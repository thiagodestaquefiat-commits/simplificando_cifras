// Velocidade da rolagem: escolha de cada músico, lembrada por música do evento e como ponto de partida.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /scrollSpeed=detailEventContext\?\(readEventScrollPref\(detailEventContext\)\?\?scrollSpeed\):\(saved\.scrollSpeed\?\?scrollSpeed\)/, "no evento, abre com a velocidade escolhida pela pessoa, não a que veio com a versão da banda");
assert.equal((html.match(/const saved=rememberScrollSpeedChoice\(scrollSpeed\);/g) || []).length, 3, "os três controles de velocidade lembram a escolha");
assert.doesNotMatch(html, /detailEditBaseline\?\{autoScrollSpeed:scrollSpeed\}:stagePreferences\.save/, "mudar a velocidade não depende mais do modo de edição para ser lembrada");
assert.match(html, /function rememberScrollSpeedChoice\(speed\)\{const saved=stagePreferences\.save\(appCurrentUser\.id,\{\.\.\.stagePreferences\.load\(appCurrentUser\.id\),autoScrollSpeed:speed\}\);if\(detailEventContext\)writeEventScrollPref\(detailEventContext,speed\);return saved;\}/);
console.log("event-scroll-speed-memory.test.js: OK");
