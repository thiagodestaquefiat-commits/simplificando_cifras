const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let tick,analyser,lastSize;const context={window:{requestAnimationFrame(fn){tick=fn;return 1;},cancelAnimationFrame(){}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('js/tuner.js','utf8'),context);
class AudioContext{
  constructor(){this.sampleRate=48000;}
  async resume(){}
  async close(){}
  createMediaStreamSource(){return {connect(){},disconnect(){}};}
  createAnalyser(){analyser={fftSize:8192,get frequencyBinCount(){return this.fftSize/2;},getFloatTimeDomainData(samples){lastSize=samples.length;samples.fill(.02);},getFloatFrequencyData(spectrum){spectrum.fill(-60);},disconnect(){}};return analyser;}
}
(async()=>{
  const frames=[],stream={getTracks:()=>[{stop(){}}]},controller=context.window.appTuner.create({spectrum:true,pitch:false,fftSize:4096,intervalMs:20,AudioContext,mediaDevices:{getUserMedia:async()=>stream}});
  await controller.start((frequency,frame)=>frames.push({frequency,frame}));
  tick(0);tick(16);tick(32);
  assert.equal(frames.length,2,'processamento na primeira atualização e novamente sem esperar 80 ms');
  assert.equal(lastSize,4096);assert.equal(frames[0].frame.fftSize,4096);assert.equal(frames[0].frequency,null,'modo polifônico não depende da autocorrelação monofônica');
  assert.equal(frames[0].frame.spectrum.length,2048);controller.stop();
  const normal=context.window.appTuner.create({AudioContext,mediaDevices:{getUserMedia:async()=>stream}});await normal.start(()=>{});assert.equal(analyser.fftSize,8192,'afinador mantém resolução anterior');normal.stop();
  console.log('tuner-fast-audio.test.js: OK (janela curta, análise frequente e afinador preservado)');
})().catch(e=>{console.error(e);process.exitCode=1;});
