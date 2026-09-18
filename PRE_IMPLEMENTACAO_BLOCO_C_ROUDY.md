# PRE_IMPLEMENTACAO_BLOCO_C_ROUDY

Branch: `fix/security-identity-foundation`, avaliado contra `cf37e19` (A4 +
Bloco B1/B2 já mesclados nessa branch, PR #51 já incorporada na base).

**Nada foi implementado neste documento.** É só a reavaliação pedida antes de
qualquer código.

## Aviso sobre "recuperar o plano anterior"

Não existe, neste repositório, nenhum artefato (arquivo `.md`, comentário de
código, mensagem de commit) do "plano anterior" com os itens C1/C2/C3 —
procurei por `ExternalIdentity`, `collaboration_auth`, `account takeover`,
`client-chosen`, `C_SEM_ACESSO`, `Bloco C` em todo o repositório e no
histórico do git (`git log --all --grep`) e não há nada. Esse plano deve ter
existido só na conversa da sessão anterior, que não está acessível aqui.

Então este documento **não é uma recuperação literal** — é uma auditoria
nova, feita agora lendo o código real em `cf37e19`, organizada sob os mesmos
três rótulos (C1/C2/C3) porque os elementos que você descreveu (registro
público com ID escolhido pelo cliente, `user_id = subject` em
`collaboration_auth`, `ExternalIdentity`, risco de account takeover) batem
exatamente com o que encontrei no código. Se o plano anterior tinha escopo
diferente do que está abaixo, preciso que você aponte a diferença.

## O que o código faz hoje (`cf37e19`)

Só dois lugares criam `CollaborationUser`:

1. **`POST /api/collaboration/users`** (`register_user`,
   `backend/app/routes/events.py:397-411`) — endpoint público, sem
   autenticação. O `id` do novo usuário vem de `payload.get("id")`, validado
   só por um regex de forma (`^[A-Za-z0-9_.:-]{3,120}$`), sem qualquer prova
   de posse. Isso é usado pelo fluxo real de "identidade local" (colaborar
   em Eventos antes de logar com Google) — `js/event-collaboration-client.js`
   gera um id local (`generatedId()`, sempre `user_`+hex) e registra.

2. **`collaboration_auth.py:54-70`** — no primeiro login Supabase (quando
   ainda não existe `ExternalIdentity` para aquele `subject`), o código faz
   `user_id = identity.user_id if identity else subject` — ou seja, usa o
   próprio `subject` (UUID do Supabase) como `CollaborationUser.id` na
   ausência de vínculo prévio.

`ExternalIdentity` (`backend/app/models/collaboration.py:33-41`) já existe
com `UniqueConstraint(provider, subject)` — o modelo já está certo, é a
peça que protege as 8 contas reais hoje (`identity.user_id` é sempre
resolvido a partir do vínculo já gravado, nunca recalculado do `subject`
para quem já tem `ExternalIdentity`).

## Risco real (account takeover) — confirmado, mas mais estreito do que parecia

A combinação C1+C2 permite, em teoria: um atacante chama
`POST /users` com `id` = um UUID que ele aposta que será o `subject` de um
Supabase de uma vítima que **ainda nunca logou nesta aplicação**. Se a
vítima logar depois, `collaboration_auth.py` reaproveita esse `id` (porque
não existe `ExternalIdentity` ainda) e o atacante — que já tinha um
`UserAccessToken` válido para aquele `CollaborationUser.id` — continua
autenticando como a mesma conta.

Isso é real estruturalmente, mas a explorabilidade prática depende de o
atacante **adivinhar ou já conhecer o `subject` (UUID) da vítima antes do
primeiro login dela** — `subject` é o UUID que o próprio Supabase gera na
primeira autenticação daquela pessoa neste projeto, não é derivável do
e-mail/Google ID, e `supabase_auth.py` valida o token chamando
`/auth/v1/user` no próprio Supabase (sem decodificar/confiar em JWT local),
então não há como forjar um `subject` arbitrário — só descobrir/adivinhar
um UUID real de alguém que ainda não logou, o que é extremamente
improvável por força bruta.

Isso não torna o achado descartável (é o padrão errado — identidade
deveria nascer de um ID interno, não do valor externo), mas muda a
prioridade de "corrigir os dois pontos agora" para "fechar a única porta
de entrada explorável (C1) e reavaliar C2 depois com calma".

## Por que NÃO vou tocar em C2 (`user_id = subject`) nesta etapa

Descobri, lendo `backend/tests/`, que mudar esse fallback quebra
**compatibilidade muito além do previsto**:

- `register()` (helper usado em quase todo `backend/tests/*.py`) chama
  `POST /users` com IDs escolhidos pelo teste (`"leader-user"`,
  `"band-owner"`, `"member-user"`...) e esses IDs **são referenciados
  depois em payloads** (`event_payload()["leaderId"]`,
  `["members"][i]["id"]`) — `create_event()` exige
  `requested_leader == g.current_user.id` (`events.py:494`). Isso não é
  só um detalhe de teste: é o mesmo padrão que o app real usa — um
  usuário monta a lista de membros de um Evento citando o ID local de
  colegas **antes** de eles terem se registrado no backend. Proibir IDs
  escolhidos pelo cliente de forma geral quebraria esse fluxo de produção,
  não só os testes.
- Além disso, `test_bands.py::test_supabase_login_claims_legacy_events_and_bands`
  (linha 90) e várias asserções em `test_event_invitations.py` fixam
  literalmente `"supabase-user"`/`"leader-user"`/etc. como o ID esperado
  **depois** de um login Supabase — ou seja, dependem hoje de
  `user_id == subject`. Mudar C2 exige reescrever essas asserções.

**Conclusão:** depois que C1 fecha (ninguém mais consegue plantar um
`CollaborationUser` com ID escolhido por ele que tenha o formato de um
`subject` do Supabase), não sobra nenhum caminho alcançável por um
atacante para pré-ocupar o `id` de uma conta Supabase futura — então C2
deixa de ser explorável **sem precisar mexer em `collaboration_auth.py`**.
Tocar em C2 agora seria risco (quebra ampla de testes e comportamento já em
produção) sem ganho de segurança adicional. Registro isso como item
**C2 — reavaliado, sem correção necessária nesta etapa** (não "pendente
por dificuldade", e sim "resolvido pela correção de C1").

## C1 — o que precisa ser corrigido

`register_user` precisa parar de aceitar, como `id` de um usuário novo,
qualquer string no formato de UUID canônico (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
8-4-4-4-12 em hexadecimal, case-insensitive — é exatamente o formato que o
Supabase usa para `subject`). Continua aceitando livremente qualquer outro
formato (`"leader-user"`, `"user_a1b2c3"`, etc.) — é isso que preserva 100%
da compatibilidade: nenhum ID usado hoje em produção ou nos testes tem
esse formato (o próprio cliente sempre gera `"user_"+hex`, nunca um UUID
puro).

### Arquivo alterado

- `backend/app/routes/events.py` — dentro de `register_user`, depois de
  `user_id = _identifier(...)`, rejeitar (400) se `user_id` casar com o
  padrão de UUID canônico. Nenhuma outra rota/`_identifier()` compartilhada
  é tocada (bandas, eventos, repertório continuam aceitando qualquer forma
  livre — a restrição é só no namespace de `CollaborationUser.id`).

### Precisa de migration?

**Não.** É validação de entrada em Python puro — nenhuma coluna, índice,
constraint ou tipo muda. `ExternalIdentity`/`CollaborationUser`/
`UserAccessToken` já têm o shape certo.

### Testes que serão criados

Novo arquivo `backend/tests/test_collaboration_identity_security.py`:

1. `test_register_user_rejects_uuid_shaped_id` — `POST /users` com
   `id` = UUID canônico → espera 400 (hoje retorna 201; este teste falha
   em `cf37e19`, confirmando a reprodução).
2. `test_register_user_rejects_uppercase_uuid_shaped_id` — mesmo caso com
   hex maiúsculo (Postgres/Supabase tratam UUID como case-insensitive; a
   checagem não pode ser sensível a maiúsculas).
3. `test_register_user_still_accepts_free_form_ids` — regressão: IDs no
   formato usado hoje (`"leader-user"`, `"user_"+hex) continuam
   retornando 201. Protege o helper `register()` usado no resto da suíte.
4. `test_uuid_squatting_blocked_before_real_supabase_login` — cenário
   completo do risco: tenta `POST /users` com `id` = UUID X → 400;
   depois simula (via `FakeSupabase`, mesmo padrão de
   `test_bands.py`/`test_event_invitations.py`) um login real cujo
   `subject` é esse mesmo X → confirma que nasce um `CollaborationUser`
   limpo (sem token de atacante associado) e que `/me` devolve esse
   mesmo `subject` como `id` — prova que C2 continua funcionando como
   hoje (comportamento intencionalmente preservado) e que não há mais
   como um terceiro interceptar essa conta antes do primeiro login.

Nenhum teste existente precisa ser alterado (é exatamente o ponto de não
mexer em C2).

## Riscos

**Para o login atual (8 contas Google / 498 músicas, 1 identidade de
dispositivo com token válido / 0 músicas):** nenhum. `collaboration_auth.py`
não é tocado; o caminho de login dessas 8 contas passa por
`identity.user_id` (branch já resolvido, nunca recalcula do `subject`).
A identidade de dispositivo com token válido e 0 músicas continua podendo
se registrar/operar normalmente contanto que seu ID não seja, por
coincidência, um UUID canônico — extremamente improvável para um ID gerado
localmente como `"user_"+hex`, e o bucket `C_SEM_ACESSO_APOS_MUDANCA` já
aprovado como vazio não muda, porque nenhuma linha existente é
recriada/realocada por esta correção.

**Para as 498 músicas:** nenhum — `library.py`/`PersonalSong` usam o mesmo
`g.current_user.id` resolvido por `collaboration_auth.py`, que não muda.

**Para o fluxo real de colaboração local (Eventos, bandas):** nenhum —
IDs locais continuam livres; só o formato UUID puro passa a ser recusado,
formato que o app nunca gera.

## Ordem segura de implementação (quando autorizado)

1. Criar `backend/tests/test_collaboration_identity_security.py` primeiro
   (vermelho contra `cf37e19` — confirma a reprodução do C1).
2. Rodar a suíte backend completa (`pytest backend/tests`) como estava,
   para ter uma baseline verde antes de qualquer mudança.
3. Implementar a checagem de formato UUID em `register_user`
   (`backend/app/routes/events.py`).
4. Rodar de novo: os 4 testes novos devem passar; a suíte backend inteira
   (inclusive `test_bands.py` e `test_event_invitations.py`) deve
   continuar 100% verde, sem alterar nenhuma asserção existente.
5. Rodar `npm test` (frontend) como checagem de não-regressão cruzada,
   mesmo sem tocar em `js/`/`index.html` nesta etapa.
6. Só então commit + push em `fix/security-identity-foundation` — sem
   merge, sem deploy, sem tocar em `main`, sem migration, sem alterar
   banco de produção (a correção não precisa disso).

Parando aqui, aguardando autorização para implementar C1 conforme este
plano.
