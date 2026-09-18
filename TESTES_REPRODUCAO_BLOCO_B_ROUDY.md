# TESTES_REPRODUCAO_BLOCO_B_ROUDY

Branch: `fix/security-identity-foundation` (base `448555f`, após A4/`414c0a2`).
Arquivo de teste: `tests/bloco-b-identity-library-repro.test.js`.

Este documento **não corrige nenhum bug**. Ele apenas reproduz, com o código
real de produção (`js/song-model.js` + `js/song-repository.js` +
`js/library-sync.js`, carregados via `vm` exatamente como `index.html` os
conecta — sem stubs substituindo `songRepository.activateOwner`, diferente
dos testes existentes em `tests/library-sync.test.js`), o comportamento atual
para os 11 cenários pedidos, mais um gap arquitetural.

O arquivo **não está no `npm test`** de propósito: parte dele falha porque
reproduz bugs reais ainda não corrigidos. Para rodar isoladamente:

```
node tests/bloco-b-identity-library-repro.test.js
```

`npm test` (suíte principal, 31 arquivos, inclui A4) continua 100% verde —
nada nela foi tocado.

## Resultado: 7 de 13 passam, 6 falham

| # | Cenário | Resultado | Causa |
|---|---|---|---|
| 1 | Login da conta A | ✅ PASS | Fluxo básico funciona. |
| 2 | Logout da conta A | ❌ FAIL | `musicas` continua em memória com a biblioteca privada de A depois do logout. |
| 5 | `activeOwnerId` após logout | ❌ FAIL | O módulo `songRepository` nunca é avisado do logout; `activeOwnerId` continua apontando para A. |
| 3 | Login da conta B no mesmo dispositivo | ✅ PASS | B recebe biblioteca vazia, isolada de A. |
| 4 | Isolamento dos caches de A e B | ❌ FAIL | Uma edição feita "deslogado" vaza para o cache de A (não é isolamento entre A/B, é vazamento de anônimo → A). |
| 5b | Login A novamente, mesma aba (bônus) | ❌ FAIL | A edição vazada ressurge na biblioteca de A ao relogar. |
| 6 | Biblioteca local antes do primeiro login | ✅ PASS | `storedLibraryExistedAtBoot` é setado corretamente antes de qualquer `activateOwner`. |
| 7 | Primeiro login não apaga biblioteca local | ✅ PASS | Migração silenciosa copia a biblioteca local para a nuvem sem escondê-la. |
| 8 | Falha de `pull` não esvazia a biblioteca | ✅ PASS | `pull()` propaga o erro mas não chama `persist([])`; a tela mantém os dados anteriores. |
| 9 | Mesma conta em dois dispositivos | ✅ PASS | O segundo dispositivo baixa corretamente o que o primeiro sincronizou. |
| 10 | Preservação do `clientId` | ✅ PASS | `songRepository.update()` preserva `librarySync.clientId` ao editar só o capo. |
| 11 | Capo não deve alterar hash de conteúdo musical | ❌ FAIL | `capo` ainda entra no `contentHash`/`sameContent`; dois hashes diferentes só por causa do capo. |
| — | Gap: `originalKey` vs `preferredKey` | ❌ FAIL (esperado) | `song-model.js` ainda não modela os dois conceitos separadamente. Não é regressão — é o estado atual, documentado para a próxima fase. |

## Detalhe de cada bug confirmado

### 2 + 5 + 4 + 5b — o mesmo bug raiz: `activeOwnerId` nunca é resetado no logout

`js/library-sync.js`, dentro de `initialize()`, é o único lugar que chama
`songRepository.activateOwner(...)`. No branch de logout ele só reseta as
variáveis internas do próprio `library-sync.js` (`lastUserId`,
`migrationCandidate`, `identityBlocked`) e nunca chama `songRepository` nem
`context.setSongs([])`:

```js
if(!userId){lastUserId=null;migrationCandidate=false;identityBlocked=false;
  emit({phase:"unauthenticated",...});return;}
```

Isso tem duas consequências observáveis, ambas reproduzidas:

- **UI (item 2):** `musicas` (o array em memória de `index.html`) continua
  sendo a biblioteca privada de A depois do logout — nada limpa nem
  recarrega para um estado "anônimo".
