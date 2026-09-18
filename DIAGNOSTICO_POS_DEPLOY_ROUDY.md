# DIAGNOSTICO_POS_DEPLOY_ROUDY

Branch: `fix/production-sync-order`, criada a partir de `main` = `777849b`
(confirmado via `git fetch` + `git rev-parse origin/main` antes de qualquer
coisa). **Nenhuma correção foi implementada** — só investigação e testes de
reprodução, todos rodando contra o código real de produção.

## Estado do repositório

- `git fetch origin main` → `origin/main` = `777849b6...` ✅
- `main` local atualizada via fast-forward para `777849b`
- Branch `fix/production-sync-order` criada a partir dessa `main`
- Nenhum arquivo de código-fonte foi alterado nesta etapa — só 4 arquivos de
  teste novos (ver "Testes de reprodução" abaixo)
- `npm test`: 31/31 verde (sem regressão)
- `pytest backend/tests`: 146/146 verde (144 existentes + 2 novos de
  `test_repertoire_order_repro.py`)

---

## BUG 1 — biblioteca não converge entre dispositivos

### Rastreamento do fluxo real

`login Google → appAuth.subscribe → songRepository.activateOwner → cache
local (sc_personal_song_caches_v1) → librarySync.pull() → merge() →
persist() → PersonalSong (backend) → outro dispositivo`

- **Login:** `appAuth.subscribe` (dentro de `js/library-sync.js:initialize()`)
  recebe `{authenticated:true, user:{id: subject}}`. Se `userId !==
  lastUserId`, chama `context.activateOwner(userId)` →
  `songRepository.activateOwner(userId, musicas, catalogoPadrao)`.
- **`activateOwner`:** se este dispositivo já tem
  `sc_personal_song_caches_v1[userId]` (é o caso normal de um dispositivo
  que já sincronizou antes), devolve **esse cache local imediatamente**,
  sem esperar rede. É isso que a tela mostra primeiro.
- **Pull em paralelo:** logo depois, `library-sync.js` chama
  `pull()` (não aguardado pela UI): `GET /api/library/songs` →
  `normalizeRemoteResponse` → `merge(local, remoto)` → `persist()`. Se tudo
  correr bem, qualquer música que exista no servidor e não exista
  localmente (`index<0` em `merge()`) é **sempre** empurrada para dentro do
  array local — não há caminho no código onde uma música remota nova seja
  silenciosamente ignorada.
- **`activeOwnerId`/`clientId`:** cada música sincronizada carrega
  `librarySync.clientId` (gerado uma vez, nunca trocado) e
  `serverVersion`. `activeOwnerId` (variável de módulo em
  `song-repository.js`) determina se `save()` grava no cache da conta
  (`sc_personal_song_caches_v1[activeOwnerId]`) ou no armazenamento
  anônimo — corrigido no Bloco B1, não é a causa deste bug (ver por quê
  abaixo).
- **Logout/novo login:** `deactivateOwner()` (Bloco B1) zera
  `activeOwnerId` e mostra o armazenamento anônimo local; um novo login
  refaz `activateOwner` + `pull()` do zero, do mesmo jeito que o primeiro
  login.

### Causa comprovada (reproduzida)

**O mecanismo de convergência em si está correto** — reproduzido e
confirmado com o teste "Dispositivo com cache estabelecido converge ao
logar": um dispositivo com cache parcial estabelecido converge
corretamente para o total do servidor após login, sem perder nada.

O que **é** reproduzido de forma determinística, e explica o
`PC=152 / celular=145` persistindo depois de logout+login, é isto:

> **Uma falha em `pull()` (erro de rede, ou — comprovado no teste — um
> único registro remoto malformado) é silenciosa.** `js/library-sync.js`
> registra o erro em `getStatus().error`, mas:
> 1. Nada na UI normal exibe esse status (só o painel técnico de
>    diagnóstico, que já é propositalmente escondido da navegação normal
>    — confirmado em `tests/library-sync.test.js`).
> 2. Não existe retry automático para essa falha específica (`pull()` só
>    roda de novo em outro login, ou manualmente pelo painel técnico).
> 3. Se a causa for **persistente** (não uma falha de rede pontual — por
>    exemplo um registro com `song_data` inválido para essa conta no
>    servidor), **logout+login repete exatamente a mesma falha**, porque
>    o dado ruim continua lá. Reproduzido: com um registro corrompido
>    injetado no "servidor", dois ciclos consecutivos de logout+login
>    falham do mesmo jeito; só depois que o registro é removido do lado
>    do servidor o próximo login converge.

