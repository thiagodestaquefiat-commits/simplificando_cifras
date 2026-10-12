# Assistente ROUDY — entrega 6: linguagem natural abrangente e controlada

Implementação local, sem publicação e sem alterações no banco/servidor.
URL: `http://127.0.0.1:4173/?assistente-natural=355`.
Cache: `simplificando-cifras-v355-assistente-natural`.

## Resultado

330 sinônimos normalizados, mais regras de parâmetros, datas e referências.
Os testes verificam a interpretação dos **48 tipos de ação nativos** do catálogo
(excluindo apenas o fallback de compatibilidade). Isso não significa compreender
toda frase possível nem que todas as operações estejam disponíveis em qualquer tela.

O motor local continua sem IA generativa nova/API paga. A nova camada usa uma tabela
de expressões, gramáticas fechadas e comparação conservadora de pequenas diferenças
na escrita de nomes de telas. A execução segue pelo gerenciador existente, com suas
permissões, validações, confirmações e verificação do resultado.

Não foi criada uma interface de conversa. O botão, feedback, fala e perguntas das
entregas anteriores foram reutilizados. O assistente permanece oculto no perfil.

## Exemplos por função

| Área | O que você pode dizer | O que acontece |
|---|---|---|
| Playlist | “Mostrar minhas músicas”, “meu repertório” | Abre a playlist |
| Agenda | “Minha agenda”, “ver meus compromissos” | Abre eventos |
| Datas | “Quero ensaiar para amanhã”, “ensaiar dia 20” | Procura eventos acessíveis; pergunta se há vários |
| Evento por nome | “Mostrar evento chamado Ensaio de Amanhã” | Trata o nome como título, não como data relativa |
| Repertório do evento | “Mostrar primeira canção”, “abrir última música” | Abre o item na versão do evento |
| Música por título | “Ensaiar música [título]”, “abrir música [título]” | Abre a música pessoal correspondente |
| Busca | “Pesquisar na minha playlist [nome]” | Usa a busca existente do aplicativo |
| Vídeo | “Buscar gravação de [nome] no YouTube” | Abre resultados; não vincula vídeo automaticamente |
| Tom | “Subir meio tom”, “baixar a tonalidade” | Transpõe um semitom |
| Quantidade de transposição | “Subir tom dois tons”, “descer tom dois semitons” | +4 ou -2 semitons, respeitando o limite total |
| Capotraste | “Usar capo na casa dois”, “tocar sem capotraste” | Ajusta/remove na música atual |
| BPM | “Ritmo em noventa”, “ajustar andamento para cento e vinte e cinco” | Ajusta o metrônomo contextual |
| Batidas | “Começar as batidas”, “parar o clique” | Inicia/para o metrônomo |
| Compasso | “Usar compasso três por quatro” | Aplica um dos compassos suportados |
| Rolagem | “Rolar a página” | Pergunta automática ou inteligente quando necessário |
| Rolagem automática | “Rolar sozinho”, “iniciar rolagem por tempo” | Ativa a automática |
| Rolagem inteligente | “Seguir os acordes tocados”, “acompanhar o violão” | Ativa o reconhecimento existente, com suas permissões |
| Velocidade | “Rolagem está rápida demais” | Reduz a velocidade automática, não altera o detector de acordes |
| Velocidade sem alvo | “Está rápido demais” | Usa referência recente compatível ou pergunta BPM/rolagem |
| Afinador | “Afinar minha guitarra”, “preciso afinar” | Abre o afinador, com instrumento se especificado |
| Microfone do afinador | “Começar a afinação”, “terminar afinação” | Inicia/para o afinador nativo |
| Cordas | “Afinar a corda dois”, “detectar corda automaticamente” | Seleciona corda/modo automático |
| Diagramas | “Tocar com teclado”, “mostrar acordes de ukulele” | Muda o instrumento dos diagramas |
| Visualização | “Mostrar cifra completa”, “mostrar apenas a letra” | Abre a visualização existente |
| Tablaturas | “Mostrar os riffs”, “ver os solos” | Abre tablaturas se compatíveis e disponíveis |
| Navegação musical | “Passar para o próximo louvor”, “voltar para o louvor anterior” | Navega no repertório aberto |
| Palco | “Preparar modo palco”, “encerrar modo palco” | Entra/sai do palco |
| Fonte | “Letra maior”, “diminuir letras” | Ajusta a fonte no modo palco |
| Leitura ambígua | “Está difícil de ler” | Pergunta entre opções disponíveis; não escolhe por suposição |
| Interface | “Usar interface 120 por cento” | Aplica a escala suportada |
| Cor | “Deixar cifras verdes”, “trocar cor dos acordes” | Aplica a cor ou pergunta qual |
| Idioma | “Usar o aplicativo em inglês”, “usar outro idioma” | Aplica um idioma suportado ou pergunta qual |
| Tema/acessibilidade | “Usar tema escuro”, “ativar contraste alto” | Usa preferências nativas |
| Perfil | “Personalizar meu perfil”, “editar meus instrumentos” | Abre o formulário; não edita dados pessoais automaticamente |
| Notificações | “Ver convites recebidos”, “central de notificações” | Abre a central |
| Bandas | “Ver minhas bandas”, “gerenciar meus grupos” | Abre a gestão existente |
| IA | “Criar música com inteligência artificial” | Abre criação e revisão, sem gerar/salvar automaticamente |
| Busca por IA | “Buscar música com IA” | Abre o fluxo de busca por IA |
| Arquivo/foto | “Importar um PDF”, “enviar arquivo de cifra” | Abre o formulário de arquivo/foto |
| Texto | “Colar uma cifra”, “digitar uma música” | Abre a aba Texto do criador |
| Câmera | “Fotografar uma cifra”, “usar a câmera” | Abre o fluxo de câmera e suas permissões |
| Edição | “Corrigir esta música”, “abrir editor da música” | Abre o editor; exige concluir o editor para outros comandos |
| Salvar | “Guardar meus ajustes”, “salvar o que mudei” | Salva pelo caminho nativo pessoal/contextual |
| Exclusão | “Apagar esta música” | Mantém confirmação por voz e confirmação nativa |
| Medley | “Montar medley”, “inserir bloco no medley”, “guardar meu medley” | Abre os respectivos fluxos nativos |
| Limpar Medley | “Zerar meu medley” | Mantém as confirmações, sem limpeza aproximada |
| Criar evento | “Marcar um evento”, “novo compromisso” | Abre o formulário de criação |
| Conversa do evento | “Abrir conversa do evento” | Abre o chat do evento acessível |
| Avisos do evento | “Ver avisos deste evento” | Abre avisos/notificações daquele evento |
| Editar evento | “Alterar os dados do evento” | Abre a edição, respeitando liderança |
| Compartilhar | “Ver link do evento”, “compartilhar repertório do evento” | Abre a prévia/fluxo; não envia silenciosamente |
| Liderança | “Passar a liderança” | Abre seleção e confirmação nativas; somente líder |
| Convidar | “Procurar integrante”, “chame João para o evento” | Busca/seleciona, exige permissões e confirmações |
| Organizar evento | “Escolher músicas do evento”, “mudar ordem do repertório” | Abre a organização, somente líder |
| Participantes | “Quem participa deste evento” | Exibe os integrantes |
| Excluir evento | “Apagar este evento” | Abre ações; exclusão e confirmação continuam na tela |
| Conta Google | “Login com Google”, “entrar na minha conta” | Inicia o login disponível |
| Sair | “Desconectar minha conta” | Mantém verificação/confirmadores existentes |
| Sincronização | “Sincronizar meus dados” | Executa a sincronização e reporta resultado real |
| Exportar backup | “Baixar meu backup”, “fazer backup do perfil” | Gera o arquivo pelo exportador existente |
| Importar backup | “Carregar backup do perfil” | Abre o fluxo; seleção do arquivo continua exigindo toque |
| Diagnóstico | “Gerar arquivo para suporte” | Usa o exportador de diagnóstico existente |
| Contribuição | “Copiar Pix Copia e Cola” | Copia pelo caminho nativo, sem iniciar cobrança |
| Ajuda | “O que posso pedir”, “quais são seus comandos” | Explica capacidades e limites |

