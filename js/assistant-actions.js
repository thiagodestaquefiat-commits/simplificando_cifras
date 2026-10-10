(function (global) {
  'use strict';

  // Parsers describe actions and parameters; they never touch UI or user data.
  function create(helpers) {
    const definitions = [];
    const add = (id, category, parse, options = {}) => definitions.push(Object.freeze({
      id, category, parse, risk: 'read', needsSong: false, writesSong: false,
      changesScreen: false, requiresEditInSong: false, priority: 60, ...options
    }));
    const exact = phrases => request => phrases.includes(request.text) ? {} : null;
    const match = (pattern, slots) => request => {
      const found = request.numbered.match(pattern);
      return found ? slots(found, request) : null;
    };
    const tool = 'metronomo';
    const literalMusic=request=>/^(?:abrir|tocar|ouvir|ver|ensaiar|estudar) (?:a )?musica\s+/.test(request.text);

    add('song.save', 'music', request => {
      if (['salvar', 'salvar alteracoes', 'salvar as alteracoes', 'salvar minhas alteracoes', 'salvar essas alteracoes', 'salvar ajustes', 'salvar musica', 'guardar alteracoes', 'salvar alteracoes da musica', 'salvar alteracoes desta musica', 'salvar esta musica'].includes(request.text)) return { target: 'current' };
      if (request.text === 'salvar no evento' || request.text === 'salvar alteracoes no evento') return { target: 'event' };
      if (request.context.songOpen && (request.text === 'salvar na playlist' || request.text === 'salvar alteracoes na playlist')) return { target: 'playlist' };
      return null;
    }, { needsSong: true, writesSong: true, risk: 'personal-write', validate: (slots, context) => slots.target === 'playlist' && context.eventId ? 'Você está na versão do evento. Diga salvar alterações para preservar a playlist.' : slots.target === 'event' && !context.eventId ? 'Essa música está aberta pela playlist, não por um evento. Abra a versão do evento antes de salvar lá.' : null });
    add('song.capo', 'music', request => {
      if (['sem capotraste', 'tirar capotraste', 'retirar capotraste', 'remover capotraste'].includes(request.text)) return { value: 0 };
      const found = request.numbered.match(/^(?:(?:ajustar|definir|colocar|mudar|configurar) (?:o )?)?capotraste(?: na casa| casa| em| para)?\s+(\d+)$/);
      if (!found) return null;
      return { value: /-\s*\d/.test(request.raw) ? -1 : Number(found[1]) };
    }, { needsSong: true, writesSong: true, risk: 'draft-write', validate: slots => Number.isInteger(slots.value) && slots.value >= 0 && slots.value <= 12 ? null : 'Escolha uma casa entre zero e 12.' });
    add('song.transpose', 'music', request => {
      if (['subir tom', 'subir o tom', 'aumentar tom', 'aumentar o tom'].includes(request.text)) return { delta: 1 };
      if (['descer tom', 'descer o tom', 'diminuir tom', 'diminuir o tom', 'baixar tom', 'baixar o tom'].includes(request.text)) return { delta: -1 };
      const found=request.numbered.match(/^(subir|descer|aumentar|diminuir|baixar) (?:o )?tom(?: em)? (\d+) (semitom|semitons|tom|tons)$/);
      if(found){const magnitude=Number(found[2])*(found[3].startsWith('semi')?1:2);return {delta:/-\s*\d/.test(request.raw)?0:['subir','aumentar'].includes(found[1])?magnitude:-magnitude};}
      return null;
    }, { needsSong: true, writesSong: true, risk: 'draft-write',validate:slots=>Number.isInteger(slots.delta)&&Math.abs(slots.delta)>=1&&Math.abs(slots.delta)<=11?null:'Use de um a 11 semitons, indicando subir ou descer.' });
    add('song.reset-key', 'music', exact(['tom original', 'restaurar tom', 'restaurar o tom']), { needsSong: true, writesSong: true, risk: 'draft-write' });

    add('metronome.open', 'study', exact([tool, 'abrir metronomo', 'ir para metronomo', 'quero o metronomo']), { changesScreen: true });
    add('metronome.play', 'study', request => {
      const found = request.text.match(/^(iniciar|parar|tocar|rodar) metronomo$/);
      return found ? { start: found[1] !== 'parar' } : null;
    }, { risk: 'tool-control' });
    add('metronome.bpm', 'study', match(/^(?:(iniciar|ajustar|definir|colocar|mudar|configurar) (?:o )?)?(?:metronomo|bpm)(?: em| para| a| de)?\s+(\d+)(?: bpm)?$/, (found, request) => ({ value: /-\s*\d/.test(request.raw) ? -1 : Number(found[2]), start: found[1] === 'iniciar' })), {
      risk: 'tool-control', requiresEditInSong: true, validate: slots => Number.isInteger(slots.value) && slots.value >= 30 && slots.value <= 240 ? null : 'Escolha um andamento entre 30 e 240 BPM.'
    });
    add('metronome.adjust', 'study', request => {
      if (['aumentar bpm', 'aumentar metronomo', 'acelerar metronomo', 'metronomo mais rapido', 'mais velocidade no metronomo'].includes(request.text)) return { delta: 5 };
      if (['diminuir bpm', 'baixar bpm', 'diminuir metronomo', 'reduzir metronomo', 'desacelerar metronomo', 'metronomo mais devagar', 'menos velocidade no metronomo'].includes(request.text)) return { delta: -5 };
      return null;
    }, { risk: 'tool-control', requiresEditInSong: true });
    add('metronome.meter', 'study', match(/^(?:compasso|metronomo em)\s+(\d+) (?:por|sobre) (\d+)$/, found => ({ value: `${found[1]}/${found[2]}` })), {
      risk: 'tool-control', requiresEditInSong: true, validate: slots => ['2/4', '3/4', '4/4', '6/8'].includes(slots.value) ? null : 'Use compasso 2 por 4, 3 por 4, 4 por 4 ou 6 por 8.'
    });
    add('scroll.play', 'study', request => {
      if (request.text === 'rolagem automatica') return { start: true, mode: 'automatic' };
      const found = request.text.match(/^(iniciar|parar) (?:rolagem|rolar)(?: (automatica|inteligente))?$/);
      return found ? { start: found[1] === 'iniciar', mode: found[2] === 'inteligente' ? 'smart' : found[2] === 'automatica' ? 'automatic' : null } : null;
    }, { needsSong: true, risk: 'tool-control' });
    add('tools.stop-active', 'study', exact(['parar', 'interromper', 'pausar']), { risk: 'tool-control' });

    add('search.youtube', 'search', request => {
      const found = request.text.match(/^(?:buscar|pesquisar|procurar)(?: video| musica)?(?: no)? youtube(?: por)?(?:\s+(.*))?$/);
      return found ? { query: found[1] || '' } : null;
    }, { priority: 100, changesScreen: true, validate: slots => slots.query.length >= 3 ? null : 'Diga o nome da música ou artista para buscar no YouTube.' });
    add('search.playlist', 'search', request => {
      if (/\byoutube\b/.test(request.text)) return null;
      const found = request.text.match(/^(?:buscar|pesquisar|procurar|encontrar)(?: musica| cifra| louvor| cancao| na playlist| por)?\s+(.+)$/);
      return found ? { query: found[1] } : null;
    }, { changesScreen: true });

    add('navigation.home', 'navigation', request => {
      const phrases = { musicas: ['playlist', 'minha playlist', 'abrir playlist', 'ir para playlist', 'pagina inicial', 'tela inicial'], setlists: ['evento', 'eventos', 'abrir eventos', 'ir para eventos', 'meus eventos'], medley: ['medley', 'abrir medley', 'ir para medley'] };
      const tab = Object.keys(phrases).find(key => phrases[key].includes(request.text));
      return tab ? { tab } : null;
    }, { changesScreen: true });
    add('event.date', 'events', request => {const date=!request.literalEventQuery&&!literalMusic(request)&&helpers.eventDate(request.text);return date?{...date,invalidInput:/(?:^|\s)-\s*\d/.test(request.raw)}:null;}, { priority: 90, changesScreen: true,validate:slots=>{
      const day=Number(slots.day),hasMonth=slots.month!=null&&slots.month!=='',hasYear=slots.year!=null&&slots.year!=='',month=Number(slots.month),year=Number(slots.year);
      return slots.invalidInput||!Number.isInteger(day)||day<1||day>31||hasMonth&&(!Number.isInteger(month)||month<1||month>12)||hasYear&&(!Number.isInteger(year)||year<1||year>9999)||hasMonth&&day>new Date(hasYear?year:2000,month,0).getDate()?'Diga uma data válida para o evento.':null;
    } });
    add('event.agenda', 'events', request => {
      if(request.literalEventQuery)return null;
      if (literalMusic(request)) return null;
      const match = helpers.classify?.(request.semanticRaw||request.raw);
      return ['INTENT_PROXIMO_EVENTO', 'INTENT_EVENTOS_HOJE', 'INTENT_EVENTOS_AMANHA'].includes(match?.intent) ? { intent: match.intent } : null;
    }, { priority: 80, changesScreen: true });
    add('event.open', 'events', request => {
      if(request.literalEventQuery)return {query:request.literalEventQuery};
      if (helpers.eventDate(request.text) || /\b(hoje|amanha|proximo|perto)\b/.test(request.text)) return null;
      const found = request.text.match(/^abrir evento\s+(.+)$/);
      return found ? { query: found[1] } : null;
    }, { changesScreen: true });
    add('event.song', 'events', request => {
      const ordinals={primeira:1,segunda:2,terceira:3,quarta:4,quinta:5,sexta:6,setima:7,oitava:8,nona:9,decima:10,ultima:'last'};
      const found=request.numbered.match(/^(?:abrir|ver|tocar) (?:a )?(?:(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava|nona|decima|ultima) musica|musica (?:numero )?(\d+))(?: (?:do|deste|desse) evento)?$/);
      return found?{index:/-\s*\d/.test(request.raw)?-1:found[1]?ordinals[found[1]]:Number(found[2])}:null;
    },{priority:95,changesScreen:true,validate:(slots,context)=>!context.eventId||!context.canAccessEvent?'Abra um evento disponível antes de pedir uma música do repertório.':slots.index!=='last'&&(!Number.isSafeInteger(slots.index)||slots.index<1)?'Diga uma posição válida no repertório do evento.':null});
    add('song.open', 'navigation', request => {
      const explicit = request.text.match(/^(?:abrir|tocar|ouvir|ver|ensaiar|estudar) (?:a )?musica\s+(.+)$/);
      if (explicit) return { query: explicit[1], explicit: true };
      const query = request.text.replace(/^(?:abrir|tocar|ouvir|ver)\s+/, '');
      const matches = helpers.songMatches(query);
      return matches.length ? { query, explicit: false } : null;
    }, { changesScreen: true });

    // Phase 2: every entry has a single, validated target. No substring writes.
    const languages = { portugues: 'pt-BR', 'portugues brasileiro': 'pt-BR', brasileiro: 'pt-BR', espanhol: 'es', espanol: 'es', ingles: 'en', english: 'en', italiano: 'it', frances: 'fr', francais: 'fr', alemao: 'de', deutsch: 'de' };
    const colors = { dourado: 'gold', coral: 'coral', vermelho: 'red', vermelha: 'red', laranja: 'orange', amarelo: 'yellow', amarela: 'yellow', verde: 'green', azul: 'blue', roxo: 'purple', roxa: 'purple', rosa: 'pink', branco: 'white', branca: 'white' };
    add('settings.language', 'settings', request => {
      const value = request.text.replace(/^(?:(?:mudar|trocar|definir|colocar|traduzir|falar|deixar)\s+)?(?:(?:idioma|lingua|interface|aplicativo|app)(?: da interface| do app)?\s+)?(?:(?:para|em)\s+)?/, '');
      return languages[value] ? { value: languages[value], label: value } : null;
    }, { risk: 'preference-write', priority: 75 });
    add('settings.color', 'settings', match(/^(?:(?:mudar|trocar|definir|colocar|deixar)\s+)?(?:cor (?:da |das )?cifras?|cifras?)(?: para| em)?\s+(\w+)$/, found => ({ value: colors[found[1]], label: found[1] })), { risk: 'preference-write', priority: 75, validate: slots => slots.value ? null : 'Escolha dourado, coral, vermelho, laranja, amarelo, verde, azul, roxo, rosa ou branco.' });
    add('settings.theme', 'settings', match(/^(?:(?:mudar|trocar|definir|colocar)\s+)?(?:tema|modo)(?: para| em)?\s+(claro|escuro|do sistema|sistema|automatico)$/, found => ({ value: found[1] === 'claro' ? 'light' : found[1] === 'escuro' ? 'dark' : 'system' })), { risk: 'preference-write', priority: 75 });
    add('settings.accessibility', 'settings', request => {
      if (request.text === 'modo para daltonicos') return { key: 'colorBlind', value: true };
      const found = request.text.match(/^(iniciar|parar) (alto contraste|modo daltonico|modo para daltonicos)$/);
      return found ? { key: found[2] === 'alto contraste' ? 'highContrast' : 'colorBlind', value: found[1] === 'iniciar' } : null;
    }, { risk: 'preference-write', priority: 75 });
    add('settings.scale', 'settings', match(/^(?:(?:mudar|ajustar|definir|colocar)\s+)?(?:tamanho|escala)(?: dos elementos| da interface)?(?: para| em)?\s+(\d+)(?: por cento| por 100)?$/, (found,request) => ({ value: /-\s*\d/.test(request.raw) ? -1 : Number(found[1]) })), { risk: 'preference-write', priority: 75, validate: slots => [100, 110, 120, 130, 140].includes(slots.value) ? null : 'Escolha 100, 110, 120, 130 ou 140 por cento.' });
    const panels = {
      settings: ['configuracoes', 'abrir configuracoes', 'ir para configuracoes', 'quero as configuracoes'],
      appearance: ['aparencia', 'acessibilidade', 'abrir aparencia', 'abrir acessibilidade', 'mudar aparencia', 'aparencia e acessibilidade', 'abrir aparencia e acessibilidade'],
      language: ['idioma', 'abrir idioma', 'configurar idioma', 'mudar idioma', 'trocar idioma'],
      tools: ['ferramentas', 'abrir ferramentas', 'ir para ferramentas'],
      support: ['ajuda e suporte', 'abrir ajuda', 'preciso de ajuda', 'abrir suporte'],
      account: ['minha conta', 'abrir minha conta', 'abrir conta'],
      profile: ['perfil', 'meu perfil', 'abrir perfil', 'abrir meu perfil', 'editar perfil', 'ir para perfil', 'ir para o perfil'],
      bands: ['abrir bandas', 'gerenciar bandas', 'minhas bandas'],
      backup: ['backup e dados', 'estado da sincronizacao', 'abrir sincronizacao', 'abrir backup'],
      notifications: ['notificacoes', 'abrir notificacoes', 'meus convites', 'abrir convites']
    };
    add('navigation.panel', 'navigation', request => {
      const destination = Object.keys(panels).find(key => panels[key].includes(request.text));
      return destination ? { destination } : null;
    }, { changesScreen: true, priority: 75 });
    add('navigation.back', 'navigation', exact(['voltar', 'fechar tela', 'tela anterior']), { changesScreen: true, priority: 75 });
    add('assistant.help', 'navigation', exact(['o que voce pode fazer', 'comandos de voz', 'ajuda do assistente', 'listar comandos']), { priority: 75 });

    const tunerInstruments = { violao: 'guitar', guitarra: 'guitar', ukulele: 'ukulele', baixo: 'bass', contrabaixo: 'bass', violino: 'violin' };
    add('tuner.open', 'study', request => {
      if (request.text === 'afinador automatico') return null;
      if (['afinador', 'abrir afinador', 'ir para afinador', 'quero o afinador'].includes(request.text)) return {};
      const found = request.text.match(/^(?:abrir )?(?:afinar|afinador)(?: de| para| do)?\s+(\w+)$/);
      return found ? { instrument: tunerInstruments[found[1]], label: found[1], requestedInstrument: true } : null;
    }, { changesScreen: true, priority: 75, validate: slots => slots.requestedInstrument && !slots.instrument ? 'O afinador suporta violão, guitarra, ukulele, baixo e violino.' : null });
    add('tuner.play', 'study', request => {
      const found = request.text.match(/^(iniciar|parar) (?:microfone do )?afinador$/);
      return found ? { start: found[1] === 'iniciar' } : request.text === 'iniciar afinacao' || request.text === 'comecar afinacao' ? { start: true } : null;
    }, { risk: 'tool-control', changesScreen: true, priority: 75 });
    add('tuner.string', 'study', request => {
      if (['afinador automatico', 'afinacao automatica'].includes(request.text)) return { index: null };
      const found = request.numbered.match(/^(?:afinar |selecionar )?corda (\d+)$/);
      return found ? { index: /-\s*\d/.test(request.raw)?-1:Number(found[1]) - 1 } : null;
    }, { risk: 'tool-control', priority: 75, validate: (slots, context) => !context.tunerVisible ? 'Abra o afinador antes de selecionar uma corda.' : slots.index !== null && (slots.index < 0 || slots.index >= context.tunerStringCount) ? 'Essa corda não existe no instrumento selecionado.' : null });
    const chordInstruments = { violao: 'guitar', guitarra: 'guitar', ukulele: 'ukulele', teclado: 'keyboard', piano: 'keyboard', cavaco: 'cavaquinho', cavaquinho: 'cavaquinho', viola: 'viola-caipira-cebolao-e', 'viola caipira': 'viola-caipira-cebolao-e' };
    add('song.instrument', 'music', match(/^(?:(?:mudar|definir|colocar)\s+)?(?:instrumento|diagramas?|acordes?)(?: para| de| no)?\s+(.+)$/, found => ({ value: chordInstruments[found[1]], label: found[1] })), { needsSong: true, writesSong: true, priority: 75, risk: 'draft-write', validate: slots => slots.value ? null : 'Os diagramas disponíveis são violão, guitarra, ukulele, teclado, cavaco e viola caipira.' });
    add('song.view', 'music', request => {
      const value = request.text.replace(/^(?:abrir|ver|mostrar|exibir)\s+/, '');
      const views = { 'resumo harmonico': 'summary', 'letra e cifra': 'full', 'letra e cifras': 'full', 'letra com cifra': 'full', letra: 'lyrics', tablatura: 'tablature', tablaturas: 'tablature' };
      return views[value] ? { value: views[value] } : null;
    }, { needsSong: true, priority: 75 });
    add('song.step', 'navigation', request => ['proxima musica', 'avancar musica'].includes(request.text) ? { delta: 1 } : ['musica anterior', 'voltar musica'].includes(request.text) ? { delta: -1 } : null, { needsSong: true, changesScreen: true, priority: 75 });
    add('song.font', 'music', request => ['aumentar fonte', 'fonte maior'].includes(request.text) ? { delta: 2 } : ['diminuir fonte', 'fonte menor'].includes(request.text) ? { delta: -2 } : null, { needsSong: true, writesSong: true, risk: 'draft-write', priority: 75 });
    add('scroll.speed', 'study', request => /^(?:aumentar velocidade(?: da rolagem)?|rolar mais rapido)$/.test(request.text) ? { delta: 1 } : /^(?:diminuir velocidade(?: da rolagem)?|rolar mais devagar)$/.test(request.text) ? { delta: -1 } : null, { needsSong: true, writesSong: true, risk: 'draft-write', priority: 75 });
    add('stage.play', 'study', request => ['modo palco', 'iniciar palco', 'iniciar modo palco', 'abrir modo palco'].includes(request.text) ? { start: true } : ['sair do palco', 'fechar palco', 'parar palco', 'parar modo palco', 'sair do modo palco'].includes(request.text) ? { start: false } : null, { changesScreen: true, risk: 'tool-control', priority: 75 });

    const generators = { default: ['nova musica', 'adicionar musica', 'gerar musica', 'gerar com ia', 'gerar musica com ia', 'criar com ia', 'criar musica com ia', 'abrir gerador com ia', 'usar ia para gerar musica', 'fazer musica com ia'], pesquisa: ['busca por ia', 'buscar por ia', 'abrir busca por ia'], arquivo: ['arquivo ou foto', 'adicionar por arquivo', 'abrir arquivo ou foto'], texto: ['adicionar por texto', 'abrir texto', 'gerar por texto'], camera: ['camera', 'abrir camera', 'tirar foto', 'foto da cifra', 'adicionar por foto'] };
    add('music.generate', 'creation', request => {
      const mode = Object.keys(generators).find(key => generators[key].includes(request.text));
      return mode ? { mode } : null;
    }, { changesScreen: true, risk: 'open-editor', priority: 85 });
    add('song.edit', 'creation', exact(['editar musica', 'editar esta musica']), { needsSong: true, writesSong: true, changesScreen: true, priority: 75, risk: 'open-editor' });
    add('song.delete', 'music', exact(['excluir musica', 'excluir esta musica', 'excluir da playlist', 'remover da playlist']), { needsSong: true, writesSong: true, changesScreen: true, risk: 'confirmed-delete', priority: 75, validate: (_slots, context) => context.eventId ? 'Você está na versão do evento. Edite o repertório do evento para retirar essa música; a playlist será preservada.' : null });
    const medley = { add: ['adicionar bloco', 'novo bloco do medley'], save: ['salvar medley', 'salvar na playlist'], clear: ['limpar medley', 'limpar todos os blocos'] };
    add('medley.workflow', 'creation', request => {
      const operation = Object.keys(medley).find(key => medley[key].includes(request.text));
      return operation && !(request.text === 'salvar na playlist' && request.context.songOpen) ? { operation } : null;
    }, { changesScreen: true, priority: 75, risk: 'confirmed-workflow' });
    add('event.create', 'creation', exact(['novo evento', 'criar evento', 'adicionar evento']), { changesScreen: true, priority: 75, risk: 'open-editor' });
    const eventFlows = { chat: ['abrir chat do evento', 'chat do evento', 'mensagens do evento'], notices: ['notificacoes do evento', 'avisos do evento'], edit: ['editar evento', 'editar este evento'], share: ['compartilhar evento', 'compartilhar este evento'], leadership: ['transferir lideranca', 'mudar lider do evento'], invite: ['convidar integrante', 'convidar participante', 'adicionar integrante', 'buscar integrante'], addSongs: ['adicionar musica ao evento', 'adicionar musicas ao evento'], order: ['ordenar repertorio', 'reordenar repertorio'], members: ['ver integrantes', 'ver participantes'], delete: ['excluir evento', 'excluir este evento'] };
    add('event.workflow', 'events', request => {
      const operation = Object.keys(eventFlows).find(key => eventFlows[key].includes(request.text));
      return operation ? { operation } : null;
    }, { changesScreen: true, risk: 'confirmed-workflow', priority: 85, validate: (slots, context) => !context.eventId || !context.canAccessEvent ? 'Abra um evento do qual você participa antes de executar esse comando.' : ['edit', 'leadership', 'invite', 'addSongs', 'order', 'delete'].includes(slots.operation) && !context.canManageEvent ? 'Somente o líder pode executar essa ação no evento.' : slots.operation === 'invite' && !context.authenticated ? 'Entre com sua conta para convidar integrantes.' : null });
    add('account.login', 'account', exact(['entrar com google', 'fazer login', 'iniciar sessao']), { changesScreen: true, changesAccount: () => true, risk: 'account', priority: 75 });
    add('account.logout', 'account', exact(['sair da conta', 'fazer logout', 'encerrar sessao']), { changesScreen: true, changesAccount: () => true, risk: 'confirmed-account', priority: 75 });
    add('library.sync', 'account', exact(['sincronizar agora', 'sincronizar biblioteca']), { risk: 'personal-sync', priority: 75 });
    const backupFlows = { export: ['exportar backup', 'exportar backup do perfil', 'exportar meus dados'], import: ['importar backup', 'importar backup de perfil', 'restaurar backup'], diagnostics: ['baixar diagnostico', 'gerar diagnostico', 'baixar diagnostico para suporte'] };
    add('backup.workflow', 'account', request => {
      const operation = Object.keys(backupFlows).find(key => backupFlows[key].includes(request.text));
      return operation ? { operation } : null;
    }, { risk: 'private-export-or-import', priority: 75 });
    add('contribution.pix', 'account', exact(['copiar pix', 'copiar codigo pix', 'contribuir com o projeto']), { risk: 'clipboard', priority: 75 });

    add('event.invite-person', 'events', request => {
      const found=request.text.match(/^(?:convidar|convide|convida)(?: o| a)?\s+(.+?)(?: para (?:o |este )?evento)?$/);
      return found&&!['integrante','participante'].includes(found[1])?{query:found[1]}:null;
    }, {priority:90,changesScreen:true,risk:'confirmed-invitation',validate:(_slots,context)=>!context.eventId||!context.canAccessEvent?'Abra o evento antes de convidar alguém.':!context.canManageEvent?'Somente o líder pode convidar integrantes.':!context.authenticated?'Entre com sua conta para convidar integrantes.':null});

    // Only harmless, unmatched conversational phrases retain compatibility.
    add('compatibility.legacy', 'compatibility', () => ({}), { priority: -100, changesScreen: true, risk: 'legacy-guarded', changesAccount: text => ['entrar com google', 'fazer login', 'iniciar sessao', 'sair da conta', 'fazer logout', 'encerrar sessao'].includes(text) });
    return Object.freeze(definitions);
  }
  global.roudyAssistantActions = Object.freeze({ create });
})(window);
