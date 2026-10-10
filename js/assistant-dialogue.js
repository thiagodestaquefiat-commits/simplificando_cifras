(function (global) {
  'use strict';
  // One short-lived question in RAM. Answers always return to the action manager.
  function create({ manager, context, normalize, numbers, memory = null, now = () => Date.now(), ttlMs = 30000 }) {
    const result = global.roudyActionManager.result;
    const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const replyKey = value => clean(value).replace(/\s+por favor$/, '').replace(/^(?:eu quero|pode ser|prefiro|quero)\s+/, '').replace(/^(?:o|a|os|as|do|da|de|esse|essa|aquele|aquela)\s+/, '');
    const ownerKey = value => JSON.stringify([value.ownerId, value.authSubject, value.libraryOwner, value.ready]);
    const scopeKey = value => JSON.stringify([ownerKey(value), value.screen, value.songId, value.eventId, value.itemId, value.canEditSong, value.canAccessEvent, value.canManageEvent, value.editorOpen, value.dialogueScope]);
    let pending = null, invalidated = null, serial = 0, busy = false, lastOwner = null;
    const seen = new Map();
    const colors = ['dourado', 'coral', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa', 'branco'];
    const colorAliases = { vermelha:'vermelho', amarela:'amarelo', roxa:'roxo', branca:'branco' };
    const languages = ['portugues', 'portugues brasileiro', 'brasileiro', 'espanhol', 'espanol', 'ingles', 'english', 'italiano', 'frances', 'francais', 'alemao', 'deutsch'];
    const missing = [];
    const add = (pattern, prompt, parse, options = {}) => missing.push({ pattern, prompt, parse, ...options });
    const oneOf = (values, prefix, aliases = {}) => text => { const value = aliases[replyKey(text)] || replyKey(text);return values.includes(value) ? { command: prefix + value } : null; };
    const numeric = (prefix, min, max, suffix = '') => text => {
      const value = numbers(replyKey(text)).replace(/^(?:casa|bpm|andamento|tamanho|escala)\s+/, '').replace(/(?: bpm| por cento| por 100| por centos)$/, '');
      if (/-\s*\d/.test(text) || !/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) return null;
      return { command: prefix + Number(value) + suffix };
    };
    add(/^(?:mudar|trocar|definir|colocar) (?:a )?cor(?: (?:da|das) cifras?)?(?: para)?$/, 'Qual cor? Por exemplo: azul, verde, dourado ou branco.', oneOf(colors, 'cor da cifra ', colorAliases));
    add(/^(?:mudar|trocar|definir|colocar) (?:o )?(?:idioma|lingua)(?: (?:da interface|do app))?(?: para)?$/, 'Qual idioma? Português brasileiro, espanhol, inglês, italiano, francês ou alemão?', oneOf(languages, 'mudar idioma para ', {'portugues do brasil':'portugues brasileiro'}));
    add(/^(?:mudar|trocar|definir|colocar) (?:o )?tema(?: para)?$/, 'Qual tema: claro, escuro ou do sistema?', oneOf(['claro', 'escuro', 'do sistema'], 'tema ', {sistema:'do sistema', automatico:'do sistema'}));
    add(/^(?:(?:mudar|ajustar|definir|colocar) )?(?:bpm|andamento|metronomo em)(?: para)?$/, 'Qual andamento, entre 30 e 240 BPM?', numeric('bpm ', 30, 240), { editInSong: true });
    add(/^(?:mudar|ajustar|definir|colocar) (?:o )?capotraste(?: na casa| casa| em| para)?$/, 'Em qual casa, de zero a 12? Diga zero para ficar sem capotraste.', text => ['sem', 'sem capotraste'].includes(replyKey(text)) ? {command:'capotraste 0'} : numeric('capotraste ', 0, 12)(text), { needsSong: true, editInSong: true });
    add(/^(?:(?:mudar|ajustar|definir|colocar) )?compasso(?: para| em)?$/, 'Qual compasso: 2 por 4, 3 por 4, 4 por 4 ou 6 por 8?', text => {
      const meter = numbers(replyKey(String(text).replace(/(\d+)\s*\/\s*(\d+)/,'$1 por $2'))).replace(/^(?:compasso )/, '').replace('sobre', 'por');
      return ['2 por 4','3 por 4','4 por 4','6 por 8'].includes(meter) ? {command:'compasso ' + meter} : null;
    }, { editInSong: true });
    add(/^(?:mudar|ajustar|definir|colocar) (?:o )?(?:instrumento|diagramas?|acordes?)(?: para)?$/, 'Qual instrumento: violão, guitarra, ukulele, teclado, cavaco ou viola caipira?', oneOf(['violao','guitarra','ukulele','teclado','piano','cavaco','cavaquinho','viola','viola caipira'], 'instrumento para '), { needsSong: true, editInSong: true });
    add(/^(?:mudar|ajustar|definir) (?:o )?(?:tamanho|escala)(?: dos elementos| da interface)?(?: para| em)?$/, 'Qual tamanho: 100, 110, 120, 130 ou 140 por cento?', text => {
      const parsed = numeric('escala ', 100, 140)(text);return parsed && [100,110,120,130,140].includes(Number(parsed.command.split(' ')[1])) ? parsed : null;
    });
    add(/^(?:mudar|ajustar|trocar) (?:o )?tom$/, 'Quer subir um semitom, descer um semitom ou voltar ao tom original?', oneOf(['subir','descer','original'], '', {aumentar:'subir',baixar:'descer','tom original':'original'}), { needsSong: true, editInSong: true, transform: value => ({command:value.command === 'original' ? 'tom original' : value.command + ' tom'}) });
    add(/^(?:abrir|tocar|ouvir|ver) (?:a )?musica$/, 'Qual é o título da música?', text => ({command:'abrir musica ' + text}));
    add(/^abrir evento$/, 'Qual evento? Diga o nome, hoje, amanhã ou o dia.', text => {
      const value = replyKey(text);return {command: /^(?:hoje|amanha)$/.test(value) ? 'evento de ' + value : /^dia\b/.test(value) ? 'evento ' + value : 'abrir evento ' + text};
    });
    add(/^(?:convidar|convida|convide)$/,'Quem você quer convidar? Diga o nome ou nome de usuário.',text=>({command:'convidar '+text}),{needsEvent:true});

    function sync() {
      memory?.sync();
      const current = context(), identity = ownerKey(current);
      if (lastOwner !== identity) { seen.clear();lastOwner = identity; }
      if (pending && (pending.scope !== scopeKey(current) || now() >= pending.expiresAt)) {
        invalidated = pending.scope === scopeKey(current) ? 'expired' : 'context';pending = null;
      }
      return pending;
    }
    function cancel() { const hadQuestion = Boolean(pending);pending = null;invalidated = null;return hadQuestion; }
    function question(plan, original, attempts = 0) {
      const current = context();
      const choices = plan.choices?.map(item=>Object.freeze({...item,aliases:Object.freeze([...(item.aliases||[])])}));
      pending = { ...plan, ...(choices?{choices:Object.freeze(choices)}:{}), original, attempts, id: ++serial, scope: scopeKey(current), expiresAt: now() + ttlMs };
      invalidated = null;
      return result('clarify', plan.prompt, { awaitingResponse: true, questionId: pending.id });
    }
    function publicPending() { sync();return pending ? { id:pending.id, kind:pending.kind, expiresAt:pending.expiresAt } : null; }
    function refreshDeadline(id) { sync();if (!pending || pending.id !== id) return false;pending.expiresAt = now() + ttlMs;return true; }
    function selection(choices, raw) {
      const text = replyKey(raw), ordinal = {primeiro:1,primeira:1,segundo:2,segunda:2,terceiro:3,terceira:3,quarto:4,quarta:4,quinto:5,quinta:5};
      const token = text.replace(/^(?:numero|opcao)\s+/, ''), numbered = numbers(token), index = ordinal[token] || (/^[1-5]$/.test(numbered) ? Number(numbered) : 0);
      if (index) return choices[index - 1] || null;
      if (!text) return null;
      const aliases = choice => [choice.label, ...(choice.aliases || [])].filter(Boolean).map(replyKey);
      const exact = choices.filter(choice => aliases(choice).includes(text));
      if (exact.length === 1) return exact[0];
      if (exact.length > 1 || text.length < 3) return null;
      const partial = choices.filter(choice => aliases(choice).some(alias => alias.includes(text)));
      return partial.length === 1 ? partial[0] : null;
    }
    const clearCommand = resolved => Boolean(resolved.definition && resolved.definition.id !== 'compatibility.legacy');
    const freshCommand = (resolved, raw) => {
      const text=resolved.canonical||normalize(raw),explicit=/^(?:abrir|tocar|ouvir|ver|iniciar|parar|mudar|trocar|definir|ajustar|colocar|salvar|excluir|buscar|aumentar|diminuir|subir|descer|compartilhar|sincronizar)\b/.test(text);
      return resolved.languageRequest===true||explicit&&(clearCommand(resolved)||missing.some(spec=>spec.pattern.test(text)))||clearCommand(resolved)&&['navigation.home','navigation.panel','assistant.help','music.generate','assistant.sequence','assistant.undo'].includes(resolved.definition.id);
    };
    function safeToAsk(current, spec) {
      if (current.ready === false || current.editorOpen) return false;
      if (spec.needsSong && !current.songOpen) return false;
      if (spec.needsEvent && (!current.eventId || !current.canAccessEvent || !current.canManageEvent || !current.authenticated)) return false;
      return !((spec.editInSong && current.songOpen) && !current.canEditSong);
    }
    async function perform(raw, options) {
      const contextual=memory?.interpret(raw);
      if(contextual){
        if(contextual.command)return perform(contextual.command,options);
        if(contextual.followUp&&safeToAsk(context(),{}))return question({kind:'command',choices:contextual.followUp.choices,prompt:contextual.message},raw);
        return contextual;
      }
      const current = context(), resolved = manager.resolve(raw);
      const text = resolved.canonical||resolved.request?.text||normalize(raw);
      if (!text && safeToAsk(current,{})) return question({kind:'request',prompt:'Olá! O que você deseja fazer?'},raw);
      const spec = missing.find(item => item.pattern.test(text));
      if (spec && !safeToAsk(current,spec)) return result('blocked',current.ready===false?'Aguarde o carregamento da conta.':current.editorOpen?'Conclua ou feche o editor antes de fazer outro pedido.':spec.needsEvent?'Abra um evento do qual você seja líder e entre com sua conta para convidar.':spec.needsSong&&!current.songOpen?'Abra uma música antes desse pedido.':'Esta música não está disponível para alteração.');
      if (spec && safeToAsk(current, spec) && (!resolved.status || resolved.status !== 'blocked')) return question({kind:'parameter', prompt:spec.prompt, spec}, raw);
      const definition = resolved.definition;
      const valid = definition && !definition.validate?.(resolved.slots, current) && safeToAsk(current, {needsSong:definition.needsSong, editInSong:definition.writesSong || definition.requiresEditInSong});
      if (valid && (definition.id === 'song.delete' || definition.id === 'account.logout' && current.authenticated || definition.id === 'medley.workflow' && resolved.slots.operation === 'clear' && current.medleyCount > 0)) {
        const prompt = definition.id === 'song.delete' ? 'Você quer excluir esta música da sua playlist? Diga sim ou cancelar. A confirmação de segurança na tela será mantida.' : definition.id === 'account.logout' ? 'Você quer sair da sua conta? Diga sim ou cancelar. Vou manter a verificação de sincronização e a confirmação de segurança.' : 'Você quer limpar todos os blocos do Medley? Diga sim ou cancelar. A confirmação na tela será mantida.';
        return question({kind:'confirm',prompt}, raw);
      }
      const output = await dispatch(raw, options);
      if(output.followUp?.kind==='confirm'&&safeToAsk(context(),{}))return question({kind:'confirm',choiceId:output.followUp.choiceId,prompt:output.message},raw);
      if (output.followUp && ['entity','command'].includes(output.followUp.kind) && Array.isArray(output.followUp.choices) && output.followUp.choices.length >= 2 && output.followUp.choices.length <= 5 && safeToAsk(context(), {})) return question({kind:output.followUp.kind,choices:output.followUp.choices,prompt:output.message}, raw);
      return output;
    }
    async function dispatch(raw,options){const before=context(),output=await manager.run(raw,options);memory?.observe(output,before);return output;}
    async function run(raw, options = {}) {
      if (typeof raw !== 'string' || raw.length > 500) return result('blocked', 'Diga um pedido curto, com uma ação de cada vez.');
      sync();
      const identity = ownerKey(context()), cacheKey = options.requestId ? identity + ':' + String(options.requestId) : null;
      const previous = cacheKey && seen.get(cacheKey);
      if (previous && now() - previous.time < 60000) return {...previous.output, duplicate:true, silent:true};
      if (busy) return result('blocked', 'Um comando já está sendo executado.');
      busy = true;let output;
      try {
        const text = clean(raw), normalized = normalize(raw);
        const cancelling = ['cancelar','cancela','cancelar pedido','cancelar conversa','parar conversa','esquece','esqueca','deixa pra la','deixe pra la'].includes(text) || normalized === 'parar conversa';
        if (cancelling || pending?.kind === 'confirm' && /^(?:nao|nao quero|negativo|nao exclua|nao confirme)$/.test(text)) {cancel();memory?.clear();output=result('noop','Pedido cancelado.');}
        else if (pending) {
          const plan = pending, resolved = manager.resolve(raw);
          // A complete new command supersedes the question; short replies fill its slot.
          const newCommand = freshCommand(resolved,raw);
          if (newCommand) {cancel();output=await perform(raw,options);}
          else {
            let answer = null;
            if (plan.kind === 'request' && clearCommand(resolved)) {cancel();output=await perform(raw,options);}
            else if (plan.kind === 'confirm') answer = /^(?:sim|confirmo|confirmar|pode|pode sim|pode excluir|pode sair|pode convidar|isso|ok|certo)$/.test(text) ? {command:plan.original,choiceId:plan.choiceId,confirmed:true} : null;
            else if (plan.kind === 'parameter') {answer=plan.spec.parse(raw);if(answer && plan.spec.transform)answer=plan.spec.transform(answer);}
            else if(plan.choices) { const selected=selection(plan.choices,raw);if(selected)answer=plan.kind==='entity'?{command:plan.original,choiceId:selected.id}:{command:selected.command}; }
            if (output) { /* The open request was resolved without selecting a slot. */ }
            else if (answer) {
              cancel();output=await dispatch(answer.command,{...options,...(answer.choiceId?{choiceId:answer.choiceId}:{}),...(answer.confirmed?{confirmed:true}:{})});
              if (output.followUp) output=question({kind:output.followUp.kind,choices:output.followUp.choices,choiceId:output.followUp.choiceId,prompt:output.message},answer.command);
            } else if (resolved.status === 'blocked') {cancel();output=resolved;}
            else if (clearCommand(resolved)) {cancel();output=await perform(raw,options);}
            else if (plan.attempts >= 2) {cancel();output=result('blocked','Não consegui completar o pedido. Toque no assistente e faça um novo pedido.');}
            else output=question({...plan,prompt:'Não consegui distinguir essa resposta. ' + plan.prompt.replace(/^Não consegui distinguir essa resposta\. /,'')},plan.original,plan.attempts+1);
          }
        } else if (invalidated && !freshCommand(manager.resolve(raw),raw)) {const reason=invalidated;invalidated=null;output=result('blocked',reason==='expired'?'A pergunta expirou. Faça o pedido novamente.':'A tela ou a conta mudou. Faça um novo pedido no contexto atual.');}
        else if (/^(?:sim|confirmo|ok|nao)$/.test(text)) output=result('clarify','Não há um pedido aguardando essa confirmação. Diga o que deseja fazer.');
        else {invalidated=null;output=await perform(raw,options);}
      } finally {busy=false;}
      if (cacheKey && identity === ownerKey(context())) {seen.set(cacheKey,{time:now(),output});while(seen.size>64)seen.delete(seen.keys().next().value);}
      return output;
    }
    return Object.freeze({run,cancel,sync,clearMemory:()=>memory?.clear(),getPending:publicPending,refreshDeadline,getScope:()=>scopeKey(context())});
  }
  global.roudyAssistantDialogue = Object.freeze({create});
})(window);
