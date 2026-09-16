# IA Musical do MVP

## Uma música, duas visualizações

O aplicativo mantém um único `Song`. O resumo harmônico permanece na estrutura
normalizada do editor (`editorData.sections`) e a cifra tradicional fica em
`fullChordSheet`. A interface deriva as duas visualizações desse mesmo objeto:

- **Letra + Cifras:** seções, linhas de letra e acordes com posições semânticas;
- **Resumo Harmônico:** progressão, repetição e frase-gancho curta.

Músicas antigas continuam compatíveis por meio da conversão legada existente.
O escopo (`accessContext.scope`) permanece `personal` ou `team`, sem duplicar a
música para cada visualização.

## Structured Output v2

O backend solicita uma única resposta estruturada. `fullChordSheet.sections`
associa cada acorde a um índice aproximado da linha de letra. O campo
`harmonicSummary.blocos` contém somente o conteúdo necessário para leitura
rápida. A cifra completa pode ser produzida a partir de material enviado pelo
usuário ou de fonte externa cuja licença autorize explicitamente exibição e
persistência. Sem essa autorização, a pesquisa mantém apenas a representação
técnica parcial e não preenche `fullChordSheet`.

## Upload e privacidade

São aceitos PDF, PNG, JPG/JPEG, WebP e TXT, observados os limites configurados.
O arquivo é validado por assinatura, MIME, extensão, tamanho e páginas. Ele é
processado em memória, não é persistido e seu conteúdo não entra nos logs. A
rota exige usuário autenticado e o resultado sempre abre como rascunho.

## Pesquisa online e fontes autorizadas

O módulo `music_sources.py` define o contrato `MusicSourceProvider`, um registro
de providers aprovados e uma lista explícita de hosts HTTPS permitidos. A busca
retorna apenas candidatos e metadados. O conteúdo só é obtido no backend depois
que o usuário escolhe uma versão; só então ele segue pelo mesmo pipeline textual
do upload e gera `fullChordSheet` + `harmonicSummary` em uma única análise.

Nenhum provider de conteúdo está ativado enquanto não houver API ou parceria
autorizada. Nesse estado, a interface informa que não encontrou uma fonte
autorizada e orienta o envio de PDF, imagem ou TXT, sem chamar a OpenAI.

Fontes avaliadas:

- [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API): API oficial útil
  para identificação e metadados, mas não fornece letra+cifra;
- [Spotify Web API](https://developer.spotify.com/documentation/web-api): API
  oficial de metadados e reprodução; não é usada como fonte de letra+cifra;
- [Musixmatch API](https://github.com/musixmatch/musixmatch-sdk): catálogo de
  letras licenciadas, sujeito a contrato, termos e credencial própria. Uma
  integração só deve ser ativada após autorização comercial e jurídica; a
  oferta consultada não garante cifras;
- Cifra Club: conteúdo acessível ao usuário, mas sem API pública aprovada para
  este uso; os termos consultados vedam métodos de extração de dados. Exige
  parceria/autorização específica;
- Ultimate Guitar: conteúdo sujeito a licença e restrições de reprodução fora
  do serviço. Exige API/parceria que autorize uso e redistribuição;
- Songsterr: possível candidato técnico para tablaturas/metadados, mas deve ter
  contrato, escopo de API e direitos de uso confirmados antes de ser ativado.

Sites de cifra sem API oficial/licença comprovada não entram na allowlist. Não
são permitidos scraping indiscriminado, bypass de login, CAPTCHA, paywall ou
proteções anti-bot.

### Experimento Anthropic da PR #50

O modo `Buscar cifra` faz uma única Web Search restrita ao domínio
`cifraclub.com.br`. A mesma evidência alimenta dois resultados do mesmo
rascunho: `chord_sheet` (seções, linhas, posições e repetições) e
`harmonic_summary` (progressões e ganchos curtos). O cache usa a identidade
normalizada de artista + título + versão do analisador e não guarda páginas
brutas.

O contrato separa quatro capacidades: localizar, estruturar, exibir conteúdo
integral e persistir conteúdo integral. A página pública pode ser tecnicamente
suficiente para reconhecer estrutura e posicionamento, mas isso não comprova
licença para redistribuição. Por isso, resultados do Cifra Club permanecem
parciais e não persistíveis, salvo evidência explícita de autorização. Os Termos
de Uso consultados também vedam métodos de extração de dados, então o experimento
não contorna controles nem realiza scraping direto.

Cada futuro provider deve entregar `sourceName`, `sourceUrl`, `title`, `artist`,
`content`, `format` e `retrievedAt`. O frontend nunca envia conteúdo ou URL
arbitrária ao endpoint de geração: envia apenas IDs opacos, que o registro do
backend resolve em um provider previamente configurado.

## Segurança e observabilidade

A chave da OpenAI permanece somente no Railway. O frontend envia o token de
sessão; o backend determina o usuário autenticado. CORS, rate limit, timeout,
Structured Outputs e classificação segura de erros permanecem ativos. Logs
podem conter request ID, duração, tipo da entrada, tamanho e páginas, mas nunca
letra, cifra, arquivo, token ou segredo.
