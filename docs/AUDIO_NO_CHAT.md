# Mensagens de áudio de eventos

## Escopo e armazenamento

- Segurar o microfone inicia a gravação; soltar envia. Arrastar para a esquerda ou para cima cancela. Teclado: segurar Espaço/Enter; Escape cancela.
- Limites: 90 segundos, 3 MB de entrada, 12 uploads/minuto e 60 áudios por usuário por dia. A conversão descarta vídeo e regrava somente áudio AAC/MP4 mono para compatibilidade entre navegadores. PyAV usa codecs embarcados; não depende de executável ffmpeg externo.
- `EventAudio` é uma tabela nova com os bytes privados, ligada à mensagem. A criação de mensagem e arquivo usa uma transação. A tabela é criada pelo `db.create_all()` existente; não há alteração destrutiva de esquema.
- JSON de mensagens contém apenas duração, tipo e tamanho. Gravações nunca entram em localStorage, JWT, logs ou URLs públicas. Download exige token e associação atual ao evento, mesmo que o usuário saiba o ID da mensagem. `Cache-Control: private, no-store`.
- Apagar a própria mensagem remove também o arquivo. IDs de upload UUID tornam tentativas repetidas idempotentes.
- Um rascunho por conta/evento é guardado como Blob em IndexedDB antes de enviar. Falha de envio permite reenviar/descartar; não há reenvio automático em segundo plano. Logout não transfere rascunhos a outra pessoa; é necessário retornar à mesma conta/evento para recuperá-los. Limpar os dados do navegador apaga rascunhos locais ainda não enviados.
- Saída, troca de conta, aba em segundo plano e cancelamento interrompem microfone e reprodução. Respostas tardias são verificadas por conta/evento. URLs Blob são revogadas ao limpar a reprodução; somente um áudio toca por vez. Atualizações preservam o player das mensagens presentes; exclusão da mensagem interrompe e revoga seu áudio.
- A barra visual é um indicador decorativo, não uma análise da forma de onda. Ao reproduzir, controles nativos fornecem pausa e progresso acessíveis.

## Publicação e testes

Requer publicação do frontend e backend, instalação de `av>=16,<18` e banco persistente (não armazenamento efêmero de container). O limite global `MAX_CONTENT_LENGTH` precisa permitir multipart de 3 MB + 64 KB. A configuração padrão suporta isso.

`npm run test:chat-audio` usa microfone sintético do Chrome e Flask/banco isolados reais: grava, envia, transcodifica, reproduz, cancela, testa falha/reenvio e saída. `pytest backend/tests/test_event_audio.py` verifica autorização, conteúdo malformado, idempotência e exclusão privada. Não substitui testes em Android e iPhone reais, permissões de microfone e Safari.

## Reparos de áudios longos

- Mantidos os limites de 90 segundos e 3 MiB. A conversão tolera até 250 ms de
  diferença no fim da captura (timer/codec), mas grava apenas 90 segundos de PCM;
  durações acima da tolerância são recusadas. O AAC ainda pode ter padding de frame.
- MySQL/MariaDB: tabela nova usa MEDIUMBLOB e o ajuste aditivo amplia apenas a
  coluna legada BLOB. PostgreSQL mantém BYTEA; SQLite mantém LargeBinary.
  A migração roda na inicialização; testar no banco de homologação e confirmar
  permissão ALTER e janela adequada antes de publicar. Não há exclusão de dados.
- Upload: prazo de 120 s no cliente, incluindo leitura da confirmação. Download:
  prazo de 30 s e cancelamento ao sair do chat/perder foco. Limites de proxy e
  servidor continuam independentes. Conferir MAX_CONTENT_LENGTH no Railway:
  para aceitar o teto do recurso, permitir ao menos 3 MiB + 64 KiB de multipart.
- O rascunho só é removido após resposta válida com o ID e tipo esperados.
  Erros de armazenamento são registrados com requestId e classe, sem bytes.
  A gravação acima de 3 MiB é recusada, não truncada em bytes arbitrários.
- Verificação local: AAC de 80/90 s com salvamento e download, tipos de coluna,
  migração simulada, rollback, resposta HTML inválida e retomada de reprodução.
  MySQL/PostgreSQL reais, produção e aparelhos físicos ainda exigem homologação.