## Sequências, memória e perguntas

- Até três ajustes por pedido, com validação completa antes de iniciar.
- Exemplo: “Usar capo na casa dois e ritmo noventa e guardar meus ajustes”.
- Navegação, geração, exclusão e operações sensíveis permanecem fora dos lotes.
- Conjunções de números (“cento e vinte e cinco”) não dividem o pedido.
- Uma falha interrompe os passos seguintes; não há salvamento depois de ajuste falho.
- Memória curta de 45 segundos continua vinculada a conta/tela/música/evento/item.
- “Está rápido demais” significa reduzir; “mais rápido” significa aumentar.
- Sem referência compatível, BPM e rolagem não são escolhidos arbitrariamente.
- “Está difícil de ler” oferece fonte somente no palco, além de aparência/contraste.
- “Ajustar tamanho” diferencia interface e música; pode abrir o palco após escolha.
- A pergunta pendente mantém prazo, invalidação por contexto e três tentativas.
- A escuta de resposta continua aguardando a fala da pergunta terminar.
- Desfazer conserva as regras da entrega 4: não apaga dados nem reverte gravação
  remota automaticamente; restaurar um rascunho salvo exige salvar novamente.

## Proteções contra conflitos

1. **Polarity:** comandos negados não executam. Uma alternativa do reconhecimento
   não pode eliminar a negação presente na transcrição principal.
