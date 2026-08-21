# Changelog

## 0.4.0 — Eventos colaborativos (MVP local-first)

- Renomeia a aba principal para **Playlist** e a antiga área de playlists para **Eventos**.
- Migra playlists legadas para eventos com data, horário, local, informações, repertório ordenado e membros escalados.
- Adiciona funções/instrumentos por participante e apresentação compacta dos membros ao final do repertório.
- Implementa ajustes pessoais e compartilhados de tom e observações por música, com notificações essenciais.
- Adiciona chat por evento com mensagens, respostas, reações, edição, exclusão, cópia, emojis e indicadores de não lidas.
- Adiciona enquetes com múltiplas opções, escolha única ou múltipla, resultados, total e identificação de votantes.
- Sincroniza mensagens entre abas por `BroadcastChannel` e prepara serviços modulares para um backend futuro.
- Mantém compatibilidade com `cifras_setlists_v1` e cria `sc_events_v1` e `sc_event_messages_v1`.
- Atualiza o cache da PWA para `v39`.

## 0.3.1 — Player Spotify

- Refina os atalhos de 15 segundos do mini player, isolando-os dos tamanhos usados no player maximizado e eliminando sobreposição com play/pausa.
- Aplica 35% de transparência somente ao fundo do mini player, preservando capa, textos, ícones e controles com opacidade total.
- Monta o player maximizado diretamente na tela da música, fora do contêiner fixo do mini player, eliminando o dimensionamento incorreto no Chrome.
- Usa rede primeiro nas navegações da PWA para impedir que o Chrome continue servindo uma interface antiga após atualizações.
- Corrige a expansão limitada à altura da barra inferior; o player maximizado volta a ocupar toda a tela principal.
- Remove o iframe oficial da interface visível, evitando que o mini player pareça voltar para a versão antiga ao expandir.
- Adiciona uma linha do tempo interativa ao mini player.
- O mini player agora ocupa toda a largura inferior, permanece fixo durante a rolagem e se adapta a telas pequenas.
- Adiciona controles de voltar 15 segundos e avançar 15 segundos diretamente no mini player.
- Os botões de reprodução compacto e maximizado agora enviam `togglePlay` diretamente ao mesmo controlador do Spotify desde o primeiro clique.
- O iframe oficial permanece renderizado em 480 × 80 fora da tela quando recolhido, preservando as permissões de mídia criptografada e a reprodução ao alternar entre os modos.
- O player não depende mais de iniciar a música primeiro pelo botão vermelho do Spotify.
- Cache da PWA atualizado para `v38`.

## 0.3.0 - Player Spotify na música

- Adiciona o Spotify iFrame API à tela de detalhes da música.
- Remodela o player como barra compacta fixa e tela expandida inspirada no Spotify.
- Usa o botão oficial do Spotify no primeiro play e sincroniza os controles personalizados após o início.
- Mantém o player expandido montado durante os eventos de progresso, eliminando piscadas e reinicializações.
- Adiciona progresso, busca na faixa, atalhos de 15 segundos e repetição da música.
- Associa automaticamente músicas antigas quando título e artista correspondem.
- Oferece pesquisa manual para gravações ambíguas ou não encontradas.
- Mantém o player fora do Modo Palco e preserva cifras e títulos locais.

## Fase 2 — pesquisa Spotify

- Adicionada autenticação Spotify por Authorization Code com PKCE, sem Client Secret no frontend.
- Tokens limitados à sessão do navegador, com renovação por refresh token.
- Adicionada pesquisa de faixas pela Spotify Web API.
- Metadados de título, artista, álbum, duração, capa, Track ID, URI e ISRC são convertidos para o modelo `Song`.
- Resultados externos são renderizados com APIs seguras do DOM, sem interpolação em `innerHTML`.
- A importação reutiliza a deduplicação criada na Fase 1.
- Adicionado o estado “Cifra ainda não cadastrada” para músicas importadas.
- Removida da interface a busca de IA, que está fora do escopo do MVP.
- Atualizado o cache PWA para incluir os módulos Spotify.
- Adicionados testes de PKCE, troca de token e mapeamento da Web API.
- Adicionado servidor Node local sem dependências para executar o callback OAuth em `127.0.0.1:4173`.
- Corrigida a busca Spotify para fechar e limpar os resultados após adicionar uma música.
- Atualizado o cache PWA para distribuir imediatamente a correção da interface Spotify.
- A pesquisa Spotify agora atualiza os resultados automaticamente durante a digitação, com debounce e proteção contra respostas fora de ordem.