- **Persistência (itens 5, 4, 5b):** `songRepository.js` mantém
  `activeOwnerId` (variável de módulo, privada) apontando para `"user-a"`.
  Qualquer `songRepository.save(...)` feito depois disso — exatamente o que
  `saveMusica()`/`editMusica()` fazem em `index.html` — cai neste trecho:

  ```js
  function save(collection) {
    const songs = activeOwnerId ? filterDeleted(activeOwnerId, collection) : ...;
    if (activeOwnerId && activeOwnerId !== legacyCandidateOwnerId) return saveOwnerCache(activeOwnerId, songs);
    ...
  }
  ```

  Como `activeOwnerId` ainda é `"user-a"`, o `save()` grava no **cache
  privado da conta A** (`sc_personal_song_caches_v1["user-a"]`) em vez do
  armazenamento local anônimo (`sc_songs_v1`). Se depois disso A logar de
  novo **na mesma aba/sessão** (sem recarregar a página), essa música
  "anônima" reaparece na biblioteca dela — porque ela nunca foi realmente
  anônima aos olhos do módulo, só aos olhos da tela.

  Reabrir a página (fechar a aba/recarregar o PWA) cria uma nova instância
  do módulo `songRepository`, e aí sim `activeOwnerId` volta a `null` — ou
  seja, o vazamento só se manifesta dentro da mesma sessão de página, mas é
  real: em um dispositivo compartilhado, qualquer edição feita entre um
  logout e o fechamento da aba pode ser silenciosamente atribuída — e, num
  próximo `syncNow()`, enviada — à conta que acabou de sair.

Isso é consistente com o objetivo declarado: hoje `activeOwnerId` (estado em
memória) é tratado como parte da identidade ativa, mas nada sincroniza esse
estado com o evento de logout do `appAuth`.

### 11 — `capo` participa do hash de conteúdo musical

`js/library-sync.js`:

```js
const VOLATILE_CONTENT_FIELDS = new Set(["createdAt", "updatedAt"]);
```

Só `createdAt`/`updatedAt` são excluídos do `musicalPayload()` usado por
`contentHash()`/`sameContent()`. `capo` (personalização do usuário) continua
dentro do payload comparado, então duas músicas com o mesmo conteúdo musical
mas capo diferente produzem hashes diferentes:

```
contentHash({...song, capo:""})                 → '21155290'
contentHash({...song, capo:"Capotraste casa 2"}) → 'c34fc350'
```

Isso é exatamente o problema descrito: uma alteração de capo (personalização)
é hoje indistinguível de uma alteração real de conteúdo musical para fins de
detecção de conflito/divergência entre dispositivos.

## O que já funciona (não precisa de correção agora)

- Isolamento de B em relação a A no `activateOwner` (guardado por
  `sc_legacy_library_owner_v1`) — item 3.
- Biblioteca local pré-existente sobrevive ao primeiro login e à migração
  silenciosa — itens 6 e 7.
- `pull()` nunca substitui a biblioteca por uma lista vazia quando a
  requisição falha — item 8.
- Convergência entre dois dispositivos da mesma conta — item 9.
- `clientId` sobrevive a uma edição via `songRepository.update()` (caminho
  usado por `saveMusica()` e pela revisão de IA via `songFormat.toLegacy`,
  que espalha `...(existing||{})` antes de sobrescrever campos) — item 10.

## Decisões arquiteturais — status

- **Separar conteúdo musical de personalização do usuário:** ainda não
  implementado; é exatamente a causa do bug do item 11 (`capo` não está
  separado).
- **`capo` fora do hash/payload de divergência musical:** ainda não
  implementado (mesmo bug).
- **`GlobalSong → SongVersion → PersonalSong`:** nenhuma mudança de modelo
  foi feita; a separação conceitual continua só no papel, para a próxima
  fase.
- **`originalKey` vs `preferredKey`:** `song-model.js` ainda não distingue
  os dois; documentado no teste como gap esperado, não como regressão.
- **Catálogo global:** não implementado (como solicitado).
- **Migração das 498 músicas:** não realizada (como solicitado).
- **Banco de dados:** nenhuma alteração de schema/dados foi feita nesta
  etapa — só arquivos `js/` e `tests/` foram lidos, nenhum tocado além da
  criação do teste.
- **Claim v2:** não implementado (como solicitado).

## Próximo passo (aguardando autorização)

Nenhuma correção foi aplicada. Os candidatos a correção, em ordem de
severidade, seriam:

1. Resetar `activeOwnerId`/`legacyCandidateOwnerId` em `songRepository`
   quando `library-sync.js` detecta logout (`!userId`), e também limpar
   `musicas` na tela (via `context.setSongs([])`/recarregar biblioteca
   local) — resolve os itens 2, 4, 5 e 5b.
2. Adicionar `capo` (e outros campos de personalização futuros) a
   `VOLATILE_CONTENT_FIELDS` em `js/library-sync.js` — resolve o item 11.
