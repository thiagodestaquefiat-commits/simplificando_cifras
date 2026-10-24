# Playlists colaborativas

Implementação local - 23/10/2026. Não publicada em produção automaticamente.

## Contrato de produto

- O botão + ao lado das fotos abre o convite de colaboração, não cria uma cópia pública.
- Busca por nome/@usuário, perfil resumido, convite direto, compartilhamento de link, cópia de link e leitura do QR de perfil reutilizam os componentes existentes.
- Apenas quem aceita passa a integrar a playlist. Os links expiram em 7 dias e aceitam uma pessoa; gerar outro link permite convidar outra pessoa.
- Todos os integrantes aceitos têm os mesmos direitos: editar nome/capa/descrição, músicas, ordem, notas e ajustes; convidar outros integrantes e excluir a playlist para todos. Exclusão exige confirmação explícita.
- Fotos e nomes dos integrantes são obtidos do servidor. Foto própria tem prioridade sobre a foto do provedor de login.
- A central reúne convites e notificações de playlists e eventos. Alterações identificam o responsável, a playlist e o tipo de mudança; ajustes identificam o campo e seus valores. O autor não recebe notificação da própria ação.
- São notificações internas do aplicativo, atualizadas com ele aberto; não são push do sistema operacional com o aplicativo fechado.
- A biblioteca pessoal e o catálogo ROUDY não são modificados. Músicas compartilhadas usam snapshots próprios e identificadores virtuais para abrir/navegar no Estudo.
- Edições de blocos, Letra + Cifras, editor completo, vídeo e resultados de IA abertos a partir dessa música também são salvos na cópia da playlist compartilhada, não na biblioteca. Fixar uma playlist continua sendo uma preferência individual.
- Partituras MusicXML acompanham os dados da música. PDFs continuam restritos ao dispositivo que guardou o arquivo, conforme a implementação anterior; esta entrega não cria armazenamento remoto de arquivos PDF. Remover/substituir uma partitura na playlist compartilhada não apaga um arquivo que a biblioteca pessoal ainda pode usar.
- O botão Share da playlist sempre gera um link de cópia fixa, inclusive quando a playlist original é colaborativa. Esse link não concede acesso de edição nem sincroniza mudanças posteriores. Convites colaborativos ficam exclusivamente no botão + ao lado das fotos. Os links antigos de cópia continuam funcionando.

## Persistência e isolamento

Novas tabelas aditivas: `collaborative_playlists`, `playlist_members`, `playlist_invites`, `playlist_operations`, `playlist_notifications`. Registradas no factory do Flask e criadas pelo mecanismo aditivo já existente (`db.create_all`). Nenhuma tabela ou dado anterior é apagado.

O documento comum contém snapshots das músicas e ajustes por item. Não aponta para IDs privados da biblioteca de outro usuário para buscar conteúdo. Identidade e permissão são conferidas pelo servidor em cada operação; só possuir o ID da playlist não concede acesso. Tokens de convite são aleatórios e apenas seu hash fica no banco. A prévia pública do link não expõe músicas nem a lista de integrantes.

O cache e a fila de alterações são guardados juntos no registro local da playlist, separado por conta. Alterações offline sobrevivem à reabertura; o envio é retomado ao reconectar. A UI só remove uma operação pendente depois da resposta do servidor e da gravação local. Tombstones locais preservam exclusões não enviadas. O logout é impedido se houver operações ainda pendentes ou conflitantes.

Operações possuem identificadores idempotentes. O servidor combina alterações em campos diferentes (inclusive ajustes diferentes da mesma música); alterações concorrentes incompatíveis retornam conflito, sem sobrescrever silenciosamente. Uma atualização condicional de versão no banco reserva a revisão antes de gravar recibo e notificações na mesma transação. Exclusão verifica a revisão observada. A revisão de conflitos permite guardar uma cópia pessoal antes de receber a versão compartilhada; não descarta ajustes automaticamente.

Consultas periódicas ocorrem a cada 15 segundos com o app visível, além de foco/reconexão. Um cursor de estado evita baixar os documentos completos e redesenhar a interface quando não há mudanças. Não há garantia de entrega em tempo real ou de sincronização em segundo plano com o navegador fechado.

## Rotas

Base `/api/collaborative-playlists`:

- `GET /`: playlists da conta, convites pendentes, 250 notificações recentes e cursor.
- `GET /?since=...`: resposta curta quando não há mudança.
- `POST /`: promove uma playlist local, idempotente por criador/clientId.
- `POST /<id>/operations`: alteração ou exclusão com recibo idempotente e proteção de conflito.
- `POST /<id>/invitations`: convite direto por destinatário ou link aleatório.
- `GET /links/<token>`: prévia mínima do convite ainda válido.
- `POST /invitations/<id-ou-token>/accept|reject`: aceite/rejeição; token requer `link:true`.
- `POST /notifications/<id>/read`: leitura restrita ao destinatário.

Os links novos usam `?playlistInvite=...`. A navegação preserva o convite enquanto o usuário precisa fazer login; não aceita automaticamente ao abrir um link.

## Verificação reproduzível

```
node tests/user-playlists.test.js
node tests/playlist-collaboration.test.js
node tests/playlist-collaboration-ui.test.js
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_playlist_collaboration.py -q -p no:cacheprovider
```

O teste de interface precisa do Playwright e Chrome já disponíveis no ambiente de desenvolvimento; não foram adicionadas dependências. Ele inicia um Flask temporário com SQLite em memória e provedor de autenticação fictício restrito ao fixture de teste; abre três contextos independentes de navegador. Não usa usuários, tokens, banco ou serviços de produção.

Cobre busca por @usuário, convite direto, aceite pela central, aceite pelo link, fotos, ajustes de tom, notificações, abertura e navegação entre músicas e preservação da biblioteca pessoal. Testes de unidade/API cobrem conflitos, campos disjuntos, idempotência, exclusão, permissões, expiração, rejeição, falha de gravação e troca de conta.

Limitação da evidência: não houve teste de carga ou corrida simultânea em PostgreSQL/MySQL de produção. Antes do rollout, testar duas instâncias do backend concorrentes, bibliotecas grandes, rede instável e aparelhos reais.

## Disponibilização

Publicar frontend **e backend** juntos. Atualizar apenas o frontend não disponibiliza as novas rotas no Railway: o aplicativo local que ainda aponta para o backend antigo informará que a colaboração não está disponível nesse servidor.

Para testes manuais, configurar a API local com o mesmo projeto Supabase (somente as configurações públicas e validação de autenticação já suportadas), um banco local ou de homologação e uma origem CORS permitida. O frontend aceita `SIMPLIFICANDO_CIFRAS_CONFIG.API_BASE_URL` antes de carregar `js/ai/api-config.js`. Contas da produção não são copiadas automaticamente para um banco local: perfis entram no diretório desse ambiente ao autenticar nele.

Fazer backup do banco antes do deploy aditivo. Homologar login, convites e duas contas reais no mesmo backend; depois liberar a versão do PWA. Esta implementação não faz deploy, push GitHub ou alterações no banco de produção.
