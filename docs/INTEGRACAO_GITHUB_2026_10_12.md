# Integração local — 12/10/2026

Main integrada: `9fad36e`, atualizada em 12/10/2026. Base local preservada: `fadcbc8`.
Integração realizada somente no checkout local; sem push, deploy ou alteração da main.

## Recursos integrados

- QR Code de perfil e leitura de identidade para convites.
- Compartilhamento de músicas no chat e visualização de conteúdo compartilhado.
- Nova criação progressiva e edição de campos de eventos; sugestões de repertório.
- Editor de medley, ações de blocos, perfis, contribuição, configurações e ajustes visuais da main.
- Servidor: compartilhamento de eventos, imagem e permissões atualizados.

## Preservação e correções de compatibilidade

- Mantidos módulos locais de linguagem natural, intenções, acompanhamento, sequências, memória e voz selecionável. Prefixo Roudy continua opcional.
- Mantidos afinador v4, áudio de acordes v2, rolagem v7, tablaturas v2 e modelos locais mais novos.
- Busca por IA mantida junto de arquivo/imagem e texto.
- Convites por voz e por QR exportados juntos.
- Restaurada commitSongs, ainda chamada pelos fluxos locais de edição e persistência.
- Adição de músicas a eventos, inclusive nas novas sugestões, usa eventSongCopy + eventEditFromSong para preservar o estado da playlist e evitar modificações cruzadas.
- Assistente reconhece o novo formulário de evento e o seletor de medley; protege as novas telas de edição.
- Perfil mantém resumo dos instrumentos selecionados e ocultação do assistente.
- Cache offline v426 contém os novos módulos; removidas duplicações de folhas de estilo.
- Restaurada a precedência dos estilos de leitura locais para manter a barra de seis controles sem excesso de largura; verificada em 320, 390, 768 e 1366 px, com rolagem ligada/desligada.

## Verificação

Suíte principal; interfaces do assistente; voz, PWA/offline, upload e convites; onze testes específicos das novidades da main; dez testes do servidor de compartilhamento e permissões de eventos. Transcrições e convites são simulados nos testes. Não houve certificação de câmera/microfone físico nem mudanças de dados reais.
