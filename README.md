# Simplificando Cifras

O detalhe de cada música agora inclui um player de estudo do Spotify. Músicas importadas já chegam vinculadas; músicas antigas tentam uma associação exata por título e artista e, quando isso não for seguro, exibem uma busca manual. A reprodução completa usa o Web Playback SDK e requer uma conta Spotify Premium autorizada no aplicativo.

Aplicação web progressiva para organizar, estudar e executar repertórios musicais, criar eventos, escalar membros e conversar com a equipe.

O plano de evolução da base local para uma plataforma colaborativa está documentado em [ROADMAP.md](ROADMAP.md).

## Identidade visual

A Sprint 4 estabelece uma identidade visual escura, moderna e centrada no uso por músicos em ensaios e no palco. A marca combina a nota musical com circuitos tecnológicos em degradê verde-azul. A interface utiliza Inter, azul `#2563EB`, verde `#22C55E`, branco e cinzas neutros, com contraste alto, sombras discretas e componentes arredondados.

A atualização é exclusivamente visual: arquitetura, navegação, catálogo, persistência, regras de negócio e funcionalidades permanecem inalterados. Os ícones PNG da PWA são fornecidos em 48, 72, 96, 128, 192, 256 e 512 pixels.

## Como executar

O projeto usa HTML, CSS e JavaScript puro. Para que o service worker e o login Spotify funcionem, abra-o pelo servidor HTTP local incluído no projeto, e não diretamente como arquivo.

Com Node.js instalado:

```bash
npm run dev
```

Depois, acesse `http://127.0.0.1:4173/`.

## Dados e persistência

- O catálogo padrão contém 86 músicas no formato legado compatível `{ l, c }`.
- Toda música é normalizada pelo modelo `Song`, com metadados próprios e campos externos opcionais.
- Músicas, eventos, repertórios e conversas ficam no armazenamento local do navegador neste MVP.
- Playlists legadas em `cifras_setlists_v1` são migradas para eventos em `sc_events_v1` sem perda do repertório.
- A coleção de músicas usa `sc_songs_v1` e mantém uma cópia compatível em `cifras_musicas_v1` durante a migração.
- `js/storage.js` é a única camada autorizada a acessar diretamente o `localStorage`.
- Limpar os dados do navegador remove alterações locais. Faça uma cópia antes de limpar.

### Modelo Song

O modelo central preserva `key`, `capo` e `blocos` usados pela interface atual e acrescenta `album`, `duration`, `coverUrl`, `spotifyTrackId`, `spotifyUri`, `isrc`, `createdAt` e `updatedAt`. Os campos externos são opcionais, portanto uma música não depende do Spotify para existir.

## Funcionalidades

- biblioteca e busca por título, artista ou tom;
- conexão Spotify com OAuth 2.0 Authorization Code + PKCE;
- pesquisa de faixas no Spotify e importação segura dos metadados para a biblioteca local;
- transposição e retorno ao tom original;
- seleção de capotraste e diagramas de acordes;
- playlist principal com biblioteca e pesquisa musical;
- criação, edição, exclusão, ordenação e compartilhamento de eventos com repertório;
- membros participantes com função ou instrumento por evento;
- ajustes pessoais e compartilhados de tom e observações por música do evento;
- notificações essenciais de alterações compartilhadas;
- chat do evento com mensagens, respostas, reações, edição, exclusão, cópia, não lidas e enquetes;
- sincronização local do chat entre abas abertas por `BroadcastChannel`;
- medley;
- modo palco com navegação, auto-scroll, velocidade e tamanho de fonte;
- diagramas em faixa horizontal própria, com indicação clara quando um desenho não está disponível;
- exportação completa da biblioteca em JSON, incluindo catálogo padrão, dados persistidos e estado atual da sessão;
- funcionamento offline após o primeiro carregamento bem-sucedido.

## Configuração do Spotify

O aplicativo Spotify deve possuir a Redirect URI de desenvolvimento abaixo, cadastrada exatamente como escrita:

```text
http://127.0.0.1:4173/
```

Para a versão publicada no Netlify, cadastre também:

```text
https://simplificandocifras.netlify.app/
```

O Spotify não aceita `localhost` para esse fluxo. Execute o projeto em `127.0.0.1`, conecte a conta pelo botão **Conectar** e autorize os escopos solicitados.

A integração usa PKCE no navegador. O Client ID é público; `Client Secret`, access tokens e refresh tokens não devem ser adicionados ao repositório. Os tokens da conta conectada ficam somente em `sessionStorage` e não fazem parte da exportação da biblioteca.

Esta etapa implementa autenticação, renovação de token, pesquisa, importação e reprodução completa pelo Web Playback SDK. No modo de desenvolvimento do Spotify, o proprietário precisa ter Premium e cada usuário de teste precisa estar autorizado no painel do aplicativo.

## Exportar biblioteca

Use o botão **Exportar Biblioteca** no topo da aplicação. O arquivo JSON separa explicitamente:

- o catálogo padrão incluído no aplicativo;
- os valores persistidos no navegador, preservados também em formato bruto por chave;
- o estado atual de músicas, eventos/repertórios, medleys, favoritos e configurações.

A exportação é local, não envia dados para backend e não altera nem remove informações do navegador.

## Navegação e Modo Palco

Os botões **Anterior** e **Próxima** aparecem somente quando a música é aberta a partir do repertório de um evento. Eles seguem a ordem definida pelo usuário e param na primeira e na última música. No Modo Palco, os diagramas são ocultados para priorizar a leitura, enquanto tom, capotraste, transposição, fonte, velocidade e auto-scroll continuam disponíveis.

## Limites do MVP colaborativo

O projeto ainda não possui backend nem autenticação própria. Por isso, chat em tempo real, permissões, notificações e edições pessoais funcionam localmente no navegador e entre abas da mesma origem. Os módulos `event-model`, `event-repository` e `event-chat` isolam essas fronteiras para que armazenamento, autorização e sincronização possam ser substituídos futuramente por uma API autenticada e banco de dados sem reescrever a interface.

## IA

A busca por IA está intencionalmente desativada no frontend. Uma versão futura deverá chamar um backend autenticado, que manterá chaves e segredos fora do navegador.

## Verificação antes de publicar

1. Abrir a aplicação e confirmar que são exibidas 86 músicas em uma instalação limpa.
2. Buscar por título, artista e tom.
3. Abrir uma música, transpor, selecionar capotraste e retornar ao original.
4. Criar, ordenar, atualizar e excluir um evento; adicionar membros, abrir o chat e confirmar a persistência após recarregar.
5. Ativar o modo palco e testar anterior, próxima, fonte, velocidade e auto-scroll.
6. No painel de aplicação do navegador, validar manifesto, service worker e modo offline.
7. Testar em retrato e paisagem, nos tamanhos de celular, tablet e computador.

## Arquivos antigos

A versão alternativa encontrada na auditoria foi preservada em `_legacy/`. Ela serve apenas como histórico e não é carregada pela aplicação.
