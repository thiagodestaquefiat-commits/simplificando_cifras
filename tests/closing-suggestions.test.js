const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/closing-suggestions.js', 'utf8'), context);
const { closingSuggestions } = context;

const song = (id, title, key, lyrics, extra = {}) => ({ id, title, key, updatedAt: '1', blocos: lyrics.split('\n').map(l => ({ l, c: '' })), ...extra });
const cruz = song(1, 'Ao Pé da Cruz', 'D', 'No calvário Jesus morreu por mim\nSeu sangue me lavou na cruz\nO Cordeiro foi ferido em meu lugar\nSua graça me alcançou e o perdão me libertou\nNa cruz eu encontrei a vida');
const sangue = song(2, 'Sangue Precioso', 'G', 'O sangue do Cordeiro tem poder\nNa cruz do calvário ele venceu\nPor sua graça fui perdoado\nMeu pecado foi lavado pelo sangue\nEu canto ao Cordeiro que morreu');
const fiel = song(3, 'Deus é Fiel', 'D', 'Tu és fiel Senhor, fiel em tudo\nTuas promessas nunca falham\nTua aliança permanece para sempre\nFiel tu és em cada estação\nCumpres a tua palavra');
const fogo = song(4, 'Fogo Santo', 'D', 'Derrama teu fogo sobre nós\nEspírito Santo vem nos avivar\nSopra o vento da renovação\nQue a chuva caia sobre a terra\nAcende a chama em nosso coração');
const cruz2 = song(5, 'Rude Cruz', 'E', 'Rude cruz onde Cristo morreu\nNo calvário seu sangue verteu\nO Cordeiro de Deus me salvou\nPor sua graça e perdão\nA cruz é minha glória');
const semLetra = song(6, 'Só Resumo', 'D', 'D A Bm G');
const copia = song(7, 'ao pe da cruz', 'D', cruz.blocos.map(b => b.l).join('\n'));

const result = closingSuggestions.suggest({ reference: cruz, targetKey: 'D', candidates: [sangue, fiel, fogo, cruz2, semLetra, copia, cruz], excludeIds: [1], limit: 3 });
const ids = result.map(item => item.song.id);
assert.ok(ids.includes(2) && ids.includes(5), 'músicas sobre a cruz aparecem mesmo com nomes diferentes');
assert.ok(!ids.includes(4), 'tema diferente (Espírito Santo) não entra');
assert.ok(!ids.includes(6), 'música sem letra não é sugerida');
assert.ok(!ids.includes(7) && !ids.includes(1), 'a própria música (ou cópia com mesmo nome) não é sugerida');
assert.ok(result.length <= 3);
assert.ok(result[0].sharedThemes.includes('cruz'));

assert.equal(closingSuggestions.semitonesTo('G', 'D'), 7, 'G → D');
assert.equal(closingSuggestions.semitonesTo('E', 'D'), 10, 'E → D');
assert.equal(closingSuggestions.semitonesTo('C', 'Am'), 0, 'C e Am são relativos');
assert.equal(closingSuggestions.semitonesTo('Bm', 'D'), 0);
assert.equal(closingSuggestions.semitonesTo('Em', 'Bm'), 7);
assert.equal(closingSuggestions.keyDistance('E', 'D'), 2);

const full = { id: 9, title: 'Completa', key: 'D', fullChordSheet: { content: '[Intro] D A\nD        A\nNa cruz do calvário\nBm   G\nSeu sangue me lavou' } };
const lyrics = closingSuggestions.lyricsOf(full);
assert.match(lyrics, /calvário/);
assert.doesNotMatch(lyrics, /\bBm\b/, 'linhas de acordes não contam como letra');

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /<script src="js\/closing-suggestions\.js\?v=\d+"><\/script>/, 'o módulo é carregado');
assert.match(html, /eventClosingSuggestionsMarkup\(event,availableItems/, 'o repertório mostra as sugestões após a última música');
assert.match(html, /function addClosingSuggestionToEvent\(/);
console.log('closing-suggestions ok');
