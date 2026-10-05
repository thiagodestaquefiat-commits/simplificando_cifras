# Salvamento explícito dos ajustes da música

Implementação local para músicas abertas da playlist pessoal. Não altera a versão oficial de eventos nem contribui alterações ao catálogo compartilhado.

Ao abrir a música, captura o estado inicial. O botão “Salvar alterações” no final da página aparece apenas quando a comparação com esse estado encontra diferenças; desfazer todas as mudanças oculta o botão. Após salvar com sucesso, o estado salvo vira a nova referência. Uma falha de armazenamento não confirma nem descarta o rascunho.

Campos acompanhados: transposição, capotraste, BPM e compasso do metrônomo, velocidade da rolagem, instrumento dos diagramas, visualização musical, tamanho da tablatura/fonte de palco e vínculo do vídeo (incluindo metadados). Configuração é armazenada em `playbackSettings` da música pessoal e metadados do vídeo, usando o repositório e sincronização pessoal existentes. Letras/cifras originais não são reescritas para aplicar transposição.

Durante o rascunho, ajustes do metrônomo e vídeo não são gravados automaticamente. Sair sem clicar em salvar descarta esses ajustes temporários. Reproduzir/pausar, posição da reprodução/rolagem, escuta do microfone e progresso de reconhecimento são estados transitórios, não alterações musicais persistentes. Edição de conteúdo continua usando o salvamento explícito do editor existente. Preferências globais de aparência/idioma permanecem globais.

Teste de interface: alterar/desfazer, salvar/reabrir tom/capo/BPM/compasso, vídeo em rascunho e retorno ao original, ajuste não salvo descartado. Suíte de regressão passa. Não houve push ou deploy.
