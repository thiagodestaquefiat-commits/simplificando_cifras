"""NLU local por similaridade: nenhuma API, modelo remoto ou chave secreta."""

from dataclasses import dataclass
from difflib import SequenceMatcher
import re
import unicodedata
from typing import Iterable


ALIASES = {
    "abre": "abrir", "abra": "abrir", "abrisse": "abrir",
    "mostra": "mostrar", "mostre": "mostrar", "ver": "mostrar",
    "exiba": "mostrar", "exibir": "mostrar",
    "acessar": "abrir", "acesso": "abrir",
    "eventos": "evento", "proxima": "proximo",
    "configuracao": "configuracoes", "ajustes": "configuracoes",
    "cancoes": "musicas", "musica": "musicas",
}
# Negação e palavras temporais NÃO são descartadas.
FILLERS = frozenset({"cara", "ai", "ae", "ei", "eai", "roudy", "ola",
                     "por", "favor", "me", "eu", "voce", "pode", "poderia",
                     "quero", "gostaria", "preciso", "o", "a", "os", "as",
                     "um", "uma", "de", "do", "da", "dos", "das", "que",
                     "ta", "esta", "e", "para", "pra", "pro", "ir", "ate"})


def normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text.casefold())
    value = "".join(c for c in value if not unicodedata.combining(c))
    tokens = re.findall(r"[a-z0-9]+", value)
    return " ".join(ALIASES.get(t, t) for t in tokens if t not in FILLERS)


@dataclass(frozen=True)
class IntentDefinition:
    name: str
    phrases: tuple[str, ...]
    # Cada grupo requer ao menos um conceito. Evita comparação com domínio errado.
    required_groups: tuple[tuple[str, ...], ...] = ()


@dataclass(frozen=True)
class IntentMatch:
    intent: str | None
    confidence: float
    reason: str
    alternatives: tuple[str, ...] = ()


class IntentClassifier:
    """Dicionário de exemplos + fuzzy matching + limiar + margem de ambiguidade.

    Confidence é um score heurístico, não uma probabilidade calibrada.
    SequenceMatcher é a alternativa da biblioteca padrão ao fuzzywuzzy.
    """

    def __init__(self, definitions: Iterable[IntentDefinition], *,
                 threshold: float = 0.72, ambiguity_margin: float = 0.08):
        if not 0 <= threshold <= 1 or not 0 <= ambiguity_margin <= 1:
            raise ValueError("Os limites devem estar entre 0 e 1.")
        self.threshold = threshold
        self.ambiguity_margin = ambiguity_margin
        self._definitions: dict[str, IntentDefinition] = {}
        self._examples: dict[str, tuple[str, ...]] = {}
        for definition in definitions:
            self.register(definition)

    def register(self, definition: IntentDefinition) -> None:
        if definition.name in self._definitions:
            raise ValueError(f"Intenção duplicada: {definition.name}")
        examples = tuple(normalize(p) for p in definition.phrases)
        if not definition.name or not examples or not all(examples):
            raise ValueError("Cada intenção exige nome e exemplos não vazios.")
        self._definitions[definition.name] = definition
        self._examples[definition.name] = examples

    @staticmethod
    def similarity(left: str, right: str) -> float:
        a, b = left.split(), right.split()
        sequence = SequenceMatcher(None, left, right, autojunk=False).ratio()
        sorted_tokens = SequenceMatcher(None, " ".join(sorted(a)),
                                       " ".join(sorted(b)), autojunk=False).ratio()
        sa, sb = set(a), set(b)
        overlap = 2 * len(sa & sb) / (len(sa) + len(sb))
        # Não usa token_set_ratio: frase grande contendo uma palavra não vira 100%.
        return 0.55 * max(sequence, sorted_tokens) + 0.45 * overlap

    @staticmethod
    def _concept_present(concept: str, tokens: list[str]) -> bool:
        expected = normalize(concept).split()
        if len(expected) != 1:
            return bool(expected) and " ".join(expected) in " ".join(tokens)
        word = expected[0]
        return any(token == word or (
            len(word) >= 5 and len(token) >= 5 and
            SequenceMatcher(None, word, token, autojunk=False).ratio() >= 0.84
        ) for token in tokens)

    def classify(self, text: str) -> IntentMatch:
        if not isinstance(text, str) or len(text) > 500:
            return IntentMatch(None, 0.0, "invalid_input")
        normalized = normalize(text)
        tokens = normalized.split()
        if not tokens:
            return IntentMatch(None, 0.0, "empty_input")
        if set(tokens) & {"nao", "nunca", "nem", "sem"}:
            return IntentMatch(None, 0.0, "negated_command")
        # Fora do escopo: múltiplas ações. Nunca executa só metade silenciosamente.
        if any(marker in text.casefold() for marker in (" e depois ", " em seguida ", ";")):
            return IntentMatch(None, 0.0, "multiple_commands")
        ranked = []
        for name, definition in self._definitions.items():
            if not all(any(self._concept_present(c, tokens) for c in group)
                       for group in definition.required_groups):
                continue
            score = max(self.similarity(normalized, example) for example in self._examples[name])
            ranked.append((score, name))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        if not ranked:
            return IntentMatch(None, 0.0, "unknown_intent")
        score, name = ranked[0]
        if score < self.threshold:
            return IntentMatch(None, round(score, 3), "low_confidence")
        if len(ranked) > 1 and score - ranked[1][0] < self.ambiguity_margin:
            return IntentMatch(None, round(score, 3), "ambiguous",
                               tuple(item[1] for item in ranked[:2]))
        return IntentMatch(name, round(score, 3), "matched")