2. **Dados literais:** títulos, buscas e identificadores não usam correspondência
   aproximada. Palavras numéricas em nomes não são convertidas em parâmetros.
   “Mostrar evento chamado Ensaio de Amanhã” usa título, não a data amanhã.
3. **Aproximação limitada:** somente abertura de 11 telas/ferramentas de consulta;
   similaridade mínima 0,94 e margem mínima 0,08. Sem aproximação de exclusão,
   importação, exportação, login, convite, parâmetros numéricos ou reprodução.
4. **Valores:** limites nativos de BPM, capotraste, escala, compasso, cordas e
   transposição permanecem; datas inválidas e parâmetros negativos são recusados.
5. **Escopo:** alterações dentro do evento continuam pessoais daquele evento;
   não alteram a playlist nem a biblioteca comunitária.
6. **Permissões:** conta pronta, editor, acesso ao evento e liderança são conferidos
   novamente na execução. Duplicação e comandos simultâneos continuam bloqueados.
7. **Resultados reais:** abrir um formulário não é gerar/salvar conteúdo; iniciar
   câmera/afinador não dispensa permissões; backup não é automaticamente importado.

## Limites explícitos

É uma ampliação do motor local, não um assistente generativo capaz de qualquer
pedido. Não cria funcionalidades que o app não oferece. Não altera volume do
aparelho, não traduz voz para todas as línguas e não executa instruções livres
extraídas de letras, arquivos ou nomes de usuários.

A transposição numérica exige unidade: “dois semitons” ou “dois tons”. Um tom vale
dois semitons. O atalho antigo “subir tom” mantém seu comportamento de um semitom.
As mensagens reportam a mudança efetiva, inclusive quando o limite total é alcançado.

Fonte da música por voz continua no palco; tamanho da interface é outra preferência.
Tablaturas continuam condicionadas ao instrumento e ao conteúdo disponível.
Criação por IA, arquivo, foto e texto apenas abre os respectivos fluxos, com revisão.
Funções dependentes de rede continuam com suas dependências anteriores. A camada
de interpretação nova é local; ela não muda a compatibilidade/captação do navegador.

## Arquivos alterados nesta etapa

- `js/assistant-language.js`: novo catálogo modular, gramáticas, ambiguidades e
  aproximação de navegação; sinônimos conflitantes são rejeitados na inicialização.
- `js/assistant-action-manager.js`: traduz para pedidos nativos preservando o texto
  original, números negativos, validação, permissões e os limites de comandos.
- `js/assistant-actions.js`: semântica de datas/títulos, unidades de transposição,
  validação de datas e cordas negativas, títulos literais de estudo/ensaio.
- `js/assistant-action-runtime.js`: datas naturais chegam ao resolvedor existente;
  transposição informa o número real de semitons alterados.
- `js/assistant-dialogue.js`: usa parâmetros traduzidos para perguntar o que falta;
  um novo pedido reconhecido substitui uma pergunta antiga, sem consumir sua resposta.
- `js/assistant-memory.js`: reconhece queixas de andamento/velocidade.
- `js/assistant-sequences.js`: novos verbos de fronteira e aliases em lotes seguros.
- `js/app-assistant.js`: informa contexto de palco e protege negação na transcrição.
- `index.html` / `service-worker.js`: inclui módulo e revisões sem apagar dados locais.
- `package.json` e testes: nova cobertura de linguagem e atualização do cache.

Não foram alterados schema, Supabase, backend, serviços pagos ou caminhos de
salvamento. Não houve push, deploy ou publicação nesta entrega.

## Validação

- `npm test`: regressão geral (65 arquivos de teste).
- `npm run test:assistant`: catálogo, diálogo, lotes, memória, linguagem e cliente de intenções.
- `npm run test:assistant:ui`: sete testes de interface.
- `assistant-language.test.js`: 330 aliases, todos os 48 tipos de ação funcional,
  parâmetros, ambiguidades, nomes, datas, negações, confirmações e permissões.
- `assistant-language-ui.test.js`: clique no ícone + fala simulada, TTS/pergunta,
  parâmetros reais, transposição, lotes/salvar, criação sem autosave, eventos de
  amanhã, nome literal e assistente oculto no perfil.
- Cache/PWA e integridade do patch verificados.

As transcrições foram simuladas; a qualidade de captação do microfone físico precisa
ser testada no aparelho do usuário.

## APPLE DESIGN RESEARCH — dispensa autorizada

Pergunta: ampliar linguagem natural e confirmar pedidos vagos sem gerar conflitos
ou uma interface nova. `apple-docs/search_docs` e `read_doc` estavam indisponíveis;
nenhuma fonte Apple foi consultada ou inventada. O usuário autorizou explicitamente
seguir sem a pesquisa nesta etapa 6.

Decisão específica do ROUDY: reutilizar fala/perguntas existentes, manter ações
nativas, usar catálogo fechado, restringir aproximação a navegação e preservar
as confirmações. São decisões do produto, não recomendações atribuídas à Apple.
