# Inteligência Contextual — Fase 5

## Escopo

A Fase 5 adiciona linguagem contextual determinística entre Delivery Policy e a Home existente. Não altera Context Engine, Signals, Relevance, Priority, NBA, destinations, acknowledgement ou `SongReviewReceipt`. Não usa LLM, rede, chatbot, página, card ou configuração nova.

## Auditoria e integração

Na Fase 4, `context-delivery.js` acumulava duas responsabilidades: selecionar a superfície e escrever a copy. O menor ponto de integração foi extrair somente `copyFor` para `contextual-copy.js`.

Fluxo final:

`Context Engine → Signals → Relevance → NBA → Delivery Policy → Contextual Copy → Home existente`

Os dados consumidos já existiam na NBA: `actionType`, `reasonCode`, `fingerprint`, `eventId`, `repertoireItemId`, `eventPhase`, `pendingCount`, `evidenceIncomplete` e `relevantChanges`. Nome do evento e título da música são resolvidos a partir dos eventos já carregados.

## Catálogo

O catálogo centralizado cobre somente:

- `REVIEW_CHANGED_SONG`: genérica ou mudança de tom comprovada;
- `START_PREPARATION`: com contagem, sem contagem ou evento hoje;
- `CONTINUE_PREPARATION`: com contagem, sem contagem ou evento hoje;
- `ENTER_STAGE_MODE`: hoje ou fallback seguro;
- `NONE`: retorna `null`.

Cada resultado contém `messageKey`, `variantId`, `tone`, `variables`, `text`, `kicker`, `actionLabel` e `usedLlm: false`.

## Determinismo e segurança

A variante é escolhida por hash FNV-1a da fingerprint. A mesma fingerprint sempre produz o mesmo `variantId` e texto, inclusive após re-render. Uma nova fingerprint pode selecionar outra variante. Não existe `Math.random()`.

Quanto menor a evidência, menos específica é a frase. Before/after só aparece para `KEY_CHANGED` quando `evidenceIncomplete` é falso e ambos os valores são escalares, presentes e diferentes. Ausência de nomes usa “A música” ou “seu evento”; contagem desconhecida nunca vira zero.

Singular e plural são resolvidos explicitamente: “Falta 1 música” e “Faltam 2 músicas”. A lógica não trunca nomes; a Home continua responsável por layout.

## Separação preservada

- A copy não altera `destination`.
- Resolver ou renderizar copy não cria acknowledgement.
- CTA não cria `SongReviewReceipt` nem `READY`.
- “Agora não” continua sendo o único acknowledgement explícito da apresentação.
- “Marcar como preparado” continua sendo a única confirmação explícita da revisão.
- Tudo funciona offline e sem chamada externa.

## Exemplos

- Revisão: “A Alegria mudou desde a sua última preparação. Dá uma conferida?”
- Tom comprovado: “O tom de A Alegria mudou de G para A. Dá uma conferida?”
- Início: “Culto de Domingo está chegando. Tem 4 músicas para preparar.”
- Continuação: “Tá quase. Faltam 2 músicas para Culto de Domingo.”
- Palco: “Tudo pronto por aqui. Agora é palco.”

## Testes

`contextual-copy.test.js` cobre silêncio de `NONE`, todos os actionTypes, evidência incompleta, before/after confiável, contagem, singular/plural, campos ausentes, estabilidade por fingerprint, variação entre fingerprints, imutabilidade de destination, ausência de acknowledgement/receipt, offline e `usedLlm: false`.

Também foram executadas as regressões JavaScript das Fases 1–4: inteligência, relevância, delivery, receipts e sintaxe da aplicação. Python, Flask, pytest e npm não estavam disponíveis no ambiente; nenhum pacote foi instalado.

## Fase 5.1 — Expansão Editorial

### Auditoria de evidências

- A NBA entregue à copy contém contagens `pending`, `ready`, `changed` e `total`, todas derivadas de estados de preparação/receipts.
- `TODAY` é calculado pelo mesmo dia local. “Amanhã” é guardado por `APPROACHING` mais `hoursUntil` entre 0 e 24; o motor exclui o mesmo dia desse estado.
- Não há diferença de calendário na entrada da copy capaz de comprovar exatamente “3 dias”; essa frase permanece inativa.
- `KEY_CHANGED` possui `before/after` confiáveis quando `evidenceIncomplete` é falso.
- Existem signals de `SONG_ADDED`; a extensão cirúrgica abaixo passou a preservar essa evidência também na NBA de preparação enquanto o item adicionado continua pendente.
- Existe somente o último item aberto para uma experiência editorial legada. Não há contador confiável de aberturas, visitas, passadas ou revisitas diárias.
- Nenhuma telemetria foi criada. Abertura, scroll e reprodução continuam sem equivalência com preparação.

### Matriz editorial

