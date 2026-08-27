# Modo Palco — Fase 1

## Objetivo

Transformar a visualização de cifras em uma interface de apresentação confiável, pessoal e preparada para conexão instável, sem alterar o repertório oficial do evento.

## Decisões de arquitetura

- As preferências do palco são pessoais e ficam separadas pelo identificador do usuário.
- O armazenamento já aceita vários perfis por usuário, embora a interface use apenas o perfil ativo nesta fase.
- Nenhuma configuração de palco é gravada na versão compartilhada do repertório.
- Antes da entrada, é criado um pacote local compacto com ordem, cifras, tons, estrutura, notas e preferências essenciais.
- Spotify, mapas, diagramas e demais integrações externas não fazem parte do pacote offline do palco.
- Não houve migration de banco nesta fase. A sincronização das preferências entre aparelhos poderá ser adicionada quando a autenticação/Supabase estiver disponível em produção.

## Fluxo implementado

1. O usuário abre uma música, preferencialmente pelo repertório de um evento.
2. Ao selecionar **Modo Palco**, configura preset, conteúdo, informações visíveis, fonte, velocidade, tema, tela cheia, Wake Lock e bloqueio de edição.
3. O aplicativo salva a preferência pessoal e prepara o repertório no aparelho.
4. Durante a apresentação, o cabeçalho mostra música, artista, posição, tom, conectividade e próxima música.
5. A navegação pode ser feita pelos botões anterior/próxima ou pela lista rápida do repertório.
6. Os controles permitem transpor, ajustar fonte, iniciar/pausar auto-scroll, alterar velocidade, reconfigurar e sair.
7. Controles automáticos desaparecem após inatividade e reaparecem com um toque.

## Presets iniciais

- Vocal: letra em destaque.
- Violão/Guitarra: letra e acordes.
- Baixo: acordes em destaque.
- Teclado: cifra completa.
- Bateria: estrutura musical.
- Personalizado: mantém a última configuração ajustada.

## Compatibilidade e fallback

- Tela cheia e Screen Wake Lock são usados somente quando o navegador oferece suporte e autoriza a ação.
- A ausência dessas APIs não impede a entrada no Modo Palco.
- O pacote offline complementa o cache da PWA e evita depender das integrações externas durante a apresentação.
- Layouts de celular, tablet, computador, retrato e paisagem foram considerados nos estilos e testes responsivos.

## Próximas fases

- Exibir andamento, BPM, fórmula de compasso e capo com controles rápidos.
- Notas pessoais em painel lateral/flutuante.
- Gestos configuráveis e bloqueáveis.
- Modo ensaio, marcações, metrônomo e sincronização opcional entre integrantes.
- Sincronização dos perfis pessoais entre dispositivos após a fundação de autenticação compartilhada.
