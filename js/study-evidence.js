// Private, bounded preparation evidence. No media, musical content or gesture log.
(function (global) {
  'use strict';
  const CONFIG = Object.freeze({ loopPasses: 3, loopSeconds: 60, editSpanMs: 30000, readingSpanMs: 90000, separationMs: 900000, cooldownMs: 72 * 3600000, songWindowMs: 14 * 86400000, consistencyWindowMs: 7 * 86400000, retentionMs: 90 * 86400000, maxSessions: 600, checkpointMs: 15000, reservationMs: 30000 });
  const ACTIONS = Object.freeze(['RECOGNIZE_SONG_DEDICATION', 'RECOGNIZE_CONSISTENCY', 'RECOGNIZE_REPERTOIRE_DEDICATION']);
  const isRecognition = action => ACTIONS.includes(action?.actionType);
  const clone = value => JSON.parse(JSON.stringify(value));
  const identity = song => String(song?.librarySync?.clientId || song?.id || '');
  function dayKey(at, zone) {
    try { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)); return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-'); }
    catch (_) { return null; }
  }
  function empty(userId) { return { userId, enabled: true, epoch: 0, sessions: [], lastPresentedAt: null, reservation: null }; }
  function trim(state, now, config) {
    state.sessions = (state.sessions || []).filter(s => s.qualifiedAt <= now && now - s.qualifiedAt <= config.retentionMs).sort((a, b) => a.qualifiedAt - b.qualifiedAt).slice(-config.maxSessions);
    return state;
  }
  function indexedStore(indexedDB = global.indexedDB) {
    let opening;
    function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        if (!indexedDB) return reject(new Error('Local evidence storage unavailable'));
        const request = indexedDB.open('roudy-private-study-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('users', { keyPath: 'userId' });
        request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Local evidence storage blocked'));
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      });
      return opening;
    }
    return { async update(userId, edit) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readwrite'), store = tx.objectStore('users'); let next;
        const read = store.get(userId);
        read.onsuccess = () => { try { next = edit(read.result || empty(userId)); store.put(next); } catch (error) { tx.abort(); reject(error); } };
        tx.oncomplete = () => resolve(clone(next)); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Local evidence transaction aborted'));
      });
    } };
  }
  // Uses the player's existing monitor. A discontinuity invalidates this passage,
  // never manufactures a completion. Only scalar accumulators live in memory.
  function createLoopObserver() {
    let bounds = null, last = null, seconds = 0, tracking = false;
    function arm(value) { bounds = value?.deliberate ? { start: value.start, end: value.end } : null; last = null; seconds = 0; tracking = false; }
    function sample({ position, at, playing, visible, rate = 1 }) {
      if (!bounds || !Number.isFinite(position) || !Number.isFinite(at)) return null;
      const nearStart = position >= bounds.start - .05 && position <= bounds.start + .35;
      if (!playing || !visible) { last = null; seconds = 0; tracking = false; return null; }
      if (!tracking) { if (nearStart) { tracking = true; last = { position, at }; seconds = Math.max(0, position - bounds.start); } return null; }
      const elapsed = (at - last.at) / 1000, delta = position - last.position;
      if (elapsed < 0 || elapsed > 1.25 || delta < -.15 || delta > Math.min(2.8, elapsed * Math.max(1, Math.min(2, Number(rate) || 1)) + .3)) {
        last = nearStart ? { position, at } : null; seconds = 0; tracking = nearStart; return null;
      }
      seconds += Math.max(0, delta); last = { position, at };
      if (position >= bounds.end - .08) {
        const length = bounds.end - bounds.start, complete = seconds >= length - Math.min(.5, length * .04);
        const result = complete ? { ...bounds, seconds: Math.min(length, seconds), complete: true } : null;
        last = null; seconds = 0; tracking = false; return result;
      }
      return null;
    }
    return Object.freeze({ arm, sample });
  }
  // One pair of unconsumed records supports one comment. Content is resolved live.
  function candidates(input, options = {}) {
    const config = { ...CONFIG, ...options }, state = input.state, now = Number(input.now), userId = String(input.userId || '');
    if (!userId || !state?.enabled || state.userId !== userId || (state.lastPresentedAt != null && now - state.lastPresentedAt < config.cooldownMs)) return [];
    const songs = input.songs || [], zone = input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const available = state.sessions.filter(s => !s.consumedAt && s.qualifiedAt <= now && now - s.qualifiedAt <= config.songWindowMs);
    const findSong = session => songs.find(song => identity(song) === session.songKey);
    const records = available.filter(s => findSong(s));
    const result = [];
    function add(type, pair, destination, eventId = null) {
      const ids = pair.map(s => s.id).sort(), song = findSong(pair[pair.length - 1]);
      result.push({ actionType: type, category: 'dedication', deliveryClass: 'optional', priority: 'LOW', localOnly: true, eventId, songId: song?.id || null, repertoireItemId: destination.repertoireItemId || null, destination,
        fingerprint: ['dedication', userId, type, ...ids].join(':'), expiresAt: new Date(Math.min(...pair.map(s => s.qualifiedAt)) + (type === ACTIONS[1] ? config.consistencyWindowMs : config.songWindowMs)).toISOString(),
        evidence: { sessionIds: ids, songTitle: String(song?.title || ''), observedPreparation: true }, because: ['qualified-private-preparation', 'unconsumed-distinct-sessions'] });
    }
    for (const song of songs) {
      const pair = records.filter(s => s.songKey === identity(song)).slice(-2);
      if (pair.length === 2) add(ACTIONS[0], pair, { view: 'song', songId: song.id });
    }
    const week = records.filter(s => now - s.qualifiedAt <= config.consistencyWindowMs);
    const last = week[week.length - 1], other = last && week.find(s => dayKey(s.qualifiedAt, zone) && dayKey(s.qualifiedAt, zone) !== dayKey(last.qualifiedAt, zone));
    if (other) add(ACTIONS[1], [other, last], { view: 'song', songId: findSong(last).id });
    for (const event of input.events || []) {
      if (/^(PAST|UNKNOWN)$/.test(event.phase) || /^(cancelled|canceled|archived|ended)$/.test(event.status)) continue;
      const linked = records.filter(s => s.events.some(ref => String(ref.eventId) === String(event.id) && (event.repertoire || []).some(item => String(item.id) === String(ref.itemId) && String(item.songId) === String(s.songId) && item.accessible !== false && item.official?.accessible !== false && !/^(removed|deleted|archived|hidden|inaccessible)$/.test(item.status || '') && String(item.updatedAt || '') === ref.revision) && !(event.changes || []).some(change => (String(change.songId) === s.songId || String(change.repertoireItemId) === ref.itemId) && Date.parse(change.timestamp) > s.qualifiedAt && /KEY_CHANGED|CAPO_CHANGED|STRUCTURE_CHANGED|repertoire\.(song|key)\.updated/.test(change.type))));
      const right = linked[linked.length - 1], left = right && linked.find(s => s.songKey !== right.songKey);
      if (left) add(ACTIONS[2], [left, right], { view: 'event', eventId: event.id }, event.id);
    }
    return result;
  }
  function create(options = {}) {
    const config = Object.freeze({ ...CONFIG, ...options.config }), store = options.store || indexedStore(), clock = options.now || Date.now;
    let userId = '', state = null, active = null, generation = 0, serial = Promise.resolve(), available = true;
    const id = () => global.crypto?.randomUUID?.() || `${clock()}-${Math.random().toString(36).slice(2)}`;
    function update(owner, edit) {
      const task = serial.then(async () => {
        try { const next = await store.update(owner, value => trim(edit(trim(value, clock(), config)), clock(), config)); if (userId === owner) state = next; available = true; return next; }
        catch (_) { if (userId === owner) { available = false; state = null; } return null; }
      }); serial = task.catch(() => {}); return task;
    }
    async function useUser(value) { end(); userId = String(value || ''); state = null; generation++; if (!userId) return null; const owner = userId; return update(owner, value => value); }
    function begin(context) {
      end();
      if (!available || !state?.enabled || !userId || String(context?.userId) !== userId || !context.songKey || context.stage || context.visible === false) return null;
      active = { ...context, userId, epoch: state.epoch, token: id(), generation, startedAt: clock(), lastEvidenceAt: clock(), qualified: false, recordId: null, path: null, visible: true, edit: null, regions: new Map(), lastCheckpoint: 0, loop: null };
      return active.token;
    }
    function live() { return active && active.visible && state?.enabled && active.userId === userId && active.epoch === state.epoch && !active.stage; }
    function persist(candidate, endedAt = null) {
      if (!candidate.qualified) return Promise.resolve(null);
      const data = { ...candidate, events: candidate.eventId && candidate.itemId ? [{ eventId: String(candidate.eventId), itemId: String(candidate.itemId), revision: String(candidate.revision || '') }] : [] };
      return update(data.userId, value => {
        if (!value.enabled || value.epoch !== data.epoch) return value;
        let previous = value.sessions.find(s => s.id === data.recordId);
        if (!previous) {
          const latest = value.sessions.filter(s => s.songKey === data.songKey).slice(-1)[0];
          // A live/overlapping record is never split just because a new document opens.
          if (latest && (!latest.endedAt || data.startedAt - latest.lastEvidenceAt < config.separationMs)) previous = latest;
        }
        if (previous) {
          previous.lastEvidenceAt = Math.max(previous.lastEvidenceAt, data.lastEvidenceAt);
          previous.endedAt = endedAt ? Math.max(previous.lastEvidenceAt, endedAt) : null;
          for (const ref of data.events) if (!previous.events.some(v => v.eventId === ref.eventId && v.itemId === ref.itemId && v.revision === ref.revision)) previous.events.push(ref);
          previous.events = previous.events.slice(-20); data.recordId = previous.id;
        } else {
          data.recordId = id();
          value.sessions.push({ id: data.recordId, songKey: String(data.songKey), songId: String(data.songId), startedAt: data.startedAt, qualifiedAt: data.qualifiedAt, lastEvidenceAt: data.lastEvidenceAt, endedAt, timeZone: data.timeZone || 'UTC', localDay: dayKey(data.qualifiedAt, data.timeZone || 'UTC'), path: data.path, events: data.events });
        }
        if (active?.token === data.token) active.recordId = data.recordId;
        return value;
      });
    }
    function touch() {
      active.lastEvidenceAt = clock();
      if (active.qualified && clock() - active.lastCheckpoint >= config.checkpointMs) { active.lastCheckpoint = clock(); persist(active); }
    }
    function qualify(path) {
      if (!live()) return Promise.resolve(false);
      touch(); if (active.qualified) return Promise.resolve(true);
      active.qualified = true; active.path = path; active.qualifiedAt = clock(); active.lastCheckpoint = clock();
      return persist(active).then(value => Boolean(value));
    }
    function end() {
      const previous = active; active = null;
      if (previous?.qualified) return persist(previous, clock());
      return Promise.resolve(null);
    }
    function armLoop({ start, end: finish, deliberate }) {
      if (!live()) return;
      active.loop = deliberate && Number.isFinite(start) && finish > start ? { start, end: finish, passes: 0, seconds: 0 } : null;
    }
    function loopPass({ start, end: finish, seconds, complete }) {
      if (!live() || !active.loop || !complete || start !== active.loop.start || finish !== active.loop.end || !Number.isFinite(seconds)) return Promise.resolve(false);
      const length = finish - start;
      if (seconds < length - Math.min(.5, length * .04) || seconds > length + 1) return Promise.resolve(false);
      active.loop.passes++; active.loop.seconds += Math.min(length, seconds); touch();
      return active.loop.passes >= config.loopPasses && active.loop.seconds >= config.loopSeconds ? qualify('loop') : Promise.resolve(false);
    }
    function editStart() { if (live()) active.edit = { first: null, last: null }; }
    function editInput() { if (live() && active.edit) { const at = clock(); if (active.edit.first == null) active.edit.first = at; active.edit.last = at; touch(); } }
    function editSaved(changed) {
      const valid = live() && changed && active.edit?.first != null && active.edit.last - active.edit.first >= config.editSpanMs;
      if (active) active.edit = null;
      return valid ? qualify('block') : Promise.resolve(false);
    }
    function cancelEdit() { if (active) active.edit = null; }
    function reading(region, deliberate = false) {
      if (!live() || !deliberate || !region) return Promise.resolve(false);
      const at = clock(); touch();
      if (!active.regions.has(String(region))) { if (active.regions.size >= 40) active.regions.delete(active.regions.keys().next().value); active.regions.set(String(region), at); }
      const different = [...active.regions].some(([key, first]) => key !== String(region) && at - first >= config.readingSpanMs);
      return different ? qualify('reading') : Promise.resolve(false);
    }
    async function setEnabled(enabled) { end(); const owner = userId; if (!owner) return false; generation++; const next = await update(owner, value => ({ ...value, epoch: value.epoch + 1, enabled: Boolean(enabled), reservation: null })); return Boolean(next); }
    async function clear() { end(); const owner = userId; if (!owner) return false; generation++; const next = await update(owner, value => ({ ...empty(owner), enabled: value.enabled, epoch: value.epoch + 1 })); return Boolean(next); }
    function snapshot() { return state ? clone(state) : null; }
    async function refresh() { if (userId) return update(userId, value => value); return null; }
    async function reserve(action) {
      if (!isRecognition(action) || !userId) return null;
      const owner = userId, token = id(), at = clock(); let granted = false;
      await update(owner, value => {
        const ids = action.evidence?.sessionIds || [];
        if (!value.enabled || ids.length !== 2 || value.lastPresentedAt != null && at - value.lastPresentedAt < config.cooldownMs || value.reservation && at < value.reservation.until) return value;
        if (!ids.every(id => value.sessions.some(s => s.id === id && !s.consumedAt))) return value;
        value.reservation = { token, fingerprint: action.fingerprint, until: at + config.reservationMs }; granted = true; return value;
      });
      return granted ? { owner, token, fingerprint: action.fingerprint } : null;
    }
    async function consume(action, grant, isVisible) {
      if (!grant || grant.owner !== userId || !isRecognition(action)) return false;
      let consumed = false;
      await update(grant.owner, value => {
        const at = clock(), ids = action.evidence.sessionIds;
        if (!value.enabled || !isVisible() || value.reservation?.token !== grant.token || value.reservation.fingerprint !== action.fingerprint || at > value.reservation.until || value.lastPresentedAt != null && at - value.lastPresentedAt < config.cooldownMs) return value;
        if (!ids.every(id => value.sessions.some(s => s.id === id && !s.consumedAt))) return value;
        value.sessions.forEach(s => { if (ids.includes(s.id)) s.consumedAt = at; });
        value.lastPresentedAt = at; value.reservation = null; consumed = true; return value;
      }); return consumed;
    }
    async function release(grant) { if (grant) await update(grant.owner, value => { if (value.reservation?.token === grant.token) value.reservation = null; return value; }); }
    return Object.freeze({ config, useUser, begin, end, armLoop, loopPass, editStart, editInput, editSaved, cancelEdit, reading, setEnabled, clear, snapshot, refresh, reserve, consume, release, activeToken: () => active?.token || null, flush: () => serial, available: () => available });
  }
  global.studyEvidence = Object.freeze({ CONFIG, ACTIONS, isRecognition, identity, dayKey, indexedStore, createLoopObserver, candidates, create });
  if (typeof module !== 'undefined') module.exports = global.studyEvidence;
})(typeof window !== 'undefined' ? window : globalThis);
