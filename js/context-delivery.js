(function (global) {
  'use strict';

  function copyFor(action, events) {
    const value = global.contextualCopy && global.contextualCopy.resolve(action, { events });
    return value ? { ...value, title: value.text, description: '' } : null;
  }
  function select(action, context) {
    if (!action || action.actionType === 'NONE') return { surface: 'NONE', action: null, copy: null };
    if (!action.destination || !action.destination.view) return { surface: 'NONE', action: null, copy: null };
    return { surface: 'HOME', action, copy: copyFor(action, context && context.events) };
  }

  global.contextDelivery = Object.freeze({ select, copyFor });
})(typeof window !== 'undefined' ? window : globalThis);
