// Botão Modo Palco dentro da música (estudo): aparece quando a música vem de um evento ou playlist,
// entra no palco e some lá dentro. O palco segue a página do estudo (resumo, Letra + Cifras ou Letra).
const assert=require('node:assert/strict'),html=require('node:fs').readFileSync('index.html','utf8'),css=require('node:fs').readFileSync('css/song-reading.css','utf8');
assert.ok(/<button class="study-stage-button" id="btn-palco"[^>]*onclick="toggleStageModeBtn\(\)"[^>]*hidden>/.test(html),'o botão existe na música');
assert.ok(/stageButton\.hidden=!stageButtonVisible/.test(html),'o botão aparece conforme o contexto (evento/playlist)');
assert.ok(/stageButtonVisible=Boolean\(context&&\(findEvent\(context\.playlistId\)\|\|String\(context\.playlistId\)\.startsWith\('upl:'\)\)\)/.test(html),'playlists também mostram o botão');
assert.match(css,/#view-detail\.stage-mode \.study-stage-button/,'o botão some dentro do palco');
assert.ok(/currentSongView==='full'\?combinedHtml/.test(html),'palco mostra Letra + Cifras quando o estudo está nela');
assert.ok(!/if\(!STAGE_CLEAN\)currentSongView=activeStagePreferences\.sheetView/.test(html),'a preferência do palco não troca a página do estudo');
console.log('ok - botão Modo Palco na música e palco seguindo o estudo');
