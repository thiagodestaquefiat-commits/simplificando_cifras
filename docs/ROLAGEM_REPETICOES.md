# Repetições na rolagem inteligente

Marcadores de linha `(2x)`, `(3x)`, `(4x)` etc. geram novas passagens pela mesma
sequência, usando o campo `repeticoes` existente no resumo. A cifra não é duplicada
visualmente nem alterada na biblioteca. Letra + Cifras também lê marcadores ao fim
da linha de acordes. `Solo 2x` em uma linha com acordes ou no título de um trecho
de uma única linha também é considerado. Repetições válidas: de 1 a 99.

Ao finalizar uma passagem, volta ao primeiro acorde da linha, realinha suavemente
a tela e limpa somente os verdes dessa linha. O status informa `Volta 2/4`, por
exemplo. Depois da última passagem, os verdes permanecem e avança para a próxima
linha. Silêncio não reinicia contagem; pausa e novo play reiniciam como antes.
A trava para acordes consecutivos iguais continua exigindo nova execução/silêncio
ou ataque, evitando contar várias voltas sustentando uma única nota.

Exemplo: `G Em C G D (4x)` exige 20 confirmações, só depois segue para o próximo
trecho. `C D Em (2x)` seguido de `C D Em D` repete apenas a primeira linha.

Não interpreta instruções estruturais como Da Capo, Segno, casas 1/2 ou repetir
várias linhas indicadas por um título de seção; essas exigem marcação de escopo
própria. O reconhecimento de acordes permanece beta experimental.

Testes: sequências expandidas, contagem até a quarta volta, silêncio preservando
o índice e interface real móvel com frequências simuladas, verdes por passagem,
segunda linha 2x e conclusão. Implementação local, sem deploy.