`js/library-sync.js:normalizeRemoteResponse` rejeita a **resposta
inteira** quando qualquer registro não normaliza (`songData` nulo/inválido,
faltando `clientId`, etc.) — não descarta só o registro ruim, aborta o
pull inteiro daquela conta, em qualquer dispositivo.

### Onde as 7 músicas provavelmente estão

Sem acessar produção (não é necessário para esta conclusão): as 7 músicas
que existem no PC e não aparecem no celular estão, com maior probabilidade,
**no servidor** (`PersonalSong` da conta, já sincronizadas a partir do PC)
— porque o próprio celular relatou "0 pendências" implícitas (não há
indicação de erro na tela) e um `pull()` bem-sucedido as traria
automaticamente. A causa mais provável não é "onde estão" e sim "por que o
pull que deveria trazê-las não está completando".

### Fonte de verdade atual

Para um usuário autenticado, a fonte de verdade **pretendida** é o
servidor (`PersonalSong`, chave `(owner_user_id, client_id)`) — o desenho
de `pull()`/`merge()` já implementa isso corretamente. Na prática, porém,
a fonte de verdade **efetiva** é "o que o último `pull()` bem-sucedido
trouxe", porque uma falha silenciosa deixa o dispositivo congelado
indefinidamente no seu cache local anterior, sem qualquer sinalização.

### Por que logout/login não resolveu

Porque cada novo login apenas repete a mesma sequência
(`activateOwner` → `pull()`), e se a causa da falha original ainda existe
(dado ruim no servidor, ou qualquer outra condição persistente — ex.: uma
exclusão pendente presa, testável da mesma forma), o novo `pull()` falha
pelo mesmo motivo. Comprovado no teste de reprodução.

### Por que os testes do Bloco B passaram mesmo assim

`tests/library-sync.test.js` e `tests/bloco-b-identity-library-repro.test.js`
**nunca testam um dispositivo que já possui um cache de dono estabelecido,
porém menor que o servidor**. Todo cenário de "segundo dispositivo" nesses
arquivos começa com biblioteca **vazia** (`device(userId, [])`). É
exatamente essa lacuna — device com cache parcial pré-existente fazendo
login — que corresponde ao caso real (celular já usado antes, com 145
músicas, servidor com 152). Além disso, os mocks de `fetch` nesses testes
**nunca retornam um registro malformado nem um erro de rede** — então a
suíte nunca exercitou o caminho de falha silenciosa de `pull()`.

### Teste de reprodução criado

`tests/production-library-convergence-repro.test.js` (3 cenários, roda
com `node tests/production-library-convergence-repro.test.js`,
**não está no `npm test`**):

1. ✅ PASS — dispositivo com cache estabelecido converge corretamente
   quando nada falha (prova que o mecanismo básico funciona).
2. ✅ PASS — um único registro remoto corrompido trava o pull de forma
   determinística, sobrevive a logout+login, e só um login novo depois do
   dado ser corrigido no servidor converge.
3. ✅ PASS — a diferença de `clientId` entre o cache do celular e o do PC
   identifica exatamente as músicas ausentes, sem precisar de acesso ao
   banco (útil para a investigação real, sem tocar em produção).

### Arquivos que precisariam ser corrigidos

- `js/library-sync.js` — `normalizeRemoteResponse` (não abortar a
  resposta inteira por causa de um registro ruim; ou pelo menos reportar
  quais falharam) e o tratamento de erro em `pull()`/`schedule()` (hoje
  `.catch(()=>{})` silencioso no fluxo de login).
- Possivelmente `index.html` — para dar alguma visibilidade ao usuário
  quando `librarySync.getStatus().phase==='error'` (hoje só o painel
  técnico escondido mostra isso).

### Menor correção segura proposta (não implementada)

