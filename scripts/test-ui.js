#!/usr/bin/env node
// Roda as suítes de tela (testes que abrem o app num navegador) e mostra um resumo.
// Uso: node scripts/test-ui.js [filtro]   — ex.: node scripts/test-ui.js palco
// Não gasta crédito da Netlify: tudo roda nesta máquina.
const { spawn } = require("node:child_process");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, ".."), filter = process.argv[2] || "";
const files = fs.readdirSync(path.join(root, "tests")).filter(name => name.endsWith(".js") && name.includes(filter))
  .filter(name => /require\(['"]playwright['"]\)/.test(fs.readFileSync(path.join(root, "tests", name), "utf8")));
const parallel = Number(process.env.UI_PARALLEL || 4), timeoutMs = Number(process.env.UI_TIMEOUT_MS || 120000);
const results = [];
function run(name) {
  return new Promise(resolve => {
    const started = Date.now(), child = spawn(process.execPath, ["-r", "./tests/support/browser-env.js", path.join("tests", name)], { cwd: root, env: process.env });
    let output = ""; child.stdout.on("data", d => { output += d; }); child.stderr.on("data", d => { output += d; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); output += "\n[tempo esgotado]"; }, timeoutMs);
    child.on("close", code => { clearTimeout(timer); results.push({ name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000), output }); resolve(); });
  });
}
// Muitos testes abrem http://127.0.0.1:4173: sobe o servidor local se ele ainda não estiver no ar.
function portOpen(port) { return new Promise(resolve => { const socket = require("node:net").connect(port, "127.0.0.1"); socket.once("connect", () => { socket.end(); resolve(true); }); socket.once("error", () => resolve(false)); }); }
async function ensureServer() {
  if (await portOpen(4173)) return null;
  const server = spawn(process.execPath, ["scripts/dev-server.js"], { cwd: root, env: { ...process.env, ROUDY_PORT: "4173" }, stdio: "ignore" });
  for (let i = 0; i < 50 && !(await portOpen(4173)); i += 1) await new Promise(r => setTimeout(r, 100));
  return server;
}
(async () => {
  const server = await ensureServer();
  const queue = [...files];
  await Promise.all(Array.from({ length: parallel }, async () => { while (queue.length) await run(queue.shift()); }));
  results.sort((a, b) => a.name.localeCompare(b.name));
  const failed = results.filter(r => !r.ok);
  for (const r of failed) console.log(`\n✗ ${r.name}\n${r.output.split("\n").filter(Boolean).slice(-6).join("\n")}`);
  console.log(`\nSuítes de tela: ${results.length - failed.length} passaram, ${failed.length} falharam (de ${results.length}).`);
  server?.kill();
  process.exit(failed.length ? 1 : 0);
})();
