"""Seções da Letra e cifra: só nome de seção vira título; letra continua letra."""
from app.schemas.resumo_harmonico import CifraCompleta
from app.services.harmonic_normalizer import fix_sheet_section_names, is_section_name


def sheet(sections):
    return CifraCompleta.model_validate({"source": "user_upload", "content": "x", "sections": sections})


def line(letra, *acordes):
    return {"letra": letra, "acordes": [{"acorde": a, "posicao": i * 4} for i, a in enumerate(acordes)]}


def test_lyric_used_as_section_name_goes_back_to_lyrics():
    s = sheet([{"nome": "Oceanos onde os pés podem falhar", "linhas": [line("E ali te encontro no mistério", "D", "A")]}])
    fix_sheet_section_names(s)
    assert s.sections[0].nome is None
    assert [l.letra for l in s.sections[0].linhas] == ["Oceanos onde os pés podem falhar", "E ali te encontro no mistério"]


def test_lyric_name_is_not_duplicated_when_already_first_line():
    s = sheet([{"nome": "Tu me chamas", "linhas": [line("Tu me chamas", "G")]}])
    fix_sheet_section_names(s)
    assert s.sections[0].nome is None and len(s.sections[0].linhas) == 1


def test_real_section_names_are_kept():
    s = sheet([{"nome": "Refrão", "linhas": [line("Meus pés", "G")]},
               {"nome": "[Primeira Parte]", "linhas": [line("Tu me chamas", "D")]}])
    fix_sheet_section_names(s)
    assert [sec.nome for sec in s.sections] == ["Refrão", "Primeira Parte"]


def test_section_name_written_as_lyric_line_opens_new_section():
    s = sheet([{"nome": None, "linhas": [line("Intro:"), line("", "D", "A"), line("Refrão:"), line("Meus pés", "G")]}])
    fix_sheet_section_names(s)
    assert [sec.nome for sec in s.sections] == ["Intro", "Refrão"]
    assert s.sections[1].linhas[0].letra == "Meus pés"


def test_section_vocabulary():
    for name in ["Refrão 2x", "Refrão (2x)", "Refrão Final", "Pós-Refrão", "Instrumental", "Verso 2", "Pré Refrão"]:
        assert is_section_name(name), name
    for lyric in ["Oceanos onde os pés podem falhar", "Final feliz da minha história", "Tu és fiel"]:
        assert not is_section_name(lyric), lyric

