// MANUTENÇÃO: Sugestões para encerrar o culto/evento a partir da última música do repertório.
// MANUTENÇÃO: Funciona só no aparelho, sobre a biblioteca do próprio usuário — sem IA, sem custo e sem banco novo.
// MANUTENÇÃO: O tema vem da letra (não do título); o tom é resolvido por transposição na hora de adicionar.
(function (global) {
  "use strict";

  const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // Cada tema lista radicais (já sem acento). Uma palavra conta para o tema se começa com o radical.
  const THEMES = Object.freeze({
    cruz: ["cruz", "calvario", "sangue", "cordeiro", "cravo", "sacrifici", "madeiro", "crucific", "morreu", "ferida", "lado aberto"],
    graca: ["graca", "perdao", "perdo", "misericord", "redenc", "redim", "resgat", "pecad", "culpa", "salvac", "salvou", "lavou", "purific"],
    fidelidade: ["fiel", "fidelidade", "promess", "alianca", "cumpr", "nunca falh", "jamais falh", "nao falh"],
    entrega: ["entreg", "rendo", "render", "rendid", "quebrant", "altar", "submet", "oferta", "sou teu", "tudo que sou"],
    espirito: ["espirito", "fogo", "chama", "aviv", "uncao", "ungi", "derram", "chuva", "vento", "renov", "pentecost", "agua viva", "rio"],
    adoracao: ["ador", "exalt", "louv", "digno", "gloria", "majestade", "trono", "aleluia", "hosana", "santo", "magnific", "rei dos reis", "senhor dos senhores"],
    presenca: ["presenca", "intim", "abraco", "tua face", "contigo", "habit", "morar", "teu colo", "perto de ti", "teus bracos"],
    confianca: ["confi", "cuid", "pastor", "descans", "refugio", "abrigo", "rocha", "escudo", "socorr", "temer", "medo", "seguro", "fortaleza", "sustent"],
    vitoria: ["vitori", "venc", "batalha", "guerr", "milagr", "poder", "cura", "curar", "libert", "cadeia", "corrente", "gigante", "muralha", "impossivel", "inimigo"],
    consolo: ["esperanc", "consol", "lagrima", "chor", "deserto", "vale", "restaur", "aflic", "tempestade", "sofri", "dor", "cansad", "recomec"],
    amor: ["amor", "amou", "amado", "amar", "me ama", "te amo"],
    eternidade: ["volta", "voltar", "ceu", "eterni", "nuvens", "trombeta", "maranata", "jerusalem", "para sempre", "galardao"],
    missao: ["nacoes", "evangel", "missao", "colheita", "seara", "anunci", "proclam", "ide ", "povos"],
    gratidao: ["gratid", "obrigad", "agradec", "grato"],
    caminho: ["caminh", "direc", "guia", "conduz", "lampada", "tua palavra", "teus passos", "proposito", "chamado"]
  });

  const STOPWORDS = new Set(("a o e de da do das dos em no na nos nas um uma uns umas que se me te nos vos lhe eu tu ele ela nos vos eles elas " +
    "meu minha meus minhas teu tua teus tuas seu sua seus suas por para pra pro com sem sob sobre ate como mais menos muito pouco " +
    "ja nao sim so tao tambem quando onde quem qual quais porque pois mas ou nem isso isto aquilo esse essa este esta aquele aquela " +
    "ao aos as os la ai oh ah uh ou eh ho hey yeah vem vai sou es foi ser estar estou esta estao tem ter tenho ha hoje aqui " +
    "todo toda todos todas tudo nada cada outro outra coro refrao intro ponte final repete bis vez vezes deus senhor jesus").split(/\s+/));

  const CHORD_TOKEN = /^\(?[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:[#b+\-]?[0-9]+)*(?:\([^)]*\))?(?:\/[A-G](?:#|b)?)?\)?$/;
  const cache = new Map();

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isChordLine(line) {
    const tokens = String(line || "").trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return false;
    const chords = tokens.filter((token) => CHORD_TOKEN.test(token.replace(/[|.,]/g, "")) || /^[|x0-9:]+$/i.test(token));
    return chords.length / tokens.length >= 0.6;
  }

  function lyricsOf(song) {
    if (!song || typeof song !== "object") return "";
    const parts = [];
    (Array.isArray(song.blocos) ? song.blocos : []).forEach((block) => { if (block && block.l) parts.push(String(block.l)); });
    const full = song.fullChordSheet;
    if (full && Array.isArray(full.sections) && full.sections.length) {
      full.sections.forEach((section) => (section && Array.isArray(section.linhas) ? section.linhas : []).forEach((line) => {
        if (line && line.letra) parts.push(String(line.letra));
      }));
    } else if (full && full.content) {
      String(full.content).split(/\r?\n/).forEach((line) => {
        if (line.trim() && !isChordLine(line) && !/^\s*\[.*\]\s*$/.test(line)) parts.push(line);
      });
    }
    return parts.join("\n");
  }

  function profile(song) {
    const cacheKey = song && song.id != null ? `${song.id}|${song.updatedAt || ""}` : null;
    if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
    const text = normalize(lyricsOf(song));
    const padded = ` ${text} `;
    const words = text ? text.split(" ") : [];
    const themes = {};
    Object.entries(THEMES).forEach(([theme, stems]) => {
      let hits = 0;
      stems.forEach((stem) => {
        if (stem.includes(" ")) {
          let from = 0;
          const needle = ` ${stem.trim()}`;
          while ((from = padded.indexOf(needle, from)) !== -1) { hits += 1; from += needle.length; }
        } else {
          words.forEach((word) => { if (word.startsWith(stem)) hits += 1; });
        }
      });
      if (hits) themes[theme] = hits;
    });
    const terms = {};
    words.forEach((word) => {
      if (word.length < 4 || STOPWORDS.has(word) || /^\d+$/.test(word)) return;
      const stem = word.length > 5 ? word.replace(/(s|es|mente)$/, "") : word;
      terms[stem] = (terms[stem] || 0) + 1;
    });
    const result = { hasLyrics: words.length >= 12, themes, terms };
    if (cacheKey) {
      if (cache.size > 2000) cache.clear();
      cache.set(cacheKey, result);
    }
    return result;
  }

  function cosine(left, right) {
    let dot = 0, leftNorm = 0, rightNorm = 0;
    Object.entries(left).forEach(([key, value]) => { leftNorm += value * value; if (right[key]) dot += value * right[key]; });
    Object.values(right).forEach((value) => { rightNorm += value * value; });
    return dot && leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
  }

  function parseKey(value) {
    const match = String(value || "").trim().match(/^([A-G](?:#|b)?)(m(?!aj))?/);
    if (!match) return null;
    let index = SHARP.indexOf(match[1]);
    if (index < 0) index = FLAT.indexOf(match[1]);
    return index < 0 ? null : { index, minor: Boolean(match[2]) };
  }

  // Semitons para levar a música ao tom do alvo. Modos diferentes usam o relativo (Am ≈ C).
  function semitonesTo(fromKey, toKey) {
    const from = parseKey(fromKey), to = parseKey(toKey);
    if (!from || !to) return 0;
    const fromIndex = from.minor === to.minor ? from.index : from.index + (from.minor ? 3 : 0);
    const toIndex = from.minor === to.minor ? to.index : to.index + (to.minor ? 3 : 0);
    return ((toIndex - fromIndex) % 12 + 12) % 12;
  }

  function keyDistance(fromKey, toKey) {
    const shift = semitonesTo(fromKey, toKey);
    return Math.min(shift, 12 - shift);
  }

  function identity(song) {
    return normalize(song && song.title);
  }

  function suggest(options) {
    const settings = options || {};
    const reference = settings.reference;
    const targetKey = settings.targetKey || (reference && reference.key) || "";
    const limit = Math.max(1, Number(settings.limit) || 3);
    const excluded = new Set((settings.excludeIds || []).map(String));
    const excludedTitles = new Set((settings.excludeTitles || []).map(normalize).filter(Boolean));
    if (reference) excludedTitles.add(identity(reference));
    const base = profile(reference);
    if (!base.hasLyrics) return [];
    const seen = new Set();

    const scored = (Array.isArray(settings.candidates) ? settings.candidates : []).map((song) => {
      if (!song || excluded.has(String(song.id))) return null;
      const title = identity(song);
      if (!title || excludedTitles.has(title) || seen.has(title)) return null;
      seen.add(title);
      const candidate = profile(song);
      if (!candidate.hasLyrics) return null;
      const themeScore = cosine(base.themes, candidate.themes);
      const lyricScore = cosine(base.terms, candidate.terms);
      if (themeScore < 0.35 && lyricScore < 0.12) return null;
      const distance = keyDistance(song.key, targetKey);
      const keyBonus = distance === 0 ? 0.1 : distance <= 2 ? 0.04 : 0;
      const sharedThemes = Object.keys(base.themes)
        .filter((theme) => candidate.themes[theme])
        .sort((a, b) => (base.themes[b] + candidate.themes[b]) - (base.themes[a] + candidate.themes[a]));
      return {
        song,
        score: themeScore * 0.65 + lyricScore * 0.35 + keyBonus,
        sharedThemes,
        semitones: semitonesTo(song.key, targetKey),
        keyDistance: distance
      };
    }).filter(Boolean);

    return scored
      .sort((a, b) => b.score - a.score || String(a.song.title || "").localeCompare(String(b.song.title || ""), "pt-BR"))
      .slice(0, limit);
  }

  const THEME_LABELS = Object.freeze({
    cruz: "Cruz", graca: "Graça", fidelidade: "Fidelidade", entrega: "Entrega", espirito: "Espírito Santo",
    adoracao: "Adoração", presenca: "Presença", confianca: "Confiança", vitoria: "Vitória", consolo: "Consolo",
    amor: "Amor de Deus", eternidade: "Eternidade", missao: "Missão", gratidao: "Gratidão", caminho: "Direção"
  });

  global.closingSuggestions = Object.freeze({
    suggest,
    profile,
    lyricsOf,
    semitonesTo,
    keyDistance,
    themeLabel: (theme) => THEME_LABELS[theme] || theme
  });
})(typeof window !== "undefined" ? window : globalThis);
