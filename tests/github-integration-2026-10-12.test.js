const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('service-worker.js','utf8'),assistant=fs.readFileSync('js/app-assistant.js','utf8'),invites=fs.readFileSync('js/event-user-invites.js','utf8');
for(const source of [html,sw,assistant,invites])assert.doesNotMatch(source,/^(?:<<<<<<<|=======|>>>>>>>)/m,'nenhum conflito pendente');
const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(scripts).size,scripts.length,'scripts não carregados em duplicidade');
for(const path of ['js/app-assistant.js?v=30','js/tuner.js?v=4','js/chord-audio.js?v=2','js/smart-scroll.js?v=7','js/tablature.js?v=2','js/assistant-language.js?v=1','js/assistant-dialogue.js?v=4','js/event-qr-scanner.js?v=1','js/profile-qr.js?v=3','js/event-user-invites.js?v=8']){
  assert.ok(scripts.includes(path),path+' preservado');assert.ok(sw.includes('./'+path),path+' no cache offline');
}
assert.match(html,/function commitSongs\(next\)/);
assert.doesNotMatch(html,/shared:eventSongModel\(song\)/,'novas inclusões usam a cópia persistida e isolada do evento');
assert.match(html,/shared:eventEditFromSong\(eventSongCopy\(song\)\)/);
assert.match(invites,/Object\.freeze\(\{[^\n]*inviteFromVoice,inviteScanned/);
assert.match(assistant,/createEvent:[^\n]*event-create-title/);
assert.match(assistant,/medley-sheet-title/);assert.match(assistant,/#medley-save-title, \.medley-sheet/);
assert.match(fs.readFileSync('js/ai/ai-harmonic-summary.js','utf8'),/Busca por IA/);
console.log('github-integration-2026-10-12: OK (conflitos, módulos, cache, persistência, isolamento e novos formulários)');
