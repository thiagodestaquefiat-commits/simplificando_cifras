(function (global) {
  'use strict';
  const clean = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const prepare=value=>{let text=clean(value);for(let i=0;i<3;i++)text=text.replace(/^(?:sera que voce pode|voce poderia|poderia|tem como|por gentileza|por favor|faz favor|me ajuda a|me ajude a|eu gostaria de|quero|preciso|pode|agora|entao|roudy|me) /,'').replace(/ (?:por gentileza|por favor)$/,'');return text;};
  // Closed vocabulary: every translation returns a native command, not executable code.
  const groups = {
    'abrir playlist':['minhas musicas','meu repertorio','biblioteca musical','ver minha biblioteca','mostrar minhas musicas','abrir biblioteca','voltar para minhas musicas','ver meus louvores'],
    'abrir eventos':['minha agenda','ver agenda','abrir agenda','mostrar meus eventos','ver meus compromissos','ver eventos','agenda de eventos'],
    'abrir medley':['montar medley','ver meus medleys','abrir meus medleys','montar uma sequencia de louvores'],
    'abrir configuracoes':['ajustes do aplicativo','abrir ajustes','ver configuracoes','personalizar aplicativo','configurar o aplicativo','abrir preferencias'],
    'abrir aparencia':['personalizar aparencia','ajustar acessibilidade','opcoes de acessibilidade','configurar visual','mudar visual do aplicativo'],
    'abrir idioma':['escolher idioma','selecionar idioma','ver idiomas','opcoes de idioma','idiomas disponiveis'],
    'abrir ferramentas':['ferramentas de estudo','abrir ferramentas musicais','ver ferramentas','ferramentas musicais'],
    'abrir suporte':['falar com suporte','preciso de suporte','ajuda do aplicativo','central de ajuda','ver ajuda e suporte'],
    'abrir minha conta':['ver minha conta','dados da minha conta','gerenciar minha conta'],
    'abrir perfil':['meus dados pessoais','personalizar meu perfil','ver meu perfil','alterar minha foto','trocar foto de perfil','editar meu nome de usuario','editar meus instrumentos','editar minha localizacao'],
    'abrir bandas':['ver minhas bandas','gerenciar meus grupos','ver grupos musicais'],
    'abrir notificacoes':['central de notificacoes','mostrar notificacoes','ver meus avisos','ver minhas notificacoes','ver convites recebidos','tem alguma notificacao','tenho algum convite'],
    'abrir backup':['meus backups','opcoes de backup','backup do meu perfil','ver estado da biblioteca'],
    'voltar':['voltar uma tela','voltar para a tela anterior','fechar esta tela','sair desta tela'],
    'ajuda do assistente':['o que posso pedir','me explique seus comandos','como voce pode me ajudar','quais sao seus comandos','o que voce sabe fazer'],
    'abrir afinador':['preciso afinar','quero afinar','afinar meu instrumento','ferramenta para afinacao'],
    'iniciar afinador':['comecar a afinacao','escutar meu instrumento','ativar microfone do afinador','ligar microfone do afinador'],
    'parar afinador':['terminar afinacao','encerrar afinacao','parar de afinar','desligar microfone do afinador'],
    'afinador automatico':['detectar corda automaticamente','deixar afinador automatico','voltar a afinacao automatica'],
    'abrir metronomo':['quero estudar o ritmo','ver metronomo','mostrar o metronomo','abrir ferramenta de ritmo'],
    'iniciar metronomo':['comecar as batidas','ligar as batidas','iniciar as batidas','comecar o clique','tocar o metronomo'],
    'parar metronomo':['parar as batidas','parar o clique','interromper as batidas','silenciar as batidas'],
    'aumentar bpm':['acelerar as batidas','batidas mais rapidas','metronomo esta lento','metronomo esta devagar','aumentar o andamento'],
    'diminuir bpm':['desacelerar as batidas','batidas mais lentas','metronomo esta rapido','metronomo esta rapido demais','diminuir o andamento'],
    'iniciar rolagem':['comecar a rolar','fazer a pagina rolar','rolar a pagina','iniciar acompanhamento da pagina'],
    'iniciar rolagem automatica':['rolar sozinho','rolar sozinha','rolar automaticamente','iniciar rolagem por tempo','seguir a pagina automaticamente'],
    'iniciar rolagem inteligente':['acompanhar os acordes','seguir os acordes tocados','seguir o que estou tocando','acompanhar o violao','rolar conforme os acordes'],
    'parar rolagem':['parar de rolar','interromper a rolagem','pausar a pagina','parar a pagina'],
    'parar rolagem inteligente':['parar de acompanhar os acordes','interromper acompanhamento dos acordes'],
    'parar rolagem automatica':['parar rolagem por tempo','interromper rolagem automatica'],
    'aumentar velocidade da rolagem':['pagina rolando devagar','rolagem esta lenta','rolagem esta devagar','rolagem esta lenta demais','acelerar a rolagem'],
    'diminuir velocidade da rolagem':['pagina rolando rapido demais','rolagem esta rapida','rolagem esta rapida demais','desacelerar a rolagem'],
    'subir tom':['subir a tonalidade','aumentar a tonalidade','deixar o tom mais alto','transpor um semitom acima','subir meio tom'],
    'descer tom':['descer a tonalidade','baixar a tonalidade','deixar o tom mais baixo','transpor um semitom abaixo','descer meio tom'],
    'tom original':['voltar ao tom original','voltar a tonalidade original','desfazer transposicao','zerar transposicao'],
    'remover capotraste':['tocar sem capotraste','deixar sem capotraste','tirar o capo','sem capo'],
    'salvar alteracoes':['guardar meus ajustes','guardar estas alteracoes','salvar o que mudei','gravar os ajustes da musica','salvar os ajustes atuais'],
    'resumo harmonico':['mostrar so os acordes','ver resumo da harmonia','abrir resumo dos acordes','ver resumo harmonico'],
    'letra e cifra':['mostrar letra com acordes','ver letra com cifras','mostrar cifra completa','ver letra e acordes'],
    'letra':['mostrar apenas a letra','ver so a letra','letra sem acordes','letra sem cifras'],
    'tablaturas':['mostrar os riffs','ver os solos','abrir os solos','mostrar tablatura'],
    'proxima musica':['passar para proxima musica','passar para o proximo louvor','avancar para a proxima cancao','pular para proxima musica'],
    'musica anterior':['voltar para o louvor anterior','voltar para a cancao anterior'],
    'aumentar fonte':['aumentar o tamanho da letra','letra maior','texto maior','aumentar letras'],
    'diminuir fonte':['diminuir o tamanho da letra','letra menor','texto menor','diminuir letras'],
    'iniciar palco':['preparar modo palco','entrar no modo palco','abrir modo apresentacao','modo de apresentacao'],
    'parar palco':['encerrar modo palco','sair da apresentacao','voltar ao modo de estudo'],
    'gerar com ia':['criar musica com inteligencia artificial','usar inteligencia artificial','abrir criacao de musica','criar uma musica','adicionar uma musica'],
    'abrir busca por ia':['procurar musica com inteligencia artificial','buscar musica com ia','buscar cifra com ia'],
    'arquivo ou foto':['importar uma foto','importar um pdf','enviar arquivo de cifra','usar um arquivo','adicionar cifra por arquivo'],
    'adicionar por texto':['colar letra e cifra','colar uma cifra','digitar uma musica','escrever letra e cifra','usar texto de uma musica'],
    'abrir camera':['fotografar uma cifra','capturar foto da cifra','usar a camera','tirar foto da musica'],
    'editar musica':['corrigir esta musica','editar a letra desta musica','editar a cifra desta musica','abrir editor da musica'],
    'excluir musica':['apagar esta musica','remover esta musica da playlist','excluir a musica atual'],
    'adicionar bloco':['adicionar trecho ao medley','inserir bloco no medley'],
    'salvar medley':['guardar meu medley','salvar sequencia do medley'],
    'limpar medley':['apagar todos os blocos do medley','zerar meu medley'],
    'criar evento':['marcar um evento','cadastrar evento','criar novo compromisso','novo compromisso'],
    'abrir chat do evento':['conversar com o grupo do evento','abrir conversa do evento','ver mensagens deste evento'],
    'notificacoes do evento':['ver avisos deste evento','abrir avisos do evento'],
    'editar evento':['alterar os dados do evento','corrigir este evento'],
    'compartilhar evento':['enviar convite do evento','compartilhar repertorio do evento','ver link do evento'],
    'transferir lideranca':['passar a lideranca','trocar o lider do evento'],
    'convidar integrante':['buscar usuario para convidar','procurar integrante','convidar alguem para o evento'],
    'adicionar musicas ao evento':['montar repertorio do evento','escolher musicas do evento'],
    'ordenar repertorio':['organizar ordem das musicas','mudar ordem do repertorio'],
    'ver integrantes':['quem participa deste evento','ver integrantes deste evento','mostrar membros do evento'],
    'excluir evento':['apagar este evento','remover este evento'],
    'entrar com google':['acessar minha conta google','login com google','entrar na minha conta'],
    'sair da conta':['desconectar minha conta','sair do meu perfil','logout da minha conta'],
    'sincronizar biblioteca':['atualizar minha biblioteca na nuvem','enviar alteracoes para a nuvem','sincronizar meus dados'],
    'exportar backup do perfil':['baixar meu backup','fazer backup do perfil','guardar uma copia dos meus dados','exportar backup de perfil'],
    'importar backup de perfil':['recuperar meu backup','carregar backup do perfil','importar meu backup'],
    'baixar diagnostico para suporte':['gerar arquivo para suporte','baixar relatorio de diagnostico','baixar diagnostico para ajuda'],
    'copiar pix':['copiar codigo da contribuicao','copiar pix copia e cola','ajudar o projeto com pix'],
    'iniciar alto contraste':['ativar contraste alto','deixar com alto contraste'],
    'parar alto contraste':['desativar contraste alto','tirar alto contraste'],
    'iniciar modo para daltonicos':['ativar acessibilidade para daltonicos','ligar modo daltonico'],
    'parar modo para daltonicos':['desativar acessibilidade para daltonicos','tirar modo daltonico'],
    'tema escuro':['deixar a tela escura','usar tema escuro'],
    'tema claro':['deixar a tela clara','usar tema claro'],
    'tema do sistema':['usar o tema do aparelho','seguir tema do sistema'],
    'mudar bpm':['escolher andamento','ajustar ritmo','mudar andamento','definir andamento'],
    'mudar capotraste':['escolher casa do capotraste','mudar o capo','ajustar o capo'],
    'mudar compasso':['escolher compasso','definir formula de compasso'],
    'mudar cor':['escolher cor da cifra','trocar cor dos acordes','mudar a cor dos acordes'],
    'mudar idioma':['usar outro idioma','traduzir a interface','alterar lingua do app'],
    'mudar tema':['usar outro tema','escolher tema'],
    'mudar instrumento':['escolher instrumento dos diagramas','trocar instrumento dos acordes'],
    'mudar escala':['escolher tamanho da interface','escolher escala da interface'],
    'mudar tom':['mudar tonalidade','ajustar tonalidade'],
    'parar':['parar ferramenta ativa','interromper ferramenta atual']
  };
  const aliases=new Map();
  for(const [command,phrases] of Object.entries(groups))for(const phrase of phrases){const key=prepare(phrase);if(aliases.has(key)&&aliases.get(key)!==command)throw new Error('Alias conflitante: '+key);aliases.set(key,command);}
  const rules=[];
  const colorForms={dourada:'dourado',douradas:'dourado',dourados:'dourado',corais:'coral',vermelhas:'vermelho',vermelhos:'vermelho',laranjas:'laranja',amarelas:'amarelo',amarelos:'amarelo',verdes:'verde',azuis:'azul',roxas:'roxo',roxos:'roxo',rosas:'rosa',brancas:'branco',brancos:'branco'};
  const add=(pattern,build)=>rules.push({pattern,build});
  const addData=(pattern,build)=>rules.push({pattern,build,data:true});
  add(/^(?:ensaiar|preparar (?:o ensaio|para o evento)|ver ensaio|ver compromisso)(?: para| de| do)? (hoje|amanha)$/,m=>'evento de '+m[1]);
  add(/^(?:ensaiar|ver compromisso|ver ensaio)(?: no| para o)? dia (\d+)(.*)$/,m=>'evento dia '+m[1]+m[2]);
  add(/^(?:preparar para|ver|mostrar) (?:o )?(?:proximo ensaio|proximo compromisso|evento mais proximo)$/,()=> 'abrir proximo evento');
  add(/^(?:abrir|ver|mostrar) (?:a )?agenda (?:de )?(hoje|amanha)$/,m=>'evento de '+m[1]);
  add(/^(?:ritmo|andamento|andamento do metronomo|batidas por minuto)(?: em| para| de)? (\d+)(?: bpm)?$/,m=>'bpm '+m[1]);
  add(/^(?:ajustar|mudar|colocar|deixar|configurar|definir) (?:o )?(?:ritmo|andamento)(?: em| para| de)? (\d+)(?: bpm)?$/,m=>'bpm '+m[1]);
  add(/^(?:usar|deixar|colocar|ajustar) (?:o )?(?:capo|capotraste)(?: na| na casa| em| para a casa| casa)? (\d+)$/,m=>'capotraste '+m[1]);
  add(/^(?:usar|colocar|mudar|ajustar) (?:o )?compasso(?: em| para)? (\d+) (?:por|sobre) (\d+)$/,m=>'compasso '+m[1]+' por '+m[2]);
  add(/^(?:afinar|afinacao de|abrir afinador para)(?: meu| minha| um| uma| o| a)? (violao|guitarra|ukulele|baixo|contrabaixo|violino)$/,m=>'abrir afinador '+m[1]);
  add(/^(?:afinar a|selecionar a|usar a) corda (\d+)$/,m=>'corda '+m[1]);
  add(/^(?:usar|tocar com|mostrar diagramas de|mostrar acordes de)(?: o| a)? (violao|guitarra|ukulele|teclado|piano|cavaco|cavaquinho|viola caipira)$/,m=>'instrumento para '+m[1]);
  add(/^(?:deixar|usar|colocar|mudar) (?:a )?(?:cifra|cifras|cor dos acordes|cor das cifras)(?: em| na cor| para)? (\w+)$/,m=>'cor da cifra '+(colorForms[m[1]]||m[1]));
  add(/^(?:traduzir o app para|usar o aplicativo em|interface em|colocar o aplicativo em|falar em) (.+)$/,m=>'mudar idioma para '+m[1]);
  add(/^(?:usar|colocar|mudar|ajustar) (?:a )?interface(?: em| para)? (\d+)(?: por cento| por 100)?$/,m=>'escala '+m[1]);
  add(/^(?:guardar|salvar) (?:estes|esses|os meus) ajustes(?: da musica)?$/,()=> 'salvar alteracoes');
  add(/^(?:ver|mostrar|abrir) (?:o )?(?:video de estudo|video da musica|gravacao da musica)$/,()=> 'buscar no youtube');
  addData(/^(?:buscar|procurar|pesquisar) (?:uma )?(?:gravacao|video)(?: de| da musica)? (.+) no youtube$/,m=>'buscar no youtube '+m[1]);
  addData(/^(?:ensaiar|estudar) (?:a )?musica (.+)$/,m=>'abrir musica '+m[1]);
  addData(/^(?:encontrar na playlist|pesquisar na minha playlist|procurar no repertorio) (.+)$/,m=>'buscar '+m[1]);
  addData(/^(?:chamar|chame|mandar convite para) (.+?)(?: para (?:o|este) evento)?$/,m=>'convidar '+m[1]);
  add(/^(?:ver|mostrar) (?:a )?(primeira|segunda|terceira|quarta|quinta|ultima) (?:cancao|do repertorio|do evento)$/,m=>'abrir '+m[1]+' musica');
  addData(/^(?:ver|mostrar|abrir) evento chamado (.+)$/,m=>'abrir evento '+m[1]);
  // Approximation is allowed only for opening these native read-only screens.
  const fuzzyCommands=new Set(['abrir playlist','abrir eventos','abrir configuracoes','abrir aparencia','abrir idioma','abrir ferramentas','abrir suporte','abrir perfil','abrir notificacoes','abrir afinador','abrir metronomo']);
  function similarity(a,b){
    const row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const previous=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=previous;}}
    return 1-row[b.length]/Math.max(a.length,b.length,1);
  }
  function interpret({raw,text,numbered,context={}}){
    let value=clean(text);
    if(!value||/\b(?:nao|nem|nunca|se|caso)\b/.test(value))return null;
    value=prepare(value);
    const choice=(message,choices)=>({message,followUp:{kind:'command',choices},languageRequest:true});
    if(/^(?:esta|ta|ficou)? ?(?:dificil de ler|dificil enxergar|ruim de ler|pouco legivel)$/.test(value)){
      const choices=[];
      if(context.songOpen&&context.stageActive)choices.push({id:'font',label:'aumentar a letra',aliases:['fonte','letra','texto'],command:'aumentar fonte'});
      choices.push({id:'appearance',label:'abrir tamanho da interface',aliases:['interface','tamanho','aparencia'],command:'abrir aparencia'},{id:'contrast',label:'ativar alto contraste',aliases:['contraste','alto contraste'],command:'iniciar alto contraste'});
      return choice('Quer '+choices.map(c=>c.label).join(', ou ')+'?',choices);
    }
    if(/^(?:ajustar|mudar|colocar) (?:o )?(?:tamanho|tamanho do texto)$/.test(value)){
      if(!context.songOpen)return {message:'Para o tamanho da interface, diga escala 110, 120, 130 ou 140, ou abrir aparência.',languageRequest:true};
      return choice('Você quer '+(context.stageActive?'aumentar a fonte da música':'abrir o modo palco para ajustar a fonte')+' ou abrir o tamanho da interface?',[{id:'font',label:context.stageActive?'fonte da música':'abrir palco para ajustar a fonte',aliases:['letra','fonte','musica','palco'],command:context.stageActive?'aumentar fonte':'iniciar palco'},{id:'interface',label:'tamanho da interface',aliases:['interface','app','tamanho'],command:'abrir aparencia'}]);
    }
    if(/^(?:salvar isso|guardar isso|salvar minhas mudancas)$/.test(value))return context.songOpen?{command:'salvar alteracoes'}:{message:'Diga o que deseja salvar: alterações de uma música ou o Medley.',languageRequest:true};
    if(/^(?:mais alto|mais baixo|aumentar som|diminuir som|som esta alto|som esta baixo|aumentar volume|diminuir volume)$/.test(value))return {message:'Volume do áudio e tom são diferentes. Não altero o volume do aparelho. Para transpor a música, diga subir tom ou descer tom.',languageRequest:true};
    const candidates=new Set();
    if(aliases.has(value))candidates.add(aliases.get(value));
    const numeric=clean(numbered||value);
    // Strip only the same recognized polite prefix; never discard arbitrary tails.
    const numericValue=prepare(numeric);
    const dataValue=prepare(raw||text);
    for(const {pattern,build,data} of rules){const match=(data?dataValue:numericValue).match(pattern);if(match)candidates.add(build(match));}
    if(candidates.size===1){const command=[...candidates][0];if(/^(?:bpm|capotraste|compasso|escala|corda|evento dia)\b/.test(command)&&/(?:^|\s)-\s*\d/.test(String(raw||'')))return {message:'Diga um valor válido, sem número negativo.',languageRequest:true};const named=dataValue.match(/^(?:ver|mostrar|abrir) evento chamado (.+)$/);return {command,...(named?{literalEventQuery:named[1]}:{})};}
    if(candidates.size>1)return choice('Encontrei mais de uma interpretação. Qual você deseja?',[...candidates].slice(0,5).map((command,i)=>({id:String(i),label:command,command})));
    // Literal data is never passed through approximate matching.
    if(/^(?:abrir|tocar|ouvir|ver) (?:a )?musica .+|^(?:abrir evento|buscar|pesquisar|procurar|convidar|convida|convide) .+/.test(value))return null;
    if(/^(?:abrir|mostrar|acessar|ver) [a-z ]+$/.test(value)&&value.length>=10&&!/\b(?:e|ou|sem|salvar|parar|iniciar|apagar|excluir|convidar|importar|exportar|backup|pix)\b/.test(value)){
      const scores=new Map();for(const [phrase,command] of aliases)if(fuzzyCommands.has(command))scores.set(command,Math.max(scores.get(command)||0,similarity(value,phrase)));
      for(const command of fuzzyCommands)scores.set(command,Math.max(scores.get(command)||0,similarity(value,command)));
      const ranking=[...scores].sort((a,b)=>b[1]-a[1]);
      if(ranking[0]?.[1]>=.94&&ranking[0][1]-(ranking[1]?.[1]||0)>=.08)return {command:ranking[0][0],confidence:ranking[0][1]};
    }
    return null;
  }
  const boundaryVerbs=Object.freeze(['guardar','guarde','escolher','traduzir','afinar','ensaiar','estudar','chamar','chame','copiar','editar','personalizar','organizar','transferir','corrigir','remover','tirar','zerar','marcar','cadastrar','fotografar','capturar','enviar','colar','digitar','escrever','montar']);
  global.roudyAssistantLanguage=Object.freeze({interpret,getExamples:()=>[...aliases].map(([phrase,command])=>({phrase,command})),similarity,boundaryVerbs});
})(window);
