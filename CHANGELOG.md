# Changelog

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
