# Inteligência Contextual — Roadie digital

## Diagnóstico anterior

O pipeline já era determinístico (`snapshot → sinais → relevância → próxima ação → copy → Home`) e utilizava eventos acessíveis, horário, repertório, alterações estruturadas e recibos explícitos de revisão. O card da Home tinha CTA real e `Agora não`, mas o histórico persistente guardava somente acknowledgements. Uma simples exibição não criava intervalo, abrir o CTA não o suprimia e mudanças comuns só chegavam ao card quando invalidavam uma revisão formal.

O sino continua sendo o histórico cronológico de convites, mensagens e alterações. O card contextual não duplica itens no sino: ele seleciona somente a próxima ação mais útil a partir dos mesmos dados já carregados.

## Regras implementadas

- **Mudanças:** alteração de tom/capo, estrutura, notas, adição ou remoção recente; abre diretamente as alterações do evento.
- **Preparação:** usa somente estados e recibos explícitos; abrir uma música nunca significa preparo concluído.
- **Continuidade:** retoma a mesma música no mesmo evento quando existe acesso recente real, sem convertê-lo em progresso.
- **Reconhecimento:** aparece somente quando todas as músicas possuem confirmação explícita confiável.
- **Antecipação:** cobre evento recém-criado com timestamp confiável, janela de sete dias, três dias, amanhã e repertório vazio.
- **Dia do evento:** preserva o acesso direto ao Modo Palco quando a preparação está comprovadamente pronta.
- Eventos passados, cancelados, encerrados, arquivados ou sem participação são excluídos.

Prioridade: mudança importante → preparação → continuidade → reconhecimento → antecipação. Em empate temporal, o evento mais urgente mantém a maior prioridade; somente uma ação ocupa o card.

## Deduplicação

`context-history.js` registra localmente por usuário apenas fingerprint, evento, categoria, quantidade e horários de apresentação/abertura. Não envia telemetria nem cria chamadas de rede.

- CTA aberto: a mesma ação não reaparece.
- Mesma fingerprint: cooldown por categoria (4 h a 7 dias).
- Mesmo evento: uma mensagem de prioridade igual ou inferior não substitui outra dentro de 12 horas.
- Mudança real: novos IDs/revisões alteram a fingerprint e liberam uma nova mensagem relevante.
- `Agora não`: continua usando o acknowledgement local/remoto existente.

## Limitações conhecidas

- Não existe timezone próprio persistido por evento; cálculos usam o fuso local do dispositivo.
- Eventos sincronizados atuais não possuem um fluxo completo de status cancelado/encerrado. O motor respeita o status quando disponível, mas não inventa esse estado.
- Histórico musical confiável disponível é a última música aberta. Ele permite continuidade, não reconhecimento de estudo.
- Reconhecimento depende de recibos/estados explícitos de preparação; sem eles o estado permanece `UNKNOWN`.

## Refinamento editorial v591

- Mudanças novas são avisos informativos e não são ocultadas pelo cooldown de incentivos do mesmo evento. A mesma mudança continua deduplicada pela fingerprint.
- Antecipação distingue preparação `READY`, pendente e `UNKNOWN`; o estado desconhecido usa texto neutro e nunca presume falta de estudo.
- Continuidade exige atividade real, item ainda presente no repertório e acesso válido.
- A camada de texto registra família, estrutura, intensidade e variante apresentadas. Na seleção seguinte, evita repetir primeiro a estrutura e depois a frase, mantendo resultado determinístico.
- Intensidades editoriais: `DISCRETO` para informação musical crítica, `DIVERTIDO` como padrão e `OUSADO` somente em variantes leves e pouco frequentes.
