# Convites para retomar estudos

Os seis textos fornecidos pelo usuário pertencem a RESUME_AFTER_INACTIVITY. OPEN_UPCOMING_EVENT continua baseado na data real, músicas existentes e estado explícito de preparação. Inatividade nunca altera esse estado.

Intervalo escolhido pelo usuário: cinco dias completos desde lastEvidenceAt da última sessão qualificada registrada neste aparelho, respeitando a preferência existente de registros privados. Sem registro, outra conta, música indisponível, dados futuros ou além da retenção de 90 dias: nenhum convite. Nova atividade qualificada cancela a elegibilidade. O botão Retomar estudos abre a música correspondente; Agora não descarta essa ocorrência apenas localmente. O histórico limita reapresentações a sete dias. Eventos e ações operacionais existentes vencem o desempate. Não são criadas notificações push.

## APPLE DESIGN RESEARCH

Question: Como distinguir um convite contextual de retorno de um aviso factual de evento sem criar pressão ou inferir preparo?

Sources consulted: Apple HIG, Notifications, design/human-interface-guidelines/notifications (Apple Docs search + read).

Apple explicit guidance: Conteúdo conciso e informativo; evitar avisos repetidos; informação em primeiro plano deve ser apresentada sem distração ou invasão.

Design inference: Esses princípios também ajudam a limitar um card contextual dentro do app; a Apple não determina um intervalo de inatividade para o ROUDY.

ROUDY-specific decision: Usar as seis frases aprovadas, cinco dias de inatividade conforme escolha do usuário, evidência privada existente e categoria separada dos eventos. Preservar prioridade operacional e preparação desconhecida.

Implementation: study-evidence gera o candidato; context-intelligence aplica prioridade e histórico; contextual-copy fornece texto e CTA; index abre a música; descarte local não envia evidência ao servidor.

Validation: study-inactivity cobre limite temporal, ausência de registros, nova sessão, conta, preferência, destino indisponível, seis variantes, prioridade de evento, preparo desconhecido e descarte local. Suítes existentes de evidência, copy, inteligência, delivery, histórico e sintaxe passaram.
