(function(global){
  'use strict';
  // Voz do assistente: usa as vozes gratuitas que o próprio aparelho oferece (Web Speech API).
  const KEY='sc_assistant_voice_v1';
  const LANG_NAMES={pt:'Português',en:'Inglês',es:'Espanhol',fr:'Francês',it:'Italiano',de:'Alemão',ja:'Japonês',ko:'Coreano',zh:'Chinês',ru:'Russo',nl:'Holandês',pl:'Polonês',sv:'Sueco',tr:'Turco',ar:'Árabe',hi:'Hindi',id:'Indonésio',uk:'Ucraniano',cs:'Tcheco',da:'Dinamarquês',fi:'Finlandês',el:'Grego',he:'Hebraico',hu:'Húngaro',nb:'Norueguês',no:'Norueguês',ro:'Romeno',sk:'Eslovaco',th:'Tailandês',vi:'Vietnamita',ca:'Catalão',ms:'Malaio'};
  const REGION_NAMES={BR:'Brasil',PT:'Portugal',US:'EUA',GB:'Reino Unido',AU:'Austrália',IN:'Índia',CA:'Canadá',IE:'Irlanda',ZA:'África do Sul',ES:'Espanha',MX:'México',AR:'Argentina',CO:'Colômbia',US_:'EUA',FR:'França',BE:'Bélgica',CH:'Suíça',DE:'Alemanha',AT:'Áustria',IT:'Itália',JP:'Japão',CN:'China',TW:'Taiwan',HK:'Hong Kong',KR:'Coreia'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  function load(){try{const v=JSON.parse(global.localStorage.getItem(KEY)||'null');return {enabled:v?.enabled!==false,voiceURI:String(v?.voiceURI||'')};}catch(_){return {enabled:true,voiceURI:''};}}
  const BROKEN_KEY='sc_assistant_voice_broken_v1';
  function broken(){try{return new Set(JSON.parse(global.localStorage.getItem(BROKEN_KEY)||'[]'));}catch(_){return new Set();}}
  function markBroken(uri,on){const set=broken();if(on)set.add(uri);else set.delete(uri);try{global.localStorage.setItem(BROKEN_KEY,JSON.stringify([...set]));}catch(_){}}
  function save(value){try{global.localStorage.setItem(KEY,JSON.stringify(value));}catch(_){}}
  function supported(){return Boolean(global.speechSynthesis&&global.SpeechSynthesisUtterance);}
  function voices(){return supported()?global.speechSynthesis.getVoices?.()||[]:[];}
  function appLang(){return global.document.documentElement.lang||'pt-BR';}
  function languageLabel(lang){const [l,r]=String(lang||'').replace('_','-').split('-');const name=LANG_NAMES[(l||'').toLowerCase()]||lang||'Outro idioma';const region=r?REGION_NAMES[r.toUpperCase()]||r.toUpperCase():'';return region?`${name} (${region})`:name;}
  function shortName(voice){if(/^Google\s/i.test(String(voice.name||'')))return 'Google';return String(voice.name||'').replace(/^(Microsoft|Google|Apple)\s+/i,'').replace(/\s+Online\s*\(Natural\)/i,'').replace(/\s*-\s*[^-]*\([^)]*\)\s*$/,'').replace(/\s*\([^)]*\)\s*$/,'').trim()||voice.name;}
  function selected(){const s=load(),list=voices();return list.find(v=>v.voiceURI===s.voiceURI)||null;}
  function createUtterance(text){
    if(!supported()||!load().enabled)return;
    const voice=selected(),lang=String(voice?.lang||appLang()).slice(0,2).toLowerCase();
    // Pronúncia do nome: "Rôu-di" (não "Ráu-di"). Só muda o que é falado, não o texto na tela.
    const spoken=String(text||'').replace(/\bRoudy\b/gi,lang==='en'?'Roady':'Rôudi');
    const utterance=new global.SpeechSynthesisUtterance(spoken);
    if(voice){utterance.voice=voice;utterance.lang=voice.lang;}else utterance.lang=appLang();
    utterance.rate=1;return utterance;
  }
  function speak(text){
    const utterance=createUtterance(text);if(!utterance)return;
    global.speechSynthesis.cancel();global.speechSynthesis.speak(utterance);return utterance;
  }
  function groups(query){
    const q=clean(query).trim(),base=appLang().slice(0,2).toLowerCase(),map=new Map();
    for(const v of voices()){
      const label=languageLabel(v.lang);
      if(q&&!clean(v.name+' '+label).includes(q))continue;
      if(!map.has(label))map.set(label,{label,lang:v.lang,items:[]});
      map.get(label).items.push(v);
    }
    const rank=g=>{const l=String(g.lang).toLowerCase();return l===appLang().toLowerCase()?0:l.startsWith(base)?1:2;};
    return [...map.values()].sort((a,b)=>rank(a)-rank(b)||a.label.localeCompare(b.label,'pt')).map(g=>({...g,items:g.items.sort((a,b)=>shortName(a).localeCompare(shortName(b),'pt'))}));
  }
  const greeting=lang=>{const l=String(lang||'').slice(0,2).toLowerCase();return ({en:'Hi, I am Roudy.',es:'Hola, soy Roudy.',fr:'Bonjour, je suis Roudy.',it:'Ciao, sono Roudy.',de:'Hallo, ich bin Roudy.',nl:'Hallo, ik ben Roudy.',ja:'こんにちは、ロウディです。',ko:'안녕하세요, 로디입니다.',zh:'你好，我是Roudy。',ru:'Привет, я Роуди.',pl:'Cześć, jestem Roudy.',tr:'Merhaba, ben Roudy.',ar:'مرحبا، أنا رودي.',hi:'नमस्ते, मैं रॉडी हूँ।',sv:'Hej, jag är Roudy.',id:'Halo, saya Roudy.',uk:'Привіт, я Роуді.',el:'Γεια σου, είμαι ο Roudy.',he:'שלום, אני רודי.',th:'สวัสดี ฉันคือ Roudy',vi:'Xin chào, tôi là Roudy.'})[l]||'Olá, eu sou o Roudy.';};
  function rowHtml(v,current){
    const active=current&&current.voiceURI===v.voiceURI;
    return `<button class="voice-option${active?' is-active':''}${broken().has(v.voiceURI)?' is-broken':''}" type="button" role="radio" aria-checked="${active}" data-voice-uri="${esc(v.voiceURI)}" onclick="assistantVoice.choose(this.dataset.voiceUri)"><span class="voice-option-copy"><strong>${esc(languageLabel(v.lang))} - ${esc(shortName(v))}</strong><small>${broken().has(v.voiceURI)?'Não instalada neste aparelho — toque para tentar de novo':v.localService?'Funciona sem internet':'Precisa de internet'}</small></span>${active?'<span class="voice-option-check" aria-hidden="true">✓</span>':''}</button>`;
  }
  function renderList(){
    const box=global.document.getElementById('voice-list');if(!box)return;
    const query=global.document.getElementById('voice-search')?.value||'',current=selected(),list=groups(query);
    if(!supported()){box.innerHTML='<div class="event-permission-note">Este navegador não oferece vozes para o assistente.</div>';return;}
    if(!voices().length){box.innerHTML=`<div class="event-permission-note">${box.dataset.waited?'Nenhuma voz encontrada neste aparelho. O Roudy usará a voz padrão do sistema.':'Carregando vozes do aparelho…'}</div>`;if(!box.dataset.waited)global.setTimeout(()=>{box.dataset.waited='1';renderList();},1500);return;}
    const def=`<button class="voice-option${current?'':' is-active'}" type="button" role="radio" aria-checked="${!current}" onclick="assistantVoice.choose('')"><span class="voice-option-copy"><strong>Voz padrão do aparelho</strong><small>Escolhida automaticamente pelo sistema</small></span>${current?'':'<span class="voice-option-check" aria-hidden="true">✓</span>'}</button>`;
    box.innerHTML=(query?'':def)+(list.length?list.map(g=>`<div class="voice-group-title">${esc(g.label)}</div>${g.items.map(v=>rowHtml(v,current)).join('')}`).join(''):'<div class="event-permission-note">Nenhuma voz encontrada.</div>');
  }
  function open(){
    const s=load(),body=global.document.getElementById('modal-body');if(!body)return;
    const header=typeof global.accountSubpageHeader==='function'?global.accountSubpageHeader('Voz do assistente','openAppearanceSettings'):'<div class="modal-title">Voz do assistente</div>';
    body.innerHTML=`${header}<section class="settings-group"><div class="settings-row"><div class="settings-row-copy"><strong>Respostas faladas</strong><small>O Roudy responde em voz alta aos seus comandos</small></div><label class="settings-toggle"><input id="voice-enabled" type="checkbox" ${s.enabled?'checked':''} onchange="assistantVoice.toggle(this.checked)" aria-label="Respostas faladas"><span></span></label></div></section><div class="voice-picker" id="voice-picker" ${s.enabled?'':'data-disabled="true"'}><input class="form-input voice-search" id="voice-search" type="search" placeholder="Pesquise por uma voz ou idioma" aria-label="Pesquise por uma voz ou idioma" oninput="assistantVoice.renderList()"><div class="voice-list" id="voice-list" role="radiogroup" aria-label="Vozes disponíveis"></div><small class="voice-note">As vozes são gratuitas e vêm do seu aparelho; a lista muda entre celular, PC e navegador.</small></div>`;
    global.document.getElementById('modal-overlay').style.display='flex';
    renderList();
  }
  function choose(uri){
    const s=load(),previous=s.voiceURI;s.voiceURI=String(uri||'');s.enabled=true;save(s);
    const t=global.document.getElementById('voice-enabled');if(t)t.checked=true;global.document.getElementById('voice-picker')?.removeAttribute('data-disabled');
    renderList();const v=selected(),u=speak(greeting(v?.lang||appLang()));
    if(!v||!u)return;
    // Muitos celulares listam idiomas cujo pacote de voz não está baixado: a fala nunca começa.
    let started=false;
    const fail=()=>{if(started)return;started=true;global.speechSynthesis.cancel();markBroken(v.voiceURI,true);const cur=load();if(cur.voiceURI===v.voiceURI){cur.voiceURI=previous===v.voiceURI?'':previous;save(cur);}renderList();if(typeof global.showToast==='function')global.showToast('⚠️ Essa voz não está instalada no aparelho. No Android, baixe o idioma em Configurações › Saída de texto para fala.');};
    u.onstart=()=>{if(started)return;started=true;markBroken(v.voiceURI,false);renderList();};
    u.onerror=fail;global.setTimeout(fail,4000);
  }
  function toggle(on){const s=load();s.enabled=Boolean(on);save(s);const p=global.document.getElementById('voice-picker');if(p){if(on)p.removeAttribute('data-disabled');else p.setAttribute('data-disabled','true');}if(!on)global.speechSynthesis?.cancel();}
  function summary(){const s=load();if(!s.enabled)return 'Desligada';const v=selected();return v?`${languageLabel(v.lang)} - ${shortName(v)}`:'Voz padrão do aparelho';}
  if(supported()&&'onvoiceschanged' in global.speechSynthesis)global.speechSynthesis.addEventListener('voiceschanged',renderList);
  global.assistantVoice=Object.freeze({load,createUtterance,speak,open,choose,toggle,renderList,summary,languageLabel,shortName});
})(window);
