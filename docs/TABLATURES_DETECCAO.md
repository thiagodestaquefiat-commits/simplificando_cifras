# Extração e compatibilidade de tablaturas

Blocos ASCII de 4–7 linhas com notas antes de `|` ou `:` e traços são separados
de `fullChordSheet.content` e guardados em `tablature.sections`. Letras e cifras
restantes são preservadas. A operação é idempotente e não duplica trechos após
normalização/reabertura; ocorrências repetidas no mesmo arquivo são preservadas.
Rótulos como `[Solo]`, `[Riff 1]`, `[Riff 2]`, `Solo`, `Parte 1 de 8` e `[Intro]`
são mantidos como títulos. Sem identificação, o título é `Tablatura`.

A origem é avaliada por instrumento declarado, afinação declarada e notas reais
do bloco, nessa prioridade. Declarações posteriores só valem para os trechos
seguintes. Cada seção conserva seu instrumento e afinação, inclusive arquivos
mistos. Compatibilidade da aba é pelo instrumento, não pela afinação escolhida
no afinador. Transposição de tom não muda números/casas da tablatura.

Catálogo inicial: guitarra padrão, Drop D/C/C#/B, D e C padrão, meio tom abaixo,
DADGAD, Open G/D; baixo padrão/Drop D/C, 5 e 6 cordas; ukulele GCEA/Low G e D.
Barítono DGBE é ambíguo com fragmento de guitarra: exige instrumento explícito.
Sustenidos/bemóis equivalentes e ordem inversa são considerados. Uma nota C
isolada não identifica ukulele (por exemplo, baixo em Drop C contém C).

Afinações desconhecidas não são adivinhadas: o bloco é preservado como desconhecido
e não cria uma aba de execução incompatível. O editor permite indicar manualmente
o instrumento e afinação. Metadados já cadastrados em tablaturas parciais são
respeitados. A detecção é heurística, não identificação infalível de qualquer
instrumento/afinação. Blocos sem rótulos de cordas ou fragmentos isolados com menos
de quatro linhas não são extraídos automaticamente.

Na música, a aba **Tablaturas** mostra somente seções compatíveis com o instrumento
atual do seletor. Teclado, cavaco e viola caipira não recebem tablaturas de guitarra.
Mudar instrumento atualiza a aba imediatamente; se ela estava aberta e deixa de
ser compatível, retorna ao resumo. Ocultar não exclui os dados. O parser também
reconhece baixo, mas isso não acrescenta instrumentos novos ao seletor da música.

Normalização de músicas e editor aplicam a extração ao receber/salvar conteúdo de
IA, arquivo ou texto. Músicas legadas são separadas para exibição sem gravar uma
edição no catálogo só por abri-las. O motor não faz OCR: depende de a importação
fornecer as linhas e rótulos no texto. Funciona localmente, sem chamada de IA/rede.

Testes: guitarra Drop C, baixo/ukulele de quatro cordas, meio tom abaixo, metadados
explícitos, títulos, idempotência, texto preservado, filtros e interface móvel offline.
Implementação local, sem publicação.
