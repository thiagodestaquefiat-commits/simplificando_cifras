# Biblioteca de Acordes

## Estado atual

> A interface passou a utilizar a arquitetura multi-instrumentos documentada em
> `docs/COBERTURA_MULTI_INSTRUMENTOS.md`. O arquivo `js/chord-library.js` permanece
> temporariamente como camada legada de compatibilidade e referência dos 2.016
> registros anteriores; ele não é mais a fonte dos diagramas selecionados na interface.

## Biblioteca legada de violão

O Simplificando Cifras possui uma biblioteca própria de diagramas para violão. Ela é carregada por `js/chord-library.js` e não depende do catálogo de músicas, de playlists nem do armazenamento do usuário.

A biblioteca contém **2.016 diagramas canônicos**:

- 12 classes de altura canônicas;
- 14 qualidades de acorde;
- 12 opções de baixo para cada acorde, incluindo a fundamental.

Fórmula: `12 × 14 × 12 = 2.016`.

As grafias bemol solicitadas são resolvidas por aliases, totalizando cobertura de entrada para: `A`, `A#`, `Bb`, `B`, `C`, `C#`, `Db`, `D`, `D#`, `Eb`, `E`, `F`, `F#`, `Gb`, `G`, `G#` e `Ab`.

## Categorias

- Maiores
- Menores
- Quinta
- Sexta
- Sétima
- Maior 7
- Menor 7
- Dominante
- Nona
- add9
- sus2
- sus4
- Diminutos
- Aumentados
- Décima primeira, mantida para cobrir o repertório atual
- Inversões
- Acordes com baixo

## Normalização e aliases

A normalização é usada somente para localizar o diagrama. O texto mostrado ao usuário permanece igual ao texto recebido.

Exemplos:

| Entrada exibida | Chave canônica |
| --- | --- |
| `B4` | `Bsus4` |
| `A4` | `Asus4` |
| `B2` | `Bsus2` |
| `C7m` | `Cmaj7` |
| `Db` | `C#` |
| `Gb` | `F#` |
| `BbM7/D` | `A#maj7/D` |
| `G/A` | `G/A` |

Aliases de raiz:

- `Db → C#`
- `Eb → D#`
- `Gb → F#`
- `Ab → G#`
- `Bb → A#`

Aliases de qualidade incluem `maj`, `min`, `M7`, `7M`, `7m`, `Δ7`, `2`, `4`, `sus`, `°`, `+` e `#5`.

## Estrutura dos diagramas

Cada entrada possui:

```js
{
  f: [-1, 3, 2, 0, 1, 0], // casas por corda; -1=muda, 0=solta
  fi: [0, 3, 2, 0, 1, 0], // dedos de 0 a 4
  b: 1,                    // primeira casa exibida
  bar: { fr: 1, s: 0, e: 5 }, // pestana opcional
  strings: 6,
  root: "C",
  bass: "C",
  suffix: "",
  quality: "Maior",
  categories: ["Maiores"],
  intervals: [0, 4, 7],
  source: "biblioteca"
}
```

As posições-base são transpostas para as 12 notas. As versões com baixo usam uma busca de digitação que mantém o baixo como a nota mais grave, preserva os intervalos essenciais e limita a abertura visual do diagrama.

## Fluxo de resolução

1. Receber o nome do acorde.
2. Preservar a grafia original para exibição.
3. Normalizar raiz, qualidade e baixo.
4. Localizar a chave canônica em `chordLibrary.diagrams`.
5. Renderizar o diagrama retornado.

Esse fluxo funciona para acordes vindos do catálogo padrão, músicas importadas ou futuras integrações.

## Validação automatizada

O teste `tests/chord-library.test.js` percorre todas as 2.016 entradas e verifica:

- exatamente seis cordas;
- casas inteiras entre `-1` e `24`;
- dedos inteiros entre `0` e `4`;
- ausência de dedos em cordas soltas ou mudas;
- casa-base válida;
- amplitude compatível com o desenho;
- pestanas com casa e intervalo de cordas válidos;
- notas pertencentes à formação do acorde;
- baixo solicitado como nota mais grave;
- presença dos intervalos essenciais.

## Como adicionar uma qualidade

1. Adicionar uma definição em `QUALITIES`, dentro de `js/chord-library.js`.
2. Informar `suffix`, `label`, `categories`, `intervals`, `f` e `fi`.
3. Adicionar aliases de escrita em `SUFFIX_ALIASES`, quando necessário.
4. Executar `node tests/chord-library.test.js`.
5. Executar a regressão de interface para conferir a renderização e o funcionamento offline.

Não é necessário editar nenhuma música para ampliar a biblioteca.
