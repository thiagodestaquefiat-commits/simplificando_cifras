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

  const AH_JESUS_SHEET = [
    "[Intro]", "C  G  Am", "",
    "[Primeira Parte]", "G", "Quem foi muito perdoado", "G  Em", "Deveria saber o valor de ser amado",
    "G", "Mas por outro lado", "Am", "O bem que eu quero fazer, de fato eu não faço",
    "G  C", "E, dependendo do pecado, eu nem me sinto incomodado", "Cm", "Então esbarro na Tua palavra e sou confrontado", "",
    "[Pré-Refrão]", "C  D  Em", "Não adianta fingir que está tudo bem", "G  Bm7", "Se de Ti eu recebi perdão, mas não consigo perdoar ninguém",
    "C  D  Em", "A outra face eu não dei, só o meu ego escutei", "Bm7", "Até amei os meus amigos, mas meus inimigos odiei",
    "C  D  G  Em", "Na minha hipocrisia, me achei melhor que o outro", "C  D  G  Em", "Sem perceber a trave que estava no meu olho",
    "C  D  G  Em", "Em pele de ovelha, agindo como um lobo", "Bm7  Em", "Me esqueci do reino, juntando os meus tesouros", "",
    "[Refrão 1]", "C", "Ah, Jesus, quebra o meu orgulho", "G", "E faz-me olhar pra cruz",
    "Am  C", "Tira a dureza do meu coração", "Bm7", "De joelhos, eu imploro o Teu perdão",
    "Am  G  C", "Pois Tua graça joga a minha carne ao chão", "Am  G  C", "E me ensina o valor da comunhão",
    "G  C", "Do beber do vinho e partilhar do pão", "",
    "[Solo 1]", "C  G  Am", "", "[Pré-Refrão]", "C  D  Em  G  Bm7", "", "[Refrão 1]", "C  Bm7  Am  G", "", "[Solo 2]", "C  G  Am", "",
    "[Segunda Parte]", "C  Bm7", "Eu sou o vaso, Tu és o oleiro", "Am7  G", "Quebra minha vida, me refaz por inteiro",
    "C  Bm7", "Tomo a minha cruz e nego a mim mesmo", "Am  G", "Pois do pecado não sou mais prisioneiro", "",
    "[Pré-Refrão 2]", "C  G", "Mesmo com falhas, esse é o meu desejo", "Am  G  C  D  G", "Dá-me um coração igual ao Teu", "",
    "[Refrão 2]", "G  C", "Dá-me um coração igual ao Teu", "D", "Meu Mestre",
    "G  C", "Dá-me um coração igual ao Teu", "D  G  Em", "Coração disposto a obedecer",
    "G  Em", "Cumprir todo o Teu querer", "Am  G  C  D  G", "Dá-me um coração igual ao Teu", "",
    "[Refrão 1]", "C  Bm7  Am  G", "", "[Solo 3]", "C  G  Am", "", "[Interlúdio]", "C  G  Am", "",
    "[Ponte]", "C  G  Am  G", "Judas veio ao Teu encontro, com a traição pesando", "C  G  Am  G", "Mas Te vejo se inclinando e os pés do traidor lavando",
    "C  G  Am  G", "Vejo Pedro Te negando e o galo então cantando", "C  G  Am  G", "Mesmo assim, Tu dizes: Pedro, apascenta o meu rebanho", "",
    "[Pré-Refrão 3]", "C  G", "Quebrantado, estou chorando; minha alma está clamando", "Am  G  C  D  G", "Dá-me um coração igual ao Teu", "",
    "[Refrão 2]", "G  C  D  Em  Am", "", "[Refrão Final]", "C  Bm7  Am  G", "",
    "[Final]", "C  G  Em  C  Am  Am7  Bm7  C  Cm  D  Em  G"
  ].join("\n");

  const CULTURA_SHEET = [
    "[Intro]", "F  Am  G", "",
    "[Verso]", "F  Am  G", "Aqui na terra como no céu", "F", "Toma o Teu lugar", "Am  G", "Na terra como no céu", "",
    "[Verso - repetição]", "F  Am  G", "Aqui na terra como no céu", "F", "Toma o Teu lugar", "Am  G", "Na terra como no céu", "",
    "[Interlúdio]", "F  Am  G", "",
    "[Verso]", "F  Am  G", "Aqui na terra como no céu", "F", "Toma o Teu lugar", "Am  G", "Na terra como no céu", "",
    "[Ponte]", "F", "Venha o Teu Reino", "G", "Venha o Teu Governo", "F  G", "Flua a cultura que vem do céu", "",
    "[Final]", "F", "Te convidamos", "Am", "Te desejamos", "G", "Rei da glória", "Em  F", "Toma o Teu lugar", "Am  G  Em", "Toma o Teu lugar"
  ].join("\n");

  const DIGNO_SHEET = [
    "[Intro]", "C#m7  B4  A2", "C#m7  B4  A2", "",
    "[Primeira Parte]", "A2  E", "Graças eu Te dou, ó Pai", "A2  B4  E", "Pelo preço que pagou",
    "C#m7", "Sacrifício de amor", "B4  A2  F#m  C#m7  B4", "Que me comprou, ungido do Senhor", "",
    "[Segunda Parte]", "A2  E", "Pelos cravos em Suas mãos", "A2  B4  E", "Graças eu Te dou, ó meu Senhor",
    "C#m7", "Lavou minha mente e coração", "B4  A2", "Me deu perdão", "F#m7(11)  C#m7  B4", "Restaurou-me a comunhão", "",
    "[Refrão]", "E  B4", "Digno é o Senhor", "F#m7(11)  E  A2", "Sobre o trono está", "B4  A2  E  A2", "Soberano, Criador",
    "F#m7(11)  C#m7  B4", "Vou sempre Te adorar", "E  E7M", "Elevo minhas mãos", "F#m7(11)  E  A2", "Ao Cristo que venceu",
    "B4  A2", "Cordeiro de Deus", "E  A2  B4", "Morreu por mim", "F#m7(11)  C#m7  B4", "Mas ressuscitou", "",
    "[Segunda Parte]", "A2  E  A2  B4  C#m7  F#m7(11)", "", "[Refrão]", "E  B4  F#m7(11)  A2  C#m7  E7M", "",
    "[Refrão Final]", "E  E7M", "Digno é o Senhor", "F#m  E  A2", "Sobre o trono está", "B4  A2  E  A2", "Soberano, Criador",
    "F#m  C#m7  B4", "Vou sempre Te adorar", "E  E7M", "Elevo minhas mãos", "F#m  E  A2", "Ao Cristo que venceu",
    "B4  A2", "Cordeiro de Deus", "E  A2  B4", "Morreu por mim", "F#m  C#m7  B4", "Mas ressuscitou",
    "F#m  C#m7  B4", "Digno é o Senhor", "F#m  C#m7  B4", "Mas ressuscitou", "F#m  C#m7  B4  E", "Digno é o Senhor"
  ].join("\n");

  const SANTO_SHEET_LINES = ["[Intro]", "A  B  G#m  C#m"];
  SANTO_SHEET_LINES.push("", "[Primeira Parte]", "E", "As muitas gerações", "A  E", "Rendidas em louvor", "C#m  B  A", "Cantando ao Cordeiro uma canção");
  SANTO_SHEET_LINES.push("E", "Os que em Ti se foram", "A  E", "E os que hão de crer", "C#m  B  A", "Cantando ao Cordeiro uma canção");
  SANTO_SHEET_LINES.push("", "[Pré-Refrão]", "A", "Teu nome é o mais alto", "B", "Teu nome é o maior", "C#m  A", "Teu nome é sobre todos");
  SANTO_SHEET_LINES.push("A", "Os tronos e domínios", "B", "Governos e poderes", "C#m  F#m", "Teu nome é sobre todos");
  SANTO_SHEET_LINES.push("", "[Refrão]", "A  B", "E os anjos clamam: Santo", "G#m  C#m", "Toda criação: Santo", "F#m7  B", "Exaltado És, Santo", "E", "Santo pra sempre");
  SANTO_SHEET_LINES.push("", "[Segunda Parte]", "E", "Quem foi perdoado", "A  E", "E redimido foi", "C#m  B  A", "Cante ao Cordeiro uma canção");
  SANTO_SHEET_LINES.push("E", "Aquele que é livre", "A  E", "E leva o Seu nome", "C#m  B  A", "Cante ao Cordeiro uma canção", "C#m  B  A", "Cantaremos para sempre, amém");
  SANTO_SHEET_LINES.push("", "[Refrão]", "A  B", "E os anjos clamam: Santo", "G#m  C#m", "Toda criação: Santo", "F#m7  B", "Exaltado És, Santo", "E", "Santo pra sempre");
  SANTO_SHEET_LINES.push("A  B", "O Teu povo canta: Santo", "G#m  C#m", "Sim, ao Rei dos reis: Santo", "F#m7  B", "Tu sempre serás, Santo", "E", "Santo pra sempre");
  SANTO_SHEET_LINES.push("", "[Pré-Refrão]", "A  B  C#m  F#m", "", "[Refrão Final]", "A  B  G#m  C#m  F#m7  E", "", "[Final]", "F#m7  B  E");
  const SANTO_SHEET = SANTO_SHEET_LINES.join("\n");

  const DEMO_SONGS = Object.freeze([
    demoSong("demo-ah-jesus-coracao-igual-ao-teu", "Ah, Jesus / Coração Igual ao Teu", "Julliany Souza", "G", [
      ["Intro", "C  G  Am"], ["Primeira Parte", "G  Em  Am  G  C  Cm", "Quem foi muito perdoado"],
      ["Pré-Refrão", "C  D  Em  G  Bm7", "Não adianta fingir"], ["Refrão 1", "C  Bm7  Am  G", "Ah, Jesus"],
      ["Segunda Parte", "C  Bm7  Am7  G  Am", "Eu sou o vaso"], ["Pré-Refrão 2", "C  G  Am  D", "Dá-me um coração igual ao Teu"],
      ["Refrão 2", "G  C  D  Em  Am", "Coração disposto a obedecer"], ["Ponte", "C  G  Am", "Judas veio ao Teu encontro"],
      ["Final", "C  G  Em  Am  Am7  Bm7  Cm  D"]
    ], "Resumo harmônico: em G, começa em confissão, cresce no pré-refrão e em Ah, Jesus, conecta com Coração Igual ao Teu, passa pela ponte narrativa e retorna aos dois refrões antes do final.", AH_JESUS_SHEET),
    demoSong("demo-cultura-do-ceu", "Cultura do Céu", "Davi Fernandes", "C", [
      ["Intro", "F  Am  G"], ["Verso", "F  Am  G", "Aqui na terra como no céu"],
      ["Ponte", "F  G", "Venha o Teu Reino"], ["Final", "F  Am  G  Em", "Te convidamos"]
    ], "Resumo harmônico: em C, sustenta o verso no ciclo F-Am-G, abre a ponte em F-G e encerra com o convite final passando por F-Am-G-Em.", CULTURA_SHEET),
    demoSong("demo-digno-e-o-senhor", "Digno É o Senhor", "Felipe Rodrigues", "E", [
      ["Intro", "C#m7  B4  A2"], ["Primeira Parte", "A2  E  B4  F#m  C#m7", "Graças eu Te dou"],
      ["Segunda Parte", "A2  E  B4  F#m7(11)  C#m7", "Pelos cravos em Suas mãos"],
      ["Refrão", "E  B4  F#m7(11)  A2  C#m7  E7M", "Digno é o Senhor"],
      ["Final", "E  E7M  F#m  A2  B4  C#m7", "Digno é o Senhor"]
    ], "Resumo harmônico: em E, alterna duas partes de gratidão com um refrão amplo; F#m7(11), C#m7, A2, B4 e E7M definem a condução até o refrão final.", DIGNO_SHEET),
    demoSong("demo-santo-pra-sempre", "Santo Pra Sempre", "Ana Nóbrega", "E", [
      ["Intro", "A  B  G#m  C#m"], ["Primeira Parte", "E  A  C#m  B", "As muitas gerações"],
      ["Pré-Refrão", "A  B  C#m  F#m", "Teu nome é o mais alto"],
      ["Refrão", "A  B  G#m  C#m  F#m7  E", "E os anjos clamam: Santo"],
      ["Segunda Parte", "E  A  C#m  B", "Quem foi perdoado"], ["Final", "F#m7  B  E"]
    ], "Resumo harmônico: em E, parte do ciclo A-B-G#m-C#m, apresenta verso e pré-refrão, abre no refrão congregacional e retorna com a segunda parte antes do final em F#m7-B-E.", SANTO_SHEET)
  ]);

  function demoSong(id, title, artist, key, blocks, summary, fullContent) {
    const blocos = blocks.map(([l, c, hook]) => ({
      l,
      c: `${hook ? `${hook}...` : l}\n${c}`
    }));
    return {
      id, title, artist, key, capo: "", blocos, demo: true, summary,
      fullChordSheet: { visibility: "private", source: "user_text", content: fullContent },
      sourceInfo: { type: "manual", name: "PDF fornecido pelo usuário", url: null }
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
  function isDemoSong(song) { return DEMO_SONGS.some((demo) => String(demo.id) === String(song && song.id)); }
  function catalog() { return clone(DEMO_SONGS); }
  function migrate(songs) {
    const source = Array.isArray(songs) ? songs : [];
    return { songs: clone(source), removed: 0, seeded: false };
  }
  function demoMedley() {
    return [
      { musicTitle: "Nada Além do Sangue", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 0, label: "Intro / Primeira Parte", key: "A", capo: 1,
        chords: "A  F#m  A  F#m\n\nA  F#m7  A\nTeu sangue leva-me além a todas as alturas\nF#m7\nOnde ouço a Tua voz\nE  D9\nFala de Tua justiça pela minha vida\nA  F#m7  E\nJesus, este é o Teu sangue" },
      { musicTitle: "Nada Além do Sangue", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 1, label: "Refrão", key: "A", capo: 1,
        chords: "A9\nQue nos lava dos pecados\nF#m7\nE nos traz restauração\nE\nNada além do sangue\nD9  A  E  D9\nNada além do sangue de Jesus\nA9\nQue nos faz brancos como a neve\nF#m7\nAceitos como amigos de Deus" },
      { musicTitle: "Nada Além do Sangue", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 2, label: "Ponte / Transição", key: "A", capo: 1,
        chords: "A  F#m7\nEu sou livre, eu sou livre\nE\nNada além do sangue\nD9  A  E  D9\nNada além do sangue de Jesus\n\nA" },
      { musicTitle: "Alvo Mais Que a Neve", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 3, label: "Entrada", key: "A", capo: 1,
        chords: "A  E\nAlvo mais que a neve\nBm7  E  F#m7\nAlvo mais que a neve\nA/C#  D\nSe nesse sangue, lavado\nA/E  E  A\nMais alvo que a neve serei" },
      { musicTitle: "Alvo Mais Que a Neve", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 4, label: "Repetição", key: "A", capo: 1,
        chords: "A  E\nAlvo mais que a neve\nBm7  E  F#m7\nAlvo mais que a neve\nA/C#  D\nSe nesse sangue, lavado\nA/E  E  A\nMais alvo que a neve serei" },
      { musicTitle: "Nada Além do Sangue", musicId: "demo-medley-nada-alem-alvo", blocoIdx: 5, label: "Retorno / Final", key: "A", capo: 1,
        chords: "A  F#m7\nEu sou livre, eu sou livre\nE\nNada além do sangue\nD9  A  E  D9  A\nNada além do sangue de Jesus" }
    ];
  }
  function loadMedley(storage, isNewLibrary) {
    const current = storage.get(MEDLEY_KEY, null);
    if (Array.isArray(current)) return current;
    for (const key of LEGACY_MEDLEY_KEYS) { const legacy = storage.get(key, null); if (Array.isArray(legacy)) return legacy; }
    const initial = isNewLibrary ? demoMedley() : [];
    if (isNewLibrary) storage.set(MEDLEY_KEY, initial);
    return initial;
  }
  function saveMedley(storage, medley) { return storage.set(MEDLEY_KEY, Array.isArray(medley) ? medley : []); }
  function markMigrated(storage, details) { storage.set(MIGRATION_KEY, { version: 1, ...details }); }

  global.demoLibrary = Object.freeze({ catalog, migrate, signature, isLegacyCatalogSong, isDemoSong, loadMedley, saveMedley, markMigrated, migrationKey: MIGRATION_KEY });
})(window);
