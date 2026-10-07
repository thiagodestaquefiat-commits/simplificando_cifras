"""Catálogo único para Python e fallback JS. Saída stdout, sem regravar arquivos."""

import json

from .intents import INTENTS
from .nlu import ALIASES, FILLERS


def javascript():
    catalog = {"aliases": ALIASES, "fillers": sorted(FILLERS), "threshold": 0.72,
               "margin": 0.08, "intents": [
                   {"name": i.name, "phrases": i.phrases, "groups": i.required_groups}
                   for i in INTENTS]}
    return "// Gerado por python -m voice_assistant.export_catalog; não editar manualmente.\n" + \
        "globalThis.roudyIntentCatalog = Object.freeze(" + json.dumps(catalog, ensure_ascii=False) + ");\n"


if __name__ == "__main__":
    print(javascript(), end="")
