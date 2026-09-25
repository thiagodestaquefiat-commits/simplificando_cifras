const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const textNode = (value, protectedContent = false) => ({
  nodeType: 3,
  nodeValue: value,
  parentElement: { closest: () => protectedContent }
});
const label = textNode('Acordes');
const lyrics = textNode('Acordes', true);
const attrs = new Map([['placeholder', 'Nome do evento']]);
const input = {
  nodeType: 1,
  tagName: 'INPUT',
  closest: () => false,
  hasAttribute: name => attrs.has(name),
  getAttribute: name => attrs.get(name),
  setAttribute: (name, value) => attrs.set(name, value)
};
const body = { nodeType: 1, tagName: 'BODY', closest: () => false, hasAttribute: () => false };
const nodes = [label, lyrics, input];
const context = {
  window: {},
  document: { body, createTreeWalker: () => {
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
  } },
  NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
  MutationObserver: class { observe() {} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ui-i18n.js', 'utf8'), context);
const i18n = context.window.uiI18n;

i18n.setLanguage('en');
assert.equal(label.nodeValue, 'Chords');
assert.equal(lyrics.nodeValue, 'Acordes', 'conteúdo musical permanece no idioma original');
assert.equal(attrs.get('placeholder'), 'Event name');
assert.equal(i18n.translate('✅ Configurações salvas.'), '✅ Settings saved.');
i18n.setLanguage('es');
assert.equal(label.nodeValue, 'Acordes');
assert.equal(attrs.get('placeholder'), 'Nombre del evento');
i18n.setLanguage('pt-BR');
assert.equal(label.nodeValue, 'Acordes');
assert.equal(attrs.get('placeholder'), 'Nome do evento');
i18n.setLanguage('it');
assert.equal(label.nodeValue, 'Accordi');
assert.equal(i18n.translate('0 músicas'), '0 brani');
i18n.setLanguage('fr');
assert.equal(label.nodeValue, 'Accords');
assert.equal(i18n.translate('1 música'), '1 chanson');
i18n.setLanguage('de');
assert.equal(label.nodeValue, 'Akkorde');
assert.equal(i18n.translate('2 músicas'), '2 Songs');

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /ui-i18n\.js\?v=10/);
assert.match(html, /window\.uiI18n\?\.setLanguage\(settings\.language\)/);
console.log('ui-i18n.test.js: OK');