1. Em `normalizeRemoteResponse`, separar registros inválidos dos válidos
   em vez de abortar tudo — processar os válidos e reportar os inválidos
   (não perde acesso à conta inteira por causa de 1 registro ruim).
2. Adicionar um retry automático (ex.: no próximo `pull()` agendado ou ao
   voltar `online`) para o caso de erro, hoje só coberto por
   `schedule()` quando há `localPending` — não quando o pull inicial falha
   sem nada pendente para enviar.
3. Opcional/UX: expor de forma discreta (sem abrir o painel técnico) que
   a sincronização está com erro, para o usuário saber que precisa agir
   em vez de achar que "é só isso mesmo".

Nenhuma dessas correções foi aplicada.

---

## BUG 2 — músicas de um evento fora de ordem

### Rastreamento do fluxo real

`evento → repertório → persistência (POST/PUT) → backend
(EventRepertoireItem.position) → pull (GET) → frontend
(eventModel.create, sort por order) → renderização (openSD, Modo Palco)`

- **Persistência:** `backend/app/routes/events.py:_repertoire_payload`
  atribui `position = index` (posição no array que o cliente enviou), e
  `_replace_repertoire` grava exatamente essa posição, tanto na criação
  (`POST`) quanto na resalva completa (`PUT`, full replace com checagem de
  `remoteVersion` — 409 se desatualizado). `_serialize_event` sempre
  devolve `sorted(event.repertoire, key=lambda v: v.position)`.
