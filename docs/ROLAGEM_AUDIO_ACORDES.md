# Leitura de acordes na rolagem inteligente

Melhoria local, ainda beta experimental. A leitura anterior dependia exclusivamente da fundamental do afinador; um acorde polifônico podia produzir frequência nula ou uma nota não correspondente à tônica.

Agora o microfone fornece também o espectro FFT (8192 amostras). Picos locais são interpolados, filtrados por amplitude/afinação e agrupados por classe musical. A combinação é comparada ao acorde esperado: raiz, terça e quinta; extensões e baixo de inversões integram as notas permitidas. Exige cobertura e energia mínima das notas essenciais, não apenas a nota mais forte. Nota tônica isolada dominante continua suportada.

O deslocamento físico do capotraste é considerado além das cifras já transpostas na interface. A confirmação de 250 ms e o acompanhamento sequencial permanecem. Ataque de nova batida pode rearmar acordes consecutivos com mesma raiz; sustentar o mesmo som não deve consumir uma sequência de acordes. Silêncio não reinicia progresso. Rolagem manual permanece neutra e conclusão volta ao topo.

Sem envio de áudio, IA externa ou custos adicionais. O afinador visual continua com sua leitura monofônica; somente a rolagem solicita análise espectral. Isso não equivale a reconhecimento universal: ruído, voz, acompanhamento, harmônicos fortes, afinação/instrumentos diferentes e acordes incompletos podem falhar. A tônica isolada não distingue maior/menor; extensões são toleradas, não certificadas como integralmente tocadas.

Testes: espectros sintetizados, maior/menor, inversão, capotraste, ruído plano, silêncio, tônica isolada e fluxo espectro → estabilidade → avanço. Testes automatizados não substituem validação acústica com instrumentos e microfones reais. Não houve publicação/deploy.

## Ajuste local v200 — acorde A aberto

Relato: violão, acorde A completo. Reproduzida rejeição de um perfil com A/E
dominantes e C# em 7% da energia. A regra antiga exigia 12% para a terça e 9%
para contar cada nota presente. Um espectro sintetizado da posição x02220,
com harmônicos e C# fraco, também era rejeitado.

O novo limite considera notas essenciais a partir de 3,5%, com cobertura superior
a 73%, três notas presentes e tônica acima de 8%. A terça oposta dominante é
rejeitada antes da exceção de tônica forte, para não aceitar Am como A. Limites
de silêncio/ruído, estabilidade e repetição permanecem. O afinador não foi alterado.

Testes adicionados para o perfil, espectro do voicing e avanço da rolagem, além
de Am incompatível e tônica forte com terça menor. Isso corrige a rejeição
reproduzida, mas não comprova a causa única do microfone do usuário. Ajuste local,
ainda sem novo deploy; validação acústica real necessária.

## Ajuste local v201 — resposta rápida

O controlador da tela usa confirmação de 0 ms: a primeira análise espectral
compatível já marca o acorde. Intervalo mínimo entre avanços: 50 ms. Para repetir
a mesma raiz, continua exigindo novo ataque ou ausência de sinal por 100 ms;
quedas curtas na identificação não contam como novas execuções.

Somente a rolagem usa FFT de 4096 amostras, intervalo solicitado de 20 ms e
dispensa a autocorrelação monofônica, pois compara acordes pelo espectro. O
afinador mantém sua resolução de 8192 e intervalo de 80 ms. Em 48 kHz, a janela
da rolagem representa aproximadamente 85 ms, em vez de 171 ms. Esse tamanho não
é garantia de latência: microfone, navegador, taxa de quadros e aparelho também
influenciam. Não se promete resposta física de zero milissegundos.

Testes: primeira amostra aceita imediatamente; som sustentado e pequena falha
não duplicam acorde; novo ataque e silêncio real rearmam; A/Am com janela curta;
captura rápida e afinador preservado; interface marca A e espera D após uma única
análise compatível. Sem novo deploy.

## Ajuste local v202 — confirmação curta de 120 ms

Após relato de falsos avanços sem tocar, a confirmação instantânea foi substituída
por 120 ms de reconhecimento consistente. Perdas de sinal acima de 40 ms reiniciam
a candidatura. O intervalo mínimo entre avanços passa a 80 ms; repetição da mesma
raiz ainda exige novo ataque ou ausência de sinal por 100 ms. Cada novo ataque
reinicia sua própria confirmação, sem reutilizar tempo acumulado de som sustentado.

Captura rápida e janela curta da v201 permanecem. Testes verificam rejeição de
um pico isolado, aceitação aos 120 ms, confirmação independente da repetição e
marcação visual no tempo esperado. Ruído persistente musicalmente compatível pode
ainda provocar falsos positivos; a função permanece experimental. Sem novo deploy.
