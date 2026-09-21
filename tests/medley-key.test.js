const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const transpose = html.slice(html.indexOf('const SHARP ='), html.indexOf('// ── SAVE / LOAD'));
const medley = html.slice(html.indexOf('let medleyBlocos=[];'), html.indexOf('function renderMedley(){'));
const context = {songFormat:{parseCapo(value){const match=String(value||'').match(/\d+/);return match?Number(match[0]):0;}}};
vm.createContext(context);
vm.runInContext(`${transpose}\n${medley}\nthis.setBlocks=(blocks)=>{medleyBlocos=blocks};this.renderBlock=medleyChordText;`,context);

const first={key:'A',capo:2,chords:'G D Em'};
const second={key:'G',capo:0,chords:'G D Em'};
context.setBlocks([first,second]);
assert.equal(context.renderBlock(first),'G D Em','o primeiro bloco mantém seus acordes e capotraste');
assert.equal(context.renderBlock(second),'G D Em','outro tom se adapta ao capotraste do primeiro');
context.setBlocks([{key:'C',capo:0,chords:'C G Am'},second]);
assert.equal(context.renderBlock(second),'C G Am','sem capotraste, os próximos blocos são transpostos ao tom inicial');
context.setBlocks([second,{key:'D',capo:0,chords:'D A Bm'}]);
assert.equal(context.renderBlock({key:'D',capo:0,chords:'D A Bm'}),'G D Em','mudar o primeiro bloco atualiza a referência');
assert.match(html,/eventEsc\(medleyChordText\(b\)\)/g,'a lista e o modo de tocar exibem os acordes ajustados');
assert.match(html,/#pane-medley\{flex-direction:column;align-items:stretch;/,'o painel do Medley ocupa toda a largura disponível');
assert.match(html,/#medley-content\{width:100%;/);
assert.match(html,/class="medley-empty"/,'o estado vazio centraliza a ação de adicionar bloco');
assert.match(html,/\.medley-empty \.btn\{width:min\(100%,320px\);\}/);
assert.match(html,/\.fab'\)\.style\.display=tab==='medley'\?'none':'flex'/,'o botão flutuante só desaparece na aba Medley');
assert.doesNotMatch(html.slice(html.indexOf('function renderMedley(){'),html.indexOf('function abrirAddMedley(){')), /onclick="tocarMedley\(\)"/);
assert.match(html.slice(html.indexOf('function renderMedley(){'),html.indexOf('function abrirAddMedley(){')), /onclick="limparMedley\(\)"[\s\S]*onclick="abrirSalvarMedley\(\)"/);

const saveSource=html.slice(html.indexOf('function confirmarSalvarMedley(){'),html.indexOf('function tocarMedley(){'));
const events=[];
const saveContext={
  medleyBlocos:[{musicTitle:'Primeira',musicId:1,blocoIdx:0,label:'Intro',chords:'G D',key:'A',capo:2},
    {musicTitle:'Segunda',musicId:2,blocoIdx:1,label:'Refrão',chords:'G D',key:'G',capo:0}],
  musicas:[],
  document:{getElementById(){return {value:'Meu Medley'};}},
  songFormat:context.songFormat,
  songModel:{create(song){return song;}},
  songRepository:{save(songs){events.push(['save',songs]);return true;}},
  librarySync:{schedule(){events.push(['sync']);}},
  closeModal(){events.push(['close']);},renderMusicas(){events.push(['playlist']);},
  renderMedley(){events.push(['medley']);},switchTab(tab){events.push(['tab',tab]);},
  showToast(){},medleyReference(){return saveContext.medleyBlocos[0];},
  medleyChordText(block){context.setBlocks(saveContext.medleyBlocos);return context.renderBlock(block);}
};
vm.createContext(saveContext);
vm.runInContext(`${saveSource}\nthis.saveMedley=confirmarSalvarMedley;`,saveContext);
saveContext.saveMedley();
assert.equal(events[0][0],'save');
assert.equal(events[0][1][0].title,'Meu Medley');
assert.equal(events[0][1][0].key,'A');
assert.equal(events[0][1][0].capo,'Capotraste casa 2');
assert.equal(events[0][1][0].blocos.length,2);
assert.equal(events[0][1][0].blocos[1].c,'G D');
assert.equal(saveContext.medleyBlocos.length,0,'a criação reinicia após salvar');
assert.ok(events.some(item=>item[0]==='sync'));
assert.ok(events.some(item=>item[0]==='tab'&&item[1]==='musicas'));

saveContext.medleyBlocos=[{musicTitle:'Outra',label:'Parte',chords:'C',key:'C',capo:0}];
saveContext.songRepository.save=()=>false;
saveContext.saveMedley();
assert.equal(saveContext.medleyBlocos.length,1,'falha ao salvar preserva os blocos');
console.log('medley-key.test.js: OK');
