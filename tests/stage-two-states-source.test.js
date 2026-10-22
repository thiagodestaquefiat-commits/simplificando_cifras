const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');

assert.match(html,/class="stage-preparation-controls"/);
assert.match(html,/class="stage-execution-controls"/);
assert.match(html,/id="stage-scroll-pause"/);
assert.match(html,/let stageMode=false,stageExecutionStarted=false/);
assert.match(html,/function pauseAutoScroll\(\)/);
assert.match(html,/if\(!stageMode\)studyMetronome\.start\(\)/);
assert.match(html,/stageMode&&stageExecutionStarted/);
assert.match(html,/\.stage-mode\.stage-scroll-compact \.stage-preparation-controls[^}]*display:none/);
assert.match(html,/\.stage-mode\.stage-scroll-compact \.stage-execution-controls\{display:flex\}/);
assert.match(html,/\.stage-mode \.stage-nav-icon:disabled\{opacity:\.25;pointer-events:none\}/);
assert.match(html,/\.stage-mode \.wa-block \.chord-line[^}]*color:#ff8500/);

console.log('stage-two-states-source.test.js: OK (preparação, execução, pausa, navegação e cor das cifras)');
