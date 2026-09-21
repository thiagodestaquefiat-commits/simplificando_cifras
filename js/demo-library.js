(function (global) {
  "use strict";

  const MIGRATION_KEY = "sc_demo_library_migration_v1";
  const MEDLEY_KEY = "sc_medleys_v2";
  const LEGACY_MEDLEY_KEYS = ["cifras_medleys_v1", "cifras_medley_v1"];
  const LEGACY_SIGNATURES = new Set([
    "8e6ede47","99df8e44","2dcfe4c5","5c5b179f","2b9a0b53","83e3e84f","95e3aa96","37d3aa40","7222d894","68fff31c",
    "df861344","9b8e8381","412d4043","d73d6889","1abbe01d","be7492c1","c2acc522","484af46f","860eda3c","9a4ccf2c",
    "f380b5b3","54eba4e6","d1cce96a","b030a9e8","274c9914","e522580a","83396185","b8da8f2d","61c2170e","b6102d06",
    "0ccbf44c","b6da224d","9b348589","a0277a4f","a79abe09","1ba904f8","35354368","573a6a31","e6e3e8b2","fdfeb01d",
    "93bf0bb6","aa4f5fe4","aff279e1","1f3e7875","8083bc32","28aae0c4","91f2001a","7cf922fa","bcc8ee35","a71d98de",
    "a96cbb3c","15d90635","2c84c249","468ec42e","57f04300","2103f04f","cf6371fe","900c6501","68cba51c","d59be42d",
    "ffe55382","82fb1bec","861606ec","a5be9911","5ab8bf10","7b8e5440","e4b6d8d6","a41d0240","0605b299","7fff0775",
    "33131dbd","fe94fd6e","9f3e15cb","76a1d800","140029b2","03cfaf48","438588c0","2430b040","f6eb5e54","b66d1513",
    "99e54990","46b90469","fc55fd51","f3b9b3e4","722b27a9","56782f58"
  ]);

  const DEMO_SONGS = Object.freeze([
    demoSong("demo-luz-no-caminho", "Luz no Caminho", "C", [
      ["Verso", "C                 G\nQuando a noite vem, Tua luz me guia\nAm                F\nPasso a passo eu vou, nasce um novo dia"],
      ["Refrão", "C                 G\nLuz no caminho, paz no coração\nAm                 F\nSigo confiante nesta canção"]
    ]),
    demoSong("demo-nova-manha", "Nova Manhã", "G", [
      ["Verso", "G                    D\nO céu anuncia uma nova manhã\nEm                   C\nA esperança desperta outra vez"],
      ["Refrão", "G                  D\nVou cantar, vou lembrar\nEm                         C\nCada dia traz um motivo pra recomeçar"]
    ]),
    demoSong("demo-juntos-aqui", "Juntos Aqui", "D", [
      ["Verso", "D                    A\nVozes diferentes, um só coração\nBm                      G\nCada som encontra o seu lugar"],
      ["Refrão", "D                 A\nJuntos aqui, vamos celebrar\nBm                    G\nCom respeito e alegria, aprender e tocar"]
    ]),
    demoSong("demo-som-da-graca", "Som da Graça", "A", [
      ["Verso", "A                    E\nLeve como o vento vem a melodia\nF#m                    D\nForte como a ponte que nos faz seguir"],
      ["Refrão", "A                   E\nEste é o som da graça a nos reunir\nF#m                       D\nQuatro acordes simples, tanta vida para ouvir"]
    ])
  ]);

  function demoSong(id, title, key, blocks) {
    const blocos = blocks.map(([l, c]) => ({ l, c }));
    return {
      id, title, artist: "ROUDY Demo", key, capo: "", blocos, demo: true,
      summary: `Resumo harmônico: centro tonal em ${key}; verso e refrão usam a progressão I–V–vi–IV.`,
      fullChordSheet: { visibility: "private", source: "user_text", content: blocks.map(([label, content]) => `[${label}]\n${content}`).join("\n\n") },
      sourceInfo: { type: "manual", name: "Conteúdo original de demonstração do ROUDY", url: null }
    };
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function canonicalSong(song) {
    const value = song || {};
    return JSON.stringify({
      id: value.id, title: value.title, artist: value.artist || "", key: value.key || "", capo: value.capo || "",
      blocos: value.blocos || [], fullChordSheet: value.fullChordSheet || null, album: value.album || null,
      coverUrl: value.coverUrl || null, spotifyTrackId: value.spotifyTrackId || null,
      spotifyUri: value.spotifyUri || null, isrc: value.isrc || null
    });
  }
  function signature(song) {
    const value = canonicalSong(song);
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function isLegacyCatalogSong(song) { return LEGACY_SIGNATURES.has(signature(song)); }
  function catalog() { return clone(DEMO_SONGS); }
  function migrate(songs) {
    const source = Array.isArray(songs) ? songs : [];
    const preserved = source.filter((song) => !isLegacyCatalogSong(song));
    const removed = source.length - preserved.length;
    const seeded = removed > 0 && preserved.length === 0;
    return { songs: seeded ? catalog() : preserved, removed, seeded };
  }
  function demoMedley() {
    return [
      { musicTitle: "Luz no Caminho", musicId: "demo-luz-no-caminho", blocoIdx: 1, label: "Refrão", chords: DEMO_SONGS[0].blocos[1].c, key: "C" },
      { musicTitle: "Nova Manhã", musicId: "demo-nova-manha", blocoIdx: 1, label: "Refrão", chords: DEMO_SONGS[1].blocos[1].c, key: "G" }
    ];
  }
  function loadMedley(storage, isNewLibrary) {
    const current = storage.get(MEDLEY_KEY, null);
    if (Array.isArray(current)) return current;
    for (const key of LEGACY_MEDLEY_KEYS) { const legacy = storage.get(key, null); if (Array.isArray(legacy)) return legacy; }
    const initial = isNewLibrary ? demoMedley() : [];
    storage.set(MEDLEY_KEY, initial);
    return initial;
  }
  function saveMedley(storage, medley) { return storage.set(MEDLEY_KEY, Array.isArray(medley) ? medley : []); }
  function markMigrated(storage, details) { storage.set(MIGRATION_KEY, { version: 1, ...details }); }

  global.demoLibrary = Object.freeze({ catalog, migrate, signature, isLegacyCatalogSong, loadMedley, saveMedley, markMigrated, migrationKey: MIGRATION_KEY });
})(window);
