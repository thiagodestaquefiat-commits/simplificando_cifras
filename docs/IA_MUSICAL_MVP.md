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
rápida. A cifra completa só pode ser produzida a partir de material enviado pelo
usuário; em pesquisa sem fonte ela é nula.

## Upload e privacidade

São aceitos PDF, PNG, JPG/JPEG, WebP e TXT, observados os limites configurados.
O arquivo é validado por assinatura, MIME, extensão, tamanho e páginas. Ele é
processado em memória, não é persistido e seu conteúdo não entra nos logs. A
rota exige usuário autenticado e o resultado sempre abre como rascunho.

## Pesquisa online e fontes autorizadas

O módulo `music_sources.py` define um contrato desacoplado e uma lista explícita
de hosts HTTPS permitidos. Nenhum coletor de site está ativado no MVP. Sem uma
fonte autorizada, a pesquisa pode produzir apenas informação harmônica conhecida,
com confiança no máximo média, revisão obrigatória e sem letra ou frase-gancho.

Fontes avaliadas:

- [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API): API oficial útil
  para identificação e metadados, mas não fornece letra+cifra;
- [Spotify Web API](https://developer.spotify.com/documentation/web-api): API
  oficial de metadados e reprodução; não é usada como fonte de letra+cifra;
- [Musixmatch API](https://github.com/musixmatch/musixmatch-sdk): catálogo de
  letras licenciadas, sujeito a contrato, termos e credencial própria. Uma
  integração só deve ser ativada após autorização comercial e jurídica.

Sites de cifra sem API oficial/licença comprovada não entram na allowlist. Não
são permitidos scraping indiscriminado, bypass de login, CAPTCHA, paywall ou
proteções anti-bot.

## Segurança e observabilidade

A chave da OpenAI permanece somente no Railway. O frontend envia o token de
sessão; o backend determina o usuário autenticado. CORS, rate limit, timeout,
Structured Outputs e classificação segura de erros permanecem ativos. Logs
podem conter request ID, duração, tipo da entrada, tamanho e páginas, mas nunca
letra, cifra, arquivo, token ou segredo.

