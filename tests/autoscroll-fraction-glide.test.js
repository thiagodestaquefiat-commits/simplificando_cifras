// Rolagem automática sem engasgo (19/11): o navegador rola só em pixels inteiros; em velocidade baixa
// isso virava "anda 1, para 1". A fração vai para um deslocamento da cifra e é limpa ao parar.
const assert=require('node:assert/strict'),html=require('node:fs').readFileSync('index.html','utf8');
assert.ok(/const whole=Math\.floor\(scrollPosition\);if\(Math\.abs\(whole-vd\.scrollTop\)>=0\.5\)vd\.scrollTop=whole;/.test(html),'parte inteira vai para a rolagem');
assert.ok(!/reached<whole/.test(html),'arredondamento do Android (pedir 100 e virar 99,81) não para a rolagem');
assert.ok(/vd\.scrollTop\+vd\.clientHeight>=vd\.scrollHeight-1\|\|\(stalledFrames>120/.test(html),'para só no fim da música ou se a tela travar');
assert.ok(/translate3d\(0,\$\{\(-fraction\)\.toFixed\(3\)\}px,0\)/.test(html),'fração vira deslocamento da cifra');
assert.ok(/if\(!active\)\{const glide=document\.getElementById\('detail-content'\);if\(glide&&glide\.style\.transform\)glide\.style\.transform='';\}/.test(html),'ao parar, o deslocamento é limpo');
console.log('ok - rolagem automática anda em frações de pixel');
