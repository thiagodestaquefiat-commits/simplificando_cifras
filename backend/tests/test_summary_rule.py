"""Regra do resumo ROUDY por voltas (aprovada por Thiago em 10/11/2026, conferida em 6 músicas)."""
from pathlib import Path

from app.schemas.resumo_harmonico import ResumoHarmonicoResponse
from app.services.ia_service import roudy_summary, summary_off_standard
from app.services.local_sheet_parser import parse_chord_sheet

FIXTURES = Path(__file__).parent / "fixtures"


def lines(result):
    return [(" ".join(b.acordes) + (f" ({b.repeticoes}x)" if b.repeticoes else ""), b.fraseGuia)
            for b in result.harmonicSummary.blocos]


def saved(title, blocks):
    return ResumoHarmonicoResponse.model_validate({"titulo": title, "confianca": "media", "harmonicSummary": {"blocos": [
        {"acordes": chords.split(), "repeticoes": reps, "fraseGuia": phrase} for chords, reps, phrase in blocks]}})


def organized(title, blocks):
    result = roudy_summary(saved(title, blocks))
    assert not summary_off_standard(result), "organizar de novo não muda nada"
    return lines(result)


def test_azusa_josue_e_larissa():
    # partes como o montador tira da cifra (PDF do Cifra Club enviado por Thiago)
    assert organized("Azusa", [
        ("C#m B A F#m", None, None), ("C#m B A", 3, "E há de ser"), ("A B C#m B", 3, "Enquanto muitos pensam que acabou"),
        ("C#m B A F#m", 2, "Como em Gales Tu fez"), ("C#m B A F#m", 4, "Se eu não desistir de orar"),
        ("C#m", None, None), ("A B B/D# C#m F#m", None, "4"),
    ]) == [
        ("C#m B A F#m (2x)", "Como em Gales Tu fez"),  # intro, refrão e ponte: a mesma volta, uma linha
        ("C#m B A (3x)", "E há de ser"),
        ("A B C#m B (3x)", "Enquanto muitos pensam que acabou"),
        ("A B B/D# C#m F#m", None),  # final; "4" (número da página do PDF) não é frase
    ]


def test_isaias_9_from_cifraclub():
    result = parse_chord_sheet((FIXTURES / "cifraclub_isaias_9.txt").read_text(encoding="utf-8"), "Isaías 9", "Rodolfo Abrantes", key="C")
    assert lines(result) == [
        ("C G4 Am (6x)", "Um menino nasceu"),
        ("F7M Am Dm F7M Am G", "E o Seu nome é"),
        ("Am Em Am F7M C Em F7M (2x)", "O céu começa a se abrir"),
    ]


def test_last_kiss_is_one_loop():
    assert organized("Last Kiss", [
        ("G Em C D", None, "Oh where, oh where"), ("Em C D G Em C D", None, "We were out on"), ("G Em C D", None, "I couldn't stop so"),
        ("Em C D G Em C D", None, "When I woke up"), ("G Em C D G", None, "I lifted her head"), ("Em C D G", None, "I kissed her our last kiss"),
    ]) == [("G Em C D", None)]


def test_ainda_que_a_figueira():
    assert organized("Ainda que a figueira", [
        ("F#m E9 Bm7 D", 2, "Tu és a minha porção"), ("A E9 Bm7 D", 2, "Mesmo que meus pais me deixem"),
        ("A E9 Bm7 D A E9 G D", None, "Ainda que a figueira"), ("Bm7 A E9 Bm7 A E9 Bm7 A E9 Bm7 A E9 D", None, None),
        ("A E9 Bm7 D A E9 G D A E9 Bm7", None, "Ainda que a figueira"), ("D A E9 G D A", None, "Não dê o seu fruto"),
    ]) == [
        ("F#m E9 Bm7 D (2x)", "Tu és a minha porção"),
        ("A E9 Bm7 D (2x)", "Mesmo que meus pais me deixem"),
        ("A E9 Bm7 D A E9 G D", "Ainda que a figueira"),
        ("Bm7 A E9 (4x)", None),
    ]


def test_pra_onde_ele_for_morada():
    assert organized("Pra Onde Ele For", [
        ("C E7 Am7 G F9", None, "Ele abriu mão de Sua glória"), ("C E7 Am7 G F7M", None, "Ele me deu um destino"),
        ("Dm7 C/E", None, "Parte 1 de 3"), ("F9 C/E", None, "Parte 2 de 3"), ("F9", None, "Parte 3 de 3"),
        ("Dm7 C/E F9 C/E", 2, "Pôs um anel em meu dedo"), ("F7M Am7", None, "E eu me despedi"),
    ]) == [
        ("C E7 Am7 G F9 (2x)", "Ele abriu mão de Sua glória"),
        ("Dm7 C/E F9 C/E (2x)", "Pôs um anel em meu dedo"),
        ("F7M Am7", "E eu me despedi"),
    ]


def test_single_block_already_in_standard_is_kept():
    result = saved("Uma volta", [("C#m A E B", 4, "Ouço um barulho diferente")])
    assert not summary_off_standard(result)


def test_pra_onde_ele_for_morada_complete():
    """Prints de 10/11/2026: "Parte 3 de 3 - 2x" também é rótulo de tablatura; linha com (2x) escrito
    repete inteira (F9 G Am7 Em F9 G 2x não vira F9 G Am7 Em 4x)."""
    assert organized("Pra Onde Ele For", [
        ("C E7 Am7 G F9", None, "Ele abriu mão de Sua glória"), ("C E7 Am7 G F7M", None, "Ele me deu um destino"),
        ("Dm7 C/E", None, "Parte 1 de 3"), ("F9 C/E", None, "Parte 2 de 3"), ("F9", None, "Parte 3 de 3"),
        ("Dm7 C/E F9 C/E", 2, "Pôs um anel em meu dedo"), ("F7M Am7", None, "E eu me despedi"),
        ("Am7 Em7", 4, "Se eu não tenho"), ("F9 G", None, "Parte 1 de 2"), ("Am7 Em", None, "Parte 2 de 2"),
        ("F9 G", 2, "Parte 3 de 3 - 2x"), ("F9 G Am7 Em F9 G", 2, "Sou, sou totalmente Teu"),
        ("Am7 C C/E Dm7 E7 Em Em7", None, None), ("F7M F9 G G4", None, None),
    ]) == [
        ("C E7 Am7 G F9 (2x)", "Ele abriu mão de Sua glória"),
        ("Dm7 C/E F9 C/E (2x)", "Pôs um anel em meu dedo"),
        ("F7M Am7", "E eu me despedi"),
        ("Am7 Em7 (4x)", "Se eu não tenho"),
        ("F9 G Am7 Em F9 G (2x)", "Sou, sou totalmente Teu"),
        ("Am7 C C/E Dm7 E7 Em Em7", None),
        ("F7M F9 G G4", None),
    ]
