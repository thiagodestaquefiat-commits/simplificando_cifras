(function(global){
  'use strict';
  function tones(chord){
    const match=String(chord||'').replace(/♯/g,'#').replace(/♭/g,'b').match(/^([A-G])([#b]?)(.*)$/i);if(!match)return null;
    const roots={C:0,D:2,E:4,F:5,G:7,A:9,B:11},root=(roots[match[1].toUpperCase()]+(match[2]==='#'?1:match[2]==='b'?-1:0)+12)%12,quality=match[3].split('/')[0];
    const minor=/^m(?!aj)|^-/.test(quality),dim=/dim|°|º/.test(quality),sus2=/sus2/.test(quality),sus4=/sus|^4/.test(quality)&&!sus2;
    const third=dim||minor?3:sus2?2:sus4?5:4,fifth=dim?6:/aug|\+/.test(quality)?8:7,intervals=[0,third,fifth];
    if(/maj7|M7|7M/.test(quality))intervals.push(11);else if(/7/.test(quality))intervals.push(dim?9:10);
    if(/9/.test(quality))intervals.push(2);if(/6/.test(quality))intervals.push(9);
    const bass=String(chord).split('/')[1];if(bass){const b=tones(bass);if(b)intervals.push((b.root-root+12)%12);}
    return {root,third:(root+third)%12,notes:[...new Set(intervals.map(n=>(root+n)%12))]};
  }
  function chroma(frame){
    const result=new Float64Array(12),spectrum=frame?.spectrum;if(!spectrum||frame.rms<.008)return result;
    let maximum=-Infinity;for(let i=1;i<spectrum.length;i++)if(i*frame.sampleRate/frame.fftSize>=65&&i*frame.sampleRate/frame.fftSize<=1500)maximum=Math.max(maximum,spectrum[i]);
    if(!Number.isFinite(maximum)||maximum<-75)return result;
    for(let i=2;i<spectrum.length-1;i++){
      const frequency=i*frame.sampleRate/frame.fftSize,value=spectrum[i];if(frequency<65||frequency>1500||value<maximum-28||value<spectrum[i-1]||value<=spectrum[i+1])continue;
      const denominator=spectrum[i-1]-2*value+spectrum[i+1],offset=Number.isFinite(denominator)&&denominator?Math.max(-.5,Math.min(.5,.5*(spectrum[i-1]-spectrum[i+1])/denominator)):0;
      const midi=69+12*Math.log2((i+offset)*frame.sampleRate/frame.fftSize/440),nearest=Math.round(midi);if(Math.abs(midi-nearest)>.38)continue;
      result[(nearest%12+12)%12]+=10**((value-maximum)/20)/Math.sqrt(frequency/100);
    }
    return result;
  }
  function matches(profile,chord,shift=0){
    const model=tones(chord);if(!model)return false;
    const sum=Array.from(profile).reduce((a,b)=>a+b,0);if(sum<=0)return false;
    const root=(model.root+shift+120)%12,third=(model.third+shift+120)%12,notes=model.notes.map(n=>(n+shift+120)%12),coverage=notes.reduce((a,n)=>a+profile[n],0)/sum;
    const present=notes.filter(n=>profile[n]/sum>.035).length;
    const thirdInterval=(model.third-model.root+12)%12;
    const opposite=thirdInterval===4?(root+3)%12:thirdInterval===3?(root+4)%12:null;
    // A posição aberta de A repete A/E, mas toca C# em apenas uma corda.
    // Aceita uma terça mais fraca, sem aceitar uma terça oposta dominante.
    if(opposite!==null&&profile[opposite]/sum>.07&&profile[opposite]>profile[third]*.9)return false;
    // Uma nota isolada pode guiar o acompanhamento, mas não uma terça/fundamental concorrente.
    if(profile[root]/sum>.80)return true;
    return present>=3&&coverage>.73&&profile[root]/sum>.08&&profile[third]/sum>.035;
  }
  global.chordAudio=Object.freeze({tones,chroma,matches});
})(window);
