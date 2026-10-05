# Relatos de problemas no catálogo

Implementação local, sem deploy. As regras de contribuição existentes não foram alteradas.

## Usuário

- Na música, ao final da cifra, `Reportar problema` aparece para usuários autenticados quando o servidor encontra o mesmo título e artista no catálogo. Não usa aproximação de nomes e não cria indicação visual de origem.
- Motivos: acordes, letra, título/artista, formatação, conteúdo inadequado ou outro problema. Descrição opcional, até 2.000 caracteres; não incluir dados pessoais.
- O relato refere-se à versão do catálogo, não às alterações pessoais feitas na playlist. A mensagem confirma isso.
- Confirmação só depois de gravado no servidor. Falhas de conexão permitem tentar novamente. Um relato por pessoa/música evita duplicação; limite de 5 envios/minuto e 30/dia por IP.
- Não há solicitação de retirada, exclusão automática nem alterações de playlists por causa dos relatos.

## Revisão

- Configurar `SHARED_SONG_REVIEWER_IDS` no backend com os UUIDs de usuários do Supabase autorizados, separados por vírgula, e reiniciar o serviço. O valor padrão vazio impede qualquer acesso à fila.
- A autorização exige token validado pelo Supabase e confere o ID externo validado, não email, nome, metadados editáveis ou IDs do login local legado.
- Após configurar, Configurações → Ajuda e Suporte mostra `Revisar relatos` apenas para esses usuários.
- Filtros: Pendente, Em revisão, Resolvido e Não confirmado; páginas de 50. Cada relato inclui motivo, descrição e prévia da cifra do catálogo. A equipe registra observação e estado.
- Mudar para Resolvido registra a revisão: não corrige a cifra automaticamente. A correção editorial deve ser feita pelo fluxo administrativo apropriado, após conferir a fonte.
- Identidade do denunciante não aparece na fila. Relatos ficam em `shared_song_reports` no banco do backend, vinculado ao ID da música e do usuário; não são públicos nem dados locais do navegador.
- A tabela é criada pelo mecanismo `db.create_all()` já usado na inicialização do backend. Isso precisa ocorrer no ambiente publicado quando esta versão for lançada. Nada foi alterado em produção nesta tarefa.

## API

- GET `/api/shared-songs/report-target?title=...&artist=...`: correspondência exata.
- POST `/api/shared-songs/<id>/reports`: `{reason, details}`; motivos técnicos `chords`, `lyrics`, `metadata`, `formatting`, `inappropriate`, `other`.
- GET `/api/shared-songs/review-capability`: autorização do usuário atual.
- GET `/api/shared-songs/reports?status=pending&offset=0`: fila restrita.
- PATCH `/api/shared-songs/reports/<id>`: `{status, reviewNote}`; estados `pending`, `in_review`, `resolved`, `dismissed`.

Todas as rotas exigem autenticação; fila e alterações de estado exigem revisor autorizado no servidor.

## Validação desta entrega

- `npm test`: aprovado, incluindo autenticação, troca de conta, erro e conexão do cliente de relatos.
- Backend: 306 testes aprovados, incluindo persistência, duplicação, validação, correspondência exata, autorização e preservação de músicas.
- Interface de relatos: testes isolados com servidor simulado, celular e desktop, envio, nova tentativa após erro, revisão e proteção contra conteúdo malicioso.
- O teste abrangente antigo `pwa-branding.test.js` tem fluxo de navegação anterior à tela inicial de login e às categorias de configurações; ele parou porque a tela de login intercepta o clique na conta. Isso não foi tratado como validação aprovada do PWA inteiro, nem motivou mudanças fora do escopo.
- Nenhum teste usou relatos reais, contas reais ou alterou o banco de produção. Para uso integrado, o backend em execução precisa receber esta versão e a equipe precisa configurar os revisores.
