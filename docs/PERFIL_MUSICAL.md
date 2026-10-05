# Personalização do perfil

Meu Perfil inclui localização digitada (até 120 caracteres, exemplo São Paulo, SP) e seleção múltipla de instrumentos/funções. As opções abrangem voz, backing vocal, guitarra, violão, baixo, bateria, teclas, piano, percussão, ukulele, violino, viola, saxofone, flauta, trompete e outro.

Os campos são opcionais. Salvar mantém os dados no perfil local da identidade atual; limpar e desmarcar também são salvos. Para contas autenticadas, a atualização existente do Supabase envia `location` e `instruments` em `user_metadata`, permitindo leitura em outro dispositivo. Falhas remotas mantêm o salvamento local e exibem o aviso já existente.

Não usa GPS nem solicita localização do navegador. Esses campos não conferem permissões de liderança nem substituem a função musical definida para cada evento. Não foram acrescentados ao diretório público de busca nesta alteração.

Backup exporta os novos campos (sem email/telefone). Importar preenche localização/instrumentos somente quando o perfil atual ainda não possui esses dados; não substitui escolhas atuais. Backups antigos continuam aceitos.

Testes: múltipla seleção, reabertura, limpeza, ocultação do assistente no perfil, payload/retorno da conta autenticada e exportação sem contatos privados. Nenhum dado real foi enviado ao Supabase para testar.
