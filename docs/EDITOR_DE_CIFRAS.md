# Editor de cifras

O editor dedicado aceita músicas existentes e rascunhos de origem manual, importada ou IA. A integração pública é `openSongEditor(data, options)` e não depende de um provedor de IA.

```js
openSongEditor({
  source: "ai",
  status: "draft",
  title: "...",
  artist: "...",
  originalKey: "G",
  currentKey: "G",
  sections: []
}, { onSave(song) { /* integrar com a biblioteca */ } });
```

## Formato editorial v3

O modelo separa metadados, seções, linhas, letra e acordes posicionados. Ao salvar, `song-format.js` também produz `key`, `capo`, `instrumento` e `blocos`, mantendo compatibilidade com busca, playlists, medleys, palco e exportação atuais.

```js
{
  id: "local-...",
  title: "Nome",
  artist: "Artista",
  originalKey: "G",
  currentKey: "A",
  capo: 0,
  instrument: "guitar",
  bpm: null,
  status: "draft",
  source: "manual",
  aiGenerated: false,
  reviewedByUser: false,
  sections: [{
    id: "section-...",
    type: "verse",
    label: "Verso",
    lines: [{
      id: "line-...",
      lyrics: "Letra",
      chords: [{ id: "chord-...", chord: "G", position: 0 }]
    }]
  }],
  notes: "",
  createdAt: "...",
  updatedAt: "..."
}
```

Rascunhos são persistidos em `sc_song_editor_drafts_v1`. Músicas definitivas continuam na coleção atual e carregam o modelo em `editorData`, além dos campos legados.

## Módulos

- `song-format.js`: normalização e adaptadores;
- `song-editor-state.js`: operações e transposição;
- `song-editor-history.js`: desfazer/refazer da sessão;
- `song-editor-validation.js`: validação de música e acordes;
- `chord-simplifier.js`: sugestões não destrutivas;
- `song-editor-renderer.js`: DOM seguro, preview e resumo;
- `song-editor.js`: ciclo de vida, persistência e integração;
- `song-editor.css`: layout mobile/desktop.

Texto editável é renderizado com `textContent` ou `value`. Dados normalizados removem caracteres de controle e delimitadores HTML antes de voltar à interface legada.
