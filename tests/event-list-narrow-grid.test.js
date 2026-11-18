// A linha do evento tem 4 colunas (data, divisória, texto, seta). Em celulares estreitos uma regra
// tinha só 3 colunas: a divisória ocupava o espaço do texto e título/horário ficavam espremidos à direita.
const assert=require('node:assert/strict'),html=require('node:fs').readFileSync('index.html','utf8');
const rules=[...html.matchAll(/#pane-setlists \.setlist-item\{[^}]*grid-template-columns:([^;}]*)/g)].map(m=>m[1]);
const withDivider=rules.filter(cols=>/\b1px\b/.test(cols));
assert.ok(withDivider.length>=1,'existe a coluna da divisória');
const last=rules.at(-1);
assert.match(last,/\b1px\b/,'a última regra (celular estreito) também tem a coluna da divisória: '+last);
console.log('ok - lista de eventos mantém 4 colunas em celular estreito');