| Copy | Estado | Evidência necessária | Contexto |
|---|---|---|---|
| “Você abriu ‘A Casa É Sua’ 8 vezes...” | UNSUPPORTED | `openCount=8` + título normalizado | Familiaridade |
| “7 passadas no repertório...” | UNSUPPORTED | contador real de passadas | Familiaridade |
| “Evento amanhã. Nada de descobrir o tom no palco.” | GUARDED | `APPROACHING` + `0≤hoursUntil≤24` + preparação pendente | START/CONTINUE |
| “Só falta uma música. Sempre tem uma.” | ACTIVE/GUARDED | `pendingCount=1` | CONTINUE |
| “...ansiedade para o soundcheck.” | EDITORIAL_REVIEW | aprovação editorial adicional | Inativa |
| “Terceira passada hoje...” | UNSUPPORTED | passadas do dia | Familiaridade |
| “Tudo certo... parte fácil: tocar.” | ACTIVE/GUARDED | `ENTER_STAGE_MODE` + READY/TODAY | Palco |
| “Você e esse repertório...” | UNSUPPORTED | repetição comprovada | Familiaridade |
| “{readyCount} músicas revisadas. Uma sobrevivente.” | ACTIVE/GUARDED | uma pendência + contagens consistentes + `changedCount=0` | CONTINUE |
| “...adicionou música em cima da hora.” | GUARDED | `SONG_ADDED` pendente + timestamp da adição a até 24h do evento | Alteração |
| “Música nova no repertório.” | ACTIVE/GUARDED | `SONG_ADDED` associado a item ainda pendente | Alteração |
| “Música nova no repertório. Respira. Ainda dá tempo.” | ACTIVE/GUARDED | `SONG_ADDED` + evento futuro com `hoursUntil` confiável | Alteração |
| “O tom mudou para {after}...” | ACTIVE/GUARDED | `KEY_CHANGED`, after escalar e evidência completa | REVIEW_CHANGED_SONG |
| “Você voltou para ‘Yeshua’...” | UNSUPPORTED | retorno comportamental confiável | Familiaridade |
| “Quarta vez em...” | UNSUPPORTED | contador confiável de visitas | Familiaridade |
| “Nenhuma música revisada...” | REJECTED | pressão negativa | Inativa |
| “Faltam 3 dias...” | UNSUPPORTED | diferença confiável de calendário = 3 | Temporal |
| “É hoje. Agora menos configuração...” | ACTIVE/GUARDED | `eventPhase=TODAY` + NBA existente | START/CONTINUE |
| “Repertório inteiro revisado. ROUDY oficialmente sem assunto.” | ACTIVE/GUARDED | `ENTER_STAGE_MODE` + READY/TODAY | Palco |
| “Tudo preparado. Pode fechar o app. Sério.” | ACTIVE/GUARDED | `ENTER_STAGE_MODE` + READY/TODAY | Palco |
| “Bom dia, {userName}...” | APPROVED_NOT_DELIVERABLE | superfície não-NBA apropriada | `NONE` continua `null` |

Também estão ativos com guards: “As outras duas sabem quem são” somente para duas pendências, contagens consistentes e nenhuma mudança stale; “Tem {pendingCount} músicas dando sopa” somente em START com contagem confiável; e as variantes genéricas da Fase 5 como fallback.

### Ordem de especificidade

Famílias específicas vencem as genéricas: uma pendência → duas pendências consistentes → TODAY → amanhã comprovado → com contagem → sem contagem. Mudança de tom comprovada vence mudança genérica. Finalizações só existem no catálogo de `ENTER_STAGE_MODE`, cuja NBA já exige READY e TODAY.

## Fase 5.1 — Extensão SONG_ADDED

### Origem e lacuna corrigida

O fato nasce na operação real de domínio. `addSongToEvent()` registra localmente `repertoire.song.added`; ao persistir, `_replace_repertoire()` cria o `EventChange` canônico com `change_type=SONG_ADDED`, `song_id`, `after.repertoireItemId`, ator e `created_at`. O backend já possuía esse schema e o Context Engine já normalizava a mudança e gerava o signal `SONG_ADDED`.

A semântica era perdida somente na construção da NBA agregada `START_PREPARATION`/`CONTINUE_PREPARATION`: a evidence levava contagens, mas descartava mudanças estruturadas. A correção preserva na operação local os mesmos IDs conhecidos e anexa à NBA existente apenas adições cuja música/item continua `NOT_STARTED`. Nenhuma NBA, prioridade, score ou Signal novo foi criado.

### Evidence e resolução

Cada mudança entregue em `evidence.relevantChanges` usa:

`{ type, changeId, eventId, songId, repertoireItemId, changedAt, hoursBeforeEvent, before, after }`

O `repertoireItemId` é lido do campo explícito ou de `after.repertoireItemId`; o timestamp vem de `EventChange.created_at`. A mesma identidade de mudança é deduplicada pelo mecanismo existente. A fingerprint da preparação continua derivada dos itens pendentes, portanto uma nova música altera a identidade contextual sem criar estado paralelo.

A mensagem deixa de competir quando o item deixa de estar pendente, a alteração deixa de corresponder ao repertório atual, o evento passa, a NBA muda ou a fingerprint é acknowledged. A copy não controla resolução e não cria receipt.

### Regra temporal e copy

“Em cima da hora” reutiliza a janela `APPROACHING` já definida pelo motor: `0 <= horas entre a adição e o início do evento <= 24`. A comparação usa o timestamp da própria adição, não apenas a proximidade atual do evento. `PAST`, `UNKNOWN` ou timestamp ausente recebem somente o fallback neutro. Uma adição anterior à janela, com evento ainda futuro, pode usar “Respira. Ainda dá tempo.”, mas nunca “em cima da hora”.

Copy habilitada:

- “Música nova no repertório.”
- “Música nova no repertório. Respira. Ainda dá tempo.”
- “O repertório mudou. Sim, alguém adicionou música em cima da hora.”

### Garantias e testes

Não há comparação de listas na copy, parsing de texto, telemetria, rede, LLM ou UI nova. `pendingCount` sozinho não prova adição. `SongReviewReceipt`, acknowledgement, destinos, prioridades e `NONE → null` permanecem inalterados; `usedLlm` continua falso.

Os testes cobrem a criação do `EventChange`, IDs e timestamp, ausência de receipt/READY, propagação Snapshot → Signal → NBA/evidence → Delivery → Copy, deduplicação, expiração por preparo, distinção de KEY_CHANGED/reorder/metadata/remoção, guards temporais, determinismo e strings seguras.
