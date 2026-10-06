(function(global){
  "use strict";
  let recognition=null,listening=false;
  const COLORS={coral:"coral",vermelho:"red",laranja:"orange",amarelo:"yellow",verde:"green",azul:"blue",roxo:"purple",rosa:"pink",branco:"white"};
  const LANGUAGES={portugues:"pt-BR",brasileiro:"pt-BR",espanhol:"es",ingles:"en",italiano:"it",frances:"fr",alemao:"de",english:"en",espanol:"es",deutsch:"de"};
  const TUNER_INSTRUMENTS={violao:"guitar",guitarra:"guitar",ukulele:"ukulele",baixo:"bass",contrabaixo:"bass",violino:"violin"};
  const CHORD_INSTRUMENTS={violao:"guitar",guitarra:"guitar",ukulele:"ukulele",teclado:"keyboard",piano:"keyboard",cavaco:"cavaquinho",cavaquinho:"cavaquinho",viola:"viola-caipira-cebolao-e"};
  const MONTHS={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
  const NUMBER_WORDS={primeiro:1,um:1,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,"vinte e um":21,"vinte e dois":22,"vinte e tres":23,"vinte e quatro":24,"vinte e cinco":25,"vinte e seis":26,"vinte e sete":27,"vinte e oito":28,"vinte e nove":29,trinta:30,"trinta e um":31};
  const clean=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const includesAny=(text,values)=>values.some(value=>text.includes(value));
  const element=id=>global.document.getElementById(id);
  function spokenNumbers(text){
    const units={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19};
    const tens={vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cento:100,duzentos:200, cem:100};
    return text.replace(/\b(?:duzentos|cento|cem|noventa|oitenta|setenta|sessenta|cinquenta|quarenta|trinta|vinte|dezenove|dezoito|dezessete|dezesseis|quinze|catorze|quatorze|treze|doze|onze|dez|nove|oito|sete|seis|cinco|quatro|tres|duas|dois|uma|um|zero)(?: e (?:noventa|oitenta|setenta|sessenta|cinquenta|quarenta|trinta|vinte|dezenove|dezoito|dezessete|dezesseis|quinze|quatorze|catorze|treze|doze|onze|dez|nove|oito|sete|seis|cinco|quatro|tres|duas|dois|uma|um))*/g, phrase=>String(phrase.split(' e ').reduce((sum,word)=>sum+(units[word]??tens[word]??0),0)));
  }
  function normalizeCommand(value){
    let text=clean(String(value||'').replace(/(compasso\s+\d+)\s*\/\s*(\d+)/i,'$1 por $2')).replace(/^(?:(?:e ai|eai|ei|ola)\s+)?roudy\s*/,"").replace(/^por favor\s+/,"").replace(/^(?:eu\s+)?(?:quero|gostaria de|preciso que|voce pode|pode)\s+/,"");
    text=text.replace(/^(?:me leve|me leva|va|vamos|ir)\s+(?:para|pra|pro|a)\s+/,"abrir ").replace(/^(?:abre|abra|mostra|mostre)\s+/,"abrir ");
    text=text.replace(/^(?:mude|muda|troque|troca|altere|altera)\s+/,"mudar ").replace(/^(?:ligue|liga|ative|ativa|aciona|acione|inicie|comece|comeca|de inicio a)\s+/,"iniciar ").replace(/^(?:desligue|desliga|desative|desativa|pare|para|pause|pausa|interrompa|interrompe|cancele|cancela|silencie|silencia)\s+/,"parar ");
    text=text.replace(/^(?:aumente|aumenta|acelere|acelera)\s+/,"aumentar ").replace(/^(?:diminua|diminui|reduza|reduz|desacelere|desacelera)\s+/,"diminuir ").replace(/^(?:baixe|baixa)\s+/,"baixar ").replace(/^(?:salve|salva)\s+/,"salvar ");
    text=text.replace(/^(?:edite|edita)\s+/,"editar ").replace(/^(?:exclua|exclui|apague|apaga|remova|remove)\s+/,"excluir ").replace(/^(?:compartilhe|compartilha)\s+/,"compartilhar ").replace(/^(?:sincronize|sincroniza)\s+/,"sincronizar ").replace(/^(?:busque|busca|procure|procura|pesquise|pesquisa)\s+/,"buscar ");
    text=text.replace(/^(?:toca|toque|ouca|escute)\s+/,"tocar ");
    text=text.replace(/^(?:ativar|ligar|acionar|comecar|retomar|continuar|habilitar|habilite|retome|continue)\s+/,"iniciar ").replace(/^(?:desativar|desligar|pausar|interromper|cancelar|silenciar|cessar|desabilitar|desabilite)\s+/,"parar ").replace(/\s+por favor$/,"").replace(/\bukelele\b/g,"ukulele").replace(/\brolar automaticamente\b/g,'rolagem automatica').replace(/\brolagem por audio\b/g,'rolagem inteligente').replace(/\brolagem por som\b/g,'rolagem inteligente').replace(/\bbatidas por minuto\b/g,'bpm').replace(/\bconfiguracao\b/g,'configuracoes').replace(/\bdefina\b/g,'definir').replace(/\bajuste\b/g,'ajustar');
    return text.replace(/^(abrir|mudar|iniciar|parar|aumentar|diminuir|baixar|salvar|editar|excluir|compartilhar|sincronizar|buscar)\s+(?:o|a|os|as)\s+/,"$1 ").replace(/^(?:o|a|os|as)\s+(?=afinador|metronomo|playlist|evento|eventos|medley|configurac|idioma|perfil|ferramentas)/,"");
  }
  function transcriptionScore(value){const text=clean(value);let score=0;const vocabulary=["playlist","evento","medley","afinador","metronomo","configuracao","idioma","perfil","ferramenta","musica","tablatura","cifra","capotraste","rolagem","palco","tema","contraste","sincronizar","youtube"];vocabulary.forEach(word=>{if(text.includes(word))score+=3;});if(musicas.some(song=>clean(song.title)===text))score+=20;if(setlists.some(event=>clean(event.title)===text))score+=18;return score;}
  function message(text,kind=""){const output=element("assistant-message");if(output){output.textContent=text;output.dataset.kind=kind;}if(typeof global.showToast==="function")global.showToast((kind==="error"?"⚠️ ":"")+text);}
  function speak(text){if(!global.speechSynthesis||!global.SpeechSynthesisUtterance)return;global.speechSynthesis.cancel();const utterance=new global.SpeechSynthesisUtterance(text);utterance.lang=global.document.documentElement.lang||"pt-BR";utterance.rate=1;global.speechSynthesis.speak(utterance);}
  function answer(text,kind="success",spoken=text){message(text,kind);speak(spoken);return {ok:kind!=="error",message:text};}
  function open(){listen();}
  function close(){stopListening();global.speechSynthesis?.cancel();}
  function closeAppLayers(){if(element("modal-overlay")?.style.display==="flex")global.closeModal?.();}
  function home(tab){global.closeEventChat?.();if(element("view-sd"))element("view-sd").style.display="none";global.closeDetail?.();closeAppLayers();global.switchTab(tab);}
  function prepareDirectNavigation(destination){
    global.closeEventChat?.();closeAppLayers();
    const songView=element("view-detail"),eventView=element("view-sd");
    if(destination==="event"){
      if(songView?.style.display==="flex")global.closeDetail?.();
      if(songView) songView.style.display="none";
    }else if(destination==="song"){
      if(eventView?.style.display==="flex")global.closeSD?.();
      if(eventView) eventView.style.display="none";
    }
  }
  function navigateToEvent(event){close();prepareDirectNavigation("event");global.openSD(event.id);}
  function navigateToSong(song){close();prepareDirectNavigation("song");global.openDetail(song.id);}
  function songMatches(query){const target=clean(query);if(!target)return [];const exact=musicas.filter(song=>clean(song.title)===target||clean(song.title+' de '+song.artist)===target);if(exact.length)return exact;return musicas.filter(song=>clean(song.title).includes(target));}
  function findSong(query){const matches=songMatches(query);return matches.length===1?matches[0]:null;}
  function songFromNaturalRequest(text){
    const candidates=[text,text.replace(/^(?:a |a musica |musica )/,""),text.replace(/^(?:quero |gostaria de )?(?:ouvir|tocar|abrir|ver)\s+(?:a\s+)?(?:musica\s+)?/,"")].map(clean).filter(Boolean);
    for(const candidate of candidates){const exact=musicas.filter(song=>clean(song.title)===candidate);if(exact.length===1)return exact[0];}
    for(const candidate of candidates){const match=findSong(candidate);if(match)return match;}
    return null;
  }
  function findNamedEvent(query){const target=clean(query);const matches=setlists.filter(event=>clean(event.title).includes(target)||target.includes(clean(event.title)));return matches.length===1?matches[0]:null;}
  function localDate(value){
    if(!value)return "";
    const raw=String(value).trim();
    let match=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match)return `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`;
    match=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if(match)return `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;
    const parsed=new Date(raw);if(Number.isNaN(parsed.getTime()))return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}-${String(parsed.getDate()).padStart(2,"0")}`;
  }
  function dateKey(offset=0){const date=new Date();date.setDate(date.getDate()+offset);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;}
  function openDatedEvent(offset,label){const matches=setlists.filter(event=>localDate(event.date)===dateKey(offset));if(!matches.length)return answer(`Você não possui eventos marcados para ${label}.`,"error");if(matches.length===1){navigateToEvent(matches[0]);return answer(`Abrindo o evento ${matches[0].title}.`);}home("setlists");return answer(`Encontrei ${matches.length} eventos para ${label}. Abri a lista para você escolher.`);}
  function openEventByCalendarDay(day,month,year){
    const today=new Date(),wantedDay=Number(day),wantedMonth=month?Number(month):null,wantedYear=year?Number(year):null;
    let matches=setlists.filter(event=>{const iso=localDate(event.date);if(!iso)return false;const [eventYear,eventMonth,eventDay]=iso.split("-").map(Number);return eventDay===wantedDay&&(!wantedMonth||eventMonth===wantedMonth)&&(!wantedYear||eventYear===wantedYear);});
    if(!wantedMonth&&!wantedYear){const current=matches.filter(event=>{const [eventYear,eventMonth]=localDate(event.date).split("-").map(Number);return eventMonth===today.getMonth()+1&&eventYear===today.getFullYear();});if(current.length)matches=current;}
    const label=[String(wantedDay).padStart(2,"0"),wantedMonth?String(wantedMonth).padStart(2,"0"):null,wantedYear||null].filter(Boolean).join("/");
    if(!matches.length)return answer(`Não encontrei evento marcado para o dia ${label}.`,"error");
    if(matches.length===1){navigateToEvent(matches[0]);return answer(`Abrindo o evento ${matches[0].title}, do dia ${label}.`);}
    home("setlists");return answer(`Encontrei ${matches.length} eventos no dia ${label}. Abri a lista para você escolher.`);
  }
  function eventDateFromText(text){
    if(!text.includes("evento")||!text.includes("dia"))return null;
    const dayToken=(text.match(/\bdia\s+(\d{1,2}|(?:vinte|trinta)(?: e \w+)?|primeiro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove)\b/)||[])[1];
    if(!dayToken)return null;const day=Number(dayToken)||NUMBER_WORDS[dayToken];
    const monthName=Object.keys(MONTHS).find(month=>new RegExp(`\\b${month}\\b`).test(text));
    const numericMonth=(text.match(/\bdia\s+\d{1,2}\s*(?:de|\/|-)\s*(\d{1,2})\b/)||[])[1];
    const year=(text.match(/\b(20\d{2})\b/)||[])[1];
    return day?{day,month:monthName?MONTHS[monthName]:numericMonth,year}:null;
  }
  function saveSettings(changes){const next={...global.loadAppSettings(),...changes};storage.set("sc_settings_v3",next);global.applyAppSettings(next);return next;}
  function setChordColor(color){const key=COLORS[color];if(!key)return answer("Não reconheci essa cor. Tente coral, vermelho, laranja, amarelo, verde, azul, roxo, rosa ou branco.","error");saveSettings({chordColor:key});return answer(`A cor das cifras foi alterada para ${color}.`);}
  function openSongByVoice(raw){const query=raw.replace(/^(?:abrir|abra|mostrar|mostre|tocar|toque|ir para|va para)\s+/,"").replace(/^(?:a\s+)?musica\s+/,"").trim();const matches=songMatches(query);if(matches.length>1)return answer(`Encontrei ${matches.length} músicas. Diga o título seguido de “de” e o nome do artista.`,"error");const song=matches[0];if(!song)return answer(`Não encontrei uma música chamada ${query||"assim"}.`,"error");navigateToSong(song);return answer(`Abrindo ${song.title}.`);}
  function showModal(){if(element("modal-overlay"))element("modal-overlay").style.display="flex";}
  function songMetronomeAvailable(){return element("view-detail")?.style.display==="flex"&&currentDetailId!=null&&!element("study-metronome")?.hidden;}
  function showToolsMetronome(){if(!element('tools-metronome')||element('modal-overlay')?.style.display!=='flex')global.openToolsMetronome();showModal();}
  async function setToolsBpm(bpm,start){const value=Math.max(30,Math.min(240,Number(bpm)||120));showToolsMetronome();await toolsMetronome.setBpm(value);if(start&&!toolsMetronome.isPlaying())await toolsMetronome.toggle();if(start&&!toolsMetronome.isPlaying())return answer('Não foi possível iniciar o áudio do metrônomo.', 'error');return answer(`Metrônomo ajustado para ${value} BPM${start?" e iniciado":""}.`);}
  async function setContextualMetronomeBpm(bpm,start){
    const value=Math.max(30,Math.min(240,Number(bpm)||120));
    if(!songMetronomeAvailable())return setToolsBpm(value,start);
    await studyMetronome.setBpm(value);if(start&&!studyMetronome.isPlaying())await studyMetronome.start();
    if(start&&!studyMetronome.isPlaying())return answer('Não foi possível iniciar o áudio do metrônomo.', 'error');
    return answer(`Metrônomo da música ajustado para ${value} BPM${start?" e iniciado":""}.`);
  }
  async function startContextualMetronome(){const inSong=songMetronomeAvailable(),controller=inSong?studyMetronome:toolsMetronome;if(!inSong){showToolsMetronome();}if(!controller.isPlaying())await (inSong?controller.start():controller.toggle());if(!controller.isPlaying())return answer('Não foi possível iniciar o áudio do metrônomo.', 'error');return answer(inSong?'Metrônomo da música iniciado.':'Metrônomo iniciado.');}
  function stopContextualMetronome(){if(songMetronomeAvailable()){studyMetronome.stop();return answer("Metrônomo da música interrompido.");}toolsMetronome.stop();return answer("Metrônomo interrompido.");}
  async function adjustContextualMetronome(amount){const controller=songMetronomeAvailable()?studyMetronome:toolsMetronome;if(controller===toolsMetronome){showToolsMetronome();}const value=Math.max(30,Math.min(240,controller.getBpm()+amount));await controller.setBpm(value);return answer(`Metrônomo ${amount>0?"acelerado":"desacelerado"} para ${value} BPM.`);}
  function openCurrentSongView(view,label){if(currentDetailId==null)return answer("Abra uma música antes de mudar a visualização.","error");global.setSongView(view);return answer(`Exibindo ${label}.`);}
  function searchPlaylist(query){const value=String(query||"").trim();if(!value)return answer("Diga o título ou artista que você deseja buscar.","error");home("musicas");const input=element("search-music");if(input){input.value=value;global.renderMusicas();input.focus();}return answer(`Buscando ${value} na playlist.`);}
  function setAccessibility(changes,label){saveSettings(changes);return answer(label);}
  function currentEventRequired(){return currentSdId!=null&&typeof global.findEvent==="function"?global.findEvent(currentSdId):null;}
  let lastIntentResult=null;
  function intentScope(){const state=global.appAuth?.getState?.();return JSON.stringify([state?.authenticated||false,state?.user?.id||null,typeof appCurrentUser!=='undefined'?appCurrentUser.id:null]);}
  function intentEventSnapshot(){
    return setlists.filter(event=>{
      if(!global.eventModel?.canAccess)return true;
      const actor=typeof global.eventPermissionActor==='function'?global.eventPermissionActor(event):typeof appCurrentUser!=='undefined'?appCurrentUser:null;
      return Boolean(actor&&global.eventModel.canAccess(event,actor.id));
    }).map(event=>{
      const iso=localDate(event.date);if(!iso)return null;
      const [y,m,d]=iso.split('-').map(Number),time=String(event.time||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      // Sem horário, o evento é do dia inteiro; fim do dia é limite de comparação.
      const date=new Date(y,m-1,d,time?Number(time[1]):23,time?Number(time[2]):59,time?0:59,time?0:999);
      if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
      return {event,startsAt:date.toISOString()};
    }).filter(Boolean);
  }
  async function executeIntent(raw){
    const state=global.appAuth?.getState?.();
    if(state?.authenticated&&global.eventRepository?.getActiveOwnerId&&global.eventRepository.getActiveOwnerId()!==String(typeof appCurrentUser!=='undefined'?appCurrentUser.id:''))return answer('Aguarde o carregamento da conta e repita o pedido.','error');
    const scope=intentScope(),snapshot=intentEventSnapshot(),signature=JSON.stringify(snapshot.map(e=>[String(e.event.id),e.startsAt]));
    const payload=await global.roudyIntentClient.resolve(raw,snapshot.map((e,id)=>({id,startsAt:e.startsAt})));
    if(scope!==intentScope()||signature!==JSON.stringify(intentEventSnapshot().map(e=>[String(e.event.id),e.startsAt])))return answer('Os dados ou a conta mudaram. Repita o pedido.','error');
    lastIntentResult=payload;
    if(payload.action==='inform'||payload.action==='clarify')return answer(payload.message,'error');
    if(payload.action==='choose'){close();home('setlists');return answer('Encontrei mais de um evento. Abri a lista para você escolher.');}
    if(payload.action!=='navigate')return answer('Não foi possível executar esse pedido.','error');
    const actions={
      detalhes_evento:()=>{const event=snapshot[payload.params.evento_id]?.event;if(!event)return answer('Evento não disponível.','error');navigateToEvent(event);return answer(`Abrindo o evento ${event.title}.`);},
      afinador:()=>{close();global.openTuner();showModal();return answer('Abrindo o afinador.');},
      metronomo:()=>{close();if(songMetronomeAvailable()){element('study-metronome').scrollIntoView?.({block:'nearest',behavior:'smooth'});return answer('Metrônomo da música disponível. Diga iniciar metrônomo para tocar.');}global.openToolsMetronome();showModal();return answer('Abrindo o metrônomo.');},
      configuracoes:()=>{close();global.openAppSettings();showModal();return answer('Abrindo as configurações.');},
      playlist:()=>{close();home('musicas');return answer('Abrindo sua playlist.');}
    };
    return actions[payload.screen]?.()||answer('Tela não permitida para esse comando.','error');
  }
  async function execute(raw){
    const original=String(raw||"").trim(),spokenText=clean(original).replace(/^(e ai|eai|ei|ola) roudy\s*/,"").trim(),text=normalizeCommand(original);
    if(!text){answer("Olá! O que você deseja fazer?");setTimeout(listen,650);return;}
    message(`Entendi: “${original}”. Executando…`);
    const numbered=spokenNumbers(text);
    if(text==='parar modo palco'||text==='parar palco'){if(currentDetailId==null)return answer('Abra uma música antes de controlar o Modo Palco.','error');await global.exitStageMode();return answer('Modo Palco encerrado.');}
    if(['retirar capotraste','tirar capotraste','remover capotraste','sem capotraste'].includes(text))return execute('capotraste zero');
    if(['proximo louvor','proxima cancao','avancar para a proxima musica'].includes(text))return execute('proxima musica');
    if(['cancao anterior','louvor anterior','voltar para a musica anterior'].includes(text))return execute('musica anterior');
    if(['gerar com i a','criar musica com i a','abrir inteligencia artificial'].includes(text))return execute('gerar com ia');
    const namedSong=spokenText.replace(/^roudy\s+/, '').replace(/^(?:abrir|abre|abra|mostrar|mostre|tocar|toca|toque)\s+/, '').replace(/^(?:a\s+)?musica\s+/, '');
    if(musicas.some(song=>clean(song.title+' de '+song.artist)===namedSong))return openSongByVoice(namedSong);
    const exactSongs=songMatches(spokenText);
    if(exactSongs.some(song=>clean(song.title)===spokenText))return openSongByVoice(spokenText);
    const intentMatch=global.roudyIntentClient?.classify(original);
    if(intentMatch&&['ambiguous','multiple_commands'].includes(intentMatch.reason))return answer('Diga uma ação de cada vez para eu entender com segurança.','error');
    if(/\b(nao|nunca|nem)\b/.test(spokenText))return answer('Não executei o comando negado. Diga o que deseja fazer.','error');
    if(intentMatch?.intent&&['INTENT_PROXIMO_EVENTO','INTENT_EVENTOS_HOJE','INTENT_EVENTOS_AMANHA'].includes(intentMatch.intent)&&!eventDateFromText(text))return executeIntent(original);
    if(/^(iniciar|parar) (?:alto contraste|modo daltonico)$/.test(text)){const enabled=text.startsWith('iniciar');return setAccessibility(text.includes('contraste')?{highContrast:enabled}:{colorBlind:enabled},enabled?'Preferência ativada.':'Preferência desativada.');}
    if(/\b(?:rolagem|rolar|afinador|afinacao|microfone do afinador)\b/.test(text)&&/^(iniciar|parar)\b/.test(text)){
      const start=text.startsWith('iniciar');
      if(/afinador|afinacao/.test(text)){if(!start){global.stopTuner();return answer('Afinador interrompido.');}if(!tunerController.isRunning()){global.openTuner();showModal();await global.toggleTunerMicrophone();}return tunerController.isRunning()?answer('Microfone do afinador ativado.'):answer('Não foi possível iniciar o afinador. Confira a permissão do microfone.','error');}
      if(currentDetailId==null||element('view-detail')?.style.display!=='flex')return answer('Abra uma música antes de controlar a rolagem.','error');
      if(text.includes('inteligente')){if(!start)global.stopSmartScroll();else if(!smartScrollController.isActive())await global.toggleSmartScroll();return start&&!smartScrollController.isActive()?answer('Não foi possível iniciar a rolagem inteligente. Confira o microfone e os acordes da música.','error'):answer(start?'Rolagem inteligente ativada.':'Rolagem inteligente interrompida.');}
      if(!start){global.stopAutoScroll();if(!text.includes('automatica'))global.stopSmartScroll();return answer('Rolagem interrompida.');}
      if(scrollTimer===null)global.startAutoScroll();return scrollTimer!==null?answer('Rolagem automática iniciada.'):answer('A rolagem não iniciou. Confira se há conteúdo abaixo.','error');
    }
    const meter=numbered.match(/(?:compasso|metronomo em)\s*(2|3|4|6) (?:por|sobre) (4|8)/);
    if(meter){const value=`${meter[1]}/${meter[2]}`;if(!['2/4','3/4','4/4','6/8'].includes(value))return answer('Use compasso 2 por 4, 3 por 4, 4 por 4 ou 6 por 8.','error');if(songMetronomeAvailable())await studyMetronome.setMeter(value);else{showToolsMetronome();await toolsMetronome.setMeter(Number(meter[1]));}return answer(`Compasso ajustado para ${meter[1]} por ${meter[2]}.`);}
    const bpm=numbered.match(/(?:metronomo|bpm)(?: em| para| a| de)?\s*(\d{2,3})(?: bpm)?/);
    if(bpm){if(Number(bpm[1])<30||Number(bpm[1])>240)return answer('Escolha um andamento entre 30 e 240 BPM.','error');return setContextualMetronomeBpm(bpm[1],text.startsWith('iniciar'));}
    const capo=numbered.match(/capotraste(?: na casa| casa| em| para)?\s*(\d{1,2})/);
    if(capo){if(currentDetailId==null)return answer('Abra uma música antes de alterar o capotraste.','error');const value=Number(capo[1]);if(value>12)return answer('Escolha uma casa entre zero e 12.','error');global.selectCapo(value);return answer(value?`Capotraste ajustado para a casa ${value}.`:'Capotraste removido.');}
    let match=text.match(/(?:cor (?:da |das )?cifras?|cifras?)(?: para| em)? (coral|vermelho|laranja|amarelo|verde|azul|roxo|rosa|branco)/);if(match)return setChordColor(match[1]);
    match=text.match(/(?:metronomo|bpm)(?: em| para| a| de)?\s*(\d{2,3})(?: bpm)?/);if(!match)match=text.match(/(?:ajustar|definir|colocar|configurar) (?:o )?(?:metronomo|bpm)(?: em| para| a| de)?\s*(\d{2,3})/);if(match)return setContextualMetronomeBpm(match[1],includesAny(text,["iniciar","ligar","tocar","comecar"]));
    match=text.match(/capotraste(?: na casa)?\s*(\d{1,2})/);if(match){if(currentDetailId==null)return answer("Abra uma música antes de alterar o capotraste.","error");global.selectCapo(Number(match[1]));return answer(`Capotraste ajustado para a casa ${Math.min(12,Number(match[1]))}.`);}
    const requestedLanguage=Object.keys(LANGUAGES).find(language=>text.includes(language));if(requestedLanguage&&(text===requestedLanguage||includesAny(text,["idioma","lingua","mudar para","trocar para","colocar em","falar em","deixar em","traduzir para","interface em","aplicativo em"]))){
      saveSettings({language:LANGUAGES[requestedLanguage]});return answer(`Idioma da interface alterado para ${requestedLanguage}.`);
    }
    if(includesAny(text,["tema claro","modo claro"])){saveSettings({theme:"light"});return answer("Tema claro ativado.");}
    if(includesAny(text,["tema escuro","modo escuro"])){saveSettings({theme:"dark"});return answer("Tema escuro ativado.");}
    if(includesAny(text,["tema do sistema","sincronizar tema","tema automatico"])){saveSettings({theme:"system"});return answer("O tema agora acompanha o sistema.");}
    if(includesAny(text,["ativar alto contraste","ligar alto contraste"])){return setAccessibility({highContrast:true},"Alto contraste ativado.");}
    if(includesAny(text,["desativar alto contraste","desligar alto contraste"])){return setAccessibility({highContrast:false},"Alto contraste desativado.");}
    if(includesAny(text,["ativar modo daltonico","ligar modo daltonico","modo para daltonicos"])){return setAccessibility({colorBlind:true},"Modo para daltônicos ativado.");}
    if(includesAny(text,["desativar modo daltonico","desligar modo daltonico"])){return setAccessibility({colorBlind:false},"Modo para daltônicos desativado.");}
    match=numbered.match(/(?:tamanho|escala)(?: dos elementos| da interface)?(?: para| em)?\s*(100|110|120|130|140)(?: por cento)?/);if(match)return setAccessibility({scale:Number(match[1])},`Tamanho dos elementos ajustado para ${match[1]} por cento.`);
    if(text.includes("evento de hoje")||text.includes("evento hoje"))return openDatedEvent(0,"hoje");if(text.includes("evento de amanha")||text.includes("evento amanha"))return openDatedEvent(1,"amanhã");
    const requestedEventDate=eventDateFromText(text);if(requestedEventDate)return openEventByCalendarDay(requestedEventDate.day,requestedEventDate.month,requestedEventDate.year);
    match=text.match(/(?:abrir|abra|ir para|mostrar|mostre) (?:o )?evento (.+)/);if(match){const event=findNamedEvent(match[1]);if(!event)return answer(`Não encontrei um único evento com o nome ${match[1]}.`,"error");navigateToEvent(event);return answer(`Abrindo o evento ${event.title}.`);}
    if(includesAny(text,["minha playlist","abrir playlist","ir para playlist","pagina inicial","tela inicial"])||text==="playlist"){close();home("musicas");return answer("Abrindo sua playlist.");}
    if(includesAny(text,["abrir eventos","ir para eventos","meus eventos"])||text==="eventos"||text==="evento"){close();home("setlists");return answer("Abrindo seus eventos.");}
    if(includesAny(text,["abrir medley","ir para medley"])||text==="medley"){close();home("medley");return answer("Abrindo o Medley.");}
    match=text.match(/(?:afinar|afinador)(?: de| para| do)?\s+(violao|guitarra|ukulele|baixo|contrabaixo|violino)/);if(match){close();global.openTuner();showModal();global.selectTunerInstrument(TUNER_INSTRUMENTS[match[1]]);return answer(`Afinador preparado para ${match[1]}.`);}
    if(includesAny(text,["abrir afinador","ir para afinador","quero o afinador"])||text==="afinador"){close();global.openTuner();showModal();return answer("Abrindo o afinador.");}
    if(includesAny(text,["ativar microfone do afinador","iniciar afinador","comecar afinacao"])){global.openTuner();showModal();await global.toggleTunerMicrophone();return answer("Microfone do afinador ativado.");}
    if(includesAny(text,["parar afinador","desligar afinador","desativar microfone do afinador"])){global.stopTuner();return answer("Afinador interrompido.");}
    if(includesAny(text,["abrir metronomo","ir para metronomo","quero o metronomo"])||text==="metronomo"){close();if(songMetronomeAvailable()){element('study-metronome').scrollIntoView?.({block:'nearest',behavior:'smooth'});return answer('Metrônomo da música disponível. Diga iniciar metrônomo para tocar.');}global.openToolsMetronome();showModal();return answer("Abrindo o metrônomo.");}
    if(includesAny(text,["iniciar metronomo","ligar metronomo","ativar metronomo","acionar metronomo","tocar metronomo","comecar metronomo","dar inicio ao metronomo","rodar metronomo","retomar metronomo","continuar metronomo"]))return startContextualMetronome();
    if(includesAny(text,["parar metronomo","pausar metronomo","desligar metronomo","desativar metronomo","interromper metronomo","cancelar metronomo","silenciar metronomo","cessar metronomo"]))return stopContextualMetronome();
    if(includesAny(text,["aumentar bpm","aumentar metronomo","acelerar metronomo","metronomo mais rapido","mais velocidade no metronomo"]))return adjustContextualMetronome(5);
    if(includesAny(text,["diminuir bpm","baixar bpm","diminuir metronomo","reduzir metronomo","desacelerar metronomo","metronomo mais devagar","menos velocidade no metronomo"]))return adjustContextualMetronome(-5);
    match=text.match(/(?:compasso|metronomo em)\s*(2|3|4|6)(?: por|\/)(4|8)/);if(match){if(songMetronomeAvailable()){studyMetronome.setMeter(`${match[1]}/${match[2]}`);return answer(`Compasso do metrônomo da música ajustado para ${match[1]} por ${match[2]}.`);}global.openToolsMetronome();showModal();toolsMetronome.setMeter(Number(match[1]));return answer(`Compasso ajustado para ${match[1]} por ${match[2]}.`);}
    if(includesAny(text,["abrir ferramentas","ir para ferramentas"])||text==="ferramentas"){close();global.openToolsMenu();showModal();return answer("Abrindo as ferramentas.");}
    if(includesAny(text,["abrir configuracoes","ir para configuracoes","quero as configuracoes"])||text==="configuracoes"){close();global.openAppSettings();showModal();return answer("Abrindo as configurações.");}
    if(includesAny(text,["aparencia","acessibilidade","mudar aparencia"])){close();global.openAppearanceSettings();showModal();return answer("Abrindo Aparência e Acessibilidade.");}
    if(includesAny(text,["abrir idioma","configurar idioma","mudar idioma","trocar idioma"])||text==="idioma"){close();global.openLanguageSettings();showModal();return answer("Abrindo as configurações de idioma.");}
    if(includesAny(text,["ajuda e suporte","abrir ajuda","preciso de ajuda"])){close();global.openHelpSupport();showModal();return answer("Abrindo Ajuda e Suporte.");}
    if(includesAny(text,["abrir minha conta","minha conta","abrir conta"])){close();await global.openAccountModal();return answer("Abrindo sua conta.");}
    if(includesAny(text,["entrar com google","fazer login","iniciar sessao"])){close();await global.loginAppAccount();return answer("Iniciando a entrada com Google.");}
    if(includesAny(text,["sair da conta","fazer logout","encerrar sessao"])){close();await global.logoutAppAccount();return answer("Você saiu da conta.");}
    if(includesAny(text,["abrir meu perfil","meu perfil","editar perfil"])){close();global.openProfileSettings();showModal();return answer("Abrindo seu perfil.");}
    if(includesAny(text,["abrir bandas","gerenciar bandas","minhas bandas"])){close();await global.openBandManager();showModal();return answer("Abrindo suas bandas.");}
    if(includesAny(text,["estado da sincronizacao","backup e dados","abrir sincronizacao"])){close();await global.openLibrarySync();showModal();return answer("Abrindo as informações de sincronização.");}
    if(includesAny(text,["baixar diagnostico","gerar diagnostico"])){global.downloadSyncDiagnostics();return answer("Preparando o diagnóstico.");}
    if(includesAny(text,["copiar pix","copiar codigo pix","contribuir com o projeto"])){await global.copyRoudyPixCode();return answer("Código Pix copiado.");}
    if(includesAny(text,["nova musica","adicionar musica","gerar musica","gerar com ia","gerar musica com ia","criar com ia","criar musica com ia","abrir gerador com ia","usar ia para gerar musica","fazer musica com ia"])){close();global.aiHarmonicSummary?.open();return answer("Abrindo Gerar com IA.");}
    match=text.match(/(?:buscar|pesquisar|procurar)(?: no)? youtube\s+(.+)/);if(match){home("musicas");await global.youtubeUI.searchFromInternal(match[1]);return answer(`Buscando ${match[1]} no YouTube.`);}
    match=text.match(/(?:buscar|pesquisar|procurar)(?: musica| na playlist| por)?\s+(.+)/);if(match)return searchPlaylist(match[1]);
    if(includesAny(text,["novo evento","criar evento","adicionar evento"])){close();home("setlists");global.openAddSetlist();return answer("Abrindo a criação de evento.");}
    if(includesAny(text,["editar musica","editar esta musica"])){if(currentDetailId==null)return answer("Abra uma música antes de editar.","error");close();global.editMusica(currentDetailId);return answer("Abrindo a edição da música.");}
    if(includesAny(text,["excluir musica","excluir da playlist","remover da playlist"])){if(currentDetailId==null)return answer("Abra uma música antes de excluir.","error");global.deleteMusica(currentDetailId);return answer("Pedido de exclusão aberto. Confirme na tela para concluir.");}
    if(includesAny(text,["ver resumo harmonico","abrir resumo harmonico","mostrar resumo harmonico","resumo harmonico"]))return openCurrentSongView("summary","o resumo harmônico");
    if(includesAny(text,["ver letra e cifra","abrir letra e cifra","mostrar letra e cifra","letra e cifra","letra com cifra"]))return openCurrentSongView("full","a letra e cifra");
    if(includesAny(text,["ver tablatura","abrir tablatura","mostrar tablatura"])||text==="tablatura")return openCurrentSongView("tablature","a tablatura");
    match=text.match(/(?:instrumento|diagramas?|acordes?)(?: para| de| no)?\s+(violao|guitarra|ukulele|teclado|piano|cavaco|cavaquinho|viola)/);if(match){if(currentDetailId==null)return answer("Abra uma música antes de escolher o instrumento dos acordes.","error");global.setInstrument(CHORD_INSTRUMENTS[match[1]]);return answer(`Diagramas ajustados para ${match[1]}.`);}
    if(includesAny(text,["subir o tom","subir tom","aumentar tom","aumentar o tom"])){if(currentDetailId==null)return answer("Abra uma música antes de mudar o tom.","error");global.transpose(1);return answer("Subi o tom em um semitom.");}
    if(includesAny(text,["descer o tom","descer tom","diminuir tom","baixar tom","diminuir o tom","baixar o tom"])){if(currentDetailId==null)return answer("Abra uma música antes de mudar o tom.","error");global.transpose(-1);return answer("Desci o tom em um semitom.");}
    if(includesAny(text,["tom original","restaurar tom"])){global.resetTranspose();return answer("Tom original restaurado.");}
    if(text.includes("rolagem inteligente"))return answer('Diga ativar rolagem inteligente ou desativar rolagem inteligente.','error');
    if(text==='rolagem automatica')return execute('iniciar rolagem automatica');
    if(includesAny(text,["parar rolagem","pausar rolagem"])){global.stopAutoScroll();global.stopSmartScroll();return answer("Rolagem pausada.");}
    if(includesAny(text,["modo palco","iniciar palco"])){const event=currentEventRequired();if(event&&element("view-sd")?.style.display==="flex"){close();global.openStageFromEvent(event.id);return answer("Modo Palco do evento preparado.");}if(currentDetailId==null)return answer("Abra uma música ou evento antes de iniciar o Modo Palco.","error");close();await global.enterStageMode();return answer("Modo Palco preparado.");}
    if(includesAny(text,["sair do palco","fechar palco"])){await global.exitStageMode();return answer("Modo Palco encerrado.");}
    if(includesAny(text,["aumentar fonte","fonte maior"])){global.adjustStageFont(2);return answer("Fonte aumentada.");}
    if(includesAny(text,["diminuir fonte","fonte menor"])){global.adjustStageFont(-2);return answer("Fonte diminuída.");}
    if(includesAny(text,["aumentar velocidade","rolar mais rapido"])){global.adjustStageScrollSpeed(1);return answer("Velocidade da rolagem aumentada.");}
    if(includesAny(text,["diminuir velocidade","rolar mais devagar"])){global.adjustStageScrollSpeed(-1);return answer("Velocidade da rolagem diminuída.");}
    if(includesAny(text,["proxima musica","avancar musica"])){global.navigateSong(1);return answer("Avançando para a próxima música.");}
    if(includesAny(text,["musica anterior","voltar musica"])){global.navigateSong(-1);return answer("Voltando para a música anterior.");}
    if(includesAny(text,["sincronizar agora","sincronizar biblioteca"])){try{await librarySync.syncNow();return answer("Sincronização concluída.");}catch(error){return answer(error.message||"Não foi possível sincronizar agora.","error");}}
    if(includesAny(text,["abrir chat do evento","chat do evento","mensagens do evento"])){if(!currentEventRequired())return answer("Abra um evento antes de acessar o chat.","error");await global.openEventChat();return answer("Abrindo o chat do evento.");}
    if(includesAny(text,["editar evento","editar este evento"])){const event=currentEventRequired();if(!event)return answer("Abra um evento antes de editar.","error");global.editSetlistById(event.id);return answer("Abrindo a edição do evento.");}
    if(includesAny(text,["compartilhar evento","compartilhar este evento"])){const event=currentEventRequired();if(!event)return answer("Abra um evento antes de compartilhar.","error");global.sharePlaylist(event.id);return answer("Abrindo o compartilhamento do evento.");}
    if(includesAny(text,["transferir lideranca","mudar lider do evento"])){const event=currentEventRequired();if(!event)return answer("Abra um evento antes de transferir a liderança.","error");global.openEventLeadershipTransfer(event.id);return answer("Escolha na tela quem será o novo líder.");}
    if(includesAny(text,["notificacoes do evento","avisos do evento"])){if(!currentEventRequired())return answer("Abra um evento antes de acessar as notificações.","error");global.openEventNotifications();return answer("Abrindo as notificações do evento.");}
    if(includesAny(text,["adicionar bloco","novo bloco do medley"])){home("medley");global.abrirAddMedley();return answer("Abrindo a inclusão de bloco no Medley.");}
    if(includesAny(text,["salvar medley","salvar na playlist"])){global.abrirSalvarMedley();return answer("Abrindo o salvamento do Medley.");}
    if(includesAny(text,["limpar medley","limpar todos os blocos"])){global.limparMedley();return answer("Confirme na tela para limpar o Medley.");}
    if(includesAny(text,["o que voce pode fazer","comandos de voz","ajuda do assistente","listar comandos"])){return answer("Posso abrir músicas, eventos e telas; controlar afinador, metrônomo, rolagem e modo palco; mudar idioma, tema, acessibilidade, cor das cifras, instrumento, tom e capotraste; além de criar, editar, buscar e compartilhar conteúdos.");}
    if(includesAny(text,["voltar","fechar tela"])){close();if(element("modal-overlay")?.style.display==="flex")global.closeModal();else if(element("view-detail")?.style.display==="flex")global.closeDetail();else if(element("view-sd")?.style.display==="flex")global.closeSD();return answer("Voltei para a tela anterior.");}
    if(intentMatch?.intent)return executeIntent(original);
    if(/^(abrir|abra|mostrar|mostre|tocar|toque|ir para|va para)\s+/.test(text))return openSongByVoice(text);
    const requestedSong=songFromNaturalRequest(text)||songFromNaturalRequest(spokenText);if(requestedSong){navigateToSong(requestedSong);return answer(`Abrindo ${requestedSong.title}.`);}
    return answer("Ainda não reconheci esse pedido. Tente dizer o nome de uma tela, música, evento ou configuração.","error");
  }
  let executing=false;
  async function run(raw){if(executing)return {ok:false,message:'Um comando já está sendo executado.'};executing=true;try{return await execute(raw);}catch(error){return answer(error?.name==='NotAllowedError'?'Permita o microfone ou áudio para executar este comando.':error?.message||'Não foi possível executar o comando. Tente novamente.','error');}finally{executing=false;}}
  function updateLaunchVisibility(){
    const overlayOpen=element("modal-overlay")?.style.display==="flex",profileOpen=Boolean(global.document.body?.hasAttribute?.('data-account-menu-open'))||overlayOpen&&Boolean(element("profile-name")||global.document.querySelector('#modal-body .account-summary'));
    const songOpen=element("view-detail")?.style.display==="flex",eventOpen=element("view-sd")?.style.display==="flex";
    const stageOpen=songOpen&&element("view-detail")?.classList.contains("stage-mode");
    const secondaryOpen=songOpen||eventOpen||element("event-chat-view")?.hidden===false||overlayOpen||element("inst-modal")?.style.display==="flex";
    const header=element("app-assistant-launch"),floating=element("app-assistant-floating");
    const floatingHidden=profileOpen||!secondaryOpen||((songOpen&&!stageOpen)||eventOpen);
    if(header&&header.hidden!==profileOpen)header.hidden=profileOpen;
    if(floating&&floating.hidden!==floatingHidden)floating.hidden=floatingHidden;
    [element("song-assistant-launch"),element("event-assistant-launch")].forEach(button=>{if(button&&button.hidden!==profileOpen)button.hidden=profileOpen;});
  }
  function setListening(value){listening=Boolean(value);global.document.querySelectorAll("[data-assistant-launch]").forEach(button=>{button.classList.toggle("listening",listening);button.setAttribute("aria-pressed",String(listening));button.setAttribute("aria-label",listening?"Parar de ouvir":"Falar com o assistente Roudy");});}
  function stopListening(){try{recognition?.stop();}catch(_error){}recognition=null;setListening(false);}
  function listen(){
    if(listening){stopListening();return;}
    const Recognition=global.SpeechRecognition||global.webkitSpeechRecognition;
    if(!Recognition){message("O reconhecimento de voz não está disponível neste navegador.","error");return;}
    const current=new Recognition();
    recognition=current;
    current.lang=global.document.documentElement.lang||"pt-BR";
    current.continuous=false;
    current.interimResults=false;
    current.maxAlternatives=5;
    current.onstart=()=>{if(recognition!==current)return;setListening(true);message("Estou ouvindo… Pode falar.");};
    current.onresult=event=>{
      if(recognition!==current)return;
      const alternatives=Array.from(event.results?.[0]||[]).map(item=>item?.transcript?.trim()).filter(Boolean);
      const spoken=alternatives.sort((left,right)=>transcriptionScore(right)-transcriptionScore(left))[0]||"";
      if(spoken){stopListening();run(spoken);}
    };
    current.onerror=event=>{
      if(recognition!==current)return;
      if(event.error==="not-allowed"||event.error==="service-not-allowed")message("Permita o uso do microfone para falar com o assistente.","error");
      else if(event.error==="no-speech")message("Não ouvi nenhuma frase. Toque no agente e tente novamente.","error");
      else if(event.error==="audio-capture")message("O navegador não conseguiu acessar um microfone. Confira a permissão e o dispositivo de entrada.","error");
      else message(`Falha no reconhecimento de voz (${event.error||"erro desconhecido"}).`,"error");
    };
    current.onend=()=>{if(recognition!==current)return;recognition=null;setListening(false);};
    try{current.start();}catch(_error){recognition=null;setListening(false);message("Não foi possível iniciar o microfone.","error");}
  }
  if(global.MutationObserver&&global.document.body){const visibilityObserver=new global.MutationObserver(updateLaunchVisibility);visibilityObserver.observe(global.document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["style","hidden"]});}updateLaunchVisibility();
  global.roudyAssistant=Object.freeze({open,close,listen,run,clean,updateLaunchVisibility,getLastIntentResult:()=>lastIntentResult});
})(window);
