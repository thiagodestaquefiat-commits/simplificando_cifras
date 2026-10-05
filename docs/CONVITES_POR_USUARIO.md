# Convites por nome de usuário

## Onde aparece

No editor do evento, **Convidar Integrante** abre a busca por nome e mantém **Convidar por link**. A função musical continua sendo a selecionada no editor. Para enviar, o evento precisa estar salvo na nuvem; o envio salva os ajustes pendentes do editor, como o fluxo antigo por link.

Após selecionar um resultado, aparece um perfil resumido com nome, foto pública e referência curta da conta para diferenciar homônimos. **Convidar como Integrante** envia para o identificador da conta, nunca para um nome presumido.

O sino do cabeçalho mostra convites pendentes. A caixa oferece **Aceitar** e **Rejeitar**. Aceitar acrescenta o evento à lista pessoal com acesso de integrante; rejeitar não acrescenta nada. Em eventos vinculados a uma equipe, o aceite também adiciona à equipe como membro, seguindo a regra dos convites por link. A caixa informa isso antes do aceite.

## Busca e privacidade

- Mínimo de dois caracteres; espera de 300 ms ao digitar e descarte de respostas antigas.
- Busca parcial, sem distinção de maiúsculas, 20 resultados por página e botão Mostrar mais.
- Somente contas que já se autenticaram no backend via Supabase; convidados locais não entram no diretório. Contas com nome igual não são mescladas.
- Nome e foto HTTPS apenas. Nunca expõe telefone, email, playlists ou dados privados. Perfis legados com email como nome não entram na busca.
- Busca e convites exigem autenticação no servidor; convidados não podem consultar o diretório.
- A busca não normaliza diferenças entre letras acentuadas e não acentuadas nesta versão.

## Regras do convite

- Apenas o líder atual pode enviar. Não permite convidar a si mesmo, alguém já presente ou duplicar um convite pendente.
- Papel musical não concede liderança. O backend valida a pessoa selecionada.
- Validade de sete dias; troca de líder invalida convites antigos pendentes.
- Apenas o destinatário consulta ou responde. Aceite/rejeição repetidos são idempotentes; ações opostas são recusadas.
- Um novo convite após rejeição/expiração ganha um identificador novo; uma notificação velha não responde ao convite novo.
- Limites: 60 consultas/minuto por conta; 20 envios/hora por líder. Registros são persistidos no banco do backend, tabela `direct_event_invitations`, com restrição única por evento/destinatário.
- Notificação interna: consulta ao autenticar, abrir caixa, retornar à janela, reconectar e a cada 45 segundos enquanto o app estiver visível. Não há push, email ou aviso com o app fechado. Sem conexão, não confirma envios nem respostas.

## Disponibilização

Implementação local. A inicialização existente do backend (`db.create_all`) cria a nova tabela ausente, sem excluir dados anteriores. É necessário publicar frontend e backend para funcionar com usuários reais. Não foi feito deploy, nem alteração no Supabase/produção neste trabalho. O preview existente continua apontando para a API publicada e pode informar que a função ainda não foi disponibilizada no servidor.

## Verificação

Testes do servidor cobrem autenticidade, diretório público, convidados, paginação, permissão de líder, resposta do destinatário, duplicação, expiração, rejeição, reenvio e equipe. Testes de interface isolados cobrem busca durante digitação, respostas atrasadas, perfil seguro, envio, sino, rejeição e aceite em desktop e celular. Nenhum convite de teste foi enviado a usuários de produção.
