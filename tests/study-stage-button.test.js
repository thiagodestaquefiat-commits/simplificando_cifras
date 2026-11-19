// Botão Modo Palco dentro da música (estudo): aparece quando a música vem de um evento ou playlist,
// entra no palco e some lá dentro. O palco segue a página do estudo (resumo, Letra + Cifras ou Letra).
const assert=require('node:assert/strict'),html=require('node:fs').readFileSync('index.html','utf8'),css=require('node:fs').readFileSync('css/song-reading.css','utf8');
assert.match(html,/<button class="study-stage-button" id="btn-palco"[^>]*onclick="toggleStageModeBtn\(\)"[^>]*hidden>/,'o botão existe na música');
assert.match(html,/stageButton\.hidden=!stageButtonVisible/,'o botão aparece conforme o contexto (evento/playlist)');
assert.match(html,/startsWith\('upl:'\)\);\n  if\(stageButton\)/,'playlists também mostram o botão');
assert.match(css,/#view-detail\.stage-mode \.study-stage-button/,'o botão some dentro do palco');
assert.match(html,/currentSongView==='full'\?combinedHtml/,'palco mostra Letra + Cifras quando o estudo está nela');
assert.doesNotMatch(html,/if\(!STAGE_CLEAN\)currentSongView=activeStagePreferences\.sheetView/,'a preferência do palco não troca a página do estudo');
console.log('ok - botão Modo Palco na música e palco seguindo o estudo');
