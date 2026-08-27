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
- Músicas e conversas continuam locais neste MVP. Eventos e repertórios também possuem uma cópia local para uso offline, mas podem ser sincronizados com a API colaborativa.
- Playlists legadas em `cifras_setlists_v1` são migradas para eventos em `sc_events_v1` sem perda do repertório.
- A coleção de músicas usa `sc_songs_v1` e mantém uma cópia compatível em `cifras_musicas_v1` durante a migração.
- `js/storage.js` é a única camada autorizada a acessar diretamente o `localStorage`.
- A versão oficial de um repertório fica no banco; tom e observações pessoais são salvos como sobreposições vinculadas ao usuário, sem duplicar o repertório.
- Limpar os dados do navegador remove dados que ainda não foram sincronizados. Faça uma cópia antes de limpar.

### Modelo Song

O modelo central preserva `key`, `capo` e `blocos` usados pela interface atual e acrescenta `album`, `duration`, `coverUrl`, `spotifyTrackId`, `spotifyUri`, `isrc`, `createdAt` e `updatedAt`. Os campos externos são opcionais, portanto uma música não depende do Spotify para existir.

## Funcionalidades

- biblioteca e busca por título, artista ou tom;
- conexão Spotify com OAuth 2.0 Authorization Code + PKCE;
- pesquisa de faixas no Spotify e importação segura dos metadados para a biblioteca local;
- transposição e retorno ao tom original;
- seleção de capotraste e diagramas de acordes;
- playlist principal com biblioteca e pesquisa musical;
- criação, edição, exclusão, ordenação e compartilhamento de eventos com repertório, restritos ao Líder do evento;
- membros participantes com função ou instrumento por evento;
- endereço com autocomplete, mapa interativo, marcador, controles de navegação e abertura no Google Maps;
- contas opcionais com Google e migração progressiva da identidade local;
- Bandas/Equipes com proprietário, líderes, integrantes e Eventos vinculados;
- versões pessoais completas — título, artista, tom, capotraste, cifra e observações — visíveis somente ao integrante;
- versões compartilhadas completas visíveis a todos e editáveis somente pelo Líder;
- notificações essenciais de alterações compartilhadas;
- chat do evento com mensagens, respostas, reações, edição, exclusão, cópia, não lidas e enquetes;
- sincronização local do chat entre abas abertas por `BroadcastChannel`;
- medley;
- modo palco configurável com presets por instrumento, repertório rápido, próxima música, temas, auto-scroll, tela cheia, Wake Lock e preparação offline;
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

Os botões **Anterior** e **Próxima** aparecem somente quando a música é aberta a partir do repertório de um evento. Eles seguem a ordem definida pelo usuário e param na primeira e na última música. Antes de entrar no Modo Palco, cada músico escolhe um preset e suas preferências pessoais. Durante a apresentação, diagramas e integrações externas são ocultados para priorizar a leitura; tom, transposição, fonte, velocidade, auto-scroll, posição, próxima música e repertório rápido continuam acessíveis. A configuração e um pacote compacto do repertório ficam salvos no aparelho.

As decisões e os limites desta primeira fase estão em [docs/modo-palco-fase-1.md](docs/modo-palco-fase-1.md).

## Eventos colaborativos e permissões

Ao sincronizar pela primeira vez, o aplicativo cria uma identidade local protegida por um token secreto. O identificador mostrado na tela de Eventos pode ser informado ao Líder para que a mesma pessoa seja reconhecida em outro evento. O token não deve ser compartilhado.

Para sincronizar a escala, o Líder deve adicionar cada colega usando o identificador exibido no aplicativo desse colega. Um membro criado apenas pelo nome continua útil na cópia local do evento, mas não recebe acesso remoto até ser associado a uma identidade registrada.

Cada evento possui exatamente um Líder. Ele pode editar o evento e o repertório oficial, adicionar ou remover músicas, alterar a ordem, gerenciar membros e salvar ajustes compartilhados. Demais integrantes visualizam a versão oficial e podem salvar somente seus próprios tom e observações. A API repete todas essas validações; esconder controles na interface não é a única barreira de segurança.

A sincronização usa a API Flask e o banco configurado por `DATABASE_URL`. Se a API estiver indisponível, alterações compatíveis permanecem locais e o botão **Sincronizar** permite enviá-las depois. Chat e enquetes ainda usam armazenamento local e `BroadcastChannel`, portanto ainda não são conversas em tempo real entre dispositivos.

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
