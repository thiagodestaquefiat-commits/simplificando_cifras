// MANUTENÇÃO: Partituras da música (PDF ou MusicXML), exibidas como página extra na tela da música.
// - MusicXML (.musicxml/.xml/.mxl) fica dentro da música (compactado), sincroniza com a biblioteca e
//   acompanha o Tom (transposição feita pelo OpenSheetMusicDisplay).
// - PDF fica guardado só neste aparelho (IndexedDB), porque a biblioteca vive no localStorage e um PDF
//   enche o espaço rápido. A música guarda só o nome/tamanho, para avisar nos outros aparelhos.
// - Bibliotecas externas são carregadas só quando a página Partitura é aberta.
(function (global) {
  "use strict";

  const OSMD_URL = "https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.9/build/opensheetmusicdisplay.min.js";
  const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  const DB_NAME = "roudy-partituras";
  const STORE = "files";
  const MAX_PDF_BYTES = 15 * 1024 * 1024;
  const MAX_XML_STORED_CHARS = 450 * 1024; // a música inteira precisa caber no limite da sincronização
  const FORMATS = ["musicxml", "pdf"];

  function text(value) { return String(value == null ? "" : value).trim(); }

  function normalize(value) {
    if (!value || typeof value !== "object" || !FORMATS.includes(value.format)) return null;
    const base = { format: value.format, name: text(value.name).slice(0, 160) || "Partitura", size: Math.max(0, Number(value.size) || 0), addedAt: text(value.addedAt) || null };
    if (value.format === "musicxml") {
      const encoding = value.encoding === "gzip-base64" ? "gzip-base64" : "text";
      const data = typeof value.data === "string" ? value.data : "";
      return data ? { ...base, encoding, data } : null;
    }
    const fileKey = text(value.fileKey);
    return fileKey ? { ...base, fileKey } : null;
  }

  // ── Scripts externos (carregados uma vez, sob demanda) ──
  const loading = new Map();
  function loadScript(url, globalName) {
    if (global[globalName]) return Promise.resolve(global[globalName]);
    if (loading.has(url)) return loading.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url; script.async = true;
      script.onload = () => global[globalName] ? resolve(global[globalName]) : reject(new Error("Biblioteca de partitura indisponível."));
      script.onerror = () => { loading.delete(url); reject(new Error("Não foi possível carregar o leitor de partitura. Verifique a internet e tente de novo.")); };
      document.head.appendChild(script);
    });
    loading.set(url, promise);
    return promise;
  }

  // ── Compactação do MusicXML (gzip nativo do navegador, com plano B em texto puro) ──
  function bytesToBase64(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(binary); }
  function base64ToBytes(value) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
  async function compress(xml) {
    if (typeof global.CompressionStream !== "function") return { encoding: "text", data: xml };
    const stream = new Blob([xml]).stream().pipeThrough(new global.CompressionStream("gzip"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    return { encoding: "gzip-base64", data: bytesToBase64(bytes) };
  }
  async function xmlOf(sheet) {
    if (sheet.encoding !== "gzip-base64") return sheet.data;
    if (typeof global.DecompressionStream !== "function") throw new Error("Este navegador não consegue abrir a partitura. Atualize o navegador.");
    const stream = new Blob([base64ToBytes(sheet.data)]).stream().pipeThrough(new global.DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  // ── PDF guardado neste aparelho ──
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error("Este navegador não permite guardar PDF no aparelho.")); return; }
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento de partituras."));
    });
  }
  async function dbRun(mode, action) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), request = action(store);
        let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("Não foi possível guardar a partitura neste aparelho."));
      });
    } finally { db.close(); }
  }
  const putFile = (key, blob) => dbRun("readwrite", (store) => store.put(blob, key));
  const getFile = (key) => dbRun("readonly", (store) => store.get(key));
  const deleteFile = (key) => dbRun("readwrite", (store) => store.delete(key));

  // ── Importação ──
  function kindOf(file) {
    const name = String(file && file.name || "").toLowerCase();
    if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
    if (name.endsWith(".mxl")) return "mxl";
    if (name.endsWith(".musicxml") || name.endsWith(".xml") || /musicxml|xml/.test(file.type || "")) return "musicxml";
    return null;
  }
  async function unzipMxl(file) {
    const JSZip = await loadScript(JSZIP_URL, "JSZip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let path = null;
    const container = zip.file("META-INF/container.xml");
    if (container) {
      const doc = new DOMParser().parseFromString(await container.async("string"), "application/xml");
      path = doc.querySelector("rootfile")?.getAttribute("full-path") || null;
    }
    if (!path) path = Object.keys(zip.files).find((name) => !name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(name)) || null;
    const entry = path && zip.file(path);
    if (!entry) throw new Error("O arquivo .mxl não tem uma partitura MusicXML dentro.");
    return entry.async("string");
  }
  function validateXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("O arquivo não é um MusicXML válido.");
    const root = doc.documentElement && doc.documentElement.nodeName;
    if (root !== "score-partwise" && root !== "score-timewise") throw new Error("O arquivo não é uma partitura MusicXML. No MuseScore, use Arquivo → Exportar → MusicXML.");
  }
  function newKey() { return "pt-" + (global.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)); }

  async function importFile(file) {
    const kind = file && kindOf(file);
    if (!kind) throw new Error("Escolha um PDF ou um MusicXML (.musicxml, .xml ou .mxl).");
    const now = new Date().toISOString();
    if (kind === "pdf") {
      if (file.size > MAX_PDF_BYTES) throw new Error("O PDF passa de 15 MB. Envie um arquivo menor.");
      const fileKey = newKey();
      await putFile(fileKey, new Blob([await file.arrayBuffer()], { type: "application/pdf" }));
      return normalize({ format: "pdf", name: file.name, size: file.size, addedAt: now, fileKey });
    }
    const xml = kind === "mxl" ? await unzipMxl(file) : await file.text();
    validateXml(xml);
    const packed = await compress(xml);
    if (packed.data.length > MAX_XML_STORED_CHARS) throw new Error("Esta partitura é grande demais para sincronizar. Tente exportar só a parte da melodia ou do seu instrumento.");
    return normalize({ format: "musicxml", name: file.name, size: file.size, addedAt: now, ...packed });
  }

  async function discard(sheet) {
    const value = normalize(sheet);
    if (value && value.format === "pdf") { try { await deleteFile(value.fileKey); } catch (_) {} }
  }

  // ── Exibição ──
  // Guarda o último desenho para não redesenhar a cada atualização da tela (mesma partitura, tom e tamanho).
  let cache = { key: null, node: null };
  function cacheKey(sheet, options, width) { return [sheet.format, sheet.fileKey || sheet.data.length + ":" + sheet.data.slice(0, 64), options.semitones || 0, options.zoom || 1, Math.round(width / 40)].join("|"); }

  function message(container, html) { container.innerHTML = `<p class="sheet-music-status">${html}</p>`; }

  async function renderMusicXml(target, sheet, options) {
    const lib = await loadScript(OSMD_URL, "opensheetmusicdisplay");
    const xml = await xmlOf(sheet);
    const osmd = new lib.OpenSheetMusicDisplay(target, { autoResize: false, backend: "svg", drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false, drawCredits: false, drawPartNames: false });
    await osmd.load(xml);
    const semitones = Number(options.semitones) || 0;
    if (semitones && lib.TransposeCalculator) {
      osmd.TransposeCalculator = new lib.TransposeCalculator();
      osmd.Sheet.Transpose = ((semitones + 6) % 12 + 12) % 12 - 6; // sobe ou desce pelo caminho mais curto
      osmd.updateGraphic();
    }
    osmd.zoom = options.zoom || 1;
    osmd.render();
  }

  async function renderPdf(target, sheet, options, width) {
    const blob = await getFile(sheet.fileKey).catch(() => null);
    if (!blob) {
      message(target, `O PDF <strong>${escapeHtml(sheet.name)}</strong> foi enviado em outro aparelho e fica guardado só nele. Envie o arquivo de novo aqui para ver neste aparelho.`);
      return;
    }
    const pdfjs = await loadScript(PDFJS_URL, "pdfjsLib");
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const ratio = Math.min(2, global.devicePixelRatio || 1), cssWidth = Math.max(280, width) * (options.zoom || 1);
    target.innerHTML = "";
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
      const canvas = document.createElement("canvas");
      canvas.className = "sheet-music-pdf-page";
      canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
      canvas.style.width = Math.floor(viewport.width / ratio) + "px";
      canvas.setAttribute("aria-label", `Página ${number} de ${pdf.numPages}`);
      target.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

  async function render(container, sheetValue, options = {}) {
    const sheet = normalize(sheetValue);
    if (!container || !sheet) return;
    const width = container.clientWidth || 340, key = cacheKey(sheet, options, width);
    if (cache.key === key && cache.node) { container.replaceChildren(cache.node); options.onRendered?.(); return; }
    const target = document.createElement("div");
    target.className = "sheet-music-canvas";
    message(container, "Abrindo a partitura…");
    try {
      if (sheet.format === "musicxml") {
        // O OSMD mede o contêiner ao desenhar, então ele precisa estar na página.
        container.replaceChildren(target);
        await renderMusicXml(target, sheet, options);
      } else {
        await renderPdf(target, sheet, options, width);
        if (!container.isConnected) return;
        container.replaceChildren(target);
      }
      cache = { key, node: target };
    } catch (error) {
      if (container.isConnected) message(container, escapeHtml(error && error.message || "Não foi possível abrir a partitura."));
    }
    options.onRendered?.();
  }

  global.sheetMusic = Object.freeze({ normalize, importFile, discard, render, formatLabel: (sheet) => sheet && sheet.format === "pdf" ? "PDF" : "MusicXML", accept: ".pdf,.musicxml,.xml,.mxl,application/pdf,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml" });
})(window);
