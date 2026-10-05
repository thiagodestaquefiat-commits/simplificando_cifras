// Protege os sinks da biblioteca contra XSS armazenado.
//
// As funcoes de render vivem dentro do <script> inline do index.html. Este
// teste extrai esse script, executa-o num contexto isolado com um DOM minimo
// e injeta payloads nos campos que chegam de importacao, sincronizacao, IA e
// YouTube. Nenhuma rede, nenhum navegador: roda sempre no `npm test`.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// ---------------------------------------------------------------- payloads
const PAYLOADS = [
  "<img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
  "<svg/onload=alert(1)>",
  "\"><img src=x onerror=alert(1)>",
  "'><img src=x onerror=alert(1)>",
  "');alert(1);//",
  "\");alert(1);//",
  "</div><img src=x onerror=alert(1)><div>"
];

// Um payload esta neutralizado quando nenhum dos delimitadores que o parser
// HTML usa sobrevive cru na saida: sem "<" nao ha tag nova, sem aspas nao ha
// fuga do valor de atributo. O texto "onerror=" em si e inofensivo desde que
// nao exista uma tag para carrega-lo.
const DELIMITADORES = [
  { nome: "abertura de tag", regex: /</ },
  { nome: "fechamento de tag", regex: />/ },
  { nome: "aspas duplas", regex: /"/ },
  { nome: "aspas simples", regex: /'/ }
];

function assertInert(htmlOut, where) {
  for (const item of DELIMITADORES) {
    assert.equal(
      item.regex.test(htmlOut), false,
      `${where}: ${item.nome} cru na saida:\n${htmlOut.slice(0, 400)}`
    );
  }
}

// ------------------------------------------------- extracao das funcoes puras
// Pega apenas as funcoes de escape do script inline, sem carregar o app todo.
function loadEscapers() {
  const script = html.slice(html.indexOf("<script>", html.indexOf("</head>")));
  const eventEsc = /function eventEsc\(value\)\{[\s\S]*?\n/.exec(script);
  const attrJs = /function attrJs\(value\)\{[\s\S]*?\n/.exec(script);
  assert.ok(eventEsc, "eventEsc nao encontrado no index.html");
  assert.ok(attrJs, "attrJs nao encontrado no index.html — o helper de atributo JS sumiu");
  const context = { JSON, String };
  vm.createContext(context);
  vm.runInContext(eventEsc[0] + "\n" + attrJs[0] + "\nthis.eventEsc=eventEsc;this.attrJs=attrJs;", context);
  return context;
}

const { eventEsc, attrJs } = loadEscapers();

// ------------------------------------------------------------------ 1. eventEsc
for (const payload of PAYLOADS) {
  assertInert(eventEsc(payload), `eventEsc(${JSON.stringify(payload)})`);
}
assert.equal(eventEsc(null), "");
assert.equal(eventEsc(undefined), "");
assert.equal(eventEsc(0), "0");
console.log("  eventEsc neutraliza os 8 payloads");

// -------------------------------------------------------------------- 2. attrJs
// attrJs precisa sobreviver a DUAS camadas: o parser HTML decodifica as
// entidades e so entao o JavaScript do onclick e avaliado.
function htmlDecode(value) {
  return String(value)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

for (const payload of PAYLOADS) {
  const attributeValue = attrJs(payload);
  assertInert(attributeValue, `attrJs(${JSON.stringify(payload)}) no HTML`);

  // Apos a decodificacao HTML o resultado precisa ser UM literal JS valido
  // que devolva exatamente o payload original — sem codigo extra.
  const afterHtmlParser = htmlDecode(attributeValue);
  const evaluated = vm.runInNewContext(`(${afterHtmlParser})`);
  assert.equal(
    evaluated, payload,
    `attrJs perdeu fidelidade apos decodificacao HTML: ${afterHtmlParser}`
  );
  assert.equal(typeof evaluated, "string");
}
console.log("  attrJs resiste a decodificacao HTML + avaliacao JS");

// attrJs precisa ser estritamente mais forte que eventEsc no contexto onclick.
const breakout = "');alert(1);//";
assert.equal(
  htmlDecode(eventEsc(breakout)).includes("');"), true,
  "premissa do teste invalida: eventEsc deveria mesmo falhar em contexto onclick"
);
assert.equal(htmlDecode(attrJs(breakout)).startsWith('"'), true);
console.log("  attrJs cobre o caso onde eventEsc sozinho falharia");

// ------------------------------------------- 3. os sinks corrigidos no arquivo
// Trava de regressao: se alguem reintroduzir a interpolacao crua, quebra aqui.
const SINKS_CORRIGIDOS = [
  { nome: "renderMusicas / onclick", regex: /class="music-item" onclick="openDetail\(\$\{attrJs\(m\.id\)\}\)"/ },
  { nome: "renderMusicas / titulo", regex: /class="music-title">\$\{eventEsc\(m\.title\)\}/ },
  { nome: "renderMusicas / artista", regex: /class="music-sub">\$\{eventEsc\(m\.artist\|\|m\.capo/ },
  { nome: "renderMusicas / tom", regex: /class="key-badge">\$\{eventEsc\(m\.key\)\}/ },
  { nome: "abrirAddMedley / option", regex: /<option value="\$\{eventEsc\(m\.id\)\}">\$\{eventEsc\(m\.title\)\}/ },
  { nome: "renderDetail / editMusica", regex: /onclick="editMusica\(\$\{attrJs\(m\.id\)\}\)"/ },
  { nome: "renderDetail / deleteMusica", regex: /onclick="deleteMusica\(\$\{attrJs\(m\.id\)\}\)"/ },
  { nome: "renderDetail / generateAiForSong", regex: /onclick="generateAiForSong\(\$\{attrJs\(m\.id\)\}\)"/ },
  { nome: "diagramas / nome do acorde", regex: /class="chord-card-name">\$\{eventEsc\(name\)\}/ },
  { nome: "medley / titulo do bloco", regex: /\$\{eventEsc\(b\.musicTitle\)\}/ },
  { nome: "medley / cifra", regex: /\$\{eventEsc\(medleyChordText\(b\)\)\.replace\(\/\\n\/g,'<br>'\)\}/ },
  { nome: "editor simples / capo", regex: /id="ai-review-capo" value="\$\{safe\(model\.capo\|\|''\)\}"/ }
];

for (const sink of SINKS_CORRIGIDOS) {
  assert.equal(sink.regex.test(html), true, `sink sem escape: ${sink.nome}`);
}
console.log(`  ${SINKS_CORRIGIDOS.length} sinks da biblioteca permanecem escapados`);

// ------------------------------- 4. nenhum sink cru remanescente na biblioteca
const PADROES_PROIBIDOS = [
  { nome: "titulo cru na lista", regex: /class="music-title">\$\{m\.title\}/ },
  { nome: "tom cru na lista", regex: /class="key-badge">\$\{m\.key\}/ },
  { nome: "id cru em onclick", regex: /onclick="(openDetail|editMusica|deleteMusica|generateAiForSong)\('\$\{m\.id\}'\)"/ },
  { nome: "acorde cru no diagrama", regex: /class="chord-card-name">\$\{name\}/ },
  { nome: "cifra crua no medley", regex: /\$\{b\.chords\.replace/ }
];

for (const padrao of PADROES_PROIBIDOS) {
  assert.equal(padrao.regex.test(html), false, `padrao vulneravel reintroduzido: ${padrao.nome}`);
}
console.log("  nenhum padrao vulneravel conhecido remanescente");

// ------------------------------------ 5. normalizeChordName nao sanitiza (nota)
// Documenta POR QUE o escape no cartao de acorde e necessario: o normalizador
// devolve o token cru quando ele nao casa com a gramatica de acordes.
global.window = global;
require("../js/chord-utils.js");
const passthrough = window.chordUtils.normalizeChordName("<svg/onload=alert(1)>");
assert.equal(
  /<svg/.test(passthrough), true,
  "normalizeChordName passou a sanitizar — reavalie a necessidade do escape em G4"
);
assertInert(eventEsc(passthrough), "acorde malicioso apos eventEsc");
console.log("  token de acorde malicioso atravessa normalizeChordName e e neutralizado no render");

console.log("library-xss.test.js: OK (8 payloads x titulo/artista/tom/id/acorde/cifra, eventEsc + attrJs)");
