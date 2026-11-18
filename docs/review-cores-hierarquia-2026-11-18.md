# Revisão de cores e hierarquia do ROUDY

Análise do código atual e conferência de componentes no Chrome em viewport mobile. Não é uma auditoria completa de todas as telas, estados ou do tema claro.

## Lógica existente

A base está em `css/roudy-color-system-preview.css`, com aliases para os estilos antigos.

| Papel | Token | Cor |
|---|---|---|
| Fundo da aplicação | ui-background | #0B0B0C |
| Superfície elevada / sheets | ui-surface | #191A1C |
| Controles | ui-control | #242426 |
| Controle ativo / pressionado | ui-control-active | #343438 |
| Informação principal | text-primary | #F5F5F7 |
| Informação secundária | text-secondary | #A1A1A6 |
| Informação terciária | text-tertiary | #6E6E73 |
| Interação / seleção | roudy-electric-blue | #0789E7 |
| Êxito | semantic-success | #31C98B |
| Ação destrutiva / erro | semantic-danger | #F06464 |

Aumentar a luminosidade para distinguir superfícies sobrepostas faz sentido. Também faz sentido separar títulos, metadados e elementos decorativos por contraste. Fotos, luzes de eventos, YouTube e acordes podem ter paletas próprias sem mudar o significado das cores dos controles.

## Inconsistências encontradas

1. **Cinzas equivalentes sem papel diferente.** A Busca usa #030405 em partes ativas e #0B0B0C no estado inicial. Capas usam #202124 ou #202123, além de #1b1f26 em classes de playlists. São valores próximos sem uma distinção semântica explícita.
2. **Cinzas de texto e ícone paralelos.** Há #97979e, #979ba2, #a1a1a6, #a1a1aa, #a8abb2 e #b3b3b3. Diferenciar ícone de texto pode ser intencional, mas a decisão está em seletores locais em vez de tokens de função.
3. **Busca inicial mais clara.** #414047 foi escolhido para destacar a barra em repouso. É uma exceção deliberada, mas precisa ser um token de busca para não se espalhar para controles comuns.
4. **Seleção em azuis diferentes.** O token é #0789E7, o check do seletor usa #168be3 e ações como Nova playlist usam #69bafa. Um azul mais claro pode ajudar texto sobre fundo escuro; a diferença precisa ser por função (ação textual versus preenchimento), não por página.
5. **Estilos legados e cascata.** O index.html ainda define uma paleta roxa antiga, posteriormente sobrescrita pelo arquivo de cores. Outros CSS carregados depois aplicam valores próprios. Nem toda cor encontrada no código aparece de fato; a cascata decide a aparência final.
6. **Hierarquia tipográfica fragmentada.** Há DM Sans no body e Inter/Manrope em componentes. Isso também pode fazer textos de mesmo papel parecerem de pesos diferentes. O corpo da interface precisa ter uma família e uma escala de pesos documentadas, preservando tipografia própria de conteúdo e arte editorial.

## Contraste calculado

Razões calculadas para pares sólidos, sem opacidade, imagem ou efeito da tela.

- Texto secundário #A1A1A6 sobre sheet #191A1C: 6,77:1.
- Texto terciário #6E6E73 sobre sheet #191A1C: 3,43:1. Evitar para instruções e metadados pequenos necessários à tarefa.
- Branco sobre botão azul #0789E7: 3,66:1. Merece revisão para rótulos pequenos; a identidade azul pode ser preservada com uma variante específica para botões.
- Nota decorativa #505156 sobre capa #202124: 2,03:1. A baixa saliência é deliberada. Não reutilizar esse cinza em botões, textos necessários ou indicadores de estado.

## Recomendação

Consolidar componentes por papel. Manter fundo, superfície, controle e controle ativo; manter texto principal e secundário; reservar terciário para informação de baixa prioridade. Criar tokens explícitos para ícone de ação, ícone decorativo, busca em repouso, link azul e botão azul. Migrar os componentes por família, comparando estilos computados em cada estado. Evitar trocar todos os cinzas por um só.

A revisão da paleta inteira não foi implementada nesta tarefa.

## APPLE DESIGN RESEARCH

**Question:** Como distinguir superfícies, conteúdo secundário e ações em uma interface escura, e como separar cadastro de entrada sem rotular incorretamente uma ação?

**Sources consulted:** Apple HIG Color, Dark Mode e Managing accounts, recuperados e lidos por apple-docs.

- https://developer.apple.com/design/human-interface-guidelines/color
- https://developer.apple.com/design/human-interface-guidelines/dark-mode
- https://developer.apple.com/design/human-interface-guidelines/managing-accounts

**Apple explicit guidance:** Usar cores de modo consistente e por significado, considerar contraste e a influência da arte/transparência e identificar o método de autenticação. Diferenciar camadas na aparência escura.

**Design inference:** Vários cinzas ajudam apenas quando distinguem papéis perceptíveis. Valores quase iguais para o mesmo papel aumentam a fragmentação sem melhorar a hierarquia.

**ROUDY-specific decision:** Preservar a paleta escura autoral e as luzes dos eventos, manter o convidado disponível e separar Criar conta grátis de Entrar no fluxo de e-mail existente.

**Implementation:** Corrigido o posicionamento da capa no cabeçalho Adicionar ao repertório, alterados os ícones dos cards e a lupa selecionada, atualizados o título e os botões do login. O cadastro por e-mail permite criar usuário; Entrar não cria usuário implicitamente. Nenhuma requisição real de e-mail foi enviada na validação.

## Validação

Sintaxe HTML/JavaScript, testes de autenticação (incluindo intenção de criar ou entrar), playlists e sheet de repertório. Chrome mobile: formulário de cadastro e entrada com serviço simulado, lupa selecionada e capa sem foto centralizada em 320, 390 e 430 px. Conferidas capturas de login, Busca e Adicionar ao repertório.
