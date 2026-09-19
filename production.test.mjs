import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

async function rejectedStartup(overrides) {
  const child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env, NODE_ENV: "production", DATABASE_URL: "",
      ADMIN_PASSWORD: "", ASAAS_API_KEY: "", ASAAS_ENV: "",
      ASAAS_WEBHOOK_TOKEN: "", PGSSLMODE: "require",
      PLAN_PERSONAL_PRICE: "9.90", PLAN_COMPANY_PRICE: "15.90",
      ...overrides
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    const [code, signal] = await once(child, "exit");
    assert.equal(signal, null, "Configuracao invalida deve falhar sem aguardar conexoes");
    assert.equal(code, 1);
    return stderr;
  } finally { clearTimeout(timeout); }
}

test("producao recusa banco ausente e senha administrativa fraca", async () => {
  assert.match(await rejectedStartup({ ADMIN_PASSWORD: "senha-forte-de-teste" }), /DATABASE_URL/);
  assert.match(await rejectedStartup({ DATABASE_URL: "postgresql://invalid", ADMIN_PASSWORD: "admin123" }), /ADMIN_PASSWORD/);
});

test("cobrancas em producao exigem ambiente explicito e token de webhook forte", async () => {
  const base = { DATABASE_URL: "postgresql://invalid", ADMIN_PASSWORD: "senha-forte-de-teste", ASAAS_API_KEY: "fake-test-key" };
  assert.match(await rejectedStartup({ ...base, ASAAS_ENV: "prod" }), /ASAAS_ENV/);
  assert.match(await rejectedStartup({ ...base, ASAAS_ENV: "production", ASAAS_WEBHOOK_TOKEN: "curto" }), /ASAAS_WEBHOOK_TOKEN/);
  assert.match(await rejectedStartup({ ...base, ASAAS_WEBHOOK_TOKEN: "a".repeat(32) }), /ASAAS_ENV/);
});

test("Railway inicia processo Node diretamente e verifica PostgreSQL pelo healthcheck", async () => {
  const config = JSON.parse(await readFile(new URL("./railway.json", import.meta.url), "utf8"));
  assert.equal(config.build.builder, "RAILPACK");
  assert.equal(config.deploy.startCommand, "node server.js");
  assert.equal(config.deploy.healthcheckPath, "/api/health");
});
