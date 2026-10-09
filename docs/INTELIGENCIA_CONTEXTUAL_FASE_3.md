# Inteligência Contextual — Fase 3

## Escopo

Esta fase implementa relevância, prioridade e Next Best Action de forma determinística. Ela não escolhe canal de apresentação, não altera UI, não envia notificações e não usa LLM.

## Fases temporais

- `FAR`: mais de 7 dias.
- `PREPARATION`: entre 24 horas e 7 dias.
- `APPROACHING`: até 24 horas, em data futura.
- `TODAY`: mesma data local.
- `PAST`: data anterior.
- `UNKNOWN`: data/hora insuficiente.

`LIVE` não é inferido: o modelo atual não armazena duração ou término do evento. Um evento iniciado no mesmo dia continua `TODAY`, evitando fabricar uma janela de execução.

## Estado individual e agregado

Cada música possui somente `READY`, `NOT_STARTED`, `CHANGED_AFTER_REVIEW`, `NEEDS_REVIEW` ou `UNKNOWN`. Uma música individual nunca recebe `IN_PROGRESS`.

`IN_PROGRESS` existe apenas no agregado do evento, quando há uma combinação de músicas confirmadas e pendentes. O agregado também expõe contagens e a lista de estados individuais usada pelas regras.

## Performance notes

O campo atual é editado como **Observações do repertório**, dentro da versão oficial ou pessoal da música, e é exibido junto à música. Não existe no modelo atual um segundo campo administrativo nem uma classificação de notas. Por isso, a semântica observável hoje é de instrução musical contextual e `PERFORMANCE_NOTES_CHANGED` continua relevante para a revisão.

Não foi adotada classificação por palavras-chave: ela produziria falsos fatos. Se o produto passar a misturar lembretes administrativos nesse campo, a evolução correta é criar uma classificação explícita (`MUSICAL`, `ADMINISTRATIVE`, `UNCLASSIFIED`) e migrar a revision identity, mantendo compatibilidade com receipts anteriores.

## Relevância e prioridade

Taxonomia: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `NONE`.

As regras são categóricas e nomeadas:

| Necessidade | TODAY | APPROACHING | PREPARATION | FAR |
|---|---:|---:|---:|---:|
| Revisar versão previamente confirmada | CRITICAL | HIGH | MEDIUM | LOW |
| Iniciar/continuar músicas sem receipt | CRITICAL | HIGH | MEDIUM | LOW |
| Entrar no Modo Palco com tudo READY | MEDIUM | — | — | — |

`LOW` permanece no diagnóstico, mas não ocupa a NBA. Eventos passados e contexto temporal desconhecido não geram candidatos acionáveis.

Uma alteração oficial mascarada pela personalização do músico não produz `CHANGED_AFTER_REVIEW`; a decisão usa o receipt da versão efetiva, não o EventChange isoladamente.

## Ações

- `REVIEW_CHANGED_SONG`: abre a música específica no contexto do evento.
- `START_PREPARATION`: abre o evento quando nenhuma música pendente foi confirmada.
- `CONTINUE_PREPARATION`: abre o evento quando existe preparação parcial.
- `ENTER_STAGE_MODE`: disponível apenas em `TODAY`, com todo o repertório `READY` e Modo Palco disponível.
- `NONE`: nenhuma ação deve ser apresentada.

Não existe ação genérica própria para `EVENT_APPROACHING`; esse sinal aumenta a relevância de uma necessidade real.

## Competição e agregação

1. Prioridade contextual maior vence.
2. Na mesma prioridade, uma mudança específica de versão vence preparação pendente agregada.
3. Pendências sem receipt são agregadas em uma única ação com `pendingCount`.
4. Empates restantes usam evento e item como ordenação estável.
5. Apenas uma ação principal é retornada.

## Deduplicação e acknowledgement futuro

Signals são deduplicados por tipo, usuário, evento, música e identidade da mudança. Candidatos possuem fingerprint determinística com usuário, evento, tipo de ação, item e revisão relevante.

O motor aceita `acknowledgedFingerprints`, mas não persiste acknowledgement e não define read/unread. Essa entrada prepara uma integração futura sem acoplar decisão a delivery.

## Expiração

A validade é recalculada da fonte de verdade:

- novo receipt elimina `REVIEW_CHANGED_SONG`;
- remoção da música elimina o candidato;
- resolução de pendências elimina a ação agregada;
- evento passado elimina preparação e revisão;
- `ENTER_STAGE_MODE` expira ao final do dia local do evento.

## NONE

`NONE` sempre retorna um `reasonCode`:

- `ALL_READY`;
- `NO_ACTIONABLE_SIGNAL`;
- `EVENT_TOO_DISTANT`;
- `EVENT_PAST`;
- `INSUFFICIENT_CONTEXT`.

O diagnóstico contém regras executadas, candidatos concorrentes, motivo da vitória ou ausência de vencedor, dados faltantes e `usedLlm: false`.
