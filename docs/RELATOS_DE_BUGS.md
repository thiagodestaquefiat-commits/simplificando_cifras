# Relatos de bugs — envio de prints apenas em memória

## Fluxo
Usuário autenticado preenche descrição e, opcionalmente, seleciona um print.
Navegador reduz a imagem; servidor valida e recodifica em RAM; Brevo recebe anexo;
servidor descarta referências após a requisição. Não são gravados arquivos, Base64,
URLs ou imagens em tabelas, disco, volume ou fila de reenvio.
O parser multipart deste endpoint usa BytesIO em vez de spooling para temporários,
sem alterar o comportamento dos uploads de outros recursos.

POST /api/collaboration/bug-reports: JSON sem imagem ou multipart com clientId UUID,
description (10–4000 caracteres), steps opcional legado (até 2000) e no máximo uma image.
O destinatário e remetente vêm exclusivamente do backend.
bug_reports mantém texto, proprietário, data, protocolo e estado.
support_attempts mantém apenas hash SHA256 do conteúdo, contagem e data de tentativa.
Esses metadados permitem reconhecer reenvios sem reter os bytes da imagem.

## Proteções preservadas
- Login, 5 requisições/hora/IP, 10/dia/conta. Redis para limites globais entre workers.
- Uma PNG/JPEG estática, até 5 MiB e 16 milhões de pixels; máximo 12.000 pixels por lado.
- Outros formatos, animações, múltiplos arquivos, conteúdo forjado e arquivos inválidos recusados.
- Corpo limitado a 5 MiB + 64 KiB, no máximo 4 partes multipart.
- Validação de dimensões antes de decodificar; servidor verifica formato e integridade real.
- Uma decodificação simultânea por worker com semáforo não bloqueante.
  Concorrência total depende do número de workers: dimensionar memória/CPU do container.
- Redução proporcional até 2.000 pixels e 1 MiB; PNG quando cabe, JPEG 90/85/75/65
  sem subamostragem de cor. Se não couber, pedir recorte, sem destruir indefinidamente a leitura.
- Orientação corrigida e canvas/imagem novos para remover EXIF/GPS/XMP/ICC e textos PNG.
- Prévia, aviso de privacidade e Remover imagem. Usuário deve ocultar informação VISÍVEL:
  remover metadados não oculta nomes ou conversas no print.
- Blob URLs revogadas ao substituir/remover/fechar. Nada em localStorage.
- Não anexar automaticamente tokens, diagnóstico, biblioteca, e-mail ou foto do perfil.
- Envio binário até o servidor; Base64 (~33% extra) somente na chamada Brevo.
- Anexo ao e-mail, sem link público de download. Logs sem conteúdo ou credenciais.
- Erro na imagem não impede enviar só o texto após removê-la.
- Brevo/Gmail continuam mantendo suas próprias cópias segundo políticas do suporte.
- RAM e tráfego ainda têm custo, mesmo sem armazenamento persistente.

## Confirmação, falha e duplicidade
Texto/protocolo são salvos ANTES de chamar Brevo. Não afirmar encaminhamento
sem accepted (HTTP 201 do provedor). Isso não comprova entrega final na caixa do Gmail.
Claim atômico no banco impede dois envios simultâneos para o mesmo protocolo.
Provider recebe IdempotencyKey como proteção adicional; não pressupor deduplicação eterna.

accepted: retorna protocolo, sem reenviar em chamadas repetidas.
retry/not_configured/failed: mantém formulário e imagem para nova tentativa manual,
com o mesmo clientId e hash; hash divergente é rejeitado. Até 5 tentativas por protocolo.
uncertain: timeout, rede ou HTTP 5xx podem ter ocorrido APÓS aceite no provedor;
bloqueia reenvio cego e orienta verificação do protocolo pelo suporte.
sending: outra requisição já iniciou envio; não duplica. Após 2 minutos, marca uncertain
ao consultar novamente, cobrindo crash após a chamada externa.
Não existe thread, cron, armazenamento temporário nem fila automática.

Fechar/recarregar antes de confirmação perde o rascunho e a imagem. Para tentativa
posterior, anexar novamente em novo formulário. Não reenviar automaticamente resultado
incerto; pode haver e-mail já encaminhado. Mensagem na interface deixa isso explícito.
O texto já confirmado no banco não é apagado quando o usuário fecha a tela.
Ainda não há painel administrativo; investigar protocolos por acesso privado ao banco/Brevo.

## Railway
Somente BREVO_API_KEY, BUG_REPORT_SENDER_EMAIL, BUG_REPORT_SENDER_NAME e
BUG_REPORT_RECIPIENT_EMAIL são necessários para este recurso.
Remetente validado no Brevo. Nenhuma chave no frontend/GitHub.
BUG_REPORT_STORAGE_DIR, BUG_REPORT_STORAGE_MAX_BYTES e BUG_REPORT_MAINTENANCE_ENABLED
foram removidos do código e não são mais necessários. Não criar volume para prints.
Não remover volume utilizado por outras funcionalidades.
Sem migração destrutiva: banco legado/tabelas/arquivos de versões anteriores não são
apagados automaticamente. A versão anterior era local e não foi publicada nesta entrega.
Se alguém a publicou por outro meio, inventariar e limpar seus arquivos privadamente
em operação separada; este fluxo não consulta nem reenvia anexos legados.

## Testes e limites da evidência
backend/tests/test_bug_reports.py e test_support_images.py: envio simulado, validação,
metadata/orientação, APNG/arquivo forjado, semáforo, upload em BytesIO, hash,
retry com mesma imagem, aceites repetidos, sessão alheia e crash ambíguo.
tests/bug-report-menu.test.js, bug-report-form-ui.test.js e support-attachment-ui.test.js:
texto, prévia, compressão, remoção, falha, retry e confirmação somente com accepted.
Banco isolado e provedor simulado. Nenhum e-mail real.
Ainda validar em iPhone/Android físicos e no Railway/Gmail após publicação.

## APPLE DESIGN RESEARCH
Question: como preservar a clareza do anexo sem armazenamento?
Sources consulted: nenhuma fonte Apple; APPLE-DOCS RESEARCH UNAVAILABLE.
Apple explicit guidance: nenhuma atribuída.
Design inference: distinguir registro do relato de aceite do e-mail evita confirmação falsa.
ROUDY-specific decision: manter componentes aprovados e autorização para continuar sem Apple Docs.
Implementation: aviso sem retenção de 30 dias e estados de envio explícitos.

## Revisão do percurso do usuário
Correções: seletor mantém nome do arquivo visível junto à prévia; descrição bloqueada
durante envio; falhas ambíguas preservam conteúdo imutável e mesmo protocolo para
consulta/nova tentativa, inclusive se a tentativa seguinte receber 429. Só uma rejeição
confirmada do provedor libera edição/remoção de imagem. Respostas HTML ou JSON inválido
geram aviso simples, não detalhes técnicos. Limite de 5 tentativas informa erro explícito.
Backend rejeita texto diferente no mesmo protocolo. Cache PWA atualizado para evitar
mistura de HTML novo e JavaScript antigo. Nenhuma alteração de navegação ou design.
Teste dedicado: npm run test:support (requer Playwright disponível no ambiente).
539 testes de backend, suíte npm test, teste PWA e três testes de suporte passaram localmente.
Sem envio real ao Brevo; nem entrega Gmail, celulares físicos ou produção foram comprovados.
