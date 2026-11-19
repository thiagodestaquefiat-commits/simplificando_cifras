// Modo Palco: cara da Gisele (classe stage-mode, topo e botões) + regras do Thiago (19/11):
// o conteúdo é o mesmo do estudo (páginas que passam para o lado, pontinhos, largura da tela).
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('css/song-reading.css','utf8');
assert.ok(/var STAGE_CLEAN=false;/.test(html),'o palco continua com a cara da Gisele (stage-mode)');
assert.ok(/var STAGE_STUDY_CONTENT=true;/.test(html),'o palco usa o conteúdo do estudo');
assert.ok(/function stageUsesOwnContent\(\)\{return stageMode&&!STAGE_CLEAN&&!STAGE_STUDY_CONTENT;\}/.test(html));
assert.ok(/detailContent\.innerHTML=stageUsesOwnContent\(\)\?stageHtml:/.test(html),'renderiza as páginas do estudo no palco');
assert.ok(/indicator\.hidden=stageUsesOwnContent\(\);/.test(html),'pontinhos de página aparecem no palco');
assert.ok(/pointerType!=='touch'\|\|stageUsesOwnContent\(\)\|\|/.test(html),'dá para passar as páginas para o lado no palco');
assert.ok(/html #view-detail\.stage-mode \.detail-body\{padding-left:0!important;padding-right:0!important/.test(css),'sem a margem de 38px do palco antigo');
assert.ok(/html #view-detail\.stage-mode #song-page-indicator:not\(\[hidden\]\)\{display:flex!important/.test(css));
console.log('ok - palco com a cara da Gisele e as regras do estudo');
