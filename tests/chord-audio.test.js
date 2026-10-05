const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let time=0;const context={window:{},performance:{now:()=>time},clearTimeout,setTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync('js/chord-audio.js','utf8'),context);const audio=context.window.chordAudio;
function profile(notes){const p=new Float64Array(12);notes.forEach(([n,v])=>p[n]=v);return p;}
assert.equal(audio.matches(profile([[0,1],[4,.8],[7,.7]]),'C'),true);
assert.equal(audio.matches(profile([[0,1],[3,.8],[7,.7]]),'C'),false,'menor não passa por maior');
assert.equal(audio.matches(profile([[0,1],[3,.8],[7,.7]]),'Cm'),true);
assert.equal(audio.matches(profile([[4,1],[7,.8],[0,.7]]),'C/E'),true,'inversão mantém acorde');
assert.equal(audio.matches(profile([[2,1],[6,.8],[9,.7]]),'C',2),true,'capotraste desloca som esperado');
assert.equal(audio.matches(profile([[9,1],[1,.8],[4,.7]]),'C'),false);
assert.equal(audio.matches(profile([[0,1]]),'C'),true,'nota tônica isolada continua suportada');
assert.equal(audio.matches(profile([[4,1]]),'C'),false,'terça isolada não avança');
function frame(notes,rms=.1){const sampleRate=48000,fftSize=8192,spectrum=new Float32Array(4096).fill(-110);for(const midi of notes){const bin=440*2**((midi-69)/12)*fftSize/sampleRate;for(let i=Math.floor(bin)-1;i<=Math.ceil(bin)+1;i++)spectrum[i]=Math.max(spectrum[i],-20-15*(i-bin)**2);}return {spectrum,sampleRate,fftSize,rms};}
assert.equal(audio.matches(audio.chroma(frame([48,52,55,60,64,67])),'C'),true);
assert.equal(audio.matches(audio.chroma(frame([48,51,55,60,63,67])),'C'),false);
assert.equal(audio.matches(audio.chroma(frame([48,52,55],.001)),'C'),false,'silêncio não avança');
assert.equal(audio.matches(audio.chroma({spectrum:new Float32Array(4096).fill(-30),sampleRate:48000,fftSize:8192,rms:.1}),'C'),false,'ruído plano não passa');
console.log('chord-audio.test.js: OK (maior/menor, inversão, capo, nota isolada, espectro e silêncio)');
vm.runInContext(fs.readFileSync('js/smart-scroll.js','utf8'),context);
const repeated=context.window.smartScroll.createTracker();repeated.reset([{root:0,chord:'C'},{root:0,chord:'C'}]);repeated.sample(0,0);assert.equal(repeated.sample(0,250).advanced,true);assert.equal(repeated.sample(0,500).advanced,false);assert.equal(repeated.sample(0,600,true).advanced,false);assert.equal(repeated.sample(0,850).advanced,true,'nova batida rearma sem consumir acorde sustentado');
let callback;const lines=[{dataset:{smartChords:'C G'},getBoundingClientRect:()=>({top:100})}],container={scrollTop:0,clientHeight:600,querySelectorAll:()=>lines,addEventListener(){},removeEventListener(){},getBoundingClientRect:()=>({top:0}),scrollTo(){}};
const controller=context.window.smartScroll.create({tuner:{start(handler){callback=handler;return Promise.resolve(true);},stop(){}}});
(async()=>{await controller.start(container);for(time=0;time<=320;time+=80)callback(null,frame([48,51,55,60,63,67]));assert.equal(controller.tracker.getIndex(),0,'acorde incompatível não avança');for(time=400;time<=720;time+=80)callback(null,frame([48,52,55,60,64,67]));assert.equal(controller.tracker.getIndex(),1,'acorde completo avança mesmo quando autocorrelação não encontra fundamental');controller.stop();console.log('chord-audio pipeline: OK');})().catch(error=>{console.error(error);process.exitCode=1;});
