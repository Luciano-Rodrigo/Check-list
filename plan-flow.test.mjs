import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { once } from "node:events";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

test("cadastro, limites por acesso e ativacao pelo webhook Asaas", async (t) => {
  let databaseUrl = "";
  let database;
  const schema = `luma_test_${randomBytes(8).toString("hex")}`;
  if (process.env.TEST_DATABASE_URL) {
    database = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await database.connect();
    await database.query(`create schema ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    databaseUrl = url.toString();
  }
  let child;
  async function stopApp() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }
  t.after(async () => {
    await stopApp();
    if (database) {
      try { await database.query(`drop schema ${schema} cascade`); }
      finally { await database.end(); }
    }
  });
  let customerIndex = 0;
  let subscriptionIndex = 0;
  let authorizationIndex = 0;
  const customers = new Map();
  const subscriptions = new Map();
  const authorizations = new Map();
  const payments = new Map();
  const mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    let result = {};
    if (req.method === "POST" && req.url === "/customers") {
      result = { id: `cus_${++customerIndex}` };
      customers.set(body.email, result.id);
    } else if (req.method === "POST" && req.url === "/subscriptions") {
      result = { id: `sub_${++subscriptionIndex}` };
      subscriptions.set(result.id, body);
    } else if (req.method === "GET" && /^\/subscriptions\/sub_\d+\/payments$/.test(req.url)) {
      const subscription = req.url.split("/")[2];
      const id = `pay_${subscription}`;
      if (!payments.has(id)) payments.set(id, { id, subscription, ...subscriptions.get(subscription), status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/pay/mock", dueDate: new Date().toISOString().slice(0, 10) });
      result = { data: [payments.get(id)] };
    } else if (req.method === "GET" && req.url.startsWith("/payments/")) {
      result = payments.get(req.url.split("/").pop());
      if (!result) { res.writeHead(404); return res.end("{}"); }
    } else if (req.method === "POST" && req.url === "/pix/automatic/authorizations") {
      if (body.immediateQrCode?.originalValue !== body.value || !Number.isInteger(body.immediateQrCode?.expirationSeconds) || body.paymentCreationMode !== "SUBSCRIPTION") { res.writeHead(400); return res.end("{}"); }
      result = { ...body, id: `auth_${++authorizationIndex}`, subscriptionId: `pixsub_${authorizationIndex}`, status: "CREATED", payload: "pix-mock-copia-e-cola", encodedImage: "mock-image", immediateQrCode: { conciliationIdentifier: "mock-conciliation" } };
      authorizations.set(result.id, result);
    } else if (req.method === "GET" && /^\/pix\/automatic\/authorizations\/auth_\d+$/.test(req.url)) {
      result = authorizations.get(req.url.split("/").pop());
    } else if (req.method === "DELETE") result = { deleted: true };
    else { res.writeHead(404); return res.end("{}"); }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  });
  const mockPort = await listen(mock);
  t.after(() => close(mock));

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const childOptions = {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, PGSSLMODE: process.env.TEST_PGSSLMODE || "disable", PORT: String(port), NODE_ENV: "test", PLAN_PERSONAL_PRICE: "9.90", PLAN_COMPANY_PRICE: "15.90", ASAAS_ENV: "sandbox", ASAAS_TEST_BASE_URL: `http://127.0.0.1:${mockPort}`, ASAAS_API_KEY: "test-key", ASAAS_WEBHOOK_TOKEN: "test-webhook-token-long-enough-123456", ADMIN_PASSWORD: "test-admin-password" },
    stdio: ["ignore", "ignore", "pipe"]
  };
  let serverErrors = "";
  async function startApp() {
    child = spawn(process.execPath, ["server.js"], childOptions);
    child.stderr.on("data", (chunk) => { serverErrors += chunk.toString(); });
    for (let i = 0; i < 150; i++) {
      if (await fetch(`${base}/api/health`).then((response) => response.ok).catch(() => false)) return;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`Servidor não ficou pronto: ${serverErrors}`);
  }
  await startApp();
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).storage, database ? "postgresql-normalized" : "memory");
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-powered-by"), null);

  async function api(path, method = "GET", data = null, cookie = "", webhookToken = "") {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(webhookToken ? { "asaas-access-token": webhookToken } : {}) },
      body: data ? JSON.stringify(data) : undefined
    });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
  }

  assert.equal((await api("/api/state")).status, 401);
  const adminLogin = await api("/api/auth/login", "POST", { email: "admin@luma.com", password: "test-admin-password" });
  assert.equal(adminLogin.status, 200);
  const adminState = (await api("/api/state", "GET", null, adminLogin.cookie)).body;
  assert.equal("password" in adminState.users[0], false);
  adminState.templates.push({ id: "community-test", ownerId: "u_admin", companyId: "luma", title: "Comunidade", visibility: "public", fields: [], createdAt: new Date().toISOString() });
  assert.equal((await api("/api/state", "PUT", adminState, adminLogin.cookie)).status, 200);

  const individual = await api("/api/auth/register", "POST", { kind: "personal", plan: "free", name: "Teste Individual", email: "individual@example.invalid", document: "12345678901", password: "teste-senha-123" });
  assert.equal(individual.status, 201);
  assert.equal(individual.body.user.plan, "free");
  let personalState = (await api("/api/state", "GET", null, individual.cookie)).body;
  assert.equal(personalState.templates.some((item) => item.id === "community-test"), false);
  personalState.templates.push({ id: "individual-model", ownerId: individual.body.user.id, companyId: individual.body.user.companyId, title: "Meu modelo", visibility: "private", fields: [], createdAt: new Date().toISOString() });
  assert.equal((await api("/api/state", "PUT", personalState, individual.cookie)).status, 200);
  for (let i = 0; i < 4; i++) {
    const loaded = await api("/api/state", "GET", null, individual.cookie);
    assert.equal(loaded.status, 200, `${JSON.stringify(loaded.body)} ${serverErrors}`);
    personalState = loaded.body;
    personalState.submissions.push({ id: `individual-fill-${i}`, templateId: "individual-model", templateTitle: "Meu modelo", companyId: individual.body.user.companyId, filledBy: individual.body.user.id, createdAt: new Date().toISOString(), answers: [] });
    const saved = await api("/api/state", "PUT", personalState, individual.cookie);
    assert.equal(saved.status, i < 3 ? 200 : 403);
  }

  const company = await api("/api/auth/register", "POST", { kind: "company", plan: "free", name: "Gestor", companyName: "Empresa Teste", email: "company@example.invalid", document: "12345678000195", password: "teste-senha-123" });
  assert.equal(company.status, 201);
  const agents = [];
  for (let i = 0; i < 3; i++) {
    const created = await api("/api/users", "POST", { name: `Agente ${i}`, email: `agent-${i}@example.invalid`, password: "teste-senha-123" }, company.cookie);
    assert.equal(created.status, i < 2 ? 201 : 403);
    if (created.status === 201) agents.push(created.body.user);
  }
  let companyState = (await api("/api/state", "GET", null, company.cookie)).body;
  companyState.templates.push({ id: "company-model", ownerId: company.body.user.id, companyId: company.body.user.companyId, title: "Empresa", visibility: "private", assignedAgentIds: agents.map((agent) => agent.id), fields: [], createdAt: new Date().toISOString() });
  assert.equal((await api("/api/state", "PUT", companyState, company.cookie)).status, 200);
  const agentLogin = await api("/api/auth/login", "POST", { email: agents[0].email, password: "teste-senha-123" });
  assert.equal(agentLogin.status, 200);
  for (let i = 0; i < 3; i++) {
    const agentState = (await api("/api/state", "GET", null, agentLogin.cookie)).body;
    agentState.submissions.push({ id: `agent-fill-${i}`, templateId: "company-model", templateTitle: "Empresa", companyId: company.body.user.companyId, filledBy: agents[0].id, createdAt: new Date().toISOString(), answers: [] });
    assert.equal((await api("/api/state", "PUT", agentState, agentLogin.cookie)).status, i < 2 ? 200 : 403);
  }

  const subscriber = await api("/api/auth/register", "POST", { kind: "personal", plan: "paid", name: "Assinante", email: "subscriber@example.invalid", document: "12345678902", password: "teste-senha-123" });
  assert.equal(subscriber.body.user.plan, "free");
  const started = await api("/api/plan/start", "POST", { method: "CREDIT_CARD", termsAccepted: true }, subscriber.cookie);
  assert.equal(started.status, 200);
  assert.equal(started.body.invoiceUrl, "https://sandbox.asaas.com/pay/mock");
  assert.equal((await api("/api/asaas/webhook", "POST", { id: "evt_0", event: "PAYMENT_CONFIRMED", payment: {} })).status, 401);
  assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.plan, "free");
  const cardEvent = { id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_sub_1", subscription: [...subscriptions.keys()][0], customer: customers.get("subscriber@example.invalid"), value: 9.90, dueDate: new Date().toISOString().slice(0, 10) } };
  payments.set(cardEvent.payment.id, { ...cardEvent.payment, status: "CONFIRMED" });
  assert.equal((await api("/api/asaas/webhook", "POST", cardEvent, "", "test-webhook-token-long-enough-123456")).status, 200);
  assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.plan, "paid");
  assert.equal((await api("/api/state", "GET", null, subscriber.cookie)).body.templates.some((item) => item.id === "community-test"), true);
  const subscriberState = (await api("/api/state", "GET", null, subscriber.cookie)).body;
  subscriberState.submissions.push({ id: "community-fill", templateId: "community-test", templateTitle: "Comunidade", companyId: subscriber.body.user.companyId, filledBy: subscriber.body.user.id, createdAt: new Date().toISOString(), answers: [] });
  assert.equal((await api("/api/state", "PUT", subscriberState, subscriber.cookie)).status, 200);

  const companyStarted = await api("/api/plan/start", "POST", { method: "CREDIT_CARD", termsAccepted: true }, company.cookie);
  assert.equal(companyStarted.status, 200);
  const companyEvent = { id: "evt_company", event: "PAYMENT_CONFIRMED", payment: { id: "pay_sub_2", subscription: [...subscriptions.keys()][1], customer: customers.get("company@example.invalid"), value: 15.90, dueDate: new Date().toISOString().slice(0, 10) } };
  payments.set(companyEvent.payment.id, { ...companyEvent.payment, status: "CONFIRMED" });
  assert.equal((await api("/api/asaas/webhook", "POST", companyEvent, "", "test-webhook-token-long-enough-123456")).status, 200);
  for (let i = 2; i < 6; i++) {
    const created = await api("/api/users", "POST", { name: `Agente ${i}`, email: `agent-${i}@example.invalid`, password: "teste-senha-123" }, company.cookie);
    // Plano de empresa inclui dois colaboradores e permite adicionais cobrados por acesso.
    assert.equal(created.status, 201);
  }
  assert.equal((await api("/api/state", "GET", null, company.cookie)).body.templates.some((item) => item.id === "community-test"), true);
  for (let i = 0; i < 4; i++) {
    companyState = (await api("/api/state", "GET", null, company.cookie)).body;
    companyState.submissions.push({ id: `company-paid-fill-${i}`, templateId: "company-model", templateTitle: "Empresa", companyId: company.body.user.companyId, filledBy: company.body.user.id, createdAt: new Date().toISOString(), answers: [] });
    assert.equal((await api("/api/state", "PUT", companyState, company.cookie)).status, 200);
  }

  const pixUser = await api("/api/auth/register", "POST", { kind: "personal", plan: "paid", name: "Pix Teste", email: "pix@example.invalid", document: "12345678903", password: "teste-senha-123" });
  const pixStarted = await api("/api/plan/start", "POST", { method: "PIX_AUTOMATIC", termsAccepted: true }, pixUser.cookie);
  assert.equal(pixStarted.status, 200);
  assert.equal(pixStarted.body.pixPayload, "pix-mock-copia-e-cola");
  assert.equal((await api("/api/auth/me", "GET", null, pixUser.cookie)).body.user.plan, "free");
  const pixEvent = { id: "evt_2", event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", authorization: { id: [...authorizations.keys()][0], customerId: customers.get("pix@example.invalid"), status: "ACTIVE" } };
  authorizations.get(pixEvent.authorization.id).status = "ACTIVE";
  assert.equal((await api("/api/asaas/webhook", "POST", pixEvent, "", "test-webhook-token-long-enough-123456")).status, 200);
  assert.equal((await api("/api/auth/me", "GET", null, pixUser.cookie)).body.user.plan, "paid");
  const allAccounts = (await api("/api/state", "GET", null, adminLogin.cookie)).body.users;
  assert.equal(allAccounts.some((item) => item.email === "company@example.invalid" && item.plan === "paid"), true);
  assert.equal(allAccounts.every((item) => !Object.hasOwn(item, "password")), true);

  await t.test("exclusao nao devolve cota e falha nao salva alteracoes parciais", async () => {
    const loaded = (await api("/api/state", "GET", null, individual.cookie)).body;
    assert.equal(loaded.allowance.used, 3);
    loaded.submissions = [];
    const deleted = await api("/api/state", "PUT", loaded, individual.cookie);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.state.allowance.remaining, 0);
    const attempted = deleted.body.state;
    attempted.templates[0].title = "Nao deve persistir";
    attempted.submissions.push({ id: "quota-after-delete", templateId: "individual-model", companyId: individual.body.user.companyId, filledBy: individual.body.user.id, createdAt: "2000-01-01T00:00:00Z" });
    assert.equal((await api("/api/state", "PUT", attempted, individual.cookie)).status, 403);
    const actual = (await api("/api/state", "GET", null, individual.cookie)).body;
    assert.equal(actual.templates[0].title, "Meu modelo");
    assert.equal(actual.submissions.length, 0);
    assert.equal(actual.allowance.used, 3);
    assert.equal(Object.hasOwn(actual, "usage"), false);
  });

  await t.test("plano gratuito nao publica modelo por edicao", async () => {
    const loaded = (await api("/api/state", "GET", null, individual.cookie)).body;
    loaded.templates[0].visibility = "public";
    assert.equal((await api("/api/state", "PUT", loaded, individual.cookie)).status, 403);
  });

  await t.test("leitor nao exclui modelos da comunidade ou atribuidos", async () => {
    for (const [cookie, id] of [[subscriber.cookie, "community-test"], [agentLogin.cookie, "company-model"]]) {
      const loaded = (await api("/api/state", "GET", null, cookie)).body;
      loaded.templates = loaded.templates.filter((item) => item.id !== id);
      const saved = await api("/api/state", "PUT", loaded, cookie);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.state.templates.some((item) => item.id === id), true);
    }
  });

  await t.test("estado antigo nao apaga alteracoes de outro dispositivo", async () => {
    const stale = (await api("/api/state", "GET", null, individual.cookie)).body;
    const fresh = structuredClone(stale);
    fresh.tasks.push({ id: "device-task", ownerId: individual.body.user.id, assignedTo: individual.body.user.id, companyId: individual.body.user.companyId, title: "Agua", createdAt: new Date().toISOString() });
    assert.equal((await api("/api/state", "PUT", fresh, individual.cookie)).status, 200);
    assert.equal((await api("/api/state", "PUT", stale, individual.cookie)).status, 409);
    const loaded = (await api("/api/state", "GET", null, individual.cookie)).body;
    assert.equal(loaded.tasks.length, 1);
    loaded.tasks[0].assignedTo = company.body.user.id;
    assert.equal((await api("/api/state", "PUT", loaded, individual.cookie)).status, 403);
  });

  await t.test("cadastros simultaneos respeitam duas vagas", async () => {
    const owner = await api("/api/auth/register", "POST", { kind: "company", name: "Concorrencia", email: "concurrent@example.invalid", password: "teste-senha-123" });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => api("/api/users", "POST", { name: `Concorrente ${i}`, email: `race-${i}@example.invalid`, password: "teste-senha-123" }, owner.cookie)));
    assert.equal(results.filter((result) => result.status === 201).length, 2);
    assert.equal(results.filter((result) => result.status === 403).length, 4);
  });

  await t.test("preenchimentos simultaneos e data canonica", async () => {
    const owner = await api("/api/auth/register", "POST", { kind: "personal", name: "Cota concorrente", email: "fill-race@example.invalid", password: "teste-senha-123" });
    let loaded = (await api("/api/state", "GET", null, owner.cookie)).body;
    loaded.templates.push({ id: "race-model", ownerId: owner.body.user.id, companyId: owner.body.user.companyId, title: "Modelo", visibility: "private", fields: [] });
    loaded = (await api("/api/state", "PUT", loaded, owner.cookie)).body.state;
    for (let i = 0; i < 2; i++) {
      loaded.submissions.push({ id: `race-fill-${i}`, templateId: "race-model", companyId: owner.body.user.companyId, filledBy: owner.body.user.id, createdAt: "2000-01-01T00:00:00Z" });
      const saved = await api("/api/state", "PUT", loaded, owner.cookie);
      assert.equal(saved.status, 200);
      loaded = saved.body.state;
      assert.notEqual(loaded.submissions[i].createdAt, "2000-01-01T00:00:00Z");
    }
    const results = await Promise.all([0, 1].map((i) => {
      const snapshot = structuredClone(loaded);
      snapshot.submissions.push({ id: `last-slot-${i}`, templateId: "race-model", companyId: owner.body.user.companyId, filledBy: owner.body.user.id, createdAt: new Date().toISOString() });
      return api("/api/state", "PUT", snapshot, owner.cookie);
    }));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    loaded = (await api("/api/state", "GET", null, owner.cookie)).body;
    assert.equal(loaded.allowance.used, 3);
    loaded.submissions.push({ id: "race-fourth", templateId: "race-model", companyId: owner.body.user.companyId, filledBy: owner.body.user.id, createdAt: new Date().toISOString() });
    assert.equal((await api("/api/state", "PUT", loaded, owner.cookie)).status, 403);
  });

  await t.test("webhook repetido nao estende periodo e estorno prevalece sobre evento antigo", async () => {
    const before = (await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user;
    assert.equal((await api("/api/asaas/webhook", "POST", cardEvent, "", "test-webhook-token-long-enough-123456")).status, 200);
    payments.get(cardEvent.payment.id).status = "RECEIVED";
    assert.equal((await api("/api/asaas/webhook", "POST", { ...cardEvent, id: "evt_settled", event: "PAYMENT_RECEIVED" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.paidUntil, before.paidUntil);
    assert.equal((await api("/api/plan/cancel", "POST", {}, subscriber.cookie)).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.plan, "free");
    payments.get(cardEvent.payment.id).status = "REFUNDED";
    assert.equal((await api("/api/asaas/webhook", "POST", { ...cardEvent, id: "evt_refund", event: "PAYMENT_REFUNDED" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.plan, "free");
    assert.equal((await api("/api/asaas/webhook", "POST", { ...cardEvent, id: "evt_late_confirmation" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, subscriber.cookie)).body.user.plan, "free");
  });

  await t.test("cancelamento do Pix preserva periodo pago sem renovar", async () => {
    const before = (await api("/api/auth/me", "GET", null, pixUser.cookie)).body.user;
    authorizations.get(pixEvent.authorization.id).status = "CANCELLED";
    assert.equal((await api("/api/asaas/webhook", "POST", { ...pixEvent, id: "evt_pix_cancel", event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    const status = (await api("/api/plan/status", "GET", null, pixUser.cookie)).body;
    assert.equal(status.billing.status, "cancelled");
    assert.equal(status.user.paidUntil, before.paidUntil);
    assert.equal(status.user.plan, "paid");
  });

  await t.test("assinatura concorrente nao duplica e valor invalido nao ativa", async () => {
    const owner = await api("/api/auth/register", "POST", { kind: "personal", name: "Pagamento concorrente", email: "billing-race@example.invalid", document: "12345678904", password: "teste-senha-123" });
    assert.equal((await api("/api/plan/start", "POST", { termsAccepted: "false" }, owner.cookie)).status, 400);
    const count = subscriptions.size;
    const results = await Promise.all([0, 1].map(() => api("/api/plan/start", "POST", { method: "CREDIT_CARD", termsAccepted: true }, owner.cookie)));
    assert.equal(results.some((result) => result.status === 200), true);
    assert.equal(results.every((result) => [200, 409].includes(result.status)), true);
    assert.equal(subscriptions.size, count + 1);
    const subscription = [...subscriptions.keys()].at(-1);
    const payment = payments.get(`pay_${subscription}`);
    payment.status = "CONFIRMED";
    payment.value = "not-a-number";
    const event = { id: "evt_invalid_amount", event: "PAYMENT_CONFIRMED", payment: { id: payment.id } };
    assert.equal((await api("/api/asaas/webhook", "POST", event, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, owner.cookie)).body.user.plan, "free");
    payment.value = 9.90;
    payment.status = "PENDING";
    assert.equal((await api("/api/asaas/webhook", "POST", { ...event, id: "evt_false_confirmation" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/auth/me", "GET", null, owner.cookie)).body.user.plan, "free");
  });

  await t.test("arquivos internos nao sao publicados", async () => {
    for (const path of ["/server.js", "/plan-flow.test.mjs", "/package-lock.json", "/node_modules/express/package.json", "/.env", "/database.sql", "/assets/%2e%2e%2fserver.js"]) assert.equal((await fetch(`${base}${path}`)).status, 404);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
  });

  await t.test("retorno ao gratuito suspende vagas excedentes sem excluir colaboradores", async () => {
    assert.equal((await api(`/api/users/${company.body.user.id}`, "DELETE", null, adminLogin.cookie)).status, 409);
    const extra = await api("/api/auth/login", "POST", { email: "agent-4@example.invalid", password: "teste-senha-123" });
    assert.equal(extra.status, 200);
    payments.get(companyEvent.payment.id).status = "REFUNDED";
    assert.equal((await api("/api/asaas/webhook", "POST", { ...companyEvent, id: "evt_company_refund", event: "PAYMENT_REFUNDED" }, "", "test-webhook-token-long-enough-123456")).status, 200);
    assert.equal((await api("/api/state", "GET", null, extra.cookie)).status, 403);
    assert.equal((await api("/api/auth/login", "POST", { email: "agent-4@example.invalid", password: "teste-senha-123" })).status, 403);
    assert.equal((await api("/api/state", "GET", null, agentLogin.cookie)).status, 200);
    const loaded = (await api("/api/state", "GET", null, company.cookie)).body;
    assert.equal(loaded.users.filter((user) => user.role === "agent").length, 6);
  });

  await t.test("PostgreSQL preserva sessoes, dados e cobrancas apos reiniciar", { skip: !database }, async () => {
    const before = (await api("/api/state", "GET", null, adminLogin.cookie)).body;
    const billingBefore = await database.query(`select * from ${schema}.plan_billing order by workspace_id`);
    await stopApp();
    await startApp();
    const after = await api("/api/state", "GET", null, adminLogin.cookie);
    assert.equal(after.status, 200);
    assert.deepEqual(after.body, before);
    const billingAfter = await database.query(`select * from ${schema}.plan_billing order by workspace_id`);
    assert.deepEqual(billingAfter.rows, billingBefore.rows);
    assert.equal((await api("/api/auth/me", "GET", null, individual.cookie)).body.user.id, individual.body.user.id);
  });
});

test("cliente preserva edicoes em andamento e usa a data confirmada pelo servidor", async () => {
  const context = vm.createContext({
    structuredClone,
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {} }
  });
  vm.runInContext(await readFile(new URL("./app.js", import.meta.url), "utf8"), context);
  const sent = { templates: [], tasks: [], submissions: [{ id: "fill", createdAt: "client-time", answers: ["old"] }] };
  const saved = { ...structuredClone(sent), revision: "server-revision", allowance: { used: 1 } };
  saved.submissions[0].createdAt = "server-time";
  const current = structuredClone(sent);
  current.submissions[0].answers = ["edited-while-saving"];
  current.tasks.push({ id: "queued-task", title: "Agua" });
  const merged = context.mergeSavedState(sent, saved, current);
  assert.equal(merged.revision, "server-revision");
  assert.equal(merged.submissions[0].createdAt, "server-time");
  assert.equal(merged.submissions[0].answers[0], "edited-while-saving");
  assert.equal(merged.tasks[0].id, "queued-task");
  assert.equal(merged.allowance.used, 1);
});
