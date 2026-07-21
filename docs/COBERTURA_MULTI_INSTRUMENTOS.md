# Cobertura da biblioteca multi-instrumentos

## Arquitetura

A definição central está em `js/instruments/instrument-definitions.js`. Cada registro informa identidade, renderer, quantidade de cordas ou ordens, afinação, biblioteca e recursos compatíveis.

O resolvedor `js/instruments/multi-instrument-chord-library.js` mantém cada resultado vinculado ao `instrumentId`. Um shape nunca é reutilizado entre instrumentos: cada posição é calculada a partir da afinação do instrumento selecionado e validada antes de ser retornada.

## Cobertura declarada

Cada instrumento suporta 12 fundamentais e 21 famílias, totalizando **252 acordes canônicos**. Aliases não duplicam registros: eles são normalizados apenas para busca, preservando a escrita original na interface.

| Instrumento | Afinação | Cordas/ordens | Canônicos | Válidos | Inválidos | Ausentes | Cobertura |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Violão & Guitarra | E2 A2 D3 G3 B3 E4 | 6 cordas | 252 | 252 | 0 | 0 | 100% |
| Ukulele | G4 C4 E4 A4, reentrante | 4 cordas | 252 | 252 | 0 | 0 | 100% |
| Teclado | Cromático | teclas | 252 | 252 | 0 | 0 | 100% |
| Cavaco | D4 G4 B4 D5 | 4 cordas | 252 | 252 | 0 | 0 | 100% |
| Viola Caipira | Cebolão em E: E2 B2 E3 G#3 B3 | 5 ordens duplas | 252 | 252 | 0 | 0 | 100% |

Total canônico validado: **1.260 diagramas**.

## Famílias

Maior, menor, quinta, sexta, menor sexta, sétima dominante, sétima maior, menor com sétima, menor com sétima maior, nona, maior com nona, menor com nona, add9, décima primeira, menor com décima primeira, décima terceira, sus2, sus4, diminuto, meio-diminuto e aumentado.

## Aliases e inversões

Os aliases incluem `B4 → Bsus4`, `A4 → Asus4`, `7M → maj7`, `° → dim`, `+ → aug`, `m7(b5) → m7b5`, `m7(11) → m11` e equivalência entre sustenidos e bemóis.

As inversões são resolvidas sob demanda. Foram validadas nos cinco instrumentos as inversões obrigatórias `C/E`, `D/F#`, `E/G#`, `G/B` e `Am/C`, além dos baixos usados no catálogo atual. Em instrumentos de afinação reentrante, o baixo é validado pela altura real produzida, não pela ordem visual da corda.

## Como os desenhos são gerados

Para instrumentos de corda, o resolvedor:

1. normaliza o acorde sem alterar seu texto visual;
2. calcula as notas permitidas e os intervalos essenciais da família;
3. enumera somente casas que produzem notas do acorde na afinação ativa;
4. exige fundamental, terça ou suspensão, extensão característica e baixo da inversão;
5. rejeita notas incompatíveis, abertura excessiva, mais de quatro posições de dedo e baixos incorretos;
6. classifica as posições por abertura, região do braço, quantidade de cordas abafadas e dificuldade;
7. retorna a posição válida de menor custo como variante padrão.

Isso não transforma shapes de seis cordas em quatro cordas. Ukulele, cavaco e viola são resolvidos diretamente em suas próprias afinações.

## Digitação e formas preferenciais

As formas básicas de violão são curadas explicitamente e têm prioridade sobre o resolvedor avançado: `C`, `D`, `E`, `F`, `G`, `A`, `B`, seus menores, `A7`, `B7`, `C7`, `D7`, `E7`, `G7`, `C7M`, `D/F#`, `G/B`, `A9`, `B4`, `C#m7` e `F#m7(11)`.

`validateFingering()` verifica dedos de 1 a 4, dedos em cordas pressionadas, repetição somente com pestana declarada, alcance da barra, dedos livres, ordem das casas e abertura da mão. Posições algorítmicas nunca inferem pestana por coincidência de casa e usam no máximo quatro dedos independentes. Formas curadas com pestana desenham uma barra contínua com um único número de dedo.

O teclado usa renderer próprio. As notas são ordenadas a partir do baixo solicitado e a fundamental recebe destaque separado. Há suporte a posição fundamental e inversões compatíveis com a formação do acorde.

## Viola Caipira

Está implementada a afinação **Cebolão em E**, representada por cinco ordens duplas. A arquitetura já reserva futuras afinações Cebolão em D, Rio Abaixo, Boiadeira e Natural, mas elas ainda não possuem bibliotecas ativas e não aparecem como selecionáveis.

## Evidências obrigatórias

`A9`, `B4`, `C#m7`, `F#m7(11)` e todos os acordes das músicas **Liberta-me de mim** e **Teu Santo Nome** foram resolvidos e validados nos cinco instrumentos. Nenhum deles produz “Diagrama não disponível”.

## Variações futuras

O campo `variant` identifica a posição padrão. A estrutura aceita múltiplas variantes futuras sem alterar o nome canônico, a afinação ou o renderer do instrumento.
