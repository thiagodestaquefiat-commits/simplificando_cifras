# Assistente ROUDY — entrega 4: sequências e desfazer

## Escopo desta entrega

Implementação local, sem publicação ou alterações no banco/servidor.
URL de teste: `http://127.0.0.1:4173/?assistente-sequencias=353`.
Cache: `simplificando-cifras-v353-assistente-sequencias`.

O botão, captura de voz e acompanhamento da entrega 3 continuam sendo usados.
Não foi criada uma tela ou painel de conversa. Os comandos completos são executados
diretamente; perguntas de parâmetros e confirmações existentes permanecem.

## Sequências

Até três ações completas, executadas na ordem falada. Exemplos:

- “Coloque o capotraste na casa dois, ajuste o metrônomo em cento e vinte e cinco e salve as alterações.”
- “Subir tom e capotraste na casa três e salvar.”
- “Cor da cifra azul e tema escuro.”
- “Compasso três por quatro e BPM noventa.”

Controles combináveis: capotraste, transposição relativa/restaurar tom, BPM absoluto
ou relativo, compasso e preferências (cor da cifra, idioma, tema, escala, alto
contraste e modo para daltônicos). BPM e compasso combinados precisam estar na tela
da música; não se abre o metrônomo global no meio de um lote. “Salvar” é opcional,
somente como última etapa após ao menos um ajuste da música.

Separadores: “e” antes de outra ação/controle, vírgula antes de uma ação/controle,
“e depois”, “depois”, “em seguida” e ponto e vírgula. As conjunções dos números
(“cento e vinte e cinco”) não são separadores. Cada parte usa o normalizador e
os parsers/limites existentes. Não há execução livre de texto nem interpretação
generativa de ações desconhecidas.

O lote completo é validado antes de iniciar: limites, permissões, conta pronta,
editor fechado, contexto da música, ações permitidas e posição do salvamento.
Pedidos incompletos, negados, fora de faixa, com mais de três ações, controles
repetidos ou operação não combinável são recusados sem executar a primeira parte.

Navegação, convite, exclusão, geração de música, importação/exportação, entrada/
saída da conta e ligar/desligar ferramentas são pedidos separados nesta entrega.
Seus caminhos e confirmações existentes não foram substituídos.

Falha durante execução: interrompe imediatamente, não executa passos restantes e
informa quantas etapas foram confirmadas, com o resultado real de cada etapa no
payload. Uma falha de BPM, por exemplo, não deixa a etapa “salvar” executar. Não há
promessa de transação/rollback automático nem de cancelar gravação remota enviada.
Mudança de conta/tela ou alteração manual em controle envolvido interrompe o lote.
Há bloqueio de execução simultânea e deduplicação por identificador de pedido.

## Desfazer

“Desfaça a última alteração”, “desfazer”, “desfaz” ou “voltar ao ajuste anterior”.
Restaura os valores anteriores dos controles suportados que realmente mudaram no
último pedido por voz. Um lote é uma única entrada; respostas de acompanhamento
(“Qual cor?” → “azul”) também são registradas. Pedidos sem mudança não criam uma
entrada nova. Salvar isoladamente não elimina o último ajuste reversível.

Histórico: somente uma entrada em memória, vinculada à conta, tela, música,
evento/item, permissões e camada aberta. Fechar a música invalida imediatamente
o histórico, mesmo se ela for reaberta rapidamente. Trocar contexto/conta, navegar
ou executar operação não suportada descarta a entrada; não existe histórico global
compartilhado entre usuários. Nenhuma fala, credencial, letra ou gravação é armazenada
no histórico. Recarregar a página o elimina.

Antes de restaurar, cada controle deve continuar no valor deixado pelo assistente.
Se houver edição manual posterior nesses controles, nada é sobrescrito. Controles
não envolvidos são preservados. Na rara falha durante a restauração, a resposta
informa a quantidade restaurada, sem afirmar sucesso integral ou tentar novamente
automaticamente.

O desfazer da música altera somente o rascunho. Mesmo após “salvar”, ele não grava
silenciosamente no banco: o botão de salvar reaparece conforme a comparação com
o estado salvo. Dizer “salvar alterações” confirma a gravação do estado restaurado.
Preferências globais são restauradas usando sua persistência nativa. Não restaura
estado de reprodução, gravação enviada, convite, exclusão, vídeo ou importação.
Fonte, instrumento, velocidade de rolagem e visualização seguem funcionando por
comandos individuais, mas não participam de lotes/desfazer nesta entrega.

## Arquivos da entrega

- `js/assistant-sequences.js`: coordenador de lote, validação e histórico escalar.
- `js/assistant-action-manager.js`: método puro `preview`, reutilizando as mesmas regras.
- `js/app-assistant.js`: integra coordenador abaixo do diálogo, leitura/restauração
  pelos controles nativos e sinônimo “coloque”.
- `js/assistant-dialogue.js`: novo lote/desfazer substitui uma pergunta pendente.
- `js/assistant-action-runtime.js`: ajuda atualizada com os novos limites.
- `index.html`: script novo, revisões e invalidação ao fechar a música.
- `service-worker.js`: nova revisão sem apagar biblioteca/dados locais.
- `package.json` e testes: inclusão das validações da entrega e cache atualizado.

## Validação

- Unitário `assistant-sequences.test.js`: limite, validação completa antes de efeito,
  números falados, conflitos, negação, falha parcial sem salvar, deduplicação, trava,
  diálogo, edição manual, isolamento por contexto/conta e desfazer de lote.
- Navegador `assistant-sequences-ui.test.js`: clique no ícone + fala simulada,
  controles/salvamento reais, rascunho após desfazer, evento sem afetar playlist,
  falha de armazenamento, edição manual e fechamento/reabertura.
- Regressão geral, suíte de interface do assistente e cache/PWA.

Reconhecimento de microfone físico depende do navegador e de suas permissões;
o teste automatizado simula a transcrição, não certifica a captação no aparelho.

## APPLE DESIGN RESEARCH — dispensa autorizada

Pergunta: execução de vários ajustes e desfazer por voz, preservando confirmação
e contexto. O MCP `apple-docs` permaneceu indisponível; não foram consultadas fontes
Apple nem atribuídas recomendações a elas. O usuário autorizou explicitamente
seguir sem essa pesquisa nesta entrega. Decisão específica do ROUDY: usar o feedback
já existente, sem nova interface, com lotes restritos e desfazer não destrutivo.
