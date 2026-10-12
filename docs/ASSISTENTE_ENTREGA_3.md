# Assistente de voz — entrega 3: acompanhamento

Implementação local em 10/10/2026. Complementa as entregas 1 e 2.

O usuário autorizou dispensar a pesquisa `apple-docs` apenas nesta etapa, após a conexão exigida pelas regras do projeto estar indisponível. Nenhuma documentação Apple foi consultada ou atribuída à implementação. Foram mantidos o ícone, a animação de escuta, os avisos e a fala já existentes; não foi criado painel de conversa.

## Quando conversa e quando executa

Comandos completos continuam executando diretamente: `mudar cor da cifra para azul` ou `iniciar metrônomo` não geram pergunta adicional. Há acompanhamento quando falta um parâmetro, existe mais de uma opção ou a operação precisa de confirmação.

Exemplos:

- `Mude a cor da cifra` → `Qual cor?` → `Verde` → aplica verde.
- `Mudar idioma` → pergunta idioma → `Inglês` → aplica inglês.
- `Mudar BPM` → pergunta andamento → `Noventa` → ajusta o controlador correto.
- `Ativar rolagem` → automática ou inteligente → ativa a escolhida.
- `Abra o evento de hoje` → se único, abre direto; se múltiplos, informa opções → `O culto` ou `o segundo` → abre diretamente o escolhido, sem deixá-lo atrás da música.
- Música com título duplicado → pergunta qual artista/opção → `de Bia` ou `o primeiro` → abre a correspondência selecionada.
- `Convida João` no evento de um líder autenticado → consulta pessoas elegíveis → pergunta qual João, se necessário → pergunta se deseja convidar → `sim` → mantém a confirmação nativa antes do envio.

## Parâmetros de acompanhamento

Cor das cifras, idioma, tema, escala da interface, BPM, capotraste, compasso, instrumento dos diagramas e ajuste relativo de tom. Também pode pedir o título de uma música, o nome/data de um evento ou a pessoa a convidar. A saudação `Roudy` usa o mesmo fluxo: pergunta o pedido, termina a fala e só então escuta.

A afinação/rolagem/controle de estudo continuam usando as funções reais do app. Não se inventa valor ausente. Notas de tom absoluto e instrumentos não suportados não são aplicados como se fossem suportados.

## Escuta e segurança

- Uma única pergunta pendente, somente em memória.
- Espera a pergunta falada terminar; aguarda 180 ms antes de uma única retomada de escuta. Não é escuta contínua nem palavra de ativação permanente.
- Se o navegador negar a retomada, mantém a pergunta para o usuário tocar no ícone e responder. Não fica tentando iniciar o microfone em loop.
- Expira após 30 segundos; após o término normal da pergunta falada, a janela de resposta é renovada. Um toque manual para responder também renova a janela ainda válida.
- `Cancelar`, `esquece` e `deixa pra lá` encerram o pedido. `Não` cancela uma confirmação. Tocar para interromper a escuta encerra a conversa.
- Um novo pedido explícito substitui a pergunta anterior.
- Conta, identidade carregada, tela, música, evento/item, visualização, camadas abertas, editores e permissões vinculam a pergunta. Mudar esse contexto invalida a resposta e cancela captura/fala de pergunta antiga.
- Resposta curta expirada não é reinterpretada como uma música com o mesmo nome ou aplicada a outra conta.
- Máximo de três respostas não identificadas por pergunta; depois solicita um novo pedido.
- Até cinco opções nomeadas por vez. Listas maiores pedem refinamento; não escolhe arbitrariamente a primeira pessoa/música/evento.
- Escolhas usam IDs e voltam ao executor para revalidar elegibilidade, acesso e disponibilidade. Pessoas removidas da busca ou mudança de liderança impedem o convite.
- Convites excluem o próprio usuário e integrantes já participantes. A busca continua usando nome e nome de usuário, e o servidor mantém sua autorização.
- Confirmação falada não substitui as confirmações nativas de exclusão, saída, limpeza do Medley e envio do convite. Nenhuma escrita sensível ocorre apenas por abrir uma pergunta.
- A mesma sessão de resposta não repete um convite/alteração. Sem histórico persistente de áudio, transcrições, perguntas ou credenciais.
- As alterações pessoais da música do evento continuam separadas da playlist e do catálogo comunitário.

## Arquitetura

- `js/assistant-dialogue.js`: memória, parâmetros, escolha, confirmação, cancelamento, expiração e deduplicação. Respostas voltam ao mesmo gerenciador de ações.
- `js/assistant-action-manager.js`: escolha por ID restrita às ações permitidas; revalidação de acesso/liderança e contexto.
- `js/assistant-action-runtime.js`: escolhas estruturadas de músicas/eventos/ferramentas e busca/convite de pessoa. Agora há 47 ações centrais, além do fallback.
- `js/assistant-actions.js`: ação declarativa `event.invite-person`.
- `js/app-assistant.js`: barreira entre fala e microfone, uma retomada controlada, alternativa por toque e assinatura das telas/camadas.
- `js/event-user-invites.js`: voz reutiliza o envio nativo com confirmação; abertura/foco atrasados da busca são invalidados ao fechar/trocar a folha.
- `index.html` e `service-worker.js`: carregamento e cache dos módulos atualizados, sem limpar dados locais.

## Verificação

- `tests/assistant-dialogue.test.js`: comandos diretos, parâmetros, escolhas, cancelamento, expiração, contexto/conta, respostas repetidas, elegibilidade de convite e confirmação nativa.
- `tests/assistant-dialogue-ui.test.js`: ícone → transcrição simulada → pergunta → término da fala → resposta; falha de retomada; evento aberto diretamente; perfil, expiração, troca de conta; seleção de pessoa e envio único simulado.
- Os testes anteriores de ações e integração foram mantidos e ajustados apenas onde o acompanhamento muda intencionalmente o fluxo.
- `npm test`, `npm run test:assistant:ui` e o teste de PWA verificam regressões e recursos locais/offline.

Testes utilizam dados fictícios, APIs simuladas e fala/microfone simulados. Não certificam transcrição em microfone físico, login Google ou envio em produção. Convites reais exigem backend, conexão, login e permissão; o reconhecimento de voz continua dependente do navegador.

Interface local: `http://127.0.0.1:4173/?assistente-conversa=352`.
Cache: `simplificando-cifras-v352-assistente-conversa`.

Nenhum deploy, push ou alteração de banco de produção nesta entrega.
