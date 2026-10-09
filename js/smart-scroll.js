(function(global){
  'use strict';

  const PITCH_CLASS={C:0,'C#':1,DB:1,D:2,'D#':3,EB:3,E:4,F:5,'F#':6,GB:6,G:7,'G#':8,AB:8,A:9,'A#':10,BB:10,B:11};

  function normalizeNote(value){
    const note=String(value||'').trim().toUpperCase().replace('♯','#').replace('♭','B');
    return Object.hasOwn(PITCH_CLASS,note)?PITCH_CLASS[note]:null;
  }
  function chordRoot(chord){
    const match=String(chord||'').trim().match(/^([A-Ga-g])([#b♯♭]?)/);
    return match?normalizeNote(match[1].toUpperCase()+match[2]):null;
  }
  function noteFromFrequency(frequency){
    if(!Number.isFinite(frequency)||frequency<=0)return null;
    return ((Math.round(69+12*Math.log2(frequency/440))%12)+12)%12;
  }
  function repeatCount(value,fallback=1){
    const match=String(value||'').match(/(?:\(\s*)?(\d{1,2})\s*[x×](?:\s*\))?\s*$/i);
    const count=match?Number(match[1]):0;
    return count>=1&&count<=99?count:fallback;
  }
  function buildSequence(blocks){
    const sequence=[];
    Array.from(blocks||[]).forEach((element,blockIndex)=>{
      const chordElements=Array.from(element.querySelectorAll?.('[data-smart-chord-token]')||[]);
      const chords=chordElements.length?chordElements.map(chordElement=>({chord:chordElement.dataset.smartChordToken,chordElement})):String(element.dataset.smartChords||'').split(/\s+/).map(chord=>({chord,chordElement:null}));
      const explicit=Number(element.dataset.smartRepeat);
      const count=Number.isInteger(explicit)&&explicit>=1&&explicit<=99?explicit:repeatCount(element.dataset.smartChords||element.textContent);
      const repeats=count>=1&&count<=99?count:1;
      for(let repetition=1;repetition<=repeats;repetition++)chords.forEach(({chord,chordElement})=>{
        const root=chordRoot(chord);
        if(root!==null)sequence.push({root,chord,blockIndex,element,chordElement,repetition,repeats});
      });
    });
    return sequence;
  }

  function createTracker(options={}){
    const stableMs=options.stableMs??250,cooldownMs=options.cooldownMs??180,dropoutMs=options.dropoutMs??220,rearmSilenceMs=options.rearmSilenceMs??0;
    let sequence=[],index=0,candidate=null,candidateSince=0,candidateLastSeen=0,lastAdvance=-Infinity,lastMatchedRoot=null,armed=true;
    let lastSignalAt=-Infinity;
    function reset(next=[]){sequence=next;index=0;candidate=null;candidateSince=0;candidateLastSeen=0;lastAdvance=-Infinity;lastMatchedRoot=null;lastSignalAt=-Infinity;armed=true;return current();}
    function current(){return sequence[index]||null;}
    function align(blockIndex){const found=sequence.findIndex(item=>item.blockIndex>=blockIndex);index=found<0?sequence.length:found;candidate=null;candidateSince=0;candidateLastSeen=0;armed=true;return current();}
    function seek(nextIndex){index=Math.max(0,Math.min(sequence.length,Number(nextIndex)||0));candidate=null;candidateSince=0;candidateLastSeen=0;armed=true;return current();}
    function sample(note,time,onset=false){
      const target=current();
      if(note===null){
        if(stableMs>0&&candidate!==null&&time-candidateLastSeen<=dropoutMs)return {advanced:false,current:target,index};
        candidate=null;candidateSince=0;candidateLastSeen=0;if(time-lastSignalAt>=rearmSilenceMs)armed=true;return {advanced:false,current:target,index};
      }
      lastSignalAt=time;
      if(!target)return {advanced:false,complete:true,current:null,index};
      if(onset&&time-lastAdvance>=cooldownMs){if(!armed){candidate=null;candidateSince=0;candidateLastSeen=0;}armed=true;}
      if(note!==lastMatchedRoot)armed=true;
      if(note!==target.root){candidate=note;candidateSince=time;candidateLastSeen=time;armed=true;return {advanced:false,current:target,index};}
      if(candidate!==note){candidate=note;candidateSince=time;candidateLastSeen=time;if(stableMs>0)return {advanced:false,current:target,index};}
      candidateLastSeen=time;
      if(!armed||time-lastAdvance<cooldownMs||time-candidateSince<stableMs)return {advanced:false,current:target,index};
      const matched=target;index++;lastAdvance=time;lastMatchedRoot=note;armed=false;candidate=null;candidateSince=0;candidateLastSeen=0;
      return {advanced:true,matched,current:current(),complete:index>=sequence.length,index};
    }
    return Object.freeze({reset,current,align,seek,sample,getIndex:()=>index,getSequence:()=>sequence.slice()});
  }

  function create(options={}){
    const tracker=createTracker(options),tuner=options.tuner||global.appTuner?.create({spectrum:true,pitch:false,fftSize:4096,intervalMs:20});
    let active=false,container=null,onUpdate=()=>{},manualTimer=0,manualIntentUntil=0,manualDisplaced=false,programmaticUntil=0;
    let previousRms=0;
    const blocks=()=>container?.querySelectorAll('[data-smart-line]')||[];
    function sync(){const previousIndex=tracker.getIndex();tracker.reset(buildSequence(blocks()));tracker.seek(previousIndex);emit();}
    function emit(extra={}){onUpdate({active,current:tracker.current(),index:tracker.getIndex(),total:tracker.getSequence().length,...extra});}
    function scrollToBlock(blockIndex,allowBackward=false){
      const target=Array.from(blocks())[blockIndex];if(!target)return;
      programmaticUntil=performance.now()+1600;
      const relativeTop=target.getBoundingClientRect().top-container.getBoundingClientRect().top;
      const readingOffset=Math.min(150,Math.max(72,container.clientHeight*.22));
      const top=container.scrollTop+relativeTop-readingOffset;
      container.scrollTo({top:allowBackward?Math.max(0,top):Math.max(container.scrollTop+56,top),behavior:'smooth'});
    }
    function finish(result){
      active=false;clearTimeout(manualTimer);tuner?.stop();
      container?.removeEventListener('scroll',onScroll);removeManualListeners();
      if(container){programmaticUntil=performance.now()+1600;container.scrollTo({top:0,behavior:'smooth'});}
      emit({completed:true,result});
    }
    function handleFrequency(frequency,audioFrame){
      if(!active)return;
      const target=tracker.current(),shift=Number(options.getPitchShift?.()||0);
      const note=audioFrame&&global.chordAudio ? (target&&global.chordAudio.matches(global.chordAudio.chroma(audioFrame),target.chord,shift)?target.root:null) : ((noteFromFrequency(frequency)===null)?null:(noteFromFrequency(frequency)-shift+120)%12);
      if(manualDisplaced&&target&&note===target.root){manualDisplaced=false;scrollToBlock(target.blockIndex,true);}
      const rms=audioFrame?.rms||0,onset=rms>.018&&previousRms>0&&rms>previousRms*1.9;previousRms=rms;
      const result=tracker.sample(note,performance.now(),onset);
      if(result.advanced&&result.current&&result.current.blockIndex===result.matched.blockIndex&&result.current.repetition!==result.matched.repetition)scrollToBlock(result.current.blockIndex,true);
      if(result.advanced&&result.current&&result.current.blockIndex!==result.matched.blockIndex)scrollToBlock(result.current.blockIndex);
      if(result.complete){finish(result);return;}
      emit({frequency,result});
    }
    function noteManualIntent(){manualIntentUntil=performance.now()+900;}
    function addManualListeners(){container?.addEventListener('pointerdown',noteManualIntent,{passive:true});container?.addEventListener('touchstart',noteManualIntent,{passive:true});container?.addEventListener('wheel',noteManualIntent,{passive:true});container?.addEventListener('keydown',noteManualIntent);}
    function removeManualListeners(){container?.removeEventListener('pointerdown',noteManualIntent);container?.removeEventListener('touchstart',noteManualIntent);container?.removeEventListener('wheel',noteManualIntent);container?.removeEventListener('keydown',noteManualIntent);}
    function onScroll(){
      if(!active||performance.now()<programmaticUntil||performance.now()>manualIntentUntil)return;
      manualDisplaced=true;
    }
    async function start(nextContainer,nextUpdate){
      if(active)return true;
      container=nextContainer;onUpdate=nextUpdate||(()=>{});manualDisplaced=false;previousRms=0;tracker.reset(buildSequence(blocks()));
      if(!tracker.getSequence().length)throw new Error('no_chords');
      const ownContainer=container;ownContainer.addEventListener('scroll',onScroll,{passive:true});
      addManualListeners();
      try{const started=await tuner.start(handleFrequency);if(!started||container!==ownContainer){ownContainer.removeEventListener('scroll',onScroll);removeManualListeners();return false;}active=true;emit();return true;}
      catch(error){ownContainer.removeEventListener('scroll',onScroll);removeManualListeners();throw error;}
    }
    function stop(){active=false;clearTimeout(manualTimer);tuner?.stop();container?.removeEventListener('scroll',onScroll);removeManualListeners();container=null;emit();}
    return Object.freeze({start,stop,sync,isActive:()=>active,tracker});
  }

  global.smartScroll=Object.freeze({create,createTracker,buildSequence,chordRoot,noteFromFrequency,repeatCount});
})(window);
