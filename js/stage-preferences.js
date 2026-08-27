(function (global) {
  'use strict';

  const STORAGE_KEY = 'sc_stage_preferences_v1';
  const CONTENT_MODES = ['lyrics-chords', 'lyrics', 'chords', 'structure'];
  const THEMES = ['dark', 'light', 'contrast'];
  const CONTROLS_MODES = ['auto', 'always', 'hidden'];

  const BASE = Object.freeze({
    version: 1,
    preset: 'custom',
    contentMode: 'lyrics-chords',
    showPrevious: true,
    showNext: true,
    showPosition: true,
    showSetlist: true,
    showNextPreview: true,
    showKey: true,
    autoScroll: false,
    autoScrollSpeed: 60,
    fontSize: 28,
    fullscreen: true,
    wakeLock: true,
    editLock: true,
    theme: 'dark',
    controlsMode: 'auto'
  });

  const PRESETS = Object.freeze({
    vocal: {
      label: 'Vocal',
      description: 'Letra em destaque, tom e próxima música visíveis.',
      values: { contentMode: 'lyrics', fontSize: 34, showKey: true, showNextPreview: true }
    },
    guitar: {
      label: 'Violão / Guitarra',
      description: 'Letra e acordes com leitura equilibrada.',
      values: { contentMode: 'lyrics-chords', fontSize: 28, showKey: true, showNextPreview: true }
    },
    bass: {
      label: 'Baixo',
      description: 'Acordes e estrutura com menos distrações.',
      values: { contentMode: 'chords', fontSize: 30, showKey: true, showNextPreview: true }
    },
    keys: {
      label: 'Teclado',
      description: 'Cifra completa, tom e contexto do repertório.',
      values: { contentMode: 'lyrics-chords', fontSize: 27, showKey: true, showNextPreview: true }
    },
    drums: {
      label: 'Bateria',
      description: 'Estrutura musical e navegação em primeiro plano.',
      values: { contentMode: 'structure', fontSize: 32, showKey: false, showNextPreview: true }
    },
    custom: {
      label: 'Personalizado',
      description: 'Use sua última configuração ou ajuste cada opção.',
      values: {}
    }
  });

  function cleanText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function detectPreset(role) {
    const text = cleanText(role);
    if (/vocal|voz|cantor|cantora|ministro/.test(text)) return 'vocal';
    if (/baixo|bass/.test(text)) return 'bass';
    if (/tecl|piano|keys/.test(text)) return 'keys';
    if (/bater|drum|percuss/.test(text)) return 'drums';
    if (/viol|guit|cavaq|ukulele/.test(text)) return 'guitar';
    return 'custom';
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const preset = Object.prototype.hasOwnProperty.call(PRESETS, source.preset)
      ? source.preset
      : BASE.preset;
    return {
      ...BASE,
      ...source,
      version: 1,
      preset,
      contentMode: CONTENT_MODES.includes(source.contentMode) ? source.contentMode : BASE.contentMode,
      theme: THEMES.includes(source.theme) ? source.theme : BASE.theme,
      controlsMode: CONTROLS_MODES.includes(source.controlsMode) ? source.controlsMode : BASE.controlsMode,
      autoScrollSpeed: clampNumber(source.autoScrollSpeed, 24, 140, BASE.autoScrollSpeed),
      fontSize: clampNumber(source.fontSize, 18, 48, BASE.fontSize),
      showPrevious: source.showPrevious !== false,
      showNext: source.showNext !== false,
      showPosition: source.showPosition !== false,
      showSetlist: source.showSetlist !== false,
      showNextPreview: source.showNextPreview !== false,
      showKey: source.showKey !== false,
      autoScroll: source.autoScroll === true,
      fullscreen: source.fullscreen !== false,
      wakeLock: source.wakeLock !== false,
      editLock: source.editLock !== false
    };
  }

  function defaultsFor(role) {
    const preset = detectPreset(role);
    return normalize({ ...BASE, preset, ...PRESETS[preset].values });
  }

  function storageApi() {
    return global.storage || {
      get(key, fallback) {
        try {
          return JSON.parse(global.localStorage.getItem(key)) || fallback;
        } catch (_) {
          return fallback;
        }
      },
      set(key, value) {
        global.localStorage.setItem(key, JSON.stringify(value));
      }
    };
  }

  function userKey(userId) {
    return String(userId || 'local-user');
  }

  function load(userId, role) {
    const root = storageApi().get(STORAGE_KEY, {});
    const entry = root && root[userKey(userId)];
    const saved = entry?.profiles
      ? entry.profiles[entry.activeProfileId || 'default']
      : entry;
    return saved ? normalize(saved) : defaultsFor(role);
  }

  function save(userId, preferences, profileId) {
    const api = storageApi();
    const root = api.get(STORAGE_KEY, {});
    const key = userKey(userId);
    const current = root?.[key];
    const currentProfiles = current?.profiles || (current && !current.profiles ? { default: normalize(current) } : {});
    const activeProfileId = String(profileId || current?.activeProfileId || 'default');
    const normalized = normalize({ ...preferences, updatedAt: new Date().toISOString() });
    api.set(STORAGE_KEY, {
      ...(root || {}),
      [key]: {
        version: 1,
        activeProfileId,
        profiles: { ...currentProfiles, [activeProfileId]: normalized }
      }
    });
    return normalized;
  }

  function listProfiles(userId) {
    const root = storageApi().get(STORAGE_KEY, {});
    const entry = root?.[userKey(userId)];
    if (!entry) return [];
    if (!entry.profiles) return [{ id: 'default', preferences: normalize(entry), active: true }];
    return Object.entries(entry.profiles).map(([id, preferences]) => ({
      id,
      preferences: normalize(preferences),
      active: id === (entry.activeProfileId || 'default')
    }));
  }

  function applyPreset(presetId, current) {
    const id = Object.prototype.hasOwnProperty.call(PRESETS, presetId) ? presetId : 'custom';
    return normalize({ ...BASE, ...(current || {}), ...PRESETS[id].values, preset: id });
  }

  global.stagePreferences = {
    STORAGE_KEY,
    CONTENT_MODES: CONTENT_MODES.slice(),
    THEMES: THEMES.slice(),
    CONTROLS_MODES: CONTROLS_MODES.slice(),
    presets: PRESETS,
    detectPreset,
    defaultsFor,
    normalize,
    load,
    save,
    listProfiles,
    applyPreset
  };
})(window);
