# Busca unificada de músicas — revisão local

Branch: `codex/busca-biblioteca-unificada`, criada de `ac62793`, na worktree existente `reconhecimento-dedicacao-20261104`. Sem commit, push, PR, merge ou deploy desta alteração. Os ajustes de áudio e placeholder pendentes foram preservados.

## Diagnóstico e decisões

A tela de Buscar fazia três renderizações separadas: biblioteca (`musicas`), versões do catálogo e candidatos externos. O botão + abria a revisão no editor, apesar de aparentar salvar. A busca da Home e os seletores de repertório continuam usando seus fluxos próprios; não foram redesenhados.

A biblioteca pessoal tem cache separado por proprietário em `songRepository` e confirmação remota em `librarySync`. Playlists podem conter referências e cópias compartilhadas; pertencer a uma playlist não prova que a música está salva na biblioteca. A nova busca consulta apenas a biblioteca para apresentar o estado salvo. Não altera itens de playlists ou repertórios.

A linha abre Estudo quando a música está na biblioteca; um resultado externo abre a revisão existente, sem salvar automaticamente. O + resolve a música, grava na biblioteca e aguarda confirmação pelo sincronizador existente. Falhas preservam a cópia local, mas não produzem uma nova confirmação remota de sucesso. O relógio indica uma cópia aguardando confirmação; permite tentar novamente. Visitantes precisam entrar na conta para salvar.

Identificação: IDs de catálogo, provedor e fonte; ISRC/Spotify; URL de origem; por último metadados completos de título + artista + versão/álbum + tom. Nunca apenas título. IDs de versões do catálogo diferentes permanecem separados. Quando a resolução encontra uma música já existente, guarda um alias mínimo de identidade (máximo 20), para reconhecer a mesma fonte após recarregar. Não altera conteúdo musical para deduplicar.

## UI e pesquisa

Campo arredondado com lupa, limpar e Cancelar externo. Microfone só aparece quando SpeechRecognition/webkitSpeechRecognition está disponível; a gravação de voz depende da permissão do navegador. Sugestões derivadas exclusivamente dos títulos e artistas encontrados, sem criar versões ou artistas fictícios. Digitação com debounce de 180 ms; consultas anteriores são abortadas/invalidadas. Resultados locais permanecem utilizáveis quando uma consulta remota falha. Não há linha fictícia baseada apenas no texto digitado.

Lista contínua: capa/placeholder, título, artista, +/check azul e ações secundárias existentes para músicas locais. Estados de carregamento e erro acessíveis, alvos de 44 px, truncamento e ausência de overflow horizontal. Mantidos o cabeçalho de exploração, a retomada, o rail Feito para você, navegação e identidade ROUDY.

Pesquisa Apple: HIG Search fields (`design/human-interface-guidelines/search-fields`), lida via apple-docs. Orientação explícita: lupa/limpar/placeholder e pesquisa enquanto digita; sugestões e resultados relevantes. Decisão de produto ROUDY: retirar a divisão por origem, usar uma lista musical e separar abrir de salvar. Não é uma exigência literal da Apple nem uma cópia da identidade Spotify.

## Arquivos desta alteração

- `js/song-search.js`: orquestração, identidade, aquisição, fila de salvamento, confirmação e sugestões.
- `js/search-menu.js`: renderização e interações; cancelamento e descarte por troca de conta.
- `index.html`: campo, lista, ponte com a biblioteca existente e carregamento do módulo.
- `css/search-menu.css`: apresentação e responsividade da lista.
- `service-worker.js`: novo módulo no cache e versão dos recursos.
- `package.json`: comando test:search.
- `tests/song-search.test.js`: abertura/salvamento distintos, duplicatas, versões, sugestões, falha e troca de conta.
- `tests/song-search-sync.test.js`: repositório e sincronizador reais com transporte simulado; confirmação, recarga e idempotência.
- `tests/song-search-ui.test.js`: página real com dados de teste, 375/390/430/820 px, estados e controles.
- `tests/search-menu-source.test.js`, `tests/search-menu-ui.test.js`, `tests/index-syntax.test.js`: expectativas atualizadas para a UI aprovada.

Nenhuma mudança de backend, dependência nova ou alteração na lógica musical. `css/event-chat-audio.css` e `js/event-chat-audio.js` já estavam modificados antes desta tarefa; continuam pendentes, sem novas alterações de áudio nesta etapa.

## Validação

- 79 arquivos distintos das suítes padrão e contextual: passaram.
- Novos testes de busca e sincronização, checagem estrutural da Busca e teste PWA: passaram.
- Testes no Chrome: nova busca em quatro larguras; busca existente, ações de playlist, adicionar música de evento à biblioteca e limite inferior/safe areas em oito combinações: passaram.
- A primeira execução do PWA não encontrou Playwright no ambiente; repetida com NODE_PATH do runtime e passou.
- A revisão visual encontrou placeholder sem dimensões; corrigido e novamente validado.
- Teste antigo da Busca tentava fechar o menu de músicas com uma função de outro sheet; atualizado para closeSongOptions e passou.
- git diff --check: sem erros.

## Limites e revisão manual

Os testes não fizeram gravações na conta real. Validar no iPhone/Safari e PWA instalada: teclado real, ditado/permissão de voz, fontes disponíveis com autenticação, salvar/recarregar/sair/entrar e outro aparelho. A confirmação e o transporte foram exercitados com os módulos reais e respostas simuladas; não equivalem a um teste end-to-end em produção.

A deduplicação é conservadora quando faltam metadados: duas fontes podem permanecer como resultados separados até a resolução. Também não há garantia transacional entre duas abas que adicionem simultaneamente uma música desconhecida; cada aba bloqueia seus próprios envios repetidos e reutiliza músicas já encontradas. Nenhuma rota/tabela nova foi criada para tentar resolver essa condição.

A captura de revisão usa dados de teste, não resultados fictícios adicionados ao ambiente real. O Preview 127 anterior não foi atualizado nesta etapa.
