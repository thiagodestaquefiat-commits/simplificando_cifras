# Validação de dedicação musical

Produção mantém os critérios aprovados: loop deliberado com três passagens e 60 segundos reais; edição efetiva salva com intervenções separadas por 30 segundos; acompanhamento com regiões distintas por 90 segundos. Separação de sessões: 15 minutos de interrupção. Reconhecimentos: música 2 sessões/14 dias; constância 2 dias/7 dias; repertório 2 músicas/14 dias. Cooldown compartilhado: 72 horas. Retenção: 90 dias/600 resumos por conta. Parâmetros em `study-evidence.js`.

## Preview controlado

Abra o Deploy Preview com `?dedicationTest=1`. Entre na conta e vá à Home. Abra “Teste de dedicação · Preview”, no canto inferior direito.

- **Música:** requer uma música na biblioteca. Cria duas sessões fictícias da mesma música.
- **Constância:** requer duas músicas na biblioteca. Cria sessões fictícias em dois dias diferentes.
- **Repertório:** requer evento acessível com duas músicas distintas da biblioteca, ainda válido para o motor contextual. Cria duas sessões vinculadas aos itens atuais.

Os avisos operacionais continuam tendo prioridade. Se um deles ocupar o card, resolva-o pelos fluxos normais; o teste não força elogios sobre avisos importantes. Evidências adiadas ficam disponíveis. A apresentação visível consome a dupla e aplica o cooldown. Cada botão reinicia somente o histórico fictício em memória para testar outra condição.

O teste não cria músicas, eventos ou confirmações de Preparado. Não altera relógio, parâmetros ou histórico real. Recarregar elimina as evidências fictícias. Remova o parâmetro para voltar ao armazenamento normal. Em produção, o parâmetro não ativa nenhum recurso de teste: o hostname é verificado antes de criar API, painel ou armazenamento de teste.

## Verificações automatizadas

`node --test tests/study-evidence.test.js` verifica o modelo e a prioridade no motor existente. `node tests/study-home-delivery-ui.test.js` verifica no Chromium o adaptador real de apresentação com DOM controlado: três condições, adiamento, card invisível sem consumo, card visível com consumo e bloqueio do modo de teste em produção. Este teste não substitui a revisão da Home completa no Preview.

Também foram executados testes existentes de contexto, Estudo, loop do YouTube, rolagem inteligente, Modo Palco e PWA. Validar manualmente Safari/iPhone físico, vídeo real sob buffering, concorrência real entre abas e comportamento offline instalado. Dados são individuais deste aparelho; não há sincronização entre dispositivos ou backend novo.
