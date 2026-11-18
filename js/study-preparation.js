// Connect existing Study controls to private evidence; no alternate notification UI.
(function (global) {
  'use strict';
  if (!global.studyEvidence || global.studyPreparation) return;
  const tracker = global.studyEvidence.create(global.studyDedicationPreview?.options || {});
  let owner = '', generation = 0, editor = null, gesture = null, settle = 0, grant = null, requesting = null, presenting = false;
  const el = id => document.getElementById(id);
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  function studyVisible() { return document.visibilityState === 'visible' && el('view-detail')?.style.display === 'flex' && typeof stageMode !== 'undefined' && !stageMode; }
  function homeVisible() {
    if (document.visibilityState !== 'visible' || el('tab-musicas')?.getAttribute('aria-selected') !== 'true' || el('view-detail')?.style.display === 'flex' || el('view-sd')?.style.display === 'flex' || el('modal-overlay')?.style.display === 'flex' || document.body.hasAttribute('data-account-menu-open')) return false;
    const card = el('playlist-ai-card'); if (!card) return false;
    const rect = card.getBoundingClientRect(); return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && getComputedStyle(card).visibility !== 'hidden';
  }
  function current() {
    if (!owner || !studyVisible() || String(appCurrentUser.id) !== owner) return null;
    const song = musicas.find(value => String(value.id) === String(currentDetailId)) || currentDetailSongOverride;
    if (!song) return null;
    const event = detailEventContext && findEvent(detailEventContext.eventId), item = event?.repertoire.find(value => String(value.id) === String(detailEventContext.itemId));
    return { userId: owner, songId: String(song.id), songKey: studyEvidence.identity(song), eventId: event?.id, itemId: item?.id, revision: item?.updatedAt || '', timeZone: zone(), visible: true };
  }
  function beginCurrent() { editor = null; gesture = null; clearTimeout(settle); const context = current(); if (context) tracker.begin(context); else tracker.end(); }
  function end() { editor = null; gesture = null; clearTimeout(settle); return tracker.end(); }
  async function authChanged(auth) {
    const next = auth?.authenticated && auth.user?.id ? String(auth.user.id) : '';
    if (next === owner) return;
    owner = next; const ownGeneration = ++generation; grant = null; requesting = null; editor = null;
    await tracker.useUser(owner);
    if (generation !== ownGeneration) return;
    beginCurrent(); if (typeof renderContextualHomeCard === 'function') renderContextualHomeCard();
  }
  function input() { return { state: tracker.snapshot(), songs: typeof musicas === 'undefined' ? [] : musicas, timeZone: zone() }; }
  function region() {
    const view = el('view-detail'), content = el('detail-content'), page = content?.querySelector('.song-page[aria-hidden="false"]') || content;
    if (!view || !page) return null;
    const top = view.getBoundingClientRect().top + Math.min(220, view.clientHeight * .35);
    const sections = [...page.querySelectorAll('[data-song-section-id],[data-smart-line]')];
    const section = sections.find(node => node.getBoundingClientRect().bottom > top);
    if (section) return `${page.dataset.pageIndex || '0'}:${section.dataset.songSectionId || section.dataset.smartLine || sections.indexOf(section)}`;
    return `${page.dataset.pageIndex || '0'}:position-${Math.floor(view.scrollTop / Math.max(120, view.clientHeight * .5))}`;
  }
  function intent(event) {
    if (!event.isTrusted || !studyVisible() || !event.target.closest('#detail-content') || event.target.closest('button,input,textarea,select,[data-inline-editing]')) return;
    if (event.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) return;
    const view = el('view-detail');
    if (!gesture || performance.now() - gesture.at > 1500) gesture = { top: view.scrollTop, first: region(), at: performance.now() };
    else gesture.at = performance.now();
  }
  function scroll() {
    if (!gesture || !studyVisible() || performance.now() - gesture.at > 1500 || typeof scrollTimer !== 'undefined' && scrollTimer !== null || typeof smartScrollController !== 'undefined' && smartScrollController.isActive()) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const movement = gesture; gesture = null;
      if (!movement || !studyVisible()) return;
      const distance = Math.abs(el('view-detail').scrollTop - movement.top), minimum = Math.max(48, Math.min(160, el('view-detail').clientHeight * .25));
      if (distance < minimum) return;
      tracker.reading(movement.first, true); tracker.reading(region(), true);
    }, 180);
  }
  function editInput(event) {
    if (!event.isTrusted || !studyVisible()) return;
    const card = event.target.closest('[data-inline-editing]');
    if (!card || !event.target.matches('textarea,input')) return;
    if (card !== editor) { editor = card; tracker.editStart(); }
    tracker.editInput();
  }
  function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
  function editAttempt(song, candidate) {
    if (!studyVisible() || !editor) return null;
    // These values exist transiently for comparison only; no edited content is persisted.
    const payload = value => { const model = songFormat.fromLegacy(value); return JSON.stringify(canonical({ sections: model.sections, fullChordSheet: value.fullChordSheet?.content || '' })); };
    return { token: tracker.activeToken(), changed: payload(song) !== payload(candidate) };
  }
  function editCommitted(attempt) { if (attempt && tracker.activeToken() === attempt.token && studyVisible()) { tracker.editSaved(attempt.changed); editor = null; } }
  function canPresent(action) { return grant && grant.owner === owner && grant.fingerprint === action.fingerprint; }
  async function requestPresentation(action) {
    if (requesting === action.fingerprint || !homeVisible()) return;
    const request = action.fingerprint, ownGeneration = generation; requesting = request;
    const next = await tracker.reserve(action);
    if (requesting === request) requesting = null;
    if (!next) return;
    if (ownGeneration !== generation || !homeVisible()) return tracker.release(next);
    if (grant) await tracker.release(grant);
    grant = next;
    requestAnimationFrame(() => {
      if (ownGeneration !== generation || !homeVisible() || resolveHomeCardContext().contextAction?.fingerprint !== request) { tracker.release(next); if (grant === next) grant = null; return; }
      renderContextualHomeCard();
    });
  }
  function presented(action, copy) {
    if (!canPresent(action) || presenting || !homeVisible()) return;
    presenting = true; const expected = grant;
    requestAnimationFrame(async () => {
      const accepted = await tracker.consume(action, expected, () => homeVisible() && grant === expected && expected.owner === owner && el('playlist-ai-title')?.textContent === copy.title);
      presenting = false;
      if (accepted) {
        presentedContextFingerprints.add(action.fingerprint); contextHistory.presented(action, owner, null, copy); dispatchContextEvent('context_action_presented', action);
      }
      if (grant === expected) grant = null;
    });
  }
  async function dismiss() { if (grant) await tracker.release(grant); grant = null; renderContextualHomeCard(); }
  function preferencesMarkup() {
    if (!owner) return '';
    const enabled = tracker.snapshot()?.enabled !== false;
    return `<section class="settings-group" data-study-preferences><div class="settings-group-title">Preparação musical</div><div class="settings-row"><div class="settings-row-copy"><strong>Reconhecer minha dedicação</strong><small>Experimental. Usa apenas sinais neste aparelho. Não é compartilhado com a banda.</small></div><label class="settings-toggle"><input type="checkbox" aria-label="Reconhecer minha dedicação" ${enabled ? 'checked' : ''} onchange="studyPreparation.setEnabled(this.checked)"><span></span></label></div><button class="btn btn-outline" type="button" onclick="studyPreparation.clearRecords()">Apagar registros de dedicação</button></section>`;
  }
  async function setEnabled(enabled) {
    if (grant) await tracker.release(grant); grant = null;
    const saved = await tracker.setEnabled(enabled); beginCurrent();
    if (!saved) showToast('Não foi possível salvar esta preferência neste aparelho.');
  }
  async function clearRecords() {
    if (!appConfirm('Apagar os registros de dedicação deste usuário neste aparelho?')) return;
    grant = null; const saved = await tracker.clear(); if(saved)contextHistory.clearCategory(owner, 'dedication'); beginCurrent(); showToast(saved ? 'Registros de dedicação apagados neste aparelho.' : 'Não foi possível apagar os registros neste aparelho.');
  }
  const api = { tracker, input, beginCurrent, end, editAttempt, editCommitted, cancelEdit() { editor = null; tracker.cancelEdit(); },
    armLoop(value) { if (studyVisible()) tracker.armLoop(value); }, loopPass(value) { if (studyVisible()) tracker.loopPass(value); },
    canPresent, requestPresentation, presented, dismiss, preferencesMarkup, setEnabled, clearRecords };
  global.studyPreparation = Object.freeze(api);
  const view = el('view-detail');
  if (view) {
    ['pointerdown', 'wheel', 'keydown'].forEach(type => view.addEventListener(type, intent, { passive: true }));
    view.addEventListener('scroll', scroll, { passive: true }); view.addEventListener('input', editInput);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { end(); if (grant) tracker.release(grant); grant = null; } else tracker.refresh().then(() => { beginCurrent(); renderContextualHomeCard(); }); });
  global.addEventListener('pagehide', () => { end(); if (grant) tracker.release(grant); });
  global.addEventListener('focus', () => { tracker.refresh().then(() => { if (!studyVisible()) renderContextualHomeCard(); }); });
  if (typeof IntersectionObserver !== 'undefined' && el('playlist-ai-card')) new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && homeVisible()) renderContextualHomeCard(); }).observe(el('playlist-ai-card'));
  global.appAuth?.subscribe(authChanged);
})(window);
