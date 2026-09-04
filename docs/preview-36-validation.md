# Preview #36: palco e leitura musical

Somente `codex/classificacao-identidade`. Não fazer merge nem publicar em produção antes da nova validação manual.

## Causas e correções

- `renderDetail` sobrescrevia `currentSongView` com `full` em todo render de palco; `openDetail` também reiniciava a seleção na navegação. Agora a seleção existente governa ambos os modos e permanece entre músicas com cifra completa. Músicas sem cifra completa usam o resumo disponível.
- A extração PDF removia somente bordas e uma legenda extensa com espaçamento específico e linhas numéricas. A limpeza compartilhada agora trata contexto técnico explícito antes da IA e na transcrição estruturada. Acordes isolados e seções instrumentais são preservados; casos ambíguos não são classificados como legenda só pelo número de acordes.
- O vocabulário da própria IA validava os acordes do resumo. Quando há texto extraído, somente o texto limpo fornecido pode validar acordes e hooks. Em imagens/PDF escaneado, a transcrição estruturada ainda depende da fidelidade visual do modelo.
- A grafia exibida não aplica aliases como B4 → Bsus4 ou C7M → Cmaj7. A forma canônica continua separada para comparação interna. Não há substituição específica por música/artista.
- Hooks aparecem antes das progressões; nomes de seção não acompanham hooks. Duplicatas iguais são omitidas da referência; contagens locais exigem evidência, e o corte arbitrário em 12 blocos foi removido. Seções reais continuam disponíveis como fallback.
- Nenhuma alteração de schema, migração de biblioteca, armazenamento de identidade, `/identity/claim`, banco de dados ou configuração de produção. O service worker recebe uma nova versão de cache dos arquivos do aplicativo; não modifica localStorage.

## Validação

- 120 testes backend, com provider simulado e SQLite em memória; zero chamadas reais à OpenAI.
- 25 testes principais frontend; regressão de identidade com 136 músicas simuladas.
- Testes de palco nas duas abas com Auto Scroll real, Capo, transposição, navegação e ausência de mutação do Song, em mobile/desktop.
- Classificação global, Auto Scroll 0,40x–2,00x em seis viewports, PWA/offline, YouTube, Eventos, editor e consistência do resumo.
- Fixtures sintéticas cobrem afinação, metadados, diagramas explícitos/rodapé, números técnicos, intro/interlúdio/solo, extensões/inversões, grafia exata, hooks e acordes ausentes da fonte, duplicatas e repetições.
- A regra antiga de largura desktop 1366×768 permanece uma exceção preexistente autorizada; não foi alterada.

Recomenda-se uma chamada real controlada com PDF representativo após autorização explícita, para avaliar OCR e qualidade semântica. Os testes simulados não demonstram fidelidade de OCR real. A biblioteca do celular não foi acessada; preservação validada por regressões e ausência de rotinas de migração/limpeza.
