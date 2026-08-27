# Changelog

## 0.7.1 — Mapa interativo nos eventos

- Substitui a prévia estática por mapa interativo MapLibre com tiles Geoapify quando a chave pública restrita está configurada.
- Permite arrastar, ampliar, reduzir e recentralizar o mapa sem capturar a rolagem comum da página no celular.
- Mantém o botão para abrir o endereço no Google Maps.
- Preserva automaticamente o mapa estático como fallback quando a chave pública ou a biblioteca interativa não estão disponíveis.
- Separa a chave pública de tiles da chave privada usada pelo Railway para autocomplete e geocodificação.
- Atualiza o cache da PWA para `v59`.

## 0.7.0 — Contas e Bandas/Equipes

- Adiciona login opcional com Google por meio do Supabase Auth, mantendo o modo local quando não configurado.
- Migra com segurança a identidade local, Eventos, personalizações e Equipes ao conectar uma conta.
- Cria Bandas com proprietário, líderes, integrantes e funções musicais.
- Permite vincular Eventos a uma Equipe e valida no backend que os participantes pertencem a ela.
- Mantém Eventos antigos sem equipe e aplica somente tabelas/colunas aditivas no banco.
- Adiciona seletor de Equipe, gerenciamento básico de integrantes e área de conta.
- Atualiza o cache da PWA para `v58`.

## 0.6.0 — Endereços e mapas nos eventos

- Adiciona autocomplete de endereços brasileiros com debounce, cancelamento e navegação por teclado.
- Persiste endereço estruturado, coordenadas, identificador do local e provedor sem remover o texto legado.
- Exibe mapa responsivo com marcador na edição e nos detalhes do evento, além de link para abrir externamente.
- Protege a chave Geoapify no backend Railway e aplica cache e limite de requisições por IP.
- Adiciona somente colunas novas à tabela `events`; registros antigos permanecem compatíveis.
- Atualiza o cache da PWA para `v57`.

## 0.5.1 — Editor completo dentro do repertório

- Reutiliza no lápis do repertório o editor visual já usado na Playlist.
- Permite editar título, artista, tom original, capotraste, cifra/resumo e observações.
- Mantém os modos pessoal e compartilhado, respeitando a permissão do Líder.
- Aplica a versão do evento na listagem, na tela da música, na transposição e no Modo Palco sem alterar a música-base da Playlist.
- Adiciona ao banco somente colunas complementares para arranjos pessoais e oficiais completos.
- Atualiza o cache da PWA para `v56`.

## 0.5.0 — Repertórios pessoais e compartilhados

- Adiciona identidade persistente do usuário e sincronização de eventos com o backend.
- Define um Líder por evento e aplica autorização no frontend e na API.
- Restringe repertório oficial, ordem, membros e informações compartilhadas ao Líder.
- Mantém tom e observações pessoais como sobreposições por usuário, sem duplicar o repertório.
- Exibe os modos **Pessoal — somente para mim** e **Compartilhada — todos do evento** conforme a permissão.
- Adiciona banco relacional para usuários, tokens, eventos, membros, repertório, personalizações e histórico.
- Preserva o funcionamento local quando a API ainda não estiver disponível e mantém uma fila de ajustes pessoais para sincronização posterior.
- Atualiza o cache da PWA para `v55`.

## 0.4.2 — Continuidade sobre a base integrada

- Parte da `main` atualizada com IA, editor, cifra completa, eventos e escopos pessoal/equipe.
- Preserva o miniplayer global implementado pela equipe, fixo no rodapé e sem cobrir a cifra.
- Usa o `seek` local do Web Playback SDK para avançar e retroceder sem reiniciar a faixa pela Web API.
- Serializa os comandos do player e garante a saída do carregamento quando um seek falha.
- Aumenta a transparência do fundo do miniplayer para 48%, mantendo conteúdo e controles opacos.
- Atualiza o cache da PWA para `v54`.

## 0.4.1 — Reprodução completa no Spotify

- Substitui o Spotify Embed escondido pelo Web Playback SDK oficial.
- Usa o token OAuth PKCE já autenticado para criar um dispositivo Spotify Connect no navegador.
- Inicia a faixa selecionada nesse dispositivo por meio da Web API.
- Preserva mini player, player maximizado, linha do tempo, atalhos de 15 segundos e repetição.
- Remove a limitação de prévia de 30 segundos do Embed para contas Premium autorizadas.
- Adiciona mensagens específicas para sessão expirada, conta sem Premium, mídia protegida e autoplay bloqueado.
- Torna pause e retomada determinísticos e refaz o fluxo protegido ao avançar ou retroceder, evitando áudio mudo e carregamento infinito após um seek.
- Preserva temporariamente a transação PKCE entre abas, mantendo os tokens somente na sessão e removendo o verificador após o callback.
- Impede que cliques concorrentes iniciem duas autorizações e invalidem o `state` esperado.
- Atualiza o cache da PWA para `v42`.

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
