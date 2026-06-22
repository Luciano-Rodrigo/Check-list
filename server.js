import express from "express";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 5173;

const fallbackState = {
  users: [
    {
      id: "u_admin",
      name: "Administrador Luma",
      email: "admin@luma.com",
      phone: "",
      password: "admin123",
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
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
  : null;

app.use(express.json({ limit: "100mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: Boolean(pool), storage: pool ? "postgresql-normalized" : "memory" });
});

app.get("/api/state", async (_req, res, next) => {
  try {
    if (!pool) {
      res.json(fallbackState);
      return;
    }
    await ensureDatabase();
    await migrateLegacyAppState();
    res.json(await readStateFromTables());
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", async (req, res, next) => {
  try {
    if (!pool) {
      res.json({ ok: true, persisted: false, storage: "memory" });
      return;
    }
    await ensureDatabase();
    await writeStateToTables(req.body);
    res.json({ ok: true, persisted: true, storage: "postgresql-normalized" });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ ok: false, error: "Erro interno do servidor." });
});

let databaseReady = false;

async function ensureDatabase() {
  if (databaseReady || !pool) return;
  await pool.query(`
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

    create index if not exists idx_app_users_workspace on app_users(workspace_id);
    create index if not exists idx_models_workspace on checklist_models(workspace_id);
    create index if not exists idx_submissions_workspace on checklist_submissions(workspace_id);
    create index if not exists idx_tasks_workspace on daily_tasks(workspace_id);
  `);
  databaseReady = true;
}

async function migrateLegacyAppState() {
  const usersCount = await pool.query("select count(*)::int as count from app_users");
  if (usersCount.rows[0].count > 0) return;
  const legacy = await pool.query("select payload from app_state where key = $1", ["main"]);
  if (legacy.rows[0]?.payload) await writeStateToTables(legacy.rows[0].payload);
  else await writeStateToTables(fallbackState);
}

async function readStateFromTables() {
  const [users, models, assignments, submissions, tasks] = await Promise.all([
    pool.query("select * from app_users order by created_at asc"),
    pool.query("select * from checklist_models order by created_at asc"),
    pool.query("select * from checklist_model_assignments"),
    pool.query("select * from checklist_submissions order by created_at asc"),
    pool.query("select * from daily_tasks order by created_at asc")
  ]);

  const assignedByModel = assignments.rows.reduce((acc, row) => {
    acc[row.model_id] ||= [];
    acc[row.model_id].push(row.agent_user_id);
    return acc;
  }, {});

  return {
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

async function writeStateToTables(state) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const users = Array.isArray(state.users) ? state.users : [];
    const templates = Array.isArray(state.templates) ? state.templates : [];
    const submissions = Array.isArray(state.submissions) ? state.submissions : [];
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];

    await ensureWorkspaces(client, users);
    await upsertUsers(client, users);
    await replaceModels(client, templates);
    await replaceSubmissions(client, submissions);
    await replaceTasks(client, tasks);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureWorkspaces(client, users) {
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

  for (const workspace of workspaceMap.values()) {
    await client.query(
      `
        insert into access_workspaces (id, owner_user_id, kind, name, created_at)
        values ($1, $2, $3, $4, $5)
        on conflict (id)
        do update set owner_user_id = coalesce(excluded.owner_user_id, access_workspaces.owner_user_id),
                      kind = excluded.kind,
                      name = excluded.name
      `,
      [workspace.id, workspace.ownerUserId, workspace.kind, workspace.name, workspace.createdAt]
    );
  }
}

async function upsertUsers(client, users) {
  for (const user of users) {
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
        user.password || user.passwordHash || "",
        user.role,
        Boolean(user.verified),
        JSON.stringify(user),
        user.createdAt || new Date().toISOString()
      ]
    );
  }
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

app.listen(port, () => {
  console.log(`Check list profissional rodando na porta ${port}`);
});
