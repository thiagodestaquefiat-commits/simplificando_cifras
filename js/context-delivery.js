(function (global) {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function songTitle(action, events) {
    const event = (events || []).find(value => text(value.id) === text(action.eventId));
    const item = event && (event.repertoire || []).find(value => text(value.id) === text(action.repertoireItemId));
    return text(item && item.shared && item.shared.title) || 'A música';
  }
  function eventTitle(action, events) {
    const event = (events || []).find(value => text(value.id) === text(action.eventId));
    return text(event && event.title) || 'Seu evento';
  }
  function copyFor(action, events) {
    if (!action || action.actionType === 'NONE') return null;
    const count = Number(action.evidence && action.evidence.pendingCount) || 0;
    if (action.actionType === 'REVIEW_CHANGED_SONG') return {
      kicker: 'ALTERAÇÃO NO REPERTÓRIO', title: `${songTitle(action, events)} mudou desde a sua preparação.`,
      description: action.evidence && action.evidence.evidenceIncomplete ? 'A versão atual foi alterada. Revise antes do evento.' : 'Revise a versão atual antes do evento.',
      actionLabel: 'Revisar alteração'
    };
    if (action.actionType === 'START_PREPARATION') return {
      kicker: 'PRÓXIMO EVENTO', title: `${eventTitle(action, events)} está chegando.`,
      description: `${count} ${count === 1 ? 'música ainda precisa' : 'músicas ainda precisam'} da sua preparação.`, actionLabel: 'Começar'
    };
    if (action.actionType === 'CONTINUE_PREPARATION') return {
      kicker: 'SUA PREPARAÇÃO', title: 'Você já começou.',
      description: `Ainda ${count === 1 ? 'falta 1 música' : `faltam ${count} músicas`}.`, actionLabel: 'Continuar'
    };
    if (action.actionType === 'ENTER_STAGE_MODE') return {
      kicker: 'EVENTO DE HOJE', title: 'Tudo pronto para hoje.', description: eventTitle(action, events), actionLabel: 'Modo Palco'
    };
    return null;
  }
  function select(action, context) {
    if (!action || action.actionType === 'NONE') return { surface: 'NONE', action: null, copy: null };
    if (!action.destination || !action.destination.view) return { surface: 'NONE', action: null, copy: null };
    return { surface: 'HOME', action, copy: copyFor(action, context && context.events) };
  }

  global.contextDelivery = Object.freeze({ select, copyFor });
})(typeof window !== 'undefined' ? window : globalThis);
