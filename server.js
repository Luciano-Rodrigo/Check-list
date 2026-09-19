import express from "express";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 5173;
const production = process.env.NODE_ENV === "production";
const scrypt = promisify(scryptCallback);
const sessions = new Map();
const billing = new Map();
const billingLocks = new Set();
let webhookQueue = Promise.resolve();
const pricing = {
  personal: Number(process.env.PLAN_PERSONAL_PRICE || 9.90),
  company: Number(process.env.PLAN_COMPANY_PRICE || 15.90)
};
if (Object.values(pricing).some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Configure preços de plano válidos.");
if (production && (!process.env.DATABASE_URL || (process.env.ADMIN_PASSWORD || "").length < 12)) {
  throw new Error("Produção exige DATABASE_URL e ADMIN_PASSWORD com pelo menos 12 caracteres.");
}
if (process.env.ASAAS_ENV && !["sandbox", "production"].includes(process.env.ASAAS_ENV)) {
  throw new Error("ASAAS_ENV deve ser sandbox ou production.");
}
if (production && process.env.ASAAS_API_KEY && (!process.env.ASAAS_ENV || (process.env.ASAAS_WEBHOOK_TOKEN || "").length < 32)) {
  throw new Error("Cobranças exigem ASAAS_ENV explícito e ASAAS_WEBHOOK_TOKEN com pelo menos 32 caracteres.");
}
if (process.env.PGSSLMODE && !["disable", "require", "verify-full"].includes(process.env.PGSSLMODE)) {
  throw new Error("PGSSLMODE deve ser disable, require ou verify-full.");
}

const fallbackState = {
  users: [
    {
      id: "u_admin",
      name: "Administrador Luma",
      email: "admin@luma.com",
      phone: "",
      password: process.env.ADMIN_PASSWORD || "admin123",
      role: "adm",
      companyId: "luma",
      verified: true,
      createdAt: new Date().toISOString()
    }
  ],
  templates: [],
  submissions: [],
  tasks: []
};

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: process.env.PGSSLMODE === "verify-full" },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10
    })
  : null;

pool?.on("error", (error) => console.error("Falha em conexão PostgreSQL ociosa:", error.code || "DATABASE_ERROR"));
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.json({ limit: "100mb" }));

app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({ ok: false, error: "Origem não autorizada." }); }
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) return res.status(403).json({ ok: false, error: "Origem não autorizada." });
  }
  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    if (shuttingDown) return res.status(503).json({ ok: false });
    if (pool) await pool.query({ text: "select 1", query_timeout: 5000 });
    res.json({ ok: true, database: Boolean(pool), storage: pool ? "postgresql-normalized" : "memory" });
  } catch {
    res.status(503).json({ ok: false, database: false });
  }
});

app.get("/api/plans", (_req, res) => res.json({ prices: pricing }));

