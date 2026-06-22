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

app.use(express.json({ limit: "80mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: Boolean(pool) });
});

app.get("/api/state", async (_req, res, next) => {
  try {
    if (!pool) {
      res.json(fallbackState);
      return;
    }
    await ensureDatabase();
    const result = await pool.query("select payload from app_state where key = $1", ["main"]);
    res.json(result.rows[0]?.payload || fallbackState);
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", async (req, res, next) => {
  try {
    if (!pool) {
      res.json({ ok: true, persisted: false });
      return;
    }
    await ensureDatabase();
    await pool.query(
      `
        insert into app_state (key, payload, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (key)
        do update set payload = excluded.payload, updated_at = now()
      `,
      ["main", JSON.stringify(req.body)]
    );
    res.json({ ok: true, persisted: true });
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
    create table if not exists app_state (
      key text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  databaseReady = true;
}

app.listen(port, () => {
  console.log(`Check list profissional rodando na porta ${port}`);
});
