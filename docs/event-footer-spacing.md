# Event footer spacing

Removed overlapping historical corrections that reserved 196px for a single-member stage and 128px below the detail content. Single-member stage is now 144px: 8px inset + 68px member row + 68px add-member control. Multi-member height follows row count plus the existing add control instead of an unconditional 253px floor. Leave-event separation remains 12px. Bottom padding is max(24px, safe-area-inset-bottom).

The constellation-to-list animation remains on scrollable events. Events that fit the viewport now show the final list immediately, so Add member is not hidden waiting for an impossible scroll. No membership, permissions, repertoire or leave-event behavior changed.

APPLE DESIGN RESEARCH

Question: Como agrupar participantes e ações finais sem sobras artificiais, preservando controles acessíveis?

Sources consulted: Apple HIG Layout / Visual hierarchy, design/human-interface-guidelines/layout (search + read).

Apple explicit guidance: Alinhar elementos para facilitar a leitura e agrupar itens relacionados com espaço, recipientes ou separadores.

Design inference: Espaço deve separar grupos, sem reservar alturas fixas maiores que seus controles. Conteúdo curto não deve depender de rolagem para disponibilizar uma ação.

ROUDY-specific decision: Manter a animação existente onde há rolagem; altura proporcional às linhas; 12px antes de Sair do evento e 24px no final, com safe area.

Implementation: index.html ajusta geometria da animação; js/event-detail-refactor.css remove overrides redundantes e reduz reservas; service-worker atualiza cache.

Validation: event-footer-spacing-ui abre eventos reais da interface com 0, 1, 2 e 6 participantes em 320, 390, 430 e 820px. Confere controle contido, sobra até 8px no palco, intervalo antes de sair e padding final. event-participants-morph e index-syntax também passam. APIs externas simuladas; nenhuma alteração em eventos reais.
