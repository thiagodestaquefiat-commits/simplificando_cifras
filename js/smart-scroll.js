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
  function buildSequence(blocks){
    const sequence=[];
    Array.from(blocks||[]).forEach((element,blockIndex)=>{
      const chordElements=Array.from(element.querySelectorAll?.('[data-smart-chord-token]')||[]);
      const chords=chordElements.length?chordElements.map(chordElement=>({chord:chordElement.dataset.smartChordToken,chordElement})):String(element.dataset.smartChords||'').split(/\s+/).map(chord=>({chord,chordElement:null}));
      chords.forEach(({chord,chordElement})=>{
        const root=chordRoot(chord);
        if(root!==null)sequence.push({root,chord,blockIndex,element,chordElement});
      });
    });
    return sequence;
  }

  function createTracker(options={}){
    const stableMs=options.stableMs||250,cooldownMs=options.cooldownMs||180;
    let sequence=[],index=0,candidate=null,candidateSince=0,lastAdvance=-Infinity,lastMatchedRoot=null,armed=true;
    function reset(next=[]){sequence=next;index=0;candidate=null;candidateSince=0;lastAdvance=-Infinity;lastMatchedRoot=null;armed=true;return current();}
    function current(){return sequence[index]||null;}
    function align(blockIndex){const found=sequence.findIndex(item=>item.blockIndex>=blockIndex);index=found<0?sequence.length:found;candidate=null;candidateSince=0;armed=true;return current();}
    function seek(nextIndex){index=Math.max(0,Math.min(sequence.length,Number(nextIndex)||0));candidate=null;candidateSince=0;armed=true;return current();}
    function sample(note,time){
      const target=current();
      if(note===null){candidate=null;candidateSince=0;armed=true;return {advanced:false,current:target,index};}
      if(!target)return {advanced:false,complete:true,current:null,index};
      if(note!==lastMatchedRoot)armed=true;
      if(note!==target.root){candidate=note;candidateSince=time;armed=true;return {advanced:false,current:target,index};}
      if(candidate!==note){candidate=note;candidateSince=time;return {advanced:false,current:target,index};}
      if(!armed||time-lastAdvance<cooldownMs||time-candidateSince<stableMs)return {advanced:false,current:target,index};
      const matched=target;index++;lastAdvance=time;lastMatchedRoot=note;armed=false;candidate=null;candidateSince=0;
      return {advanced:true,matched,current:current(),complete:index>=sequence.length,index};
    }
    return Object.freeze({reset,current,align,seek,sample,getIndex:()=>index,getSequence:()=>sequence.slice()});
  }

  function create(options={}){
    const tracker=createTracker(options),tuner=options.tuner||global.appTuner?.create();
    let active=false,container=null,onUpdate=()=>{},manualTimer=0,manualIntentUntil=0,manualDisplaced=false,programmaticUntil=0;
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
    function handleFrequency(frequency){
      if(!active)return;
      const note=noteFromFrequency(frequency),target=tracker.current();
      if(manualDisplaced&&target&&note===target.root){manualDisplaced=false;scrollToBlock(target.blockIndex,true);}
      const result=tracker.sample(note,performance.now());
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
      container=nextContainer;onUpdate=nextUpdate||(()=>{});manualDisplaced=false;tracker.reset(buildSequence(blocks()));
      if(!tracker.getSequence().length)throw new Error('no_chords');
      const ownContainer=container;ownContainer.addEventListener('scroll',onScroll,{passive:true});
      addManualListeners();
      try{const started=await tuner.start(handleFrequency);if(!started||container!==ownContainer){ownContainer.removeEventListener('scroll',onScroll);removeManualListeners();return false;}active=true;emit();return true;}
      catch(error){ownContainer.removeEventListener('scroll',onScroll);removeManualListeners();throw error;}
    }
    function stop(){active=false;clearTimeout(manualTimer);tuner?.stop();container?.removeEventListener('scroll',onScroll);removeManualListeners();container=null;emit();}
    return Object.freeze({start,stop,sync,isActive:()=>active,tracker});
  }

  global.smartScroll=Object.freeze({create,createTracker,buildSequence,chordRoot,noteFromFrequency});
})(window);
