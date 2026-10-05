# Inteligência Contextual — Fase 2

## Receipt de revisão

`song_review_receipts` possui uma linha por `(user_id, event_id, repertoire_item_id)`.

O receipt guarda o usuário autenticado, evento, item, música, equipe contextual, revisão confirmada, payload canônico da revisão, `reviewed_at` original e `client_receipt_id` idempotente. O servidor sempre deriva usuário, acesso, item e revisão atual; a revisão recebida do cliente funciona somente como precondição contra confirmação offline obsoleta.

## Revision identity v1

Formato canônico ordenado e hash SHA-256:

```text
schema + eventId + repertoireItemId + songId
+ effective(key, capo, chordSheet digest, performance notes digest)
```

`effective` usa personalização do músico quando preenchida e, caso contrário, o valor oficial. Cifra e notas entram como `{sha256, length}` para evitar duplicar conteúdo musical privado no receipt.

### Matriz de relevância

| Alteração | Contexto | Relevante? | Invalida READY? | Justificativa |
|---|---|---:|---:|---|
| Tom efetivo | Oficial/pessoal | Sim | Sim | Altera execução e shapes/transposição. |
| Capo efetivo | Oficial/pessoal | Sim | Sim | Altera execução física e tonalidade percebida. |
| Cifra/estrutura efetiva | Oficial/pessoal | Sim | Sim | Altera forma, acordes ou seções preparadas. |
| Notas de execução efetivas | Oficial/pessoal | Sim | Sim | Podem conter entradas, cortes e instruções musicais. |
| Título | Metadado | Não | Não | Não altera o material executado. |
| Artista | Metadado | Não | Não | Não altera o material executado. |
| Ordem no repertório | Contexto do evento | Não, para o receipt da música | Não | Pode gerar sinal coletivo, mas não invalida o estudo da música. |
| Local/data/descrição | Administrativo/temporal | Não | Não | Afeta o evento, não a versão musical confirmada. |
| Integrantes/funções | Escala | Não, para o receipt da música | Não | Pode gerar sinal de escala separado. |
| Foto, mensagens e preferências visuais | UI/comunicação | Não | Não | Não altera o conteúdo musical. |
| Mudança oficial mascarada por personalização efetiva idêntica | Oficial + pessoal | Não | Não | O material realmente preparado pelo músico permaneceu igual. |

## Estados

- `NOT_STARTED`: não existe receipt para o usuário/evento/item.
- `READY`: hash confirmado é igual ao hash atual.
- `CHANGED_AFTER_REVIEW`: existe receipt, mas o hash atual é diferente.
- `UNKNOWN`: o snapshot não recebeu dados suficientes ou recebeu estado não reconhecido.
- `IN_PROGRESS`: agregação do evento contém parte das músicas em `READY` e parte sem confirmação.

Nenhum comportamento de tela, scroll, download ou pacote offline cria receipt.

## Evidência

O payload anterior permite comparar os campos relevantes deterministicamente. `EventChange` novo preserva `song_id`, `change_type`, `before_value`, `after_value` e usuários afetados quando aplicável. Se um histórico antigo não tiver esses dados, o estado ainda pode ser detectado pelo hash, mas retorna `evidenceIncomplete=true` e nunca fabrica valores ou horário.

## Offline e reconciliação

1. O domínio local calcula a mesma revisão canônica e cria receipt `pending` com `reviewedAt` e `clientReceiptId` estáveis.
2. A fila é isolada por usuário/evento/item em `sc_song_review_receipts_v1`.
3. Na sincronização, o servidor recalcula a revisão atual.
4. Se `expectedRevision` for atual, o servidor grava ou atualiza o receipt.
5. Retry da mesma revisão é idempotente e preserva `reviewedAt` original.
6. Se o evento mudou enquanto estava offline, o servidor responde `409 revisao_desatualizada`; o receipt local vira `stale` e não confirma silenciosamente a versão nova.
7. Um receipt remoto nunca substitui um `pending` local de revisão diferente por “última escrita vence”.

## Segurança

O endpoint não recebe `userId`. O usuário vem da autenticação, `_member` valida acesso ao evento e o item é conferido contra o evento. O serializer consulta somente o receipt do usuário atual. Equipe é armazenada como contexto, mas autorização continua baseada em associação válida ao evento/equipe no servidor.
