# Nome de usuário único e fixo

Meu Perfil inclui um campo de nome de usuário separado do nome de exibição, com indicador na própria caixa: verde disponível e vermelho ocupado/inválido. Consulta após 350 ms sem digitar; respostas antigas ou de outra conta não são aplicadas. Erros de rede ficam neutros, nunca simulam disponibilidade.

Regras: 3–24 letras ASCII, números ou underscore, sempre minúsculas; nomes administrativos reservados. O botão **Confirmar nome de usuário** pede confirmação explícita de que a escolha será definitiva. **Salvar perfil** continua salvando os campos editáveis e não reserva um nome sem essa confirmação.

O servidor registra em `user_handles`, com chave primária por usuário e índice único no nome. A consulta de disponibilidade não reserva o nome: o POST faz a confirmação atômica. Repetir o mesmo nome é idempotente; trocar para outro é bloqueado. Metadata editável do Supabase e backup não podem alterar o nome confirmado. Não existe endpoint para renomear.

Precisa de conta autenticada; convidado/offline não pode reservar nomes globalmente. Após confirmação, o campo fica somente leitura; reabrir consulta o servidor novamente. Não muda UID nem permissões. Diretório de integrantes pesquisa também o @nome e exibe-o no perfil resumido, quando definido.

A tabela nova é criada pelo fluxo aditivo existente de inicialização do backend. Implementação local: frontend e backend precisam ser publicados juntos para funcionar na API oficial. Não houve deploy, reserva de nome real nem alteração no Supabase durante testes.

Testes verificam autenticação, formato, reservas, unicidade no banco, letras maiúsculas/minúsculas, imutabilidade, idempotência, busca por @nome, cores no navegador, cancelamento da confirmação e campo fixo após reabrir.
