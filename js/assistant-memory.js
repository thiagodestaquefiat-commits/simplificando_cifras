(function (global) {
  'use strict';
  // A single short-lived control reference, never a transcript or a user profile.
  function create({ context, normalize, numbers, snapshot, now = () => Date.now(), ttlMs = 45000 }) {
    const result = global.roudyActionManager.result;
    const owner = c => JSON.stringify([c.ownerId,c.authSubject,c.libraryOwner,c.ready]);
    const scope = c => JSON.stringify([owner(c),c.screen,c.songId,c.eventId,c.itemId,c.canEditSong,c.canAccessEvent,c.canManageEvent,c.editorOpen,c.dialogueScope]);
    const colors = {dourado:'dourado',coral:'coral',vermelho:'vermelho',vermelha:'vermelho',laranja:'laranja',amarelo:'amarelo',amarela:'amarelo',verde:'verde',azul:'azul',roxo:'roxo',roxa:'roxo',rosa:'rosa',branco:'branco',branca:'branco'};
    const languages = ['portugues','portugues brasileiro','espanhol','espanol','ingles','english','italiano','frances','francais','alemao','deutsch'];
    const integer = text => { const value=numbers(text);return /^\d+$/.test(value)?Number(value):null; };
    const controls = {
      bpm: { correction: value => { const n=integer(value);return n===null?null:'bpm '+n; }, relative: up => up?'aumentar bpm':'diminuir bpm' },
      scrollSpeed: { relative: up => up?'aumentar velocidade da rolagem':'diminuir velocidade da rolagem' },
      semitones: { relative: up => up?'subir tom':'descer tom' },
      capo: { correction: value => { const n=integer(value.replace(/^casa /,''));return n===null?null:'capotraste '+n; }, relative: (up,values) => 'capotraste '+(values.capo+(up?1:-1)) },
      fontSize: { relative: up => up?'aumentar fonte':'diminuir fonte' },
      chordColor: { correction: value => colors[value]?'cor da cifra '+colors[value]:null },
      language: { correction: value => languages.includes(value)?'mudar idioma para '+value:null },
      theme: { correction: value => ['claro','escuro','do sistema'].includes(value)?'tema '+value:null }
    };
    const actions = {'metronome.bpm':'bpm','metronome.adjust':'bpm','metronome.play':'bpm','scroll.speed':'scrollSpeed','song.capo':'capo','song.transpose':'semitones','song.reset-key':'semitones','song.font':'fontSize','settings.color':'chordColor','settings.language':'language','settings.theme':'theme'};
    let reference = null;
    function clear() { reference=null; }
    function sync() {
      if(reference&&(reference.scope!==scope(context())||now()>=reference.expiresAt||snapshot()[reference.key]!==reference.value))clear();
      return reference;
    }
    function observe(output, before) {
      if(output.duplicate)return;
      if(!output.ok||owner(before)!==owner(context())){clear();return;}
      const steps=output.action==='assistant.sequence'?output.steps||[]:[output];
      const keys=new Set(steps.filter(step=>step.ok).map(step=>actions[step.action]).filter(Boolean));
      if(keys.size!==1){if(output.action!=='song.save'&&output.action!=='assistant.help')clear();return;}
      const key=[...keys][0],current=context(),value=snapshot()[key];
      if(current.ready===false||current.editorOpen||value===undefined){clear();return;}
      reference={key,value,scope:scope(current),expiresAt:now()+ttlMs};
    }
    function interpret(raw) {
      const text=normalize(raw),ref=sync();
      if(/\b(?:nao|nem|nunca)\b/.test(text))return null;
      const speed=text.match(/^(?:(?:deixa|deixe|colocar|deixar) )?(?:um pouco )?mais (rapido|devagar|lento)$/);
      const complaint=text.match(/^(?:(?:esta|ta|ficou) )?(?:muito )?(rapido|devagar|lento)(?: demais)?$/);
      const relative=text.match(/^(aumentar|diminuir)(?: (?:um pouco|mais um pouco|um pouquinho))?$/);
      const correction=text.match(/^(?:prefiro|melhor|na verdade|em vez disso|mudar para|trocar para|ajustar para|colocar em|deixa em|deixe em)(?: (?:em|para))? (.+)$/);
      if(!speed&&!complaint&&!relative&&!correction)return null;
      const current=context();
      if(current.ready===false||current.editorOpen||current.songOpen&&!current.canEditSong)return result('blocked','Conclua o editor ou aguarde a conta antes de ajustar por voz.');
      if(correction){
        if(!ref)return result('clarify','Não tenho um ajuste recente como referência. Diga o controle e o valor, por exemplo: cor da cifra verde ou BPM 90.');
        const command=controls[ref.key]?.correction?.(correction[1]);
        return command?{command}:result('clarify','Diga o controle e o valor desejados. Não apliquei essa correção.');
      }
      const up=speed?speed[1]==='rapido':complaint?complaint[1]!=='rapido':relative[1]==='aumentar';
      const compatible=ref&&controls[ref.key]?.relative&&(!(speed||complaint)||['bpm','scrollSpeed'].includes(ref.key));
      if(compatible)return {command:controls[ref.key].relative(up,snapshot())};
      const choices=[{id:'bpm',label:'BPM do metrônomo',aliases:['bpm','metronomo','andamento'],command:controls.bpm.relative(up)}];
      if(current.songOpen)choices.push({id:'scroll',label:'velocidade da rolagem automática',aliases:['rolagem','rolagem automatica','velocidade da rolagem'],command:controls.scrollSpeed.relative(up)});
      // With no recent reference, even the sole available control must be named.
      if(choices.length<2)return result('clarify','Diga o controle que deseja ajustar, por exemplo: aumentar BPM.');
      return result('clarify','Você quer ajustar o BPM do metrônomo ou a velocidade da rolagem automática?',{followUp:{kind:'command',choices}});
    }
    return Object.freeze({interpret,observe,sync,clear});
  }
  global.roudyAssistantMemory=Object.freeze({create});
})(window);
