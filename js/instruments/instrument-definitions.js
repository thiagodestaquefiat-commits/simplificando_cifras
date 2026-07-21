(function (global) {
  "use strict";

  const definitions = [
    {
      id: "guitar", name: "Violão & Guitarra", shortName: "Violão", icon: "🎸",
      renderer: "fretted", courses: 6, physicalStrings: 6,
      tuning: [40, 45, 50, 55, 59, 64], tuningLabel: "E2 A2 D3 G3 B3 E4",
      libraryId: "guitar-standard", features: ["capo", "barres", "alternate-voicings"], isDefault: true
    },
    {
      id: "ukulele", name: "Ukulele", shortName: "Ukulele", icon: "🪕",
      renderer: "fretted", courses: 4, physicalStrings: 4,
      tuning: [67, 60, 64, 69], tuningLabel: "G4 C4 E4 A4 (reentrante)",
      libraryId: "ukulele-gcea", features: ["barres", "reentrant"], isDefault: false
    },
    {
      id: "keyboard", name: "Teclado", shortName: "Teclado", icon: "🎹",
      renderer: "keyboard", courses: 0, physicalStrings: 0,
      tuning: [], tuningLabel: "Teclado cromático", libraryId: "keyboard-standard",
      features: ["root-highlight", "inversions"], isDefault: false
    },
    {
      id: "cavaquinho", name: "Cavaco", shortName: "Cavaco", icon: "🎵",
      renderer: "fretted", courses: 4, physicalStrings: 4,
      tuning: [62, 67, 71, 74], tuningLabel: "D4 G4 B4 D5",
      libraryId: "cavaquinho-dgbd", features: ["barres"], isDefault: false
    },
    {
      id: "viola-caipira-cebolao-e", name: "Viola Caipira", shortName: "Viola", icon: "🎻",
      renderer: "double-course-fretted", courses: 5, physicalStrings: 10,
      tuning: [40, 47, 52, 56, 59], tuningLabel: "Cebolão em E · E2 B2 E3 G#3 B3",
      libraryId: "viola-cebolao-e", features: ["double-courses", "barres", "future-tunings"], isDefault: false,
      futureTunings: ["Cebolão em D", "Rio Abaixo", "Boiadeira", "Natural"]
    }
  ];

  const byId = Object.freeze(Object.fromEntries(definitions.map((instrument) => [instrument.id, Object.freeze(instrument)])));
  const legacyIds = Object.freeze({ violao: "guitar", teclado: "keyboard", cavaco: "cavaquinho", viola: "viola-caipira-cebolao-e" });

  function normalizeId(value) {
    const id = legacyIds[value] || value;
    return byId[id] ? id : "guitar";
  }

  global.instrumentDefinitions = Object.freeze({
    all: Object.freeze(definitions.slice()), byId, legacyIds,
    defaultId: "guitar", normalizeId,
    get(value) { return byId[normalizeId(value)]; }
  });
})(window);
