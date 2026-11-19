// Mais seguro (Thiago, 19/11): remover música do repertório do evento (toque no ✓) e da biblioteca
// pela Busca pergunta antes. Um toque sem querer no culto não some com a música da banda.
const assert=require('node:assert/strict'),html=require('node:fs').readFileSync('index.html','utf8');
assert.ok(/if\(exists\)\{\n(?:\s*\/\/[^\n]*\n)*\s*if\(!appConfirm\(`Remover "\$\{song\.title\}" do repertório do evento\? A música sai para toda a banda\.`\)\)return;/.test(html),'✓ do repertório pede confirmação antes de remover');
assert.ok(/remove:song=>\{\n(?:\s*\/\/[^\n]*\n)*\s*if\(!appConfirm\('Remover esta música da sua biblioteca\?'\)\)return false;\n\s*deleteMusica\(song\.id\);/.test(html),'Busca pede confirmação antes de remover da biblioteca');
console.log('ok - remoções pedem confirmação');
