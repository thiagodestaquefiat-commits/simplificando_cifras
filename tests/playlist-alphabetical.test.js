// Músicas da playlist em ordem alfabética (22/11), na tela e no Anterior/Próxima.
const assert=require('node:assert/strict'),src=require('node:fs').readFileSync('js/home-playlists.js','utf8');
assert.ok(/new Intl\.Collator\("pt-BR", \{ sensitivity: "base", numeric: true \}\)/.test(src));
assert.ok(/playlist\.items\.map\(\(item\) => \(\{ item, song: itemSong\(item\) \}\)\)\.sort\(byTitle\);/.test(src),'tela da playlist em ordem alfabética');
assert.ok(/\.filter\(\(entry\) => entry\.song\)\.sort\(byTitle\);/.test(src),'Anterior/Próxima seguem a mesma ordem');
const c=new Intl.Collator("pt-BR",{sensitivity:"base",numeric:true});
assert.deepEqual(['Último Louvor','agnus dei','Águas Purificadoras','Bondade de Deus'].sort((a,b)=>c.compare(a,b)),['agnus dei','Águas Purificadoras','Bondade de Deus','Último Louvor']);
console.log('ok - playlist em ordem alfabética');
