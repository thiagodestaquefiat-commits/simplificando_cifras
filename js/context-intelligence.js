(function (global) {
  'use strict';

  const EVENT_PHASES = Object.freeze({
    UNKNOWN: 'UNKNOWN', PAST: 'PAST', TODAY: 'TODAY', APPROACHING: 'APPROACHING',
    PREPARATION: 'PREPARATION', FAR: 'FAR',
    IMMINENT: 'APPROACHING', SOON: 'PREPARATION', PLANNING: 'FAR'
  });
  const APPROACHING_HOURS = 24;
  const EVENT_MOMENTS = Object.freeze({ PAST: 'PAST', TODAY: 'TODAY', TOMORROW: 'TOMORROW', THREE_DAYS: 'THREE_DAYS', WITHIN_WEEK: 'WITHIN_WEEK', LATER: 'LATER', UNKNOWN: 'UNKNOWN' });
  const PREPARATION_STATES = Object.freeze({
    UNKNOWN: 'UNKNOWN', NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'IN_PROGRESS',
    READY: 'READY', NEEDS_REVIEW: 'NEEDS_REVIEW', CHANGED_AFTER_REVIEW: 'CHANGED_AFTER_REVIEW'
  });
  const PRIORITIES = Object.freeze({ NONE: 'NONE', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function iso(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  function timestamp(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date.getTime(); }
  function eventDateTime(event) {
    if (!event || !/^\d{4}-\d{2}-\d{2}$/.test(text(event.date))) return null;
    const time = /^\d{2}:\d{2}$/.test(text(event.time)) ? text(event.time) : '23:59';
    const value = new Date(`${event.date}T${time}:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }
  function differenceHours(later, earlier) { return (later.getTime() - earlier.getTime()) / 36e5; }
  function sameLocalDay(left, right) {
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  }
  function inactiveEvent(event) { return /^(cancelled|canceled|cancelado|encerrado|ended|archived|arquivado)$/i.test(text(event && event.status)); }
  function eventPhase(event, nowValue) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    const startsAt = eventDateTime(event);
    if (!startsAt || Number.isNaN(now.getTime())) return { phase: EVENT_PHASES.UNKNOWN, moment: EVENT_MOMENTS.UNKNOWN, startsAt: null, hoursUntil: null, daysUntil: null };
    const hoursUntil = differenceHours(startsAt, now);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), eventDay = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
    const daysUntil = Math.round((eventDay - today) / 864e5);
    let phase;
    if (sameLocalDay(startsAt, now)) phase = EVENT_PHASES.TODAY;
    else if (hoursUntil < 0) phase = EVENT_PHASES.PAST;
    else if (hoursUntil <= APPROACHING_HOURS) phase = EVENT_PHASES.APPROACHING;
    else if (hoursUntil <= 168) phase = EVENT_PHASES.PREPARATION;
    else phase = EVENT_PHASES.FAR;
    const moment = daysUntil < 0 ? EVENT_MOMENTS.PAST : daysUntil === 0 ? EVENT_MOMENTS.TODAY : daysUntil === 1 ? EVENT_MOMENTS.TOMORROW : daysUntil <= 3 ? EVENT_MOMENTS.THREE_DAYS : daysUntil <= 7 ? EVENT_MOMENTS.WITHIN_WEEK : EVENT_MOMENTS.LATER;
    return { phase, moment, startsAt: startsAt.toISOString(), hoursUntil: Math.round(hoursUntil * 10) / 10, daysUntil };
  }

  function memberFor(event, userId) {
    return array(event && event.members).find(member => text(member.id || member.userId) === text(userId)) || null;
  }
  function canAccessEvent(event, userId) {
    const members = array(event && event.members);
    return members.length === 0 || Boolean(memberFor(event, userId));
  }
  function repertoireItems(event, userId) {
    return array(event && (event.repertoire || event.musicas)).map((item, index) => {
      const value = item && typeof item === 'object' ? item : { songId: item };
      const personal = value.personalEdits && value.personalEdits[text(userId)] || null;
      return {
        id: text(value.id) || `repertoire_${index}`,
        songId: value.songId == null ? null : String(value.songId),
        order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
        official: value.shared && typeof value.shared === 'object' ? { ...value.shared } : {},
        status: text(value.status), accessible: value.accessible !== false,
        personal: personal && typeof personal === 'object' ? { ...personal } : null,
        preparation: value.preparation && typeof value.preparation === 'object' ? { ...value.preparation } : null
      };
    }).sort((left, right) => left.order - right.order);
  }
  function normalizeChange(change, eventId) {
    const after = change && Object.prototype.hasOwnProperty.call(change, 'after') ? change.after : null;
    return {
      id: text(change && change.id), eventId: text(change && (change.eventId || eventId)),
      songId: text(change && change.songId) || null, actorId: text(change && change.actorId) || null,
      repertoireItemId: text(change && change.repertoireItemId) || text(after && after.repertoireItemId) || null,
      type: text(change && (change.changeType || change.type || change.kind)) || 'event.updated',
      timestamp: iso(change && (change.timestamp || change.createdAt)) || null,
      reason: text(change && (change.reason || change.summary)) || 'O evento foi atualizado.',
      before: change && Object.prototype.hasOwnProperty.call(change, 'before') ? change.before : null,
      after,
      affectedUsers: array(change && change.affectedUsers).map(String)
    };
  }
  function changesFor(event) {
    return array(event && (event.timeline || event.changes || event.notifications)).map(change => normalizeChange(change, event.id));
  }
  function isOwnChange(change, userId) {
    const actorId = text(change && change.actorId), currentUserId = text(userId);
    return Boolean(actorId && currentUserId && actorId === currentUserId);
  }
  function preparationRecords(input, eventId, userId) {
    return array(input && input.preparationRecords).filter(record =>
      text(record.eventId) === text(eventId) && text(record.userId) === text(userId)
    );
  }
  function preparationState(event, userId, input) {
    const items = repertoireItems(event, userId);
    if (!items.length) return { state: PREPARATION_STATES.READY, songs: [], counts: { total: 0, ready: 0, pending: 0, changed: 0, unknown: 0 }, evidence: ['Evento sem músicas pendentes.'], missingData: [] };
    const recognizedSongStates = new Set([PREPARATION_STATES.READY, PREPARATION_STATES.NOT_STARTED, PREPARATION_STATES.CHANGED_AFTER_REVIEW, PREPARATION_STATES.NEEDS_REVIEW, PREPARATION_STATES.UNKNOWN]);
    const serverPreparation = items.map(item => item.preparation).filter(Boolean);
    let songs;
    if (serverPreparation.length === items.length) {
      songs = items.map(item => {
        const rawState = text(item.preparation.state).toUpperCase();
        const state = recognizedSongStates.has(rawState) && rawState !== PREPARATION_STATES.IN_PROGRESS ? rawState : PREPARATION_STATES.UNKNOWN;
        return {
          repertoireItemId: item.id, songId: item.songId, state,
          reviewedAt: item.preparation.reviewedAt || null,
          reviewedRevision: item.preparation.reviewedRevision || null,
          currentRevision: item.preparation.currentRevision || null,
          relevantChanges: array(item.preparation.relevantChanges),
          evidenceIncomplete: item.preparation.evidenceIncomplete === true
        };
      });
    } else {
    const trackingAvailable = Boolean(input && input.preparationTrackingAvailable);
    const records = preparationRecords(input, event.id, userId);
    if (!trackingAvailable && !records.length) {
        songs = items.map(item => ({ repertoireItemId: item.id, songId: item.songId, state: PREPARATION_STATES.UNKNOWN, relevantChanges: [], evidenceIncomplete: true }));
      } else {
        const bySong = new Map(records.map(record => [text(record.songId), record]));
        const relevantChanges = changesFor(event).filter(change => !isOwnChange(change, userId));
        songs = items.map(item => {
          const record = bySong.get(item.songId);
          if (!record) return { repertoireItemId: item.id, songId: item.songId, state: PREPARATION_STATES.NOT_STARTED, relevantChanges: [], evidenceIncomplete: false };
          if (!['READY', 'REVIEWED'].includes(text(record.status).toUpperCase())) return { repertoireItemId: item.id, songId: item.songId, state: PREPARATION_STATES.NOT_STARTED, relevantChanges: [], evidenceIncomplete: false };
          const reviewedAt = timestamp(record.reviewedAt || record.updatedAt);
          const laterChanges = relevantChanges.filter(change => change.songId === item.songId && reviewedAt && timestamp(change.timestamp) > reviewedAt);
          return {
            repertoireItemId: item.id, songId: item.songId,
            state: laterChanges.length ? PREPARATION_STATES.CHANGED_AFTER_REVIEW : PREPARATION_STATES.READY,
            reviewedAt: record.reviewedAt || record.updatedAt || null,
            reviewedRevision: record.reviewedRevision || null,
            currentRevision: record.currentRevision || null,
            relevantChanges: laterChanges, evidenceIncomplete: laterChanges.some(change => !change.before || !change.after)
          };
        });
      }
    }
    const counts = {
      total: songs.length,
      ready: songs.filter(song => song.state === PREPARATION_STATES.READY).length,
      pending: songs.filter(song => song.state === PREPARATION_STATES.NOT_STARTED).length,
      changed: songs.filter(song => [PREPARATION_STATES.CHANGED_AFTER_REVIEW, PREPARATION_STATES.NEEDS_REVIEW].includes(song.state)).length,
      unknown: songs.filter(song => song.state === PREPARATION_STATES.UNKNOWN).length
    };
    let state;
    if (counts.changed) state = PREPARATION_STATES.CHANGED_AFTER_REVIEW;
    else if (counts.unknown) state = PREPARATION_STATES.UNKNOWN;
    else if (counts.ready === counts.total) state = PREPARATION_STATES.READY;
    else if (counts.pending === counts.total) state = PREPARATION_STATES.NOT_STARTED;
    else state = PREPARATION_STATES.IN_PROGRESS;
    const missingData = counts.unknown ? ['preparationTracking'] : [];
    const evidence = counts.changed
      ? songs.filter(song => [PREPARATION_STATES.CHANGED_AFTER_REVIEW, PREPARATION_STATES.NEEDS_REVIEW].includes(song.state)).flatMap(song => song.relevantChanges)
      : [`${counts.ready} de ${counts.total} músicas confirmadas.`];
    return { state, songs, counts, evidence, missingData, evidenceIncomplete: songs.some(song => song.evidenceIncomplete), receipts: serverPreparation };
  }

  function createSnapshot(input) {
    const source = input && typeof input === 'object' ? input : {};
    const user = source.user && typeof source.user === 'object' ? { ...source.user, id: text(source.user.id) } : { id: '' };
    const now = source.now instanceof Date ? source.now : new Date(source.now || Date.now());
    const bands = array(source.bands);
    const events = array(source.events).filter(event => canAccessEvent(event, user.id) && !inactiveEvent(event)).map(event => {
      const phase = eventPhase(event, now);
      const assignment = memberFor(event, user.id);
      const repertoire = repertoireItems(event, user.id);
      const preparation = preparationState(event, user.id, source);
      const band = bands.find(item => text(item.id) === text(event.bandId)) || null;
      return {
        id: text(event.id), title: text(event.title), date: text(event.date), time: text(event.time),
        location: text(event.location), band: band ? { id: text(band.id), name: text(band.name) } : null,
        assignment: assignment ? { id: text(assignment.id || assignment.userId), role: text(assignment.role || assignment.musicalRole) } : null,
        phase: phase.phase, moment: phase.moment, startsAt: phase.startsAt, hoursUntil: phase.hoursUntil, daysUntil: phase.daysUntil,
        repertoire, changes: changesFor(event), preparation,
        status: text(event.status) || 'active', createdAt: iso(event.createdAt), createdAtReliable: event.createdAtReliable !== false && Boolean(event.createdAt), updatedAt: iso(event.updatedAt),
        version: event.remoteVersion == null ? (event.version == null ? null : Number(event.version)) : Number(event.remoteVersion)
      };
    }).sort((left, right) => (timestamp(left.startsAt) || Infinity) - (timestamp(right.startsAt) || Infinity));
    return {
      version: 1, generatedAt: now.toISOString(), user: { id: user.id, name: text(user.name), role: text(user.role) },
      events, activity: source.activity && typeof source.activity === 'object' ? { ...source.activity } : null,
      preferences: source.preferences && typeof source.preferences === 'object' ? { ...source.preferences } : {},
      missingData: [...new Set(events.flatMap(event => event.preparation.missingData))]
    };
  }

  const CHANGE_SIGNAL = Object.freeze({
    'repertoire.key.updated': 'KEY_CHANGED', 'repertoire.song.updated': 'STRUCTURE_CHANGED',
    'repertoire.song.added': 'SONG_ADDED', 'repertoire.song.removed': 'SONG_REMOVED',
    'event.member.joined': 'ASSIGNMENT_CHANGED', 'event.updated': 'REPERTOIRE_CHANGED',
    'KEY_CHANGED': 'KEY_CHANGED', 'CAPO_CHANGED': 'CAPO_CHANGED', 'STRUCTURE_CHANGED': 'STRUCTURE_CHANGED',
    'PERFORMANCE_NOTES_CHANGED': 'PERFORMANCE_NOTES_CHANGED', 'SONG_ADDED': 'SONG_ADDED', 'SONG_REMOVED': 'SONG_REMOVED',
    'METADATA_CHANGED': 'METADATA_CHANGED'
  });
  function signalKey(signal) { return [signal.type, signal.targetUserId, signal.eventId, signal.songId || '', signal.evidence && signal.evidence.changeId || signal.timestamp || ''].join(':'); }
  function generateSignals(snapshot, options) {
    const lastSeenAt = timestamp(options && options.lastSeenAt);
    const signals = [];
    for (const event of snapshot.events) {
      if (event.phase === EVENT_PHASES.PAST) continue;
      if ([EVENT_PHASES.TODAY, EVENT_PHASES.APPROACHING, EVENT_PHASES.PREPARATION].includes(event.phase)) signals.push({
        type: 'EVENT_APPROACHING', source: 'event-time', targetUserId: snapshot.user.id, eventId: event.id, songId: null,
        timestamp: snapshot.generatedAt, reason: `${event.title || 'O evento'} está se aproximando.`, evidence: { phase: event.phase, hoursUntil: event.hoursUntil },
        expiresAt: event.startsAt, possibleAction: { type: 'OPEN_EVENT', eventId: event.id }
      });
      for (const change of event.changes) {
        if (lastSeenAt && timestamp(change.timestamp) && timestamp(change.timestamp) <= lastSeenAt) continue;
        if (change.affectedUsers.length && !change.affectedUsers.includes(snapshot.user.id)) continue;
        if (isOwnChange(change, snapshot.user.id)) continue;
        const signalType = CHANGE_SIGNAL[change.type] || 'REPERTOIRE_CHANGED';
        if (signalType === 'METADATA_CHANGED') continue;
        signals.push({
          type: signalType, source: 'event-change', targetUserId: snapshot.user.id,
          eventId: event.id, songId: change.songId, timestamp: change.timestamp, reason: change.reason,
          evidence: { changeId: change.id, changeType: change.type, before: change.before, after: change.after },
          expiresAt: event.startsAt, possibleAction: { type: 'REVIEW_EVENT', eventId: event.id, songId: change.songId }
        });
      }
      if ([PREPARATION_STATES.NOT_STARTED, PREPARATION_STATES.IN_PROGRESS].includes(event.preparation.state)) signals.push({
        type: 'PREPARATION_PENDING', source: 'preparation-state', targetUserId: snapshot.user.id, eventId: event.id, songId: null,
        timestamp: snapshot.generatedAt, reason: event.preparation.evidence[0], evidence: { state: event.preparation.state },
        expiresAt: event.startsAt, possibleAction: { type: 'CONTINUE_PREPARATION', eventId: event.id }
      });
      for (const song of array(event.preparation.songs).filter(value => [PREPARATION_STATES.NEEDS_REVIEW, PREPARATION_STATES.CHANGED_AFTER_REVIEW].includes(value.state))) signals.push({
        type: 'REVIEW_RECOMMENDED', source: 'preparation-state', targetUserId: snapshot.user.id, eventId: event.id, songId: song.songId,
        repertoireItemId: song.repertoireItemId, timestamp: song.reviewedAt || snapshot.generatedAt,
        reason: 'A versão confirmada não é mais a versão atual.',
        evidence: { state: song.state, reviewedRevision: song.reviewedRevision, currentRevision: song.currentRevision, relevantChanges: song.relevantChanges, evidenceIncomplete: song.evidenceIncomplete },
        expiresAt: event.startsAt, possibleAction: { type: 'REVIEW_CHANGED_SONG', eventId: event.id, songId: song.songId, repertoireItemId: song.repertoireItemId }
      });
      if (event.preparation.state === PREPARATION_STATES.READY && event.phase === EVENT_PHASES.TODAY) signals.push({
        type: 'READY_FOR_EVENT', source: 'preparation-state', targetUserId: snapshot.user.id, eventId: event.id, songId: null,
        timestamp: snapshot.generatedAt, reason: 'Não há preparação pendente registrada para este evento.', evidence: { state: event.preparation.state, phase: event.phase },
        expiresAt: event.startsAt, possibleAction: { type: 'ENTER_STAGE_MODE', eventId: event.id }
      });
    }
    const unique = new Map();
    for (const signal of signals) unique.set(signalKey(signal), signal);
    return [...unique.values()];
  }

  const PRIORITY_ORDER = Object.freeze({ NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 });
  const ACTION_ORDER = Object.freeze({ OPEN_UPCOMING_EVENT: 1, RECOGNIZE_PREPARATION: 2, CONTINUE_STUDY: 3, START_PREPARATION: 4, CONTINUE_PREPARATION: 4, ENTER_STAGE_MODE: 4, CHECK_EVENT_CHANGES: 5, REVIEW_CHANGED_SONG: 6 });
  const CATEGORY_COOLDOWN_HOURS = Object.freeze({ changes: 6, preparation: 24, continuity: 24, recognition: 168, anticipation: 36, event_day: 4 });
  const CATEGORY_ORDER = Object.freeze({ anticipation: 1, recognition: 2, continuity: 3, preparation: 4, event_day: 4, changes: 5 });
  function contextualPriority(event, kind) {
    if (!event || [EVENT_PHASES.UNKNOWN, EVENT_PHASES.PAST].includes(event.phase)) return PRIORITIES.NONE;
    if (kind === 'changed') {
      if (event.phase === EVENT_PHASES.TODAY) return PRIORITIES.CRITICAL;
      if (event.phase === EVENT_PHASES.APPROACHING) return PRIORITIES.HIGH;
      if (event.phase === EVENT_PHASES.PREPARATION) return PRIORITIES.MEDIUM;
      return PRIORITIES.LOW;
    }
    if (kind === 'pending') {
      if (event.phase === EVENT_PHASES.TODAY) return PRIORITIES.CRITICAL;
      if (event.phase === EVENT_PHASES.APPROACHING) return PRIORITIES.HIGH;
      if (event.phase === EVENT_PHASES.PREPARATION) return PRIORITIES.MEDIUM;
      return PRIORITIES.LOW;
    }
    if (kind === 'stage' && event.phase === EVENT_PHASES.TODAY) return PRIORITIES.MEDIUM;
    return PRIORITIES.NONE;
  }
  function rankSignals(signals, snapshot) {
    return array(signals).map(signal => {
      const event = snapshot.events.find(item => item.id === signal.eventId);
      const kind = signal.type === 'REVIEW_RECOMMENDED' ? 'changed' : signal.type === 'PREPARATION_PENDING' ? 'pending' : signal.type === 'READY_FOR_EVENT' ? 'stage' : 'context';
      const priority = contextualPriority(event, kind);
      const rules = [
        { rule: `signal-${signal.type.toLowerCase()}`, result: 'observed' },
        { rule: `event-phase-${event ? event.phase.toLowerCase() : 'unknown'}`, result: priority }
      ];
      return { ...signal, priority, explanation: { rules, missingData: snapshot.missingData, usedLlm: false } };
    }).sort((left, right) => PRIORITY_ORDER[right.priority] - PRIORITY_ORDER[left.priority] || String(right.timestamp || '').localeCompare(String(left.timestamp || '')));
  }
  function fingerprint(parts) { return parts.map(value => text(value) || '-').join(':'); }
  function recommendationExpiration(event) {
    if (!event || !event.startsAt) return null;
    if (event.phase !== EVENT_PHASES.TODAY) return event.startsAt;
    const day = new Date(event.startsAt); day.setHours(24, 0, 0, 0); return day.toISOString();
  }
  function pendingSongAdditions(event) {
    const pending = array(event && event.preparation && event.preparation.songs).filter(song => song.state === PREPARATION_STATES.NOT_STARTED);
    if (!pending.length) return [];
    const byItem = new Set(pending.map(song => text(song.repertoireItemId)).filter(Boolean));
    const bySong = new Set(pending.map(song => text(song.songId)).filter(Boolean));
    const startsAt = timestamp(event.startsAt);
    const unique = new Map();
    for (const change of array(event.changes)) {
      if (text(change.type) !== 'SONG_ADDED') continue;
      if (!(change.repertoireItemId && byItem.has(text(change.repertoireItemId))) && !(change.songId && bySong.has(text(change.songId)))) continue;
      const changedAt = timestamp(change.timestamp), hoursBeforeEvent = startsAt && changedAt ? (startsAt - changedAt) / 36e5 : null;
      const evidence = {
        type: 'SONG_ADDED', changeId: change.id || null, eventId: event.id,
        songId: change.songId || null, repertoireItemId: change.repertoireItemId || null,
        changedAt: change.timestamp || null, hoursBeforeEvent: Number.isFinite(hoursBeforeEvent) ? hoursBeforeEvent : null,
        before: change.before, after: change.after
      };
      unique.set(change.id || [change.songId, change.repertoireItemId, change.timestamp].join(':'), evidence);
    }
    return [...unique.values()].sort((left, right) => (timestamp(right.changedAt) || 0) - (timestamp(left.changedAt) || 0));
  }
  function candidateAllowed(candidate, options, nowValue) {
    const acknowledged = new Set(array(options && options.acknowledgedFingerprints).map(String));
    if (acknowledged.has(candidate.fingerprint)) return false;
    const history = array(options && options.history), record = history.find(value => text(value && value.fingerprint) === candidate.fingerprint);
    if (record && record.openedAt) return false;
    const shownAt = timestamp(record && record.presentedAt), now = timestamp(nowValue);
    const cooldown = CATEGORY_COOLDOWN_HOURS[candidate.category] == null ? 24 : CATEGORY_COOLDOWN_HOURS[candidate.category];
    if (shownAt && now && now - shownAt < cooldown * 36e5) return false;
    // Uma mudança nova tem fingerprint própria e é informativa: incentivos recentes do
    // mesmo evento não podem escondê-la. A mesma mudança continua deduplicada acima.
    if (candidate.deliveryClass === 'informational') return true;
    const recentForEvent = history.filter(value => text(value && value.eventId) === text(candidate.eventId) && timestamp(value.presentedAt) && now - timestamp(value.presentedAt) < 12 * 36e5);
    return !recentForEvent.some(value => (CATEGORY_ORDER[text(value.category)] || 0) >= (CATEGORY_ORDER[candidate.category] || 0));
  }
  function repertoireItemAccessible(item) {
    if (!item) return false;
    const status = text(item.status || item.official && item.official.status);
    return item.accessible !== false && (!item.official || item.official.accessible !== false) && !/^(removed|deleted|archived|hidden|inaccessible)$/i.test(status);
  }
  function relevantEventChanges(event, nowValue) {
    const relevant = new Set(['KEY_CHANGED', 'CAPO_CHANGED', 'STRUCTURE_CHANGED', 'PERFORMANCE_NOTES_CHANGED', 'SONG_ADDED', 'SONG_REMOVED', 'REPERTOIRE_CHANGED']);
    const now = timestamp(nowValue);
    return array(event.changes).filter(change => {
      const changedAt = timestamp(change.timestamp);
      return relevant.has(CHANGE_SIGNAL[change.type] || change.type) && (!changedAt || !now || now - changedAt <= 14 * 864e5);
    });
  }
  function buildCandidates(snapshot, rankedSignals, options) {
    const candidates = [];
    for (const event of snapshot.events) {
      if ([EVENT_PHASES.PAST, EVENT_PHASES.UNKNOWN].includes(event.phase)) continue;
      for (const song of array(event.preparation.songs).filter(value => {
        if (![PREPARATION_STATES.CHANGED_AFTER_REVIEW, PREPARATION_STATES.NEEDS_REVIEW].includes(value.state)) return false;
        const changes = array(value.relevantChanges);
        return !changes.length || changes.some(change => !isOwnChange(change, snapshot.user.id));
      })) {
        const priority = contextualPriority(event, 'changed');
        const relevantTypes = array(song.relevantChanges).map(change => text(change.type || change.changeType)).filter(Boolean);
        const candidate = {
          actionType: 'REVIEW_CHANGED_SONG', category: 'changes', deliveryClass: 'informational', priority, titleKey: 'nba.reviewChangedSong', reasonCode: relevantTypes[0] || 'REVISION_CHANGED_AFTER_REVIEW',
          destination: { view: 'song', eventId: event.id, songId: song.songId, repertoireItemId: song.repertoireItemId },
          eventId: event.id, songId: song.songId, repertoireItemId: song.repertoireItemId,
          evidence: { previousState: PREPARATION_STATES.READY, currentState: song.state, reviewedAt: song.reviewedAt || null, reviewedRevision: song.reviewedRevision || null, currentRevision: song.currentRevision || null, relevantChanges: song.relevantChanges, evidenceIncomplete: song.evidenceIncomplete, eventPhase: event.phase, hoursUntil: event.hoursUntil },
          expiresAt: recommendationExpiration(event),
          fingerprint: fingerprint([snapshot.user.id, event.id, 'REVIEW_CHANGED_SONG', song.repertoireItemId, song.currentRevision]),
          because: ['song-was-explicitly-reviewed', 'current-revision-differs', `event-phase-${event.phase.toLowerCase()}`, 'action-has-valid-song-destination']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
      const changes = relevantEventChanges(event, snapshot.generatedAt).filter(change => {
        if (isOwnChange(change, snapshot.user.id)) return false;
        if (!change.songId) return true;
        const song = array(event.preparation.songs).find(value => value.songId === change.songId);
        return !song || song.state !== PREPARATION_STATES.READY;
      }), latestChange = changes.slice().sort((left, right) => (timestamp(right.timestamp) || 0) - (timestamp(left.timestamp) || 0))[0];
      if (latestChange && !array(event.preparation.songs).some(song => [PREPARATION_STATES.CHANGED_AFTER_REVIEW, PREPARATION_STATES.NEEDS_REVIEW].includes(song.state) && (song.songId === latestChange.songId || !latestChange.songId))) {
        const changeTypes = [...new Set(changes.map(change => CHANGE_SIGNAL[change.type] || change.type))].sort();
        const candidate = {
          actionType: 'CHECK_EVENT_CHANGES', category: 'changes', deliveryClass: 'informational', priority: contextualPriority(event, 'changed'), titleKey: 'nba.checkEventChanges', reasonCode: changeTypes[0] || 'REPERTOIRE_CHANGED',
          destination: { view: 'event_changes', eventId: event.id }, eventId: event.id, songId: latestChange.songId || null, repertoireItemId: latestChange.repertoireItemId || null,
          evidence: { eventPhase: event.phase, eventMoment: event.moment, hoursUntil: event.hoursUntil, changeCount: changes.length, changeTypes, latestChange, evidenceIncomplete: !latestChange.timestamp },
          expiresAt: recommendationExpiration(event), fingerprint: fingerprint([snapshot.user.id, event.id, 'CHECK_EVENT_CHANGES', changes.map(change => change.id || `${change.type}-${change.timestamp}`).sort().join(',')]),
          because: ['important-event-change', `event-phase-${event.phase.toLowerCase()}`, 'action-opens-event-changes']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
      const counts = event.preparation.counts || {};
      if (counts.pending > 0) {
        const actionType = counts.ready > 0 || counts.changed > 0 ? 'CONTINUE_PREPARATION' : 'START_PREPARATION';
        const revisions = array(event.preparation.songs).filter(song => song.state === PREPARATION_STATES.NOT_STARTED).map(song => song.currentRevision || song.repertoireItemId).sort();
        const relevantChanges = pendingSongAdditions(event);
        const candidate = {
          actionType, category: 'preparation', deliveryClass: 'optional', priority: contextualPriority(event, 'pending'), titleKey: actionType === 'START_PREPARATION' ? 'nba.startPreparation' : 'nba.continuePreparation', reasonCode: 'PREPARATION_PENDING',
          destination: { view: 'event', eventId: event.id }, eventId: event.id, songId: null, repertoireItemId: null,
          evidence: { preparationState: event.preparation.state, pendingCount: counts.pending, readyCount: counts.ready, changedCount: counts.changed, totalCount: counts.total, eventPhase: event.phase, eventMoment: event.moment, hoursUntil: event.hoursUntil, relevantChanges, evidenceIncomplete: relevantChanges.some(change => !change.changedAt || !(change.songId || change.repertoireItemId)) },
          expiresAt: recommendationExpiration(event), fingerprint: fingerprint([snapshot.user.id, event.id, actionType, revisions.join(',')]),
          because: ['explicit-receipts-missing', 'pending-songs-aggregated', `event-phase-${event.phase.toLowerCase()}`, 'action-has-valid-event-destination']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
      if (event.preparation.state === PREPARATION_STATES.READY && event.phase === EVENT_PHASES.TODAY && snapshot.preferences.stageModeAvailable !== false) {
        const candidate = {
          actionType: 'ENTER_STAGE_MODE', category: 'event_day', deliveryClass: 'informational', priority: contextualPriority(event, 'stage'), titleKey: 'nba.enterStageMode', reasonCode: 'READY_TODAY',
          destination: { view: 'stage', eventId: event.id }, eventId: event.id, songId: null, repertoireItemId: null,
          evidence: { state: event.preparation.state, eventPhase: event.phase, liveInferred: false }, expiresAt: recommendationExpiration(event),
          fingerprint: fingerprint([snapshot.user.id, event.id, 'ENTER_STAGE_MODE', event.version || event.startsAt]),
          because: ['all-songs-ready', 'event-is-today', 'stage-mode-is-available', 'live-was-not-inferred']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
      if (event.preparation.counts.total > 0 && event.preparation.state === PREPARATION_STATES.READY && event.phase !== EVENT_PHASES.TODAY && [EVENT_MOMENTS.TOMORROW, EVENT_MOMENTS.THREE_DAYS, EVENT_MOMENTS.WITHIN_WEEK].includes(event.moment)) {
        const candidate = {
          actionType: 'RECOGNIZE_PREPARATION', category: 'recognition', deliveryClass: 'optional', priority: PRIORITIES.MEDIUM, titleKey: 'nba.recognizePreparation', reasonCode: 'PREPARATION_READY',
          destination: { view: 'event', eventId: event.id }, eventId: event.id, songId: null, repertoireItemId: null,
          evidence: { eventPhase: event.phase, eventMoment: event.moment, readyCount: event.preparation.counts.ready, totalCount: event.preparation.counts.total, hoursUntil: event.hoursUntil },
          expiresAt: recommendationExpiration(event), fingerprint: fingerprint([snapshot.user.id, event.id, 'RECOGNIZE_PREPARATION', event.preparation.counts.ready, event.version || event.startsAt]),
          because: ['all-songs-explicitly-ready', `event-moment-${event.moment.toLowerCase()}`, 'progress-is-measurable']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
      const activity = snapshot.activity, activityAt = timestamp(activity && activity.openedAt), generatedAt = timestamp(snapshot.generatedAt);
      if (activity && text(activity.eventId) === event.id && activityAt && generatedAt - activityAt >= 0 && generatedAt - activityAt <= 7 * 864e5) {
        const item = event.repertoire.find(value => value.id === text(activity.repertoireItemId) || value.songId === text(activity.songId));
        if (repertoireItemAccessible(item)) {
          const candidate = {
            actionType: 'CONTINUE_STUDY', category: 'continuity', deliveryClass: 'optional', priority: PRIORITIES.MEDIUM, titleKey: 'nba.continueStudy', reasonCode: 'RECENT_EVENT_SONG',
            destination: { view: 'song', eventId: event.id, songId: item.songId, repertoireItemId: item.id }, eventId: event.id, songId: item.songId, repertoireItemId: item.id,
            evidence: { eventPhase: event.phase, eventMoment: event.moment, openedAt: activity.openedAt }, expiresAt: recommendationExpiration(event),
            fingerprint: fingerprint([snapshot.user.id, event.id, 'CONTINUE_STUDY', item.id, activity.openedAt]), because: ['recent-event-song-activity', 'activity-is-not-treated-as-ready', 'action-resumes-same-song']
          };
          if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
        }
      }
      if ((event.moment === EVENT_MOMENTS.TODAY && event.preparation.state === PREPARATION_STATES.UNKNOWN) || [EVENT_MOMENTS.TOMORROW, EVENT_MOMENTS.THREE_DAYS, EVENT_MOMENTS.WITHIN_WEEK].includes(event.moment) || (event.createdAtReliable && event.createdAt && timestamp(snapshot.generatedAt) - timestamp(event.createdAt) <= 24 * 36e5 && event.daysUntil >= 0)) {
        const candidate = {
          actionType: 'OPEN_UPCOMING_EVENT', category: event.moment === EVENT_MOMENTS.TODAY ? 'event_day' : 'anticipation', deliveryClass: 'optional', priority: event.moment === EVENT_MOMENTS.TODAY ? PRIORITIES.HIGH : PRIORITIES.MEDIUM, titleKey: 'nba.openUpcomingEvent', reasonCode: event.repertoire.length ? 'UPCOMING_EVENT' : 'UPCOMING_EVENT_EMPTY',
          destination: { view: 'event', eventId: event.id }, eventId: event.id, songId: null, repertoireItemId: null,
          evidence: { preparationState: event.preparation.state, eventPhase: event.phase, eventMoment: event.moment, hoursUntil: event.hoursUntil, daysUntil: event.daysUntil, repertoireCount: event.repertoire.length, newlyCreated: Boolean(event.createdAtReliable && event.createdAt && timestamp(snapshot.generatedAt) - timestamp(event.createdAt) <= 24 * 36e5) },
          expiresAt: recommendationExpiration(event), fingerprint: fingerprint([snapshot.user.id, event.id, 'OPEN_UPCOMING_EVENT', event.moment, event.repertoire.length ? 'with-repertoire' : 'empty']),
          because: ['event-is-upcoming', `event-moment-${event.moment.toLowerCase()}`, event.repertoire.length ? 'repertoire-is-available' : 'repertoire-is-empty']
        };
        if (candidateAllowed(candidate, options, snapshot.generatedAt)) candidates.push(candidate);
      }
    }
    const unique = new Map();
    for (const candidate of candidates) if (!unique.has(candidate.fingerprint)) unique.set(candidate.fingerprint, candidate);
    return [...unique.values()].sort((left, right) =>
      PRIORITY_ORDER[right.priority] - PRIORITY_ORDER[left.priority] ||
      (ACTION_ORDER[right.actionType] || 0) - (ACTION_ORDER[left.actionType] || 0) ||
      String(left.eventId).localeCompare(String(right.eventId)) || String(left.repertoireItemId || '').localeCompare(String(right.repertoireItemId || ''))
    );
  }
  function noneReason(snapshot, candidates) {
    if (!snapshot.events.length) return 'NO_ACTIONABLE_SIGNAL';
    if (snapshot.events.every(event => event.phase === EVENT_PHASES.PAST)) return 'EVENT_PAST';
    if (snapshot.events.some(event => event.phase === EVENT_PHASES.UNKNOWN || event.preparation.state === PREPARATION_STATES.UNKNOWN)) return 'INSUFFICIENT_CONTEXT';
    if (snapshot.events.filter(event => event.phase !== EVENT_PHASES.PAST).every(event => event.preparation.state === PREPARATION_STATES.READY)) return 'ALL_READY';
    if (candidates.length && candidates.every(candidate => candidate.priority === PRIORITIES.LOW)) return 'EVENT_TOO_DISTANT';
    return 'NO_ACTIONABLE_SIGNAL';
  }
  function nextBestAction(snapshot, rankedSignals, options) {
    const candidates = buildCandidates(snapshot, rankedSignals, options);
    const winner = candidates.find(candidate => PRIORITY_ORDER[candidate.priority] >= PRIORITY_ORDER[PRIORITIES.MEDIUM]);
    if (!winner) {
      const reasonCode = noneReason(snapshot, candidates);
      return {
        actionType: 'NONE', priority: PRIORITIES.NONE, titleKey: null, reasonCode, destination: null,
        eventId: null, songId: null, repertoireItemId: null, evidence: {}, expiresAt: null, fingerprint: null,
        diagnostic: { because: [reasonCode.toLowerCase().replaceAll('_', '-')], competingCandidates: candidates.map(candidate => candidate.actionType), winnerReason: 'no candidate met the minimum attention threshold', missingData: snapshot.missingData, usedLlm: false },
        explanation: { signals: [], rules: [reasonCode], missingData: snapshot.missingData, usedLlm: false }
      };
    }
    const competingCandidates = candidates.filter(candidate => candidate !== winner).map(candidate => ({ actionType: candidate.actionType, priority: candidate.priority, fingerprint: candidate.fingerprint }));
    const winnerReason = winner.actionType === 'REVIEW_CHANGED_SONG' && competingCandidates.some(candidate => ['START_PREPARATION', 'CONTINUE_PREPARATION'].includes(candidate.actionType))
      ? 'specific actionable change outranks aggregated preparation pending'
      : 'highest contextual priority and action specificity';
    return {
      ...winner,
      diagnostic: { because: winner.because, competingCandidates, winnerReason, signals: rankedSignals.filter(signal => signal.eventId === winner.eventId).map(signal => signal.type), missingData: snapshot.missingData, usedLlm: false },
      explanation: { signals: rankedSignals.filter(signal => signal.eventId === winner.eventId).map(signal => signal.type), rules: winner.because, missingData: snapshot.missingData, usedLlm: false }
    };
  }
  function evaluate(input, options) {
    const snapshot = createSnapshot(input);
    const signals = generateSignals(snapshot, options);
    const rankedSignals = rankSignals(signals, snapshot);
    const action = nextBestAction(snapshot, rankedSignals, options);
    return { snapshot, signals: rankedSignals, candidates: buildCandidates(snapshot, rankedSignals, options), nextBestAction: action };
  }

  global.roudyContextIntelligence = Object.freeze({
    EVENT_PHASES, EVENT_MOMENTS, PREPARATION_STATES, PRIORITIES, APPROACHING_HOURS, eventPhase, createSnapshot, generateSignals, rankSignals, buildCandidates, nextBestAction, evaluate
  });
})(typeof window !== 'undefined' ? window : globalThis);
