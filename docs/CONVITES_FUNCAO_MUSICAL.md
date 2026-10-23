# Convites com função musical

O controle “Convidar como participante” foi substituído por um select nativo no mesmo local e com as cores/ícone existentes. A interface exibe “Convidar como guitarrista”, por exemplo, e envia o valor de domínio `Guitarra`.

A lista reutiliza as funções do perfil e dos eventos e os instrumentos cadastrados nas ferramentas, filtrando as opções para Vocal, Backing Vocal, Guitarra, Violão, Baixo, Bateria, Teclado, Ukulele e Violino. Vocal é a seleção inicial. Participante, Percussão, Outros, Áudio, Viola Caipira e Cavaco foram retirados apenas deste seletor; os instrumentos do perfil e os convites históricos permanecem intactos. A seleção é temporária, vinculada a conta e evento e preservada ao retornar à tela. Não altera o instrumento pessoal do líder.

- Buscar: a função é capturada ao abrir a busca e enviada ao convite direto.
- Compartilhar/Mais: criam um convite autenticado por token, com a função gravada no servidor, em vez de compartilhar uma cópia do evento. Sem compartilhamento nativo disponível, o link pode ser copiado.
- Cancelamento nativo não copia o convite silenciosamente; falhas de rede são informadas e os controles são liberados para nova tentativa.
- Conta trocada ou tela fechada invalida o resultado tardio antes de abrir o compartilhamento.
- Convites por voz sem escolha explícita continuam usando a função padrão de participante.

Os links existentes continuam aceitando nome informado pelo líder. Para o novo convite compartilhado sem destinatário conhecido, `name` é opcional e o aceite usa o nome da conta convidada. A função vem do convite no banco, não dos parâmetros da URL. Mantidos token de uso individual, validade e permissões de integrante.

**Publicação:** o aceite de convites compartilhados sem nome exige o backend atualizado, junto do frontend. Nada foi publicado neste trabalho. As correções de foto de perfil que já estavam pendentes foram preservadas.

**Validação:** interface em 390 e 1366 px; funções disponíveis, seleção visível, busca, compartilhamento de cada função, retorno, fallback para cópia e troca de conta; testes do servidor verificam aceite de todas as funções por link e busca sem conceder liderança.

## Pesquisa de interface

APPLE-DOCS RESEARCH UNAVAILABLE: ferramentas search_docs/read_doc indisponíveis. O usuário autorizou expressamente uma exceção para esta tarefa. Nenhuma orientação Apple foi consultada ou atribuída. A decisão específica do ROUDY foi reutilizar o controle existente e uma seleção nativa, sem redesenhar a tela.

## Busca priorizada pelo instrumento do convite

O seletor envia `role` à busca por nome/@usuário. O servidor coloca primeiro os perfis com esse instrumento declarado, depois os demais, mantendo nome e ID como desempate estável. A ordenação acontece antes da paginação de 20 resultados; o instrumento não é filtro de exclusão e não altera a função enviada no convite. Sem instrumento reconhecido, permanece a ordem anterior. Guitarra e Violão, assim como Vocal e Backing Vocal, não são confundidos.

O índice aditivo `profile_instruments` é atualizado exclusivamente a partir dos metadados da identidade Supabase validada em requisições autenticadas. Aceita vários instrumentos, elimina duplicatas e remove escolhas desmarcadas quando recebe uma lista vazia. Não usa a função que a pessoa exerce em eventos como evidência do perfil. Dados de contato ou instrumentos não são adicionados à resposta pública da busca.

Perfis antigos passam a entrar na priorização conforme voltam a sincronizar com o backend atualizado. A atualização dos metadados segue o cache existente de validação do Supabase (até 60 segundos); não há varredura administrativa de contas nem dependência de chave privilegiada. É necessário publicar backend e frontend juntos para disponibilizar esta função em produção. A criação da tabela é aditiva pela inicialização existente do backend; não apaga perfis ou eventos.

Validação: prioridade global antes da paginação, múltiplos instrumentos, busca por @usuário, pessoas sem instrumento, função desconhecida, atualização/remoção do índice e preservação dos campos públicos; interface móvel/desktop verifica envio da função em todas as páginas e no convite.

APPLE DESIGN RESEARCH

- Question: priorizar resultados de busca pelo instrumento selecionado sem excluir usuários ou redesenhar a interface.
- Sources consulted: nenhuma; `apple-docs/search_docs` e `apple-docs/read_doc` indisponíveis (`APPLE-DOCS RESEARCH UNAVAILABLE`).
- Apple explicit guidance: nenhuma atribuída.
- Design inference: prioridade deve ser aplicada antes da paginação para não esconder correspondências nas páginas posteriores.
- ROUDY-specific decision: priorizar instrumentos declarados mantendo busca por nome/@usuário, demais resultados e aparência atual.
- Implementation: ordenação no servidor e propagação do instrumento no cliente. Exceção de pesquisa autorizada expressamente pelo usuário para esta alteração.