- **PATCH de item único** (`PATCH /repertoire/<item>/shared`, usado por
  `changeEventOfficialKey` da PR #51 para eventos já sincronizados) **não
  toca em `position`** — confirmado lendo o código e por teste.
- **Frontend:** `eventModel.create()` sempre reordena o array por
  `item.order` (`repertoire.sort((a,b)=>a.order-b.order)`) — roda em toda
  normalização (`fromRemote`, `upsert`, `applySharedEdit`, etc). `order`
  vem do campo `position` do backend, preservado por `fromRemote`.
- **`PersonalRepertoireOverride`:** só afeta título/artista/tom/capo/cifra/
  notas **pessoais** de um item — nunca a posição. Confirmado em
  `_serialize_event` (overrides não alteram `position` nem a ordem do
  `for item in sorted(...)`).
- **Modo Palco / navegação:** usa `navigationContext` (`js/navigation-context.js`),
  que congela a lista `songIds` no momento em que
  `openDetailFromPlaylist()`/`openStageFromEvent()` é chamado — não é
  recalculada automaticamente depois disso.

### Causa da alteração de ordem

**Não consegui reproduzir uma alteração de ordem na persistência nem no
pull normal.** Testei especificamente:

- Backend real (Flask test client): criar evento com A,B,C,D → `GET` →
  reordenar via `PUT` completo (como `saveSharedEvent` faz) para D,A,C,B →
  `GET` de novo → um "terceiro dispositivo" lendo pela primeira vez. Ordem
  preservada em todos os pontos. **PASS.**
- Backend real: `PATCH` de tom oficial (como `changeEventOfficialKey` faz
  em eventos já sincronizados) não altera a ordem dos outros itens.
  **PASS.**
- Frontend real (`event-model.js` + `event-repository.js` +
  `event-collaboration-client.js` via `vm`, servidor falso com o MESMO
  contrato do backend real): dispositivo A cria com A,B,C,D, dispositivo B
  (mesma conta) puxa e confirma A,B,C,D; A reordena para D,A,C,B e
  resalva; B puxa de novo (`listEvents`) e também via
  `eventRepository.reconcileRemote` (o merge que `index.html` roda depois
  do login) — os dois refletem corretamente D,A,C,B. **PASS.**

Ou seja: **persistência, pull e merge de eventos estão corretos** nos
fluxos que consegui exercitar de ponta a ponta.

### Onde a ordem correta deveria estar armazenada / achado adicional confirmado

A ordem oficial mora em `EventRepertoireItem.position` (backend) ↔
`item.order` (frontend, depois de `eventModel.create()`) — e esse par está
consistente em todos os testes acima.

**Porém, encontrei e reproduzi um mecanismo real e concreto de ordem
"errada" na tela, mesmo com os dados corretos:** `navigationContext`
(usado pelo Modo Palco e por "próxima/anterior música" dentro de um
evento) fixa a sequência de `songIds` no momento em que a tela do evento é
aberta. Se um `pull()` em segundo plano trouxer uma ordem nova
**enquanto o usuário já está navegando aquele evento** (sem reabrir a
tela), a navegação continua na ordem antiga — nada chama
`navigationContext.setPlaylist()` de novo depois de um pull. Reproduzido:
com `event.repertoire` mudando de A,B,C,D para D,A,C,B depois de
`setPlaylist` já ter sido chamado com a ordem antiga, `stageContextData()`
continua devolvendo A,B,C,D; só reabrir a tela do evento corrige.

Isso é uma ordem **percebida** errada, dentro de uma mesma sessão — não
uma ordem persistida errada. Pode explicar um relato de "a ordem está
errada" se a pessoa estava com o Modo Palco ou o repertório já aberto
quando uma sincronização trouxe uma reordenação feita em outro
dispositivo.

**O que não descarto, mas não consegui reproduzir sem dados de produção:**
uma colisão genuína de edições concorrentes (dois dispositivos reordenando
quase ao mesmo tempo) — o backend rejeita a resalva desatualizada com 409
(`versao_desatualizada`), então isso não deveria silenciosamente
sobrescrever com ordem errada, mas eu não verifiquei como o frontend reage
a esse 409 especificamente no fluxo de reorder (só verifiquei que ele
existe e é respeitado no round-trip de PUT). Fica como candidato em
aberto, junto com qualquer coisa que só o histórico real do evento em
produção (sequência de `remoteVersion`/timestamps) revelaria — que exigiria
o acesso ao banco já combinado como adiado.

### Teste de reprodução criado

- `backend/tests/test_repertoire_order_repro.py` (2 testes, `pytest`) —
  ambos **PASS** (confirma round-trip correto no backend).
- `tests/production-event-order-repro.test.js` (2 cenários, `node
  tests/production-event-order-repro.test.js`) — ambos **PASS** (confirma
  round-trip correto multi-dispositivo no frontend real).
- `tests/production-stage-navigation-order-repro.test.js` (2 cenários) —
  **1 FAIL confirmando o achado do Modo Palco** (ordem congelada), **1
  PASS** confirmando que reabrir a tela corrige.

Nenhum desses arquivos está no `npm test`/suíte padrão — são dossiês de
investigação pontual, não regressões a vigiar a cada build.

### Arquivos que precisariam ser corrigidos

- Para o achado confirmado (Modo Palco): o código que consome
  `navigationContext` dentro de `index.html` (`stageContextData`,
  `openDetailFromPlaylist`, e onde quer que a tela reaja a um pull
  concluído) — precisaria re-chamar `navigationContext.setPlaylist()`
  quando o evento aberto muda de ordem via sync, não só ao reabrir a tela.
- Nenhuma mudança identificada em `backend/app/routes/events.py`,
  `js/event-model.js`, `js/event-repository.js` ou
  `js/event-collaboration-client.js` — nos fluxos testados, esses estão
  corretos.

### Menor correção segura proposta (não implementada)

Para o achado confirmado: fazer o consumidor de `librarySync`/pull de
eventos re-chamar `navigationContext.setPlaylist()` (ou invalidar o
contexto) quando o evento atualmente aberto muda de versão/ordem via
sync — sem alterar o modelo de dados nem a persistência, que já estão
corretos.

Para o resto (se o achado do Modo Palco não for a causa relatada):
recomendo obter, do usuário ou do banco (quando autorizado), o
`remoteVersion`/histórico de `EventChange` do evento específico afetado
antes de qualquer alteração de código — não há mudança segura a propor às
cegas quando o mecanismo mais provável já foi descartado por teste.

---

## Confirmações finais

- Nenhuma alteração de banco, migration, ou dado de produção
- `main` permanece em `777849b` (não tocada por esta investigação)
- Nenhuma música apagada, nenhum `localStorage` limpo, nenhuma migração
- `originalKey`/`preferredKey`, catálogo global e claim v2: não tocados
- Branch `fix/production-sync-order`: só arquivos de teste + este
  diagnóstico adicionados

Parando aqui, aguardando autorização para implementar qualquer correção.
