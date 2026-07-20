# Simplificando Cifras

Aplicação web progressiva para organizar, estudar e executar repertórios musicais com cifras resumidas.

## Identidade visual

A Sprint 4 estabelece uma identidade visual escura, moderna e centrada no uso por músicos em ensaios e no palco. A marca combina a nota musical com circuitos tecnológicos em degradê verde-azul. A interface utiliza Inter, azul `#2563EB`, verde `#22C55E`, branco e cinzas neutros, com contraste alto, sombras discretas e componentes arredondados.

A atualização é exclusivamente visual: arquitetura, navegação, catálogo, persistência, regras de negócio e funcionalidades permanecem inalterados. Os ícones PNG da PWA são fornecidos em 48, 72, 96, 128, 192, 256 e 512 pixels.

## Como executar

O projeto usa HTML, CSS e JavaScript puro. Para que o service worker funcione, abra-o por um servidor HTTP local, e não diretamente como arquivo.

Exemplo com Python 3:

```bash
python -m http.server 4173
```

Depois, acesse `http://localhost:4173`.

## Dados e persistência

- O catálogo padrão contém 86 músicas no formato legado compatível `{ l, c }`.
- Músicas e playlists alteradas pelo usuário ficam no armazenamento local do navegador.
- `js/storage.js` é a única camada autorizada a acessar diretamente o `localStorage`.
- Limpar os dados do navegador remove alterações locais. Faça uma cópia antes de limpar.

## Funcionalidades

- biblioteca e busca por título, artista ou tom;
- transposição e retorno ao tom original;
- seleção de capotraste e diagramas de acordes;
- criação, edição, exclusão, ordenação e compartilhamento de playlists;
- medley;
- modo palco com navegação, auto-scroll, velocidade e tamanho de fonte;
- diagramas em faixa horizontal própria, com indicação clara quando um desenho não está disponível;
- exportação completa da biblioteca em JSON, incluindo catálogo padrão, dados persistidos e estado atual da sessão;
- funcionamento offline após o primeiro carregamento bem-sucedido.

## Exportar biblioteca

Use o botão **Exportar Biblioteca** no topo da aplicação. O arquivo JSON separa explicitamente:

- o catálogo padrão incluído no aplicativo;
- os valores persistidos no navegador, preservados também em formato bruto por chave;
- o estado atual de músicas, playlists, medleys, favoritos e configurações.

A exportação é local, não envia dados para backend e não altera nem remove informações do navegador.

## Navegação e Modo Palco

Os botões **Anterior** e **Próxima** aparecem somente quando a música é aberta a partir de uma playlist. Eles seguem a ordem definida pelo usuário e param na primeira e na última música. No Modo Palco, os diagramas são ocultados para priorizar a leitura, enquanto tom, capotraste, transposição, fonte, velocidade e auto-scroll continuam disponíveis.

## IA

A busca por IA está intencionalmente desativada no frontend. Uma versão futura deverá chamar um backend autenticado, que manterá chaves e segredos fora do navegador.

## Verificação antes de publicar

1. Abrir a aplicação e confirmar que são exibidas 86 músicas em uma instalação limpa.
2. Buscar por título, artista e tom.
3. Abrir uma música, transpor, selecionar capotraste e retornar ao original.
4. Criar, ordenar, atualizar e excluir uma playlist; recarregar a página e confirmar a persistência.
5. Ativar o modo palco e testar anterior, próxima, fonte, velocidade e auto-scroll.
6. No painel de aplicação do navegador, validar manifesto, service worker e modo offline.
7. Testar em retrato e paisagem, nos tamanhos de celular, tablet e computador.

## Arquivos antigos

A versão alternativa encontrada na auditoria foi preservada em `_legacy/`. Ela serve apenas como histórico e não é carregada pela aplicação.