## Fase 1 — modelo central de música

- Criado o modelo `Song` independente de serviços externos.
- Adicionados metadados opcionais para álbum, duração, capa, Spotify e ISRC.
- Adicionadas normalização e detecção de duplicatas por Spotify Track ID, ISRC ou título/artista.
- Criado um repositório de músicas separado da interface.
- Implementada migração não destrutiva de `cifras_musicas_v1` para `sc_songs_v1`, com escrita compatível nas duas chaves.
- Preservados os campos legados de tom, capotraste e blocos para manter as 86 músicas e cifras existentes.
- Adicionados testes unitários do modelo, deduplicação, migração, atualização e remoção.

## Sprint 4 — evolução da identidade visual

- Aplicado o novo logo oficial com nota musical, circuitos tecnológicos e degradê verde-azul.
- Adotada a tipografia Inter e a paleta azul `#2563EB`, verde `#22C55E`, branco e cinzas neutros sobre fundo escuro.
- Atualizados visualmente cabeçalho, biblioteca, busca, playlists, medleys, música, Modo Palco, formulários, modais, abas, botões, FAB e mensagens.
- Reorganizados espaçamentos, contraste, foco de teclado, sombras, cantos e estados interativos, sem alterar fluxos ou regras de negócio.
- Gerados ícones PNG da PWA nos tamanhos 48, 72, 96, 128, 192, 256 e 512 pixels.
- Atualizados favicon, manifesto, cores de instalação e cache offline para a versão 8.
- Preservados integralmente catálogo, playlists, medleys, favoritos, busca, exportação, diagramas, transposição e Modo Palco.

## Sprint — responsividade, palco e diagramas

- Ampliada a largura máxima de leitura no computador, mantendo o aplicativo centralizado e em largura total no celular.
- Corrigidos limites de viewport, modais, FAB e controles em telas a partir de 320 px.
- Isolada a rolagem horizontal dos diagramas, com cartões legíveis e espaçamento completo nas extremidades.
- Adicionada normalização segura para busca de acordes equivalentes e baixos invertidos, sem alterar o texto musical.
- Acordes sem desenho agora exibem “Diagrama não disponível” e são registrados no console uma única vez.
- Diagramas e seletor de instrumento são ocultados somente no Modo Palco; tom, capotraste e transposição permanecem disponíveis.
- Anterior e Próxima agora aparecem apenas no contexto de uma playlist e respeitam sua ordem e seus limites.
- Adicionados testes automatizados para normalização de acordes e contexto de playlist.
- Atualizado o cache PWA para incluir os novos módulos.

## Sprint — exportação da biblioteca

- Adicionado o botão **Exportar Biblioteca**.
- Adicionada exportação JSON do catálogo padrão e dos dados do usuário com origem identificada.
- Incluídos músicas, playlists, medleys, favoritos, configurações e armazenamento bruto.
- Mantida compatibilidade com as chaves atuais e legadas do armazenamento local.
- Adicionado teste automatizado de preservação do formato e das origens.
- Atualizado o cache PWA para incluir o módulo de exportação.

## Etapa 1 — estabilização (17/07/2026)

### Organização

- Criada a auditoria inicial do projeto.
- Identificado `index.html` como versão principal.
- Movida a versão alternativa não utilizada para `_legacy/`, sem exclusão.
- Criada documentação de execução, testes e próximos passos.

### Correções

- Adicionados ao HTML os controles que o modo palco já esperava encontrar.
- Removida a definição duplicada de `closeDetail()`.
- Adicionadas busca por artista e limpeza de referências de playlists ao excluir uma música.
- Adicionados controles de música anterior/próxima, velocidade do auto-scroll e tamanho da fonte.
- Removida referência a elemento de capotraste inexistente no fluxo de medley.
- Corrigido o estouro horizontal das telas de música e modais em celulares com menos de 420 px.

### Segurança e arquitetura

- Criada a interface `storage.get`, `storage.set` e `storage.remove`.
- Centralizado o acesso ao armazenamento local.
- Desativada a chamada direta a um provedor de IA no frontend; integração futura documentada para backend seguro.

### PWA

- Atualizado o cache para a versão 5.
- Removidos do cache os arquivos da versão obsoleta.
- Impedido cache de respostas externas ou inválidas.
- Restringido o fallback offline a navegações.
- Permitidas orientações retrato e paisagem no manifesto.

### Preservação de dados

- Mantidas as 86 músicas, com os mesmos IDs de 1 a 86.
- Nenhum título, tom, capotraste, bloco, frase ou cifra do catálogo padrão foi alterado.
