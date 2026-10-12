# Assistente ROUDY — entrega 5: referência contextual curta

Implementação local, sem publicação, sem alteração no servidor/banco e sem nova interface.

URL: `http://127.0.0.1:4173/?assistente-contexto=354`.
Cache: `simplificando-cifras-v354-assistente-contexto`.

## O que mudou

- Uma referência ao último controle confirmado, válida por 45 segundos em memória.
- Pedidos relativos/correções são traduzidos para comandos completos do catálogo.
  Eles passam pelo mesmo gerenciador, validações, controles nativos e desfazer.
- Se não houver uma referência compatível, velocidade ambígua gera a pergunta
  “BPM do metrônomo ou velocidade da rolagem automática?”, usando o acompanhamento
  existente. Nenhuma das opções muda antes da resposta.
- Nova ação `event.song` abre uma posição do repertório do evento atual diretamente,
  preservando o contexto do evento/item. Não busca uma música parecida na playlist.

## Exemplos

| Pedido inicial | Pedido seguinte | Resultado |
|---|---|---|
| Metrônomo em 90 | Aumenta um pouco | BPM +5, respeitando 30–240 |
| Aumentar velocidade da rolagem | Mais devagar | Velocidade automática -3, entre 6–120 |
| Cor da cifra azul | Prefiro verde | Cor verde, não uma música chamada Verde |
| Capotraste na casa dois | Aumentar um pouco | Casa três, limite zero–12 |
| Capotraste na casa dois | Prefiro casa quatro | Casa quatro |
| Subir tom | Diminuir um pouco | Desce um semitom |
| Tema claro | Prefiro escuro | Tema escuro |
| Idioma inglês | Prefiro italiano | Idioma italiano |
| Aumentar fonte (no palco) | Diminuir um pouco | Fonte -2, respeitando o limite nativo |
| Abrir evento de hoje | Abra a primeira música | Primeiro item daquele evento |

Também há “segunda/terceira/.../décima/última música” e “abrir música número N”.
Posição significa a posição no repertório real, não uma lista reordenada por títulos.
Se o item estiver ausente no dispositivo, o assistente informa isso e não pula
silenciosamente para outra música. Uma posição negativa, inválida ou inexistente
não abre nada. Sem um evento acessível aberto, o pedido é recusado.
Para títulos que poderiam soar como uma posição, use “abrir música [título]”.

## Regras de memória

Não há histórico de conversa extenso, gravação, transcrição persistida ou LLM novo.
A referência guarda apenas tipo do controle, valor confirmado, identidade/contexto
e prazo; fica em RAM e desaparece ao recarregar a página.

O contexto inclui conta/autenticação/dono da biblioteca, prontidão, tela, música,
evento/item, permissões, editor e camada aberta. Trocar qualquer um deles invalida
a referência. Fechar a música invalida imediatamente, mesmo se ela for reaberta.
Um valor alterado manualmente também invalida a referência daquele controle.

Somente resultados confirmados (inclusive um ajuste que já estava no valor pedido)
criam referência. Falha, negação, cancelamento e comandos sem controle compatível
não viram alvo de pedidos vagos. “Salvar alterações” e ajuda preservam uma referência
ainda válida. Desfazer a descarta.

Uma sequência com vários controles distintos não cria um foco arbitrário.
Uma sequência com um único controle reconhecido e salvamento pode criar referência
a ele. Uma falha parcial não gera referência baseada no resultado incompleto.

Correções como “prefiro verde” precisam de referência recente compatível e de um
valor válido. Não é usado texto livre como código. Pedidos completos continuam
independentes da memória; “abrir música Verde” continua abrindo a música.

Uma pergunta já aberta tem prioridade para interpretar sua resposta, especialmente
seleção de entidade ou confirmação. A memória não transforma “sim” em uma ação,
não envia convites, não exclui músicas e não reduz as confirmações de segurança.
Pedidos relativos soltos depois de uma pergunta expirada mantêm a proteção existente.

## Escopo de dados e segurança

Os ajustes contextuais não salvam música automaticamente. Continuam sujeitos ao
botão/comando de salvar; no evento, usam a versão pessoal do evento e não alteram
a playlist nem a biblioteca comunitária.

O desfazer da entrega 4 continua aplicável aos controles já suportados por ele.
Fonte e velocidade de rolagem agora aceitam referências relativas, mas continuam
fora do desfazer/lotes conforme os limites daquela entrega.
O ajuste de velocidade contextual é explicitamente da rolagem automática, não muda
a sensibilidade nem o andamento do reconhecimento de acordes da rolagem inteligente.

Nenhum novo endpoint, chamada paga, áudio enviado, credencial, nome ou conteúdo de
música é guardado na memória contextual. A captação da fala continua sendo a função
do navegador já existente, com suas permissões e limitações.

## Arquivos

- `js/assistant-memory.js`: tabela de controles, traduções, prazo e invalidação.
- `js/assistant-dialogue.js`: traduz pedidos antes da execução; registra resultados
  completos e respostas de parâmetros; reutiliza as perguntas existentes.
- `js/app-assistant.js`: liga a memória ao estado nativo, sincroniza ao trocar telas
  e executa a abertura contextual do evento.
- `js/assistant-actions.js` / `js/assistant-action-runtime.js`: ação `event.song`
  validada e verificada, com a função nativa de abertura por item.
- `index.html`: script novo; correção de uma referência ao evento errado no filtro
  de `openDetailFromPlaylist` (agora usa o objeto `playlist` daquela função).
- `service-worker.js`: nova revisão e arquivos, sem apagar biblioteca/perfil.
- `package.json` e testes: validações de memória e cache atualizado.

## Verificação

- `npm test`: regressão geral, incluindo `assistant-memory.test.js`.
- `npm run test:assistant:ui`: seis testes de interface, incluindo memória.
- `tests/pwa-branding.test.js`: revisão do cache/PWA.
- Novo unitário cobre correções/relativos, confirmação, limites, expiração, edição
  manual, conta/contexto, falha, undo, posição do evento e duplicação de pedido.
- Novo teste de navegador usa clique real no botão e transcrição simulada; verifica
  pergunta antes de agir, barreira da fala, retomada, abertura diretamente visível,
  isolamento do evento, expiração e troca de conta.

Os testes simulam a transcrição; não certificam a captação de um microfone físico.

## APPLE DESIGN RESEARCH — dispensa autorizada

Pergunta: como interpretar referências recentes e confirmar pedidos ambíguos sem
introduzir uma nova interface? `apple-docs/search_docs` e `read_doc` estavam
indisponíveis. Nenhuma fonte Apple foi consultada ou inventada. O usuário autorizou
explicitamente seguir sem essa pesquisa nesta etapa.

Decisão específica do ROUDY: referência curta, contexto isolado, resultado confirmado
e reutilização do feedback/perguntas já existentes. Isso é uma decisão do produto,
não uma recomendação atribuída à Apple.
