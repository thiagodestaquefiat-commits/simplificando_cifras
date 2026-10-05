# Central de notificações

O sino ao lado da foto na tela principal abre **Notificações**. Reúne convites pendentes, alterações de todos os eventos acessíveis da identidade atual e mensagens/enquetes desses eventos. Não depende do filtro de equipe selecionado na lista de eventos.

- Badge soma notificações não lidas. Sino disponível também para notificações locais do convidado.
- Convites continuam oferecendo Aceitar/Rejeitar; marcar como lido nunca responde ao convite.
- Alterações e mensagens ficam na mesma seção, ordenadas por data. Ver evento e Abrir conversa navegam diretamente, fechando camadas anteriores.
- Marcar todas como lidas preserva registros, eventos e convites. Alterações vistas individualmente sincronizam o indicador do sino dentro do evento.
- Mensagens mostram autor e tipo (mensagem/enquete), sem expor o texto privado na central. Ler a conversa atualiza o estado da central.
- Leitura da central fica local, separada por conta ou identidade convidada, com IDs somente. Não sincroniza leituras entre dispositivos nesta versão.
- O histórico segue os limites existentes: últimas 50 alterações normalizadas e últimas 50 mensagens por evento. Só há notificações de dados que o app já recebeu; não inventa avisos de eventos indisponíveis ou outras contas.
- Convites vêm do backend; atualizações de eventos/chat usam os fluxos de sincronização existentes. Notificações internas não são push, email ou avisos com app fechado.
- A atualização visual do evento acionada pelo chat não dispara outra consulta de chat, evitando um ciclo recursivo de requisições.

O backend dos convites da etapa anterior ainda precisa ser publicado para operar com usuários reais. A central local de alterações e mensagens não adiciona uma nova tabela nem muda permissões de eventos.

Testes de interface cobrem central desktop/celular, conteúdo escapado, leitura sem responder convites, navegação direta para evento/conversa, aceite/rejeição e limpeza de convites ao sair. Os testes usam respostas simuladas, sem dados de produção.
