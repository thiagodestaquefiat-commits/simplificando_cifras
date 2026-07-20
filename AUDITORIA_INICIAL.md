# Auditoria inicial — Simplificando Cifras

Data: 17/07/2026  
Branch de segurança: `estabilizacao-etapa-1`  
Base auditada: commit `291f590` (`main`)

## Estrutura encontrada

- `index.html`: versão mais completa e atualmente executada; contém HTML, CSS, JavaScript e as 86 músicas embutidas.
- `app.js`, `data.js` e `styles.css`: segunda versão do aplicativo, separada por arquivos, mas não referenciada pelo `index.html`.
- `manifest.webmanifest`, `service-worker.js` e `assets/icons/`: camada PWA.

## Versão principal identificada

O `index.html` é a versão principal. Ele contém biblioteca, busca, leitura de cifras, transposição, capotraste, diagramas, playlists, medley, compartilhamento e modo palco. A versão externa é menor e tem identidade visual e modelo de interface diferentes; conectá-la ao HTML causaria regressões.

## Dados musicais

- Quantidade inicial: **86 músicas**, IDs 1 a 86.
- Modelo atual: `{ id, title, artist?, key, capo, blocos: [{ l, c }] }`.
- Os dados de `index.html` e `data.js` são duplicados.
- Nesta etapa, títulos, cifras, frases, tons, capotraste e ordem dos blocos devem permanecer byte a byte equivalentes na fonte principal.
- Risco de precedência: o conteúdo salvo no navegador substitui integralmente a lista padrão, portanto novas músicas padrão não chegam a usuários que já possuem dados locais.

## Duplicações e código sem uso

- Aplicação duplicada em `app.js`/`styles.css` e `index.html`.
- Catálogo duplicado em `data.js` e `index.html`.
- `closeDetail()` aparece duas vezes; a segunda definição sobrescreve a primeira.
- `toggleRow()` e `toggleChip()` pertencem a fluxos antigos e não são usados pelo fluxo atual de playlists.
- O service worker ainda coloca no cache os arquivos da versão externa, embora o HTML não os carregue.

## Problemas encontrados

### Críticos

1. A busca por IA chama `https://api.anthropic.com/v1/messages` diretamente do navegador. Mesmo sem uma chave fixa no repositório, esse desenho incentiva exposição de segredo, sofre bloqueios de CORS e não é apropriado para produção.
2. Duas versões misturadas tornam incerta a manutenção e ampliam o risco de editar a versão errada.
3. A persistência acessa `localStorage` diretamente em vários pontos, sem uma interface substituível por API no futuro.

### Altos

1. Playlists compartilhadas são injetadas no estado principal; referências temporárias podem permanecer na sessão e colidir com novos compartilhamentos.
2. Exclusão de música pode deixar IDs órfãos em playlists.
3. A busca anuncia “música ou tom”, mas não busca artista.
4. O modo palco não possui navegação anterior/próxima, tamanho de fonte nem controle de velocidade do auto-scroll.
5. Erros do service worker são silenciados, dificultando diagnóstico.

### Médios

1. Grande quantidade de estilos e eventos embutidos dificulta testes e manutenção.
2. Ausência de escape consistente ao inserir títulos e artistas com `innerHTML`.
3. `manifest.webmanifest` força orientação retrato, contrariando o requisito de paisagem.
4. Apenas ícone SVG está declarado; a instalação em alguns dispositivos pode exigir PNGs de 192 e 512 px.
5. O service worker usa fallback de `index.html` para qualquer requisição GET, inclusive recursos, o que pode devolver HTML onde outro tipo de arquivo era esperado.

## Elementos DOM e erros potenciais

Os principais IDs usados pelo fluxo ativo existem no HTML. Há referências condicionais protegidas por `?.` ou verificações nulas. O principal problema funcional de JavaScript identificado estaticamente é a duplicação de `closeDetail`, além da função de IA insegura. Testes visuais no navegador integrado foram inicialmente bloqueados pela comunicação local do ambiente; os testes funcionais serão repetidos após a organização usando verificações automatizadas e servidor local.

## Funcionalidades já presentes

- Biblioteca com 86 músicas e agrupamento alfabético.
- Busca por título e tom.
- Abertura e fechamento de música.
- Frases, cifras, tom, capotraste, transposição e retorno ao original.
- Diagramas de violão, guitarra, teclado, ukulele e cavaquinho.
- Criação, edição, exclusão, ordenação e persistência de playlists.
- Medley.
- Modo palco e auto-scroll básico.
- Compartilhamento textual e por link.
- Manifesto e service worker com limpeza de caches antigos.

## Funcionalidades incompletas ou frágeis

- Busca por artista.
- Favoritos (existem apenas na versão obsoleta).
- Controles completos de palco.
- Estratégia segura para IA.
- Instalação PWA validada em todos os navegadores.
- Testes automatizados e validação sistemática do catálogo.

## Plano de correção

1. Preservar a versão principal e mover a alternativa para `_legacy`, sem exclusão.
2. Extrair os dados musicais para um único arquivo carregado antes da aplicação, mantendo o formato atual e adicionando normalização compatível.
3. Criar uma interface de armazenamento e migrar os acessos diretos.
4. Desativar a IA no frontend e documentar o backend futuro.
5. Corrigir duplicações, busca por artista e integridade de playlists.
6. Corrigir cache e manifesto sem mudar a identidade visual.
7. Adicionar controles mínimos que faltam no modo palco, preservando o layout.
8. Criar README, changelog e testes de integridade; comparar o catálogo antes/depois.

## Arquivos previstos para modificação

- `index.html`
- `service-worker.js`
- `manifest.webmanifest`
- `README.md` (novo)
- `CHANGELOG.md` (novo)
- `SUGESTOES_FUTURAS.md` (novo, apenas propostas não implementadas)
- arquivos de suporte estritamente necessários para dados, armazenamento e testes
- `app.js`, `data.js` e `styles.css` serão preservados em `_legacy/`

