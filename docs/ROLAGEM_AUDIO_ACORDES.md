# Leitura de acordes na rolagem inteligente

Melhoria local, ainda beta experimental. A leitura anterior dependia exclusivamente da fundamental do afinador; um acorde polifônico podia produzir frequência nula ou uma nota não correspondente à tônica.

Agora o microfone fornece também o espectro FFT (8192 amostras). Picos locais são interpolados, filtrados por amplitude/afinação e agrupados por classe musical. A combinação é comparada ao acorde esperado: raiz, terça e quinta; extensões e baixo de inversões integram as notas permitidas. Exige cobertura e energia mínima das notas essenciais, não apenas a nota mais forte. Nota tônica isolada dominante continua suportada.

O deslocamento físico do capotraste é considerado além das cifras já transpostas na interface. A confirmação de 250 ms e o acompanhamento sequencial permanecem. Ataque de nova batida pode rearmar acordes consecutivos com mesma raiz; sustentar o mesmo som não deve consumir uma sequência de acordes. Silêncio não reinicia progresso. Rolagem manual permanece neutra e conclusão volta ao topo.

Sem envio de áudio, IA externa ou custos adicionais. O afinador visual continua com sua leitura monofônica; somente a rolagem solicita análise espectral. Isso não equivale a reconhecimento universal: ruído, voz, acompanhamento, harmônicos fortes, afinação/instrumentos diferentes e acordes incompletos podem falhar. A tônica isolada não distingue maior/menor; extensões são toleradas, não certificadas como integralmente tocadas.

Testes: espectros sintetizados, maior/menor, inversão, capotraste, ruído plano, silêncio, tônica isolada e fluxo espectro → estabilidade → avanço. Testes automatizados não substituem validação acústica com instrumentos e microfones reais. Não houve publicação/deploy.
