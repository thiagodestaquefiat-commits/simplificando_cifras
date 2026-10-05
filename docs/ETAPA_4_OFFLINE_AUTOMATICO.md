# Etapa 4 — Repertórios offline automáticos

Implementação local sobre a integração `6cb3caa`, conforme a decisão do usuário: não há botão, selo, progresso ou mensagem de sucesso para preparação offline.

## Comportamento

- Ao receber/carregar eventos e músicas, as renderizações agendam gravação automática, sem precisar abrir o evento ou entrar no palco.
- Os pacotes guardam evento, ordem, bases musicais, formatos recebidos (resumo, editor, letra+cifra e tablatura), ajustes pessoais da identidade atual e preferências.
- Persistência em IndexedDB `roudy-event-offline-v1`, loja `accounts`; cada registro é separado por conta Supabase e identidade colaborativa. Visitante tem escopo próprio.
- Gravação transacional e conferência por leitura; falhas mantêm a cópia anterior e provocam aviso discreto, sem repetição a cada renderização. Renderizações sem mudanças não regravam dados.
- Não há expulsão automática após 12 eventos no novo armazenamento.
- Na ausência de uma música na playlist pessoal, a navegação do evento pode usar a cópia já recebida do pacote, ou sua cifra oficial recebida no próprio evento. Isso não reinsere a música na playlist nem envia dados ao catálogo.
- Reabertura offline usa a sessão Supabase já persistida e a identidade colaborativa previamente consultada para aquela conta. Não cria conta, não renova token e não autentica remotamente sem rede. Logout offline remove a sessão local e oculta os eventos privados.
- Realtime não bloqueia leitura quando não há internet ou SDK. Ao voltar a conexão, o login é revalidado e os fluxos existentes voltam a atualizar dados e pacotes.
- Ajustes pessoais pendentes também têm dono explícito na fila de envio. Trocar de conta não atribui nem envia os ajustes da conta anterior à nova. Operações antigas sem dono continuam preservadas no armazenamento, mas não são enviadas automaticamente por uma identidade desconhecida.

## Limites

Não é possível acessar conteúdo que o aparelho nunca recebeu. O pacote não inventa letra/cifra/tablatura ausente. Conteúdo faltante ou falha de armazenamento geram aviso, não indicador de disponibilidade. Limpeza dos dados do navegador, uso de outro aparelho, armazenamento privado/indisponível ou remoção pelo sistema podem eliminar cópias locais; esta entrega não promete proteção contra isso.

Não foram migradas todas as músicas da biblioteca pessoal para IndexedDB; repositórios e sincronização continuam compatíveis com o armazenamento atual. O novo armazenamento cuida dos repertórios dos eventos. Os ajustes não alteram o catálogo público, regras de contribuição, servidor ou dados de produção.

Vídeos, mapas, geração com IA, novo login e atualizações que ainda não chegaram continuam dependendo da internet. Reconhecimento de voz não é garantido offline.

## Verificações

- `event-offline.test.js`: salvamento, três formatos, deduplicação, 15 eventos, reabertura, escopos A/B, exclusões, quota e respostas tardias.
- `offline-auth.test.js`: restauração de sessão existente sem SDK/rede, logout e identidade colaborativa por conta.
- `event-offline-ui.test.js`: gravação automática antes de abrir evento, IndexedDB real, recarga offline com service worker, resumo/cifra/tablatura, leitura por cópia sem playlist pessoal, edição pessoal e sua reabertura offline, layout móvel/desktop e logout.
- Regressões de login, realtime, eventos, backup e cache PWA.

Servidor local: `http://127.0.0.1:4173/?eventos-offline=185`. Não houve deploy nem push.