app.get("/api/auth/me", async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    if (user && !await agentSeatAvailable(user)) return res.json({ user: null, error: "Acesso suspenso pelo limite de colaboradores do plano. Consulte o titular." });
    res.json({ user: user ? publicUser(user) : null });
  } catch (error) { next(error); }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await findUserByEmail(email);
    const storedPassword = user?.role === "adm" && process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD : user?.password;
    if (!user || !await verifyPassword(String(req.body?.password || ""), storedPassword)) {
      return res.status(401).json({ ok: false, error: "Email ou senha inválidos." });
    }
    if (!user.verified) return res.status(403).json({ ok: false, error: "Acesso não verificado." });
    if (!await agentSeatAvailable(user)) throw httpError(403, "Acesso suspenso pelo limite de colaboradores do plano. Consulte o titular.");
    if (!user.password.startsWith("scrypt$") || user.role === "adm" && process.env.ADMIN_PASSWORD) await updatePassword(user.id, await hashPassword(req.body.password));
    await createSession(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const role = req.body?.kind === "company" ? "company" : "personal";
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim().slice(0, 160);
    const document = onlyDigits(req.body?.document);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || document && ![11, 14].includes(document.length)) {
      return res.status(400).json({ ok: false, error: "Informe nome, email e senha de pelo menos 8 caracteres. Confira o CPF/CNPJ, se informado." });
    }
    if (document && (role === "personal" && document.length !== 11 || role === "company" && document.length !== 14)) {
      return res.status(400).json({ ok: false, error: "Documento incompatível com o tipo de acesso." });
    }
    if (await findUserByEmail(email)) return res.status(409).json({ ok: false, error: "Email já cadastrado." });
    const id = `u_${randomBytes(12).toString("hex")}`;
    const workspaceId = `w_${randomBytes(12).toString("hex")}`;
    const user = { id, companyId: workspaceId, role, name, email, phone: String(req.body?.phone || "").slice(0, 30), document, companyName: role === "company" ? String(req.body?.companyName || "").trim().slice(0, 160) : "", plan: "free", selectedPlan: req.body?.plan === "paid" ? "paid" : "free", billingStatus: req.body?.plan === "paid" ? "pending" : "free", verified: true, createdAt: new Date().toISOString(), password: await hashPassword(password) };
    if (pool) {
      await ensureDatabase();
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("insert into access_workspaces (id, owner_user_id, kind, name) values ($1,$2,$3,$4)", [workspaceId, id, role, user.companyName || name]);
        await client.query("insert into app_users (id,workspace_id,name,email,phone,password_hash,role,verified,payload) values ($1,$2,$3,$4,$5,$6,$7,true,$8::jsonb)", [id, workspaceId, name, email, user.phone, user.password, role, JSON.stringify(userPayload(user))]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
    } else {
      if (fallbackState.users.some((item) => item.email.toLowerCase() === email)) throw httpError(409, "Email já cadastrado.");
      fallbackState.users.push(user);
    }
    await createSession(res, id);
    res.status(201).json({ ok: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try { await deleteSession(req); res.clearCookie("luma_session"); res.json({ ok: true }); }
  catch (error) { next(error); }
});

app.get("/api/state", requireUser, async (req, res, next) => {
  try {
    res.json(scopeState(await fullState(), req.user));
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", requireUser, async (req, res, next) => {
  try {
    if (!pool) {
      const nextState = structuredClone(fallbackState);
      applyStateChange(nextState, req.body, req.user);
      Object.assign(fallbackState, nextState);
      return res.json({ ok: true, persisted: false, storage: "memory", state: scopeState(nextState, req.user) });
    }
    await ensureDatabase();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(740119)");
      const previous = await readStateFromTables(client);
      const nextState = structuredClone(previous);
      applyStateChange(nextState, req.body, req.user);
      await writeStateWithClient(client, nextState);
      const saved = scopeState(await readStateFromTables(client), req.user);
      await client.query("commit");
      res.json({ ok: true, persisted: true, storage: "postgresql-normalized", state: saved });
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", requireUser, async (req, res, next) => {
  try {
    if (!["company", "adm"].includes(req.user.role)) throw httpError(403, "Apenas empresas criam colaboradores.");
    const role = req.user.role === "adm" && req.body?.role === "company" ? "company" : "agent";
    const name = String(req.body?.name || "").trim().slice(0, 160);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw httpError(400, "Informe nome, email e senha de pelo menos 8 caracteres.");
    if (await findUserByEmail(email)) throw httpError(409, "Email já cadastrado.");
    const user = { id: `u_${randomBytes(12).toString("hex")}`, companyId: role === "company" ? `w_${randomBytes(12).toString("hex")}` : req.user.companyId, role, name, email, phone: String(req.body?.phone || "").slice(0, 30), verified: true, createdAt: new Date().toISOString(), password: await hashPassword(password) };
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(740119)");
        const users = await client.query("select * from app_users where workspace_id=$1", [req.user.companyId]);
        checkCollaboratorLimit(users.rows.map(dbUser), req.user);
        if (role === "company") await client.query("insert into access_workspaces(id,owner_user_id,kind,name) values($1,$2,'company',$3)", [user.companyId, user.id, name]);
        await client.query("insert into app_users(id,workspace_id,name,email,phone,password_hash,role,verified,payload) values($1,$2,$3,$4,$5,$6,$7,true,$8::jsonb)", [user.id, user.companyId, name, email, user.phone, user.password, role, JSON.stringify(userPayload(user))]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
    } else {
      checkCollaboratorLimit(fallbackState.users, req.user);
      if (fallbackState.users.some((item) => item.email.toLowerCase() === email)) throw httpError(409, "Email já cadastrado.");
      fallbackState.users.push(user);
    }
    res.status(201).json({ ok: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

app.delete("/api/users/:id", requireUser, async (req, res, next) => {
  try {
    const target = await findUserById(req.params.id);
    if (!target || target.role === "adm" || target.id === req.user.id || req.user.role !== "adm" && !(req.user.role === "company" && target.role === "agent" && target.companyId === req.user.companyId)) throw httpError(403, "Acesso não pode ser removido.");
    if (["personal", "company"].includes(target.role)) {
      const subscription = await billingForWorkspace(target.companyId);
      if (subscription && subscription.status !== "cancelled") throw httpError(409, "O titular precisa cancelar a assinatura antes da exclusão da conta.");
      const workspace = await fullState();
      if (workspace.users.some((item) => item.companyId === target.companyId && item.role === "agent")) throw httpError(409, "Remova os colaboradores antes de excluir o titular.");
    }
    if (pool) await pool.query("delete from app_users where id=$1", [target.id]);
    else fallbackState.users = fallbackState.users.filter((item) => item.id !== target.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/plan/start", requireUser, async (req, res, next) => {
  let releaseLock;
  try {
    if (!["personal", "company"].includes(req.user.role)) throw httpError(403, "Assinatura disponível para o titular.");
    if (req.body?.termsAccepted !== true) throw httpError(400, "Aceite as condições da assinatura para continuar.");
    if (!process.env.ASAAS_API_KEY) throw httpError(503, "Configure ASAAS_API_KEY no servidor.");
    releaseLock = await acquireBillingLock(req.user.companyId);
    req.user = await findUserById(req.user.id);
    if (paidOwner(req.user)) throw httpError(409, "Plano pago já ativo.");
    const document = onlyDigits(req.body?.document || req.user.document);
    if (document.length !== (req.user.role === "company" ? 14 : 11)) throw httpError(400, "Informe CPF/CNPJ para assinar.");
    const method = req.body?.method === "PIX_AUTOMATIC" ? "PIX_AUTOMATIC" : "CREDIT_CARD";
    const existing = await billingForWorkspace(req.user.companyId);
    if (existing?.status === "pending" && existing.method === method) return res.json({ ok: true, ...await billingPresentation(existing) });
    if (existing && existing.status !== "cancelled") await cancelAsaasRecurrence(existing);
    const customer = existing?.customer_id ? { id: existing.customer_id } : await asaasRequest("/customers", { method: "POST", body: sanitizeAsaasCustomer({ name: req.user.companyName || req.user.name, cpfCnpj: document, email: req.user.email, mobilePhone: req.user.phone, externalReference: req.user.id }) });
    const value = pricing[req.user.role];
    let subscription = null;
    let authorization = null;
    let payment = null;
    if (method === "CREDIT_CARD") {
      subscription = await asaasRequest("/subscriptions", { method: "POST", body: { customer: customer.id, billingType: "CREDIT_CARD", value, nextDueDate: saoPauloDay(new Date()), cycle: "MONTHLY", description: `Checklist Luma ${req.user.role === "company" ? "Empresa" : "Individual"}`, externalReference: req.user.companyId } });
    } else {
      authorization = await asaasRequest("/pix/automatic/authorizations", { method: "POST", body: { customerId: customer.id, frequency: "MONTHLY", contractId: req.user.companyId.slice(0, 35), startDate: saoPauloDay(new Date()), value, description: "Checklist Luma mensal", paymentCreationMode: "SUBSCRIPTION", immediateQrCode: { originalValue: value, expirationSeconds: 3600 } } });
    }
    const record = { workspace_id: req.user.companyId, owner_user_id: req.user.id, customer_id: customer.id, subscription_id: subscription?.id || authorization?.subscriptionId || null, pix_authorization_id: authorization?.id || null, payment_id: payment?.id || null, method, status: "pending", amount: value, terms_accepted_at: new Date().toISOString() };
    await saveBilling(record);
    await setUserPlan(req.user.id, { document, selectedPlan: "paid", billingStatus: "pending" });
    res.json({ ok: true, ...await billingPresentation(record, payment, authorization) });
  } catch (error) { next(error); }
  finally { if (releaseLock) await releaseLock(); }
});

app.get("/api/plan/status", requireUser, async (req, res, next) => {
  try {
    const owner = req.user.role === "agent" ? ownerFor(await fullState(), req.user) : req.user;
    const record = await billingForWorkspace(owner.companyId);
    res.json({ user: publicUser(owner), billing: record ? await billingPresentation(record) : null });
  } catch (error) { next(error); }
});

app.post("/api/plan/cancel", requireUser, async (req, res, next) => {
  let releaseLock;
  try {
    if (!["personal", "company"].includes(req.user.role)) throw httpError(403, "Somente o titular pode cancelar.");
    releaseLock = await acquireBillingLock(req.user.companyId);
    const record = await billingForWorkspace(req.user.companyId);
    if (!record || record.status === "cancelled") throw httpError(404, "Assinatura não encontrada.");
    await cancelAsaasRecurrence(record);
    if (pool) await pool.query("update plan_billing set status='cancelled',updated_at=now() where workspace_id=$1", [req.user.companyId]);
    else record.status = "cancelled";
    await setUserPlan(req.user.id, record.paid_until && Date.parse(record.paid_until) > Date.now()
      ? { selectedPlan: "paid", billingStatus: "active" }
      : { selectedPlan: "free", plan: "free", billingStatus: "free", paidUntil: null });
    res.json({ ok: true });
  } catch (error) { next(error); }
  finally { if (releaseLock) await releaseLock(); }
});

app.post("/api/asaas/webhook", async (req, res, next) => {
  try {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const received = String(req.headers["asaas-access-token"] || "");
    if (!expected || expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return res.status(401).json({ ok: false });
    const event = req.body;
    if (!event?.id || !event?.event) throw httpError(400, "Webhook inválido.");
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(740120)");
        const inserted = await client.query("insert into asaas_webhook_events(id) values($1) on conflict do nothing returning id", [event.id]);
        if (inserted.rowCount) await processAsaasEvent(event, client);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
    } else {
      const operation = webhookQueue.catch(() => {}).then(async () => {
        if (!billing.has(`event:${event.id}`)) { await processAsaasEvent(event); billing.set(`event:${event.id}`, true); }
      });
      webhookQueue = operation;
      await operation;
    }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/asaas/charges", requireUser, async (req, res, next) => {
  try {
    if (req.user.role !== "adm") throw httpError(403, "Cobrança administrativa restrita.");
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ ok: false, error: "Configure ASAAS_API_KEY no servidor para gerar cobranças." });
      return;
    }

    const customerPayload = sanitizeAsaasCustomer(req.body?.customer);
    const paymentPayload = sanitizeAsaasPayment(req.body?.payment);
    if (!customerPayload.name || !customerPayload.cpfCnpj) {
      res.status(400).json({ ok: false, error: "Informe nome e CPF/CNPJ do cliente." });
      return;
    }
    if (!paymentPayload.value || paymentPayload.value <= 0) {
      res.status(400).json({ ok: false, error: "Informe um valor de cobrança válido." });
      return;
    }

    const customer = await asaasRequest("/customers", {
      method: "POST",
      body: customerPayload
    });
    const payment = await asaasRequest("/payments", {
      method: "POST",
      body: {
        ...paymentPayload,
        customer: customer.id
      }
    });
    const pixQrCode = payment.billingType === "PIX"
      ? await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`, { method: "GET" })
      : null;

    res.json({ ok: true, customer, payment, pixQrCode });
  } catch (error) {
    next(error);
  }
});

app.use("/assets", express.static(path.join(__dirname, "assets"), { dotfiles: "ignore" }));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, error: "Rota não encontrada." });
  if (!["/", "/index.html", "/app.js", "/styles.css", "/sw.js", "/manifest.webmanifest"].includes(req.path)) return res.sendStatus(404);
  next();
});
app.use(express.static(__dirname, { extensions: ["html"], dotfiles: "ignore" }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Falha na requisição:", error.code || error.name || "INTERNAL_ERROR");
  res.status(error.status || 500).json({ ok: false, error: error.publicMessage || "Erro interno do servidor.", ...(!production && error.details ? { details: error.details } : {}) });
});

let databaseReady = false;
let databaseInitialization;
let shuttingDown = false;

function asaasBaseUrl() {
  if (process.env.NODE_ENV === "test" && process.env.ASAAS_TEST_BASE_URL) return process.env.ASAAS_TEST_BASE_URL;
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function asaasRequest(pathname, options = {}) {
  const response = await fetch(`${asaasBaseUrl()}${pathname}`, {
    signal: AbortSignal.timeout(20000),
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ChecklistLuma/1.0 (Node.js)",
      access_token: process.env.ASAAS_API_KEY
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Asaas request failed");
    error.status = response.status;
    error.publicMessage = asaasErrorMessage(body) || "Não foi possível concluir a chamada ao Asaas.";
    error.details = body.errors || body;
    throw error;
  }
  return body;
}

function asaasErrorMessage(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((item) => item.description || item.code).filter(Boolean).join(" ");
  }
  return body?.message || "";
}

function sanitizeAsaasCustomer(customer = {}) {
  return {
    name: String(customer.name || "").trim(),
    cpfCnpj: onlyDigits(customer.cpfCnpj),
    email: String(customer.email || "").trim(),
    mobilePhone: onlyDigits(customer.mobilePhone),
    notificationDisabled: false,
    externalReference: String(customer.externalReference || `luma-customer-${Date.now()}`).trim()
  };
}

function sanitizeAsaasPayment(payment = {}) {
  const billingType = ["CREDIT_CARD", "PIX"].includes(payment.billingType) ? payment.billingType : "CREDIT_CARD";
  return {
    billingType,
    value: Number(payment.value || 0),
    dueDate: String(payment.dueDate || new Date().toISOString().slice(0, 10)),
    description: String(payment.description || "Assinatura Checklist Luma").slice(0, 500),
    externalReference: String(payment.externalReference || `luma-payment-${Date.now()}`).slice(0, 120)
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

async function ensureDatabase() {
  if (databaseReady || !pool) return;
  databaseInitialization ||= initializeDatabase().catch((error) => {
    databaseInitialization = null;
    throw error;
  });
  await databaseInitialization;
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serialize schema setup and first-run imports across overlapping deployments.
    await client.query("select pg_advisory_xact_lock(740119)");
    await client.query(`
    create table if not exists access_workspaces (
      id text primary key,
      owner_user_id text,
      kind text not null default 'personal',
      name text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists app_users (
      id text primary key,
      workspace_id text not null references access_workspaces(id) on delete cascade,
      name text not null,
      email text not null unique,
      phone text,
      password_hash text not null,
      role text not null check (role in ('adm', 'company', 'agent', 'personal')),
      verified boolean not null default false,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists checklist_models (
      id text primary key,
      workspace_id text not null references access_workspaces(id) on delete cascade,
      owner_user_id text references app_users(id) on delete set null,
      title text not null,
      description text,
      visibility text not null check (visibility in ('public', 'private')),
      category text,
      accent text,
      art_header text,
      border_style text,
      fields jsonb not null default '[]'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists checklist_model_assignments (
      model_id text not null references checklist_models(id) on delete cascade,
      agent_user_id text not null references app_users(id) on delete cascade,
      workspace_id text not null references access_workspaces(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (model_id, agent_user_id)
    );

    create table if not exists checklist_submissions (
      id text primary key,
      workspace_id text not null references access_workspaces(id) on delete cascade,
      model_id text,
      task_id text,
      filled_by_user_id text references app_users(id) on delete set null,
      template_title text not null,
      template_category text,
      template_accent text,
      template_art_header text,
      template_border_style text,
      answers jsonb not null default '[]'::jsonb,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists daily_tasks (
      id text primary key,
      workspace_id text not null references access_workspaces(id) on delete cascade,
      owner_user_id text references app_users(id) on delete set null,
      assigned_to_user_id text references app_users(id) on delete set null,
      model_id text,
      title text not null,
      recurrence_hours numeric,
      start_hour text,
      end_hour text,
      done boolean not null default false,
      completed_location text,
      last_notified_at timestamptz,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists app_state (
      key text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists app_sessions (
      token_hash text primary key,
      user_id text not null references app_users(id) on delete cascade,
      expires_at timestamptz not null
    );

    create table if not exists plan_billing (
      workspace_id text primary key references access_workspaces(id) on delete cascade,
      owner_user_id text not null references app_users(id) on delete cascade,
      customer_id text,
      subscription_id text,
      pix_authorization_id text,
      payment_id text,
      method text,
      status text not null default 'pending',
      paid_until timestamptz,
      updated_at timestamptz not null default now()
    );

    create table if not exists asaas_webhook_events (
      id text primary key,
      received_at timestamptz not null default now()
    );
    alter table plan_billing add column if not exists amount numeric(12,2);
    alter table plan_billing add column if not exists terms_accepted_at timestamptz;
    alter table plan_billing add column if not exists pix_activation_granted boolean not null default false;

    create table if not exists checklist_usage (
      submission_id text primary key,
      user_id text not null references app_users(id) on delete cascade,
      usage_day text not null
    );
    create index if not exists idx_checklist_usage_day on checklist_usage(user_id, usage_day);
    insert into checklist_usage(submission_id,user_id,usage_day)
      select id,filled_by_user_id,to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD')
      from checklist_submissions where filled_by_user_id is not null
      on conflict do nothing;

    create index if not exists idx_app_users_workspace on app_users(workspace_id);
    create index if not exists idx_models_workspace on checklist_models(workspace_id);
    create index if not exists idx_submissions_workspace on checklist_submissions(workspace_id);
    create index if not exists idx_tasks_workspace on daily_tasks(workspace_id);
  `);
  const legacyPasswords = await client.query("select id,password_hash from app_users where password_hash not like 'scrypt$%'");
  for (const row of legacyPasswords.rows) {
    await client.query("update app_users set password_hash=$2,payload=payload - 'password' - 'passwordHash' where id=$1", [row.id, await hashPassword(row.password_hash)]);
  }
  await migrateLegacyAppState(client);
  await client.query("commit");
  databaseReady = true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function migrateLegacyAppState(client) {
  const usersCount = await client.query("select count(*)::int as count from app_users");
  if (usersCount.rows[0].count > 0) return;
  const legacy = await client.query("select payload from app_state where key = $1", ["main"]);
  await writeStateWithClient(client, legacy.rows[0]?.payload || fallbackState, true);
}

async function readStateFromTables(db = pool) {
  const [users, models, assignments, submissions, tasks, usage] = await Promise.all([
    db.query("select * from app_users order by created_at asc"),
    db.query("select * from checklist_models order by created_at asc"),
    db.query("select * from checklist_model_assignments"),
    db.query("select * from checklist_submissions order by created_at asc"),
    db.query("select * from daily_tasks order by created_at asc"),
    db.query("select submission_id as id, user_id as \"userId\", usage_day as day from checklist_usage")
  ]);

  const assignedByModel = assignments.rows.reduce((acc, row) => {
    acc[row.model_id] ||= [];
    acc[row.model_id].push(row.agent_user_id);
    return acc;
  }, {});

  return {
    usage: usage.rows,
    users: users.rows.map((row) => ({
      ...row.payload,
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      password: row.password_hash,
      role: row.role,
      companyId: row.workspace_id,
      verified: row.verified,
      createdAt: row.payload?.createdAt || row.created_at?.toISOString?.() || row.created_at
    })),
    templates: models.rows.map((row) => ({
      ...row.payload,
      id: row.id,
      title: row.title,
      description: row.description || "",
      visibility: row.visibility,
      ownerId: row.owner_user_id,
      companyId: row.workspace_id,
      assignedAgentIds: assignedByModel[row.id] || [],
      category: row.category || row.payload?.category || "Operação",
      accent: row.accent || row.payload?.accent || "blue",
      artHeader: row.art_header || row.payload?.artHeader || "clean",
      borderStyle: row.border_style || row.payload?.borderStyle || "soft",
      fields: row.fields || [],
      createdAt: row.payload?.createdAt || row.created_at?.toISOString?.() || row.created_at
    })),
    submissions: submissions.rows.map((row) => ({
      ...row.payload,
      id: row.id,
      templateId: row.model_id,
      taskId: row.task_id || "",
      companyId: row.workspace_id,
      filledBy: row.filled_by_user_id,
      templateTitle: row.template_title,
      templateCategory: row.template_category || row.payload?.templateCategory || "Operação",
      templateAccent: row.template_accent || row.payload?.templateAccent || "blue",
      templateArtHeader: row.template_art_header || row.payload?.templateArtHeader || "clean",
      templateBorderStyle: row.template_border_style || row.payload?.templateBorderStyle || "soft",
      answers: row.answers || [],
      createdAt: row.payload?.createdAt || row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.payload?.updatedAt || row.updated_at?.toISOString?.() || row.updated_at
    })),
    tasks: tasks.rows.map((row) => ({
      ...row.payload,
      id: row.id,
      title: row.title,
      companyId: row.workspace_id,
      ownerId: row.owner_user_id,
      assignedTo: row.assigned_to_user_id,
      templateId: row.model_id || "",
      recurrenceHours: Number(row.recurrence_hours || 0),
      startHour: row.start_hour || "08:00",
      endHour: row.end_hour || "18:00",
      done: row.done,
      completedLocation: row.completed_location || "",
      lastNotifiedAt: row.last_notified_at?.toISOString?.() || row.payload?.lastNotifiedAt || null,
      createdAt: row.payload?.createdAt || row.created_at?.toISOString?.() || row.created_at
    }))
  };
}

async function writeStateWithClient(client, state, includeUsers = false) {
  const users = Array.isArray(state.users) ? state.users : [];
  const templates = Array.isArray(state.templates) ? state.templates : [];
  const submissions = Array.isArray(state.submissions) ? state.submissions : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  await ensureWorkspaces(client, users, templates, submissions, tasks);
  if (includeUsers) {
    await upsertUsers(client, users);
    await deleteMissingUsers(client, users);
  }
  await replaceModels(client, templates);
  await replaceSubmissions(client, submissions);
  await replaceTasks(client, tasks);
  for (const entry of usageEntries(state)) {
    await client.query("insert into checklist_usage(submission_id,user_id,usage_day) values($1,$2,$3) on conflict do nothing", [entry.id, entry.userId, entry.day]);
  }
  if (includeUsers) await deleteMissingWorkspaces(client, users, templates, submissions, tasks);
}

async function ensureWorkspaces(client, users, templates = [], submissions = [], tasks = []) {
  const workspaceMap = new Map();
  users.forEach((user) => {
    const workspaceId = user.companyId || user.id;
    const isAdmin = user.role === "adm";
    const isCompany = user.role === "company";
    const isAgent = user.role === "agent";
    if (isAgent && workspaceMap.has(workspaceId)) return;
    workspaceMap.set(workspaceId, {
      id: workspaceId,
      ownerUserId: isAgent ? workspaceMap.get(workspaceId)?.ownerUserId || null : user.id,
      kind: isAdmin ? "admin" : isCompany ? "company" : "personal",
      name: isAdmin ? "Administração Luma" : user.name || workspaceId,
      createdAt: user.createdAt || new Date().toISOString()
    });
  });
  [...templates, ...submissions, ...tasks].forEach((item) => {
    const workspaceId = item.companyId || "luma";
    if (workspaceMap.has(workspaceId)) return;
    workspaceMap.set(workspaceId, {
      id: workspaceId,
      ownerUserId: null,
      kind: workspaceId === "luma" ? "admin" : "company",
      name: workspaceId === "luma" ? "Administração Luma" : workspaceId,
      createdAt: item.createdAt || new Date().toISOString()
    });
  });

  for (const workspace of workspaceMap.values()) {
    await client.query(
      `
        insert into access_workspaces (id, owner_user_id, kind, name, created_at)
        values ($1, $2, $3, $4, $5)
        on conflict (id)
        do update set owner_user_id = coalesce(excluded.owner_user_id, access_workspaces.owner_user_id),
                      kind = case when excluded.owner_user_id is null then access_workspaces.kind else excluded.kind end,
                      name = case when excluded.owner_user_id is null then access_workspaces.name else excluded.name end
      `,
      [workspace.id, workspace.ownerUserId, workspace.kind, workspace.name, workspace.createdAt]
    );
  }
}

async function upsertUsers(client, users) {
  for (const user of users) {
    const password = user.password || user.passwordHash || "";
    const storedPassword = password.startsWith("scrypt$") ? password : await hashPassword(password);
    await client.query(
      `
        insert into app_users (id, workspace_id, name, email, phone, password_hash, role, verified, payload, created_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        on conflict (id)
        do update set workspace_id = excluded.workspace_id,
                      name = excluded.name,
                      email = excluded.email,
                      phone = excluded.phone,
                      password_hash = excluded.password_hash,
                      role = excluded.role,
                      verified = excluded.verified,
                      payload = excluded.payload
      `,
      [
        user.id,
        user.companyId || user.id,
        user.name || "Usuário",
        user.email,
        user.phone || "",
        storedPassword,
        user.role,
        Boolean(user.verified),
        JSON.stringify(userPayload(user)),
        user.createdAt || new Date().toISOString()
      ]
    );
  }
}

async function deleteMissingUsers(client, users) {
  const userIds = users.map((user) => user.id).filter(Boolean);
  await client.query("delete from app_users where not (id = any($1::text[]))", [userIds]);
}

async function deleteMissingWorkspaces(client, users, templates, submissions, tasks) {
  const workspaceIds = new Set();
  users.forEach((user) => workspaceIds.add(user.companyId || user.id));
  templates.forEach((tpl) => workspaceIds.add(tpl.companyId || "luma"));
  submissions.forEach((item) => workspaceIds.add(item.companyId || "luma"));
  tasks.forEach((task) => workspaceIds.add(task.companyId || "luma"));
  await client.query("delete from access_workspaces where not (id = any($1::text[]))", [[...workspaceIds].filter(Boolean)]);
}

async function replaceModels(client, templates) {
  await client.query("delete from checklist_model_assignments");
  await client.query("delete from checklist_models");
  for (const tpl of templates) {
    await client.query(
      `
        insert into checklist_models (
          id, workspace_id, owner_user_id, title, description, visibility, category,
          accent, art_header, border_style, fields, payload, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
      `,
      [
        tpl.id,
        tpl.companyId || "luma",
        tpl.ownerId || null,
        tpl.title,
        tpl.description || "",
        tpl.visibility || "private",
        tpl.category || "Operação",
        tpl.accent || "blue",
        tpl.artHeader || "clean",
        tpl.borderStyle || "soft",
        JSON.stringify(tpl.fields || []),
        JSON.stringify(tpl),
        tpl.createdAt || new Date().toISOString()
      ]
    );
    for (const agentId of tpl.assignedAgentIds || []) {
      await client.query(
        `
          insert into checklist_model_assignments (model_id, agent_user_id, workspace_id)
          values ($1, $2, $3)
          on conflict do nothing
        `,
        [tpl.id, agentId, tpl.companyId || "luma"]
      );
    }
  }
}

async function replaceSubmissions(client, submissions) {
  await client.query("delete from checklist_submissions");
  for (const item of submissions) {
    await client.query(
      `
        insert into checklist_submissions (
          id, workspace_id, model_id, task_id, filled_by_user_id, template_title,
          template_category, template_accent, template_art_header, template_border_style,
          answers, payload, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14)
      `,
      [
        item.id,
        item.companyId || "luma",
        item.templateId || null,
        item.taskId || null,
        item.filledBy || null,
        item.templateTitle || "Checklist",
        item.templateCategory || "Operação",
        item.templateAccent || "blue",
        item.templateArtHeader || "clean",
        item.templateBorderStyle || "soft",
        JSON.stringify(item.answers || []),
        JSON.stringify(item),
        item.createdAt || new Date().toISOString(),
        item.updatedAt || item.createdAt || new Date().toISOString()
      ]
    );
  }
}

async function replaceTasks(client, tasks) {
  await client.query("delete from daily_tasks");
  for (const task of tasks) {
    await client.query(
      `
        insert into daily_tasks (
          id, workspace_id, owner_user_id, assigned_to_user_id, model_id, title,
          recurrence_hours, start_hour, end_hour, done, completed_location,
          last_notified_at, payload, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
      `,
      [
        task.id,
        task.companyId || "luma",
        task.ownerId || null,
        task.assignedTo || null,
        task.templateId || null,
        task.title || "Tarefa",
        Number(task.recurrenceHours || 0),
        task.startHour || "08:00",
        task.endHour || "18:00",
        Boolean(task.done),
        task.completedLocation || "",
        task.lastNotifiedAt || null,
        JSON.stringify(task),
        task.createdAt || new Date().toISOString()
      ]
    );
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function userPayload(user) {
  const { password, passwordHash, ...payload } = user;
  return payload;
}

function publicUser(user) {
  return userPayload(user);
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(String(password), salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith("scrypt$")) return password === stored;
  const [, salt, expected] = stored.split("$");
  const actual = await scrypt(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function cookieToken(req) {
  const cookies = String(req.headers.cookie || "").split(";").map((part) => part.trim());
  return cookies.find((part) => part.startsWith("luma_session="))?.slice(13) || "";
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function findUserByEmail(email) {
  if (!email) return null;
  if (!pool) return fallbackState.users.find((item) => item.email.toLowerCase() === email) || null;
  await ensureDatabase();
  const { rows } = await pool.query("select * from app_users where lower(email) = $1", [email]);
  return rows[0] ? dbUser(rows[0]) : null;
}

async function findUserById(id) {
  if (!pool) return fallbackState.users.find((item) => item.id === id) || null;
  await ensureDatabase();
  const { rows } = await pool.query("select * from app_users where id = $1", [id]);
  return rows[0] ? dbUser(rows[0]) : null;
}

function dbUser(row) {
  return { ...row.payload, id: row.id, name: row.name, email: row.email, phone: row.phone || "", password: row.password_hash, role: row.role, companyId: row.workspace_id, verified: row.verified, createdAt: row.payload?.createdAt || row.created_at?.toISOString?.() };
}

async function updatePassword(id, password) {
  if (!pool) {
    const user = fallbackState.users.find((item) => item.id === id);
    if (user) user.password = password;
  } else await pool.query("update app_users set password_hash=$2, payload=payload - 'password' - 'passwordHash' where id=$1", [id, password]);
}

async function createSession(res, userId) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 86400000);
  if (pool) await pool.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,$3)", [tokenHash(token), userId, expires]);
  else sessions.set(tokenHash(token), { userId, expires: expires.getTime() });
  res.cookie("luma_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

async function sessionUser(req) {
  const token = cookieToken(req);
  if (!token) return null;
  const hash = tokenHash(token);
  let userId;
  if (pool) {
    await ensureDatabase();
    const { rows } = await pool.query("select user_id from app_sessions where token_hash=$1 and expires_at > now()", [hash]);
    userId = rows[0]?.user_id;
  } else {
    const session = sessions.get(hash);
    userId = session?.expires > Date.now() ? session.userId : null;
  }
  return userId ? findUserById(userId) : null;
}

async function deleteSession(req) {
  const token = cookieToken(req);
  if (!token) return;
  if (pool) await pool.query("delete from app_sessions where token_hash=$1", [tokenHash(token)]);
  else sessions.delete(tokenHash(token));
}

async function requireUser(req, res, next) {
  try {
    req.user = await sessionUser(req);
    if (!req.user) return res.status(401).json({ ok: false, error: "Faça login para continuar." });
    if (!await agentSeatAvailable(req.user)) throw httpError(403, "Acesso suspenso pelo limite de colaboradores do plano. Consulte o titular.");
    next();
  } catch (error) { next(error); }
}

async function fullState() {
  if (!pool) return fallbackState;
  await ensureDatabase();
  return readStateFromTables();
}

function ownerFor(state, user) {
  if (user.role === "agent") return state.users.find((item) => item.companyId === user.companyId && ["company", "adm"].includes(item.role)) || user;
  return state.users.find((item) => item.id === user.id) || user;
}

function checkCollaboratorLimit(users, actor) {
  if (actor.role !== "company") return;
  const owner = users.find((item) => item.id === actor.id) || actor;
  const limit = paidOwner(owner) ? 5 : 2;
  const count = users.filter((item) => item.companyId === actor.companyId && item.role === "agent").length;
  if (count >= limit) throw httpError(403, `Seu plano permite até ${limit} colaborador(es).`);
}

async function agentSeatAvailable(user) {
  if (user.role !== "agent") return true;
  const state = await fullState();
  const owner = ownerFor(state, user);
  if (owner.role === "adm") return true;
  if (owner.role !== "company") return false;
  const limit = paidOwner(owner) ? 5 : 2;
  const seats = state.users.filter((item) => item.role === "agent" && item.companyId === user.companyId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  return seats.slice(0, limit).some((item) => item.id === user.id);
}

function paidOwner(owner) {
  return owner.role === "adm" || owner.plan === "paid" && owner.billingStatus === "active" && (!owner.paidUntil || Date.parse(owner.paidUntil) > Date.now());
}

function visibleState(state, user) {
  const owner = ownerFor(state, user);
  const paid = paidOwner(owner);
  if (user.role === "adm") return { users: state.users.map(publicUser), templates: state.templates, submissions: state.submissions, tasks: state.tasks };
  const workspaceUsers = state.users.filter((item) => item.companyId === user.companyId).map(publicUser);
  const templates = state.templates.filter((tpl) => {
    if (tpl.visibility === "public" && paid) return true;
    if (tpl.companyId !== user.companyId) return false;
    return user.role !== "agent" || tpl.ownerId === user.id || (tpl.assignedAgentIds || []).includes(user.id);
  });
  return {
    users: workspaceUsers,
    templates,
    submissions: state.submissions.filter((item) => item.companyId === user.companyId && (user.role !== "agent" || item.filledBy === user.id)),
    tasks: state.tasks.filter((item) => item.companyId === user.companyId && (user.role !== "agent" || item.assignedTo === user.id || item.ownerId === user.id))
  };
}

function usageEntries(state) {
  const entries = new Map((state.usage || []).map((entry) => [entry.id, entry]));
  for (const item of state.submissions) {
    if (item.filledBy && !entries.has(item.id)) entries.set(item.id, { id: item.id, userId: item.filledBy, day: saoPauloDay(item.createdAt) });
  }
  return [...entries.values()];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(key === "assignedAgentIds" ? [...value[key]].sort() : value[key])]));
}

function scopeState(state, user) {
  const scoped = visibleState(state, user);
  const owner = ownerFor(state, user);
  const day = saoPauloDay(new Date());
  const limit = paidOwner(owner) ? null : owner.role === "company" ? 2 : 3;
  const used = usageEntries(state).filter((entry) => entry.userId === user.id && entry.day === day).length;
  scoped.allowance = { day, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
  const versioned = Object.fromEntries(Object.entries(scoped).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((a, b) => a.id.localeCompare(b.id)) : value]));
  scoped.revision = tokenHash(JSON.stringify(canonicalJson(versioned)));
  return scoped;
}

function saoPauloDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}

function applyStateChange(state, incoming, user) {
  if (!incoming || !["templates", "submissions", "tasks"].every((key) => Array.isArray(incoming[key]))) throw httpError(400, "Estado inválido.");
  const owner = ownerFor(state, user);
  const paid = paidOwner(owner);
  const scoped = scopeState(state, user);
  if (incoming.revision !== scoped.revision) throw httpError(409, "Os dados mudaram em outro acesso. Atualizamos a tela; confira as informações e tente novamente.");
  const limits = user.role === "adm" || paid ? Infinity : owner.role === "company" ? 2 : 3;
  state.usage = usageEntries(state);
  for (const key of ["templates", "submissions", "tasks"]) {
    const visibleIds = new Set(scoped[key].map((item) => item.id));
    const oldById = new Map(state[key].map((item) => [item.id, item]));
    const newIds = new Set();
    const accepted = [];
    for (const item of incoming[key]) {
      if (typeof item?.id !== "string" || !item.id || newIds.has(item.id)) throw httpError(400, "Registro inválido ou duplicado.");
      newIds.add(item.id);
      const prior = oldById.get(item.id);
      if (prior && !visibleIds.has(item.id)) throw httpError(403, "Registro fora do seu acesso.");
      if (user.role !== "adm") {
        if (item.companyId !== user.companyId && !(key === "templates" && prior?.visibility === "public")) throw httpError(403, "Registro fora da sua conta.");
        if (prior && prior.companyId !== user.companyId && key === "templates") {
          accepted.push(prior);
          continue;
        }
      }
      if (key === "templates") {
        if (prior && user.role === "agent" && prior.ownerId !== user.id) {
          accepted.push(prior);
          continue;
        }
        if (!prior && item.ownerId !== user.id) throw httpError(403, "Autor inválido.");
        if (prior && prior.ownerId !== user.id && user.role !== "adm" && user.role !== "company") throw httpError(403, "Modelo somente leitura.");
        if (prior && (item.ownerId !== prior.ownerId || item.companyId !== prior.companyId)) throw httpError(403, "Autor do modelo não pode ser alterado.");
        if (item.visibility === "public" && prior?.visibility !== "public" && !paid) throw httpError(403, "Compartilhamento disponível no plano pago.");
        if (!["private", "public"].includes(item.visibility)) throw httpError(400, "Visibilidade inválida.");
        if (!Array.isArray(item.assignedAgentIds || []) || (item.assignedAgentIds || []).some((id) => !state.users.some((agent) => agent.id === id && agent.role === "agent" && agent.companyId === item.companyId))) throw httpError(403, "Colaborador fora da conta.");
      }
      if (key === "submissions") {
        if (!prior) {
          if (item.filledBy !== user.id) throw httpError(403, "Responsável inválido.");
          const tpl = state.templates.find((model) => model.id === item.templateId);
          if (!tpl || !scoped.templates.some((model) => model.id === tpl.id)) throw httpError(403, "Checklist indisponível no seu plano.");
          const day = saoPauloDay(new Date());
          if (state.usage.some((entry) => entry.id === item.id)) throw httpError(409, "Identificador de preenchimento já utilizado.");
          const count = state.usage.filter((entry) => entry.userId === user.id && entry.day === day).length;
          if (count >= limits) throw httpError(403, `Seu plano permite ${limits} preenchimento(s) por dia por acesso.`);
          item.createdAt = new Date().toISOString();
          state.usage.push({ id: item.id, userId: user.id, day });
        } else if (prior.filledBy !== item.filledBy || prior.createdAt !== item.createdAt || prior.templateId !== item.templateId || prior.companyId !== item.companyId) throw httpError(403, "Dados do preenchimento não podem ser alterados.");
        if (item.taskId && !scoped.tasks.some((task) => task.id === item.taskId && task.companyId === item.companyId)) throw httpError(403, "Tarefa fora do seu acesso.");
      }
      if (key === "tasks") {
        if (!prior && item.ownerId !== user.id || prior && (item.ownerId !== prior.ownerId || item.companyId !== prior.companyId)) throw httpError(403, "Autor da tarefa inválido.");
        if (item.assignedTo && !state.users.some((assignee) => assignee.id === item.assignedTo && assignee.companyId === item.companyId)) throw httpError(403, "Responsável fora da conta.");
        if (user.role === "agent" && item.assignedTo !== (prior?.assignedTo || user.id)) throw httpError(403, "Responsável não pode ser alterado.");
        if (item.templateId && item.templateId !== prior?.templateId && !scoped.templates.some((tpl) => tpl.id === item.templateId)) throw httpError(403, "Checklist indisponível no seu plano.");
      }
      accepted.push(item);
    }
    // A visible community or assigned model is not owned by the reader.
    const readOnly = (item) => key === "templates" && user.role !== "adm" && (item.companyId !== user.companyId || user.role === "agent" && item.ownerId !== user.id);
    state[key] = state[key].filter((item) => !visibleIds.has(item.id) || !newIds.has(item.id) && readOnly(item)).concat(accepted);
  }
}

async function billingForWorkspace(workspaceId, db = pool) {
  if (!pool) return billing.get(workspaceId) || null;
  const { rows } = await db.query("select * from plan_billing where workspace_id=$1", [workspaceId]);
  return rows[0] || null;
}

async function acquireBillingLock(workspaceId) {
  if (!pool) {
    if (billingLocks.has(workspaceId)) throw httpError(409, "Há uma operação de pagamento em andamento. Aguarde e tente novamente.");
    billingLocks.add(workspaceId);
    return () => billingLocks.delete(workspaceId);
  }
  const client = await pool.connect();
  try {
    const result = await client.query("select pg_try_advisory_lock(hashtextextended($1,0)) as acquired", [`billing:${workspaceId}`]);
    if (!result.rows[0].acquired) throw httpError(409, "Há uma operação de pagamento em andamento. Aguarde e tente novamente.");
    return async () => {
      try { await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [`billing:${workspaceId}`]); }
      finally { client.release(); }
    };
  } catch (error) { client.release(); throw error; }
}

async function saveBilling(record) {
  if (!pool) return billing.set(record.workspace_id, record);
  await pool.query(`
    insert into plan_billing(workspace_id,owner_user_id,customer_id,subscription_id,pix_authorization_id,payment_id,method,status,amount,terms_accepted_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict(workspace_id) do update set customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,
      pix_authorization_id=excluded.pix_authorization_id,payment_id=excluded.payment_id,method=excluded.method,
      status=excluded.status,paid_until=null,amount=excluded.amount,terms_accepted_at=excluded.terms_accepted_at,pix_activation_granted=false,updated_at=now()
  `, [record.workspace_id, record.owner_user_id, record.customer_id, record.subscription_id, record.pix_authorization_id, record.payment_id, record.method, record.status, record.amount, record.terms_accepted_at]);
}

async function cancelAsaasRecurrence(record) {
  if (record.subscription_id && !record.pix_authorization_id) await asaasRequest(`/subscriptions/${encodeURIComponent(record.subscription_id)}`, { method: "DELETE" });
  if (record.pix_authorization_id) await asaasRequest(`/pix/automatic/authorizations/${encodeURIComponent(record.pix_authorization_id)}`, { method: "DELETE" });
  if (pool) await pool.query("update plan_billing set status='cancelled',updated_at=now() where workspace_id=$1", [record.workspace_id]);
  else record.status = "cancelled";
}

async function setUserPlan(userId, changes, db = pool) {
  if (!pool) {
    const user = fallbackState.users.find((item) => item.id === userId);
    if (user) Object.assign(user, changes);
    return;
  }
  const { rows } = await db.query("select payload from app_users where id=$1 for update", [userId]);
  if (!rows[0]) throw httpError(404, "Titular não encontrado.");
  await db.query("update app_users set payload=$2::jsonb where id=$1", [userId, JSON.stringify({ ...rows[0].payload, ...changes })]);
}

async function billingPresentation(record, knownPayment = null, knownAuthorization = null) {
  let payment = knownPayment;
  let authorization = knownAuthorization;
  if (process.env.ASAAS_API_KEY && record.status === "pending") {
    if (!payment && record.subscription_id && record.method === "CREDIT_CARD") {
      const list = await asaasRequest(`/subscriptions/${encodeURIComponent(record.subscription_id)}/payments`, { method: "GET" });
      payment = list.data?.[0] || null;
    }
    if (!authorization && record.pix_authorization_id) {
      authorization = await asaasRequest(`/pix/automatic/authorizations/${encodeURIComponent(record.pix_authorization_id)}`, { method: "GET" });
    }
  }
  return {
    method: record.method,
    status: record.status === "active" && record.paid_until && Date.parse(record.paid_until) <= Date.now() ? "expired" : record.status,
    amount: Number(record.amount ?? pricing[(await findUserById(record.owner_user_id))?.role] ?? 0),
    invoiceUrl: payment?.invoiceUrl || null,
    pixPayload: authorization?.immediateQrCode?.payload || authorization?.payload || null,
    pixImage: authorization?.immediateQrCode?.encodedImage || authorization?.immediateQrCode?.image || null,
    paidUntil: record.paid_until || null
  };
}

async function processAsaasEvent(event, db = pool) {
  const paymentEvent = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(event.event);
  const authorizationEvent = ["PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED"].includes(event.event);
  if (!paymentEvent && !authorizationEvent && event.event !== "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED") return;
  if (paymentEvent && !event.payment?.id || authorizationEvent && !event.authorization?.id) throw httpError(400, "Recurso do webhook ausente.");
  // Reconcile the current provider state instead of trusting delivery order.
  const payment = paymentEvent ? await asaasRequest(`/payments/${encodeURIComponent(event.payment.id)}`) : {};
  const authorization = authorizationEvent ? await asaasRequest(`/pix/automatic/authorizations/${encodeURIComponent(event.authorization.id)}`) : {};
  const instruction = event.paymentInstruction || {};
  const records = pool
    ? (await db.query(`select * from plan_billing where
      (subscription_id is not null and subscription_id=$1) or
      (pix_authorization_id is not null and pix_authorization_id=$2) or
      (pix_authorization_id is not null and pix_authorization_id=$3) or
      (pix_authorization_id is not null and pix_authorization_id=$4) or
      (payment_id is not null and payment_id=$5)
      limit 1 for update`, [payment.subscription || "", authorization.id || "", payment.pixAutomaticAuthorizationId || "", instruction.authorization?.id || "", payment.id || ""])).rows
    : [...billing.values()].filter((record) => record?.workspace_id);
  const record = pool ? records[0] : records.find((item) => item.subscription_id && item.subscription_id === payment.subscription || item.pix_authorization_id && item.pix_authorization_id === authorization.id || item.pix_authorization_id && item.pix_authorization_id === payment.pixAutomaticAuthorizationId || item.pix_authorization_id && item.pix_authorization_id === instruction.authorization?.id || item.payment_id && item.payment_id === payment.id);
  if (!record) return;
  const owner = await findUserById(record.owner_user_id);
  if (!owner) return;
  if (event.event === "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED" && instruction.paymentId && instruction.authorization?.id === record.pix_authorization_id) {
    if (pool) await db.query("update plan_billing set payment_id=$2,updated_at=now() where workspace_id=$1", [record.workspace_id, instruction.paymentId]);
    else record.payment_id = instruction.paymentId;
  }
  if (paymentEvent && payment.customer !== record.customer_id || authorizationEvent && authorization.customerId !== record.customer_id) return;
  const paidPayment = paymentEvent && ["CONFIRMED", "RECEIVED"].includes(payment.status);
  const initialPix = authorizationEvent && authorization.status === "ACTIVE" && !record.pix_activation_granted;
  if (paidPayment || initialPix) {
    const value = Number(paidPayment ? payment.value : authorization.value);
    const amount = Number(record.amount ?? pricing[owner.role]);
    if (!Number.isFinite(value) || Math.abs(value - amount) > 0.001) return;
    if (initialPix && record.status === "cancelled") return;
    const cycleEnd = monthlyPeriodEnd(paidPayment ? payment.dueDate : authorization.startDate);
    if (!cycleEnd) return;
    const paidUntil = new Date(Math.max(Date.parse(record.paid_until) || 0, cycleEnd)).toISOString();
    const status = record.status === "cancelled" ? "cancelled" : "active";
    if (pool) await db.query("update plan_billing set status=$2,paid_until=$3,pix_activation_granted=pix_activation_granted or $4,updated_at=now() where workspace_id=$1", [record.workspace_id, status, paidUntil, initialPix]);
    else Object.assign(record, { status, paid_until: paidUntil, pix_activation_granted: record.pix_activation_granted || initialPix });
    await setUserPlan(record.owner_user_id, { plan: "paid", selectedPlan: "paid", billingStatus: "active", paidUntil }, db);
  }
  const reversed = paymentEvent && ["REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"].includes(payment.status);
  const ended = authorizationEvent && ["CANCELLED", "EXPIRED", "REFUSED"].includes(authorization.status);
  if (reversed || ended) {
    if (reversed && monthlyPeriodEnd(payment.dueDate) < Date.parse(record.paid_until)) return;
    const paidUntil = ended ? record.paid_until : null;
    const status = ended || record.status === "cancelled" ? "cancelled" : "inactive";
    if (pool) await db.query("update plan_billing set status=$2,paid_until=$3,pix_activation_granted=pix_activation_granted or $4,updated_at=now() where workspace_id=$1", [record.workspace_id, status, paidUntil, reversed]);
    else Object.assign(record, { status, paid_until: paidUntil, pix_activation_granted: record.pix_activation_granted || reversed });
    await setUserPlan(record.owner_user_id, paidUntil && Date.parse(paidUntil) > Date.now()
      ? { plan: "paid", billingStatus: "active", paidUntil }
      : { plan: "free", billingStatus: "inactive", paidUntil: null }, db);
  }
}

function monthlyPeriodEnd(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const start = new Date(`${day}T03:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== day) return null;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0)).getUTCDate();
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, Math.min(start.getUTCDate(), lastDay), 3);
}

let server;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  try {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool?.end();
    clearTimeout(deadline);
    process.exitCode = 0;
  } catch {
    process.exitCode = 1;
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await ensureDatabase();
  if (!shuttingDown) {
    server = app.listen(port, "0.0.0.0", () => {
      console.log(`Check list profissional rodando na porta ${port}; armazenamento: ${pool ? "PostgreSQL" : "memória (desenvolvimento)"}`);
    });
    server.on("error", (error) => { console.error("Falha ao iniciar HTTP:", error.code); process.exit(1); });
  }
} catch (error) {
  console.error("Falha ao inicializar PostgreSQL. Confira DATABASE_URL, PGSSLMODE e permissões de criação de tabelas.", error.code || "DATABASE_ERROR");
  await pool?.end();
  process.exitCode = 1;
}
