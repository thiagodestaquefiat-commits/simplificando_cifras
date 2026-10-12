(function (global) {
  'use strict';
  const result = (status, message, extra = {}) => ({ ok: ['executed', 'opened', 'noop'].includes(status), action: null, status, message, ...extra });
  class ContextChanged extends Error {}

  function create({ catalog, runtime, normalize, numbers, now = () => Date.now() }) {
    const actions = new Map();
    const seen = new Map();
    let busy = false, lastResult = null, lastOwner = null;
    for (const definition of catalog) {
      if (actions.has(definition.id) || typeof runtime.handlers[definition.id] !== 'function') throw new Error(`Ação inválida: ${definition.id}`);
      actions.set(definition.id, definition);
    }
    const ownerKey = context => JSON.stringify([context.ownerId, context.authSubject, context.libraryOwner, context.ready]);
    const targetKey = context => JSON.stringify([ownerKey(context), context.screen, context.songId, context.eventId, context.itemId, context.canEditSong, context.canAccessEvent, context.canManageEvent, context.authenticated, context.editorOpen]);

    function resolve(raw, context) {
      if (typeof raw !== 'string' || raw.length > 500) return result('blocked', 'Diga um pedido curto, com uma ação de cada vez.');
      let text = normalize(raw);
      const request = { raw, text, numbered: numbers(text), context };
      if (!text) return { request, definition: actions.get('compatibility.legacy'), slots: {} };
      // Check polarity before interpreting titles, numbers or legacy branches.
      const literalSong = /^(?:abrir|tocar|ouvir|ver|ensaiar|estudar)\s+/.test(text) && actions.get('song.open').parse(request);
      if (/\b(?:nao|nunca|nem)\b/.test(text) && !literalSong) return result('blocked', 'Não executei o comando negado. Diga o que deseja fazer.');
      let verb = '(?:abrir|abre|abra|iniciar|ativar|ligar|parar|pare|interromper|pausar|mudar|mude|trocar|troque|ajustar|ajuste|definir|defina|colocar|coloque|coloca|usar|deixar|configurar|ponha|salvar|salve|excluir|apagar|buscar|pesquisar|convidar|subir|descer|aumentar|aumente|diminuir|diminua|compartilhar|gerar|exportar|importar|sincronizar)';
      const extra=global.roudyAssistantLanguage?.boundaryVerbs?.join('|');if(extra)verb=`(?:${verb}|${extra})`;
      const target = '(?:metronomo|rolagem|afinador|capotraste|capo|bpm|ritmo|andamento|compasso)';
      if (/;|\b(?:e depois|em seguida|mas|quer dizer)\b/.test(text) || new RegExp(`\\be ${verb}\\b`).test(text) || new RegExp(`\\b${target}\\b.*\\be (?:a |o )?${target}\\b`).test(text)) return result('clarify', 'Diga uma ação de cada vez para eu entender com segurança.');
      if (!/^(?:buscar|pesquisar|procurar|abrir musica|tocar musica)\b/.test(text) && [/\b(?:metronomo|bpm|compasso)\b/, /\b(?:rolagem|rolar)\b/, /\bafinador\b/].filter(pattern => pattern.test(text)).length > 1) return result('clarify', 'Diga uma ferramenta de cada vez para evitar confusão.');
      const interpretation=global.roudyAssistantLanguage?.interpret({...request});
      if(interpretation?.message){
        if(context.ready===false||context.editorOpen)return result('blocked','Aguarde a conta e conclua ou feche o editor antes de fazer esse pedido.');
        return result('clarify',interpretation.message,{...(interpretation.followUp?{followUp:interpretation.followUp}:{}),languageRequest:true});
      }
      if(interpretation?.command){text=normalize(interpretation.command);request.text=text;request.numbered=numbers(text);request.semanticRaw=interpretation.command;request.literalEventQuery=interpretation.literalEventQuery;}
      const candidates = [];
      for (const definition of actions.values()) {
        const slots = definition.parse(request);
        if (slots !== null && slots !== undefined) candidates.push({ definition, slots, request });
      }
      candidates.sort((a, b) => b.definition.priority - a.definition.priority);
      const chosen = candidates[0];
      if (!chosen) return result('clarify', 'Não reconheci esse pedido.');
      const tied = candidates.filter(candidate => candidate.definition.priority === chosen.definition.priority);
      if (tied.length > 1) return result('clarify', 'Esse pedido pode indicar mais de uma ação. Diga o nome da ferramenta ou da música.');
      // Do not let old substring rules perform a partial, malformed core command.
      const legacyScrollSpeed = /^(?:(?:aumentar|diminuir) velocidade(?: da rolagem)?|rolar mais (?:rapido|devagar))$/.test(text);
      if (chosen.definition.id === 'compatibility.legacy' && !legacyScrollSpeed && (/\b(?:bpm|metronomo|capotraste|compasso|rolagem)\b/.test(text) || /^(?:subir|descer|aumentar|diminuir|baixar|restaurar)\b.*\btom\b/.test(text))) return result('clarify', 'Diga a ferramenta e o ajuste desejado. Por exemplo: metrônomo em 90 ou ativar rolagem inteligente.',{...(interpretation?.command?{canonical:text,languageRequest:true}:{})});
      return {...chosen,...(interpretation?.command?{canonical:text,languageRequest:true}:{})};
    }

    function preview(raw) {
      const context = runtime.context(), resolved = resolve(raw, context);
      if (context.ready === false) return result('blocked', 'Aguarde o carregamento da conta.');
      if (!resolved.definition) return resolved;
      const { definition, slots } = resolved;
      const invalid = definition.validate?.(slots, context);
      if (invalid) return result('blocked', invalid);
      if (context.editorOpen && definition.id !== 'assistant.help') return result('blocked', 'Conclua ou feche o editor antes de executar outro comando por voz.');
      if (definition.needsSong && !context.songOpen) return result('blocked', 'Abra uma música antes de executar esse comando.');
      if ((definition.writesSong || context.songOpen && definition.requiresEditInSong) && !context.canEditSong) return result('blocked', 'A música não está disponível para alteração.');
      return resolved;
    }
    async function run(raw, { requestId, choiceId, confirmed } = {}) {
      const context = runtime.context();
      const currentOwner = ownerKey(context);
      if (lastOwner !== currentOwner) { seen.clear();lastResult = null;lastOwner = currentOwner; }
      const key = requestId ? ownerKey(context) + ':' + String(requestId) : null;
      const cached = key && seen.get(key);
      if (cached && now() - cached.time < 60000) return { ...cached.result, duplicate: true, silent: true };
      if (busy) return result('blocked', 'Um comando já está sendo executado.');
      busy = true;
      let output, attemptedAction = null;
      try {
        const resolved = resolve(raw, context);
        if (choiceId !== undefined && resolved.definition) {
          const selectable = ['song.open', 'event.open', 'event.date', 'event.agenda', 'event.invite-person'];
          if (!selectable.includes(resolved.definition.id) || typeof choiceId !== 'string' || !choiceId || choiceId.length > 160) throw new Error('Seleção inválida');
          resolved.slots = { ...resolved.slots, choiceId };
        }
        if(resolved.definition?.id==='event.invite-person')resolved.slots={...resolved.slots,confirmed:confirmed===true};
        if (context.ready === false) output = result('blocked', 'Aguarde o carregamento da conta e repita o pedido.');
        else if (!resolved.definition) output = resolved;
        else {
          const { definition, slots, request } = resolved;
          attemptedAction = definition.id;
          const guard = () => {
            const current = runtime.context();
            if (ownerKey(current) !== ownerKey(context) || targetKey(current) !== targetKey(context)) throw new ContextChanged();
          };
          const invalid = definition.validate?.(slots, context);
          if (invalid) output = result('blocked', invalid);
          else if (context.editorOpen && definition.id !== 'assistant.help') output = result('blocked', 'Conclua ou feche o editor antes de executar outro comando por voz.');
          else if (definition.needsSong && !context.songOpen) output = result('blocked', 'Abra uma música antes de executar esse comando.');
          else if ((definition.writesSong || (context.songOpen && definition.requiresEditInSong)) && !context.canEditSong) output = result('blocked', 'A música ou a conta não está disponível para alteração. Reabra a música.');
          else {
            guard();
            output = await runtime.handlers[definition.id]({ slots, request, context, guard });
            const current = runtime.context();
            if ((!definition.changesAccount?.(request.text) && ownerKey(current) !== ownerKey(context)) || (!definition.changesScreen && targetKey(current) !== targetKey(context))) throw new ContextChanged();
            if (!output || typeof output.ok !== 'boolean' || typeof output.message !== 'string') output = result('error', 'Não consegui confirmar o resultado desse pedido.');
          }
          output = { ...output, action: definition.id };
        }
      } catch (error) {
        output = error instanceof ContextChanged ? result('blocked', 'A conta ou a tela mudou. Repita o pedido no contexto atual.', { action: attemptedAction }) : result('error', error?.name === 'NotAllowedError' ? 'Permita o microfone ou áudio para executar este comando.' : 'Não consegui concluir esse pedido. Confira a ferramenta e tente novamente.', { action: attemptedAction });
      } finally {
        busy = false;
      }
      const sameOwner = ownerKey(runtime.context()) === ownerKey(context);
      lastResult = sameOwner ? output : null;
      if (key && sameOwner) {
        seen.set(key, { time: now(), result: output });
        while (seen.size > 64) seen.delete(seen.keys().next().value);
      }
      return output;
    }
    return Object.freeze({ run, preview, resolve: raw => resolve(raw, runtime.context()), getLastResult: () => ownerKey(runtime.context()) === lastOwner ? lastResult : null,
      getCatalog: () => [...actions.values()].map(({ id, category, risk, needsSong, writesSong, requiresEditInSong }) => ({ id, category, risk, needsSong, writesSong, requiresEditInSong })) });
  }
  global.roudyActionManager = Object.freeze({ create, result });
})(window);
