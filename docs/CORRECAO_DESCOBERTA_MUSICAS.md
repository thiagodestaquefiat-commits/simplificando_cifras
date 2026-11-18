# Descoberta de músicas externas

## Causa

O endpoint `/api/music-sources/search` consultava `AuthorizedMusicSourceRegistry`, mas a aplicação registrava esse serviço com `providers=[]`. A interface consultava o endpoint corretamente; o catálogo compartilhado era a única fonte remota capaz de retornar resultados.

## Correção

O novo adaptador `CifraClubMusicSourceProvider` conecta a pesquisa de metadados à aquisição Cifra Club já existente em `web_search.py`. A consulta retorna identidades estáveis de título/artista e não baixa cifras nem chama a IA enquanto o usuário digita. O leitor existente é acionado somente quando uma fonte é selecionada.

- Pesquisa por título, início do título e título/artista no mesmo campo.
- Identidades validadas como dois slugs; URLs arbitrárias e caminhos relativos são recusados.
- Validação de domínio e IP reaproveitada do registro e do cliente seguro.
- Leitor de cifra simplificada e fallback do leitor existente preservados.
- Proxy ScraperAPI configurado no backend reaproveitado; nenhuma chave nova foi adicionada.
- Limite diário existente verificado antes de carregar a cifra selecionada.
- `SCRAPER_ENABLED=false` continua desativando a integração.
- Falha de rede retorna indisponibilidade, em vez de ser confundida com ausência de músicas.

## Evidências

Consultas reais de metadados retornaram músicas e artistas para “Na Sua Estante”, “Bondade de Deus” e “Oceanos Ana Nobrega”. A consulta não cria registros de usuário nem gera conteúdo.

Testes cobrem o endpoint autenticado com o registro real inicializado pela aplicação, identidade de candidatos, seleção/carregamento, títulos parciais, artista, ausência de resultados, rede indisponível, URLs inválidas e bloqueio por limite diário.

O download direto de uma cifra real foi recusado pela fonte no ambiente local. A leitura com o proxy de produção não foi exercitada localmente, pois a chave não está disponível. O leitor com proxy é o mesmo já utilizado na aquisição existente. Não se deve confundir os testes de descoberta real com validação de download/geração em produção.

## Publicação

Alteração apenas de backend; não exige mudança de interface, migração de banco ou chave adicional. Publicar no Railway a partir da main após aprovação e validar a Busca em uma sessão autenticada. Os ajustes visuais e de navegação da PR132 permanecem separados.
