import pytest
from app.schemas.resumo_harmonico import ResumoHarmonicoResponse
from app.services.content_extractor import clean_pdf_text, clean_musical_text
from app.services.harmonic_normalizer import normalize_response, normalize_chord

SOURCE = '''https://example.test/score
Afinação: E A D G B E
[Intro]
C/E  G/B  F#/A#
[Verso]
C  Csus4  Am7  G  F
Uma frase que reconheço
[Interlúdio]
A9
[Solo]
B2  C#m7  D9  F9
METADADOS
Título: Canção sintética
Artista: Pessoa sintética
Diagramas de acordes
Am Am7 C C/E Csus4 Dm Dm7
0 1 2 0 0 0
5
Página 1 de 1'''


def response(chords=None, hook='Uma frase que reconheço', section='Verso', repeat=None):
    return ResumoHarmonicoResponse.model_validate(dict(titulo='Canção sintética', confianca='alta',
        harmonicSummary={'blocos':[dict(acordes=chords or ['C','Csus4','Am7','G','F'],fraseGuia=hook,secao=section,repeticoes=repeat)]},
        fullChordSheet={'source':'user_upload','content':'[reconstruir]','sections':[
            {'nome':'Verso','linhas':[{'letra':'Uma frase que reconheço','acordes':[{'acorde':c,'posicao':i*6} for i,c in enumerate(chords or ['C','Csus4','Am7','G','F'])]}]},
            {'nome':'METADADOS','linhas':[{'letra':'Afinação: E A D G B E','acordes':[]}]}
        ]}))


def test_pdf_text_and_text_share_conservative_cleanup():
    cleaned=clean_pdf_text([SOURCE])
    assert cleaned == clean_musical_text(SOURCE)
    for noise in ['Afinação','METADADOS','Título:','Artista:','Diagramas','Dm7','0 1 2','\n5','Página']:
        assert noise not in cleaned
    for useful in ['[Intro]','[Interlúdio]','[Solo]','C/E  G/B  F#/A#','A9','B2  C#m7  D9  F9','Csus4']:
        assert useful in cleaned


@pytest.mark.parametrize('chord',['C/E','G/B','F#/A#','B2','A9','C#m7','Csus4','Am7','C9','D9','F9','C7M','B4'])
def test_exact_valid_spelling(chord):
    assert normalize_chord(chord)==chord


def test_unlabelled_instrumental_is_not_a_legend():
    text='C Am F G Dm Em\nA9\nC/E'
    assert clean_musical_text(text)==text


def test_model_cannot_validate_its_own_invented_chord_or_hook():
    out=normalize_response(response(['C','Csus4','D#7'],hook='Inventada pela IA'), 'texto', 'C Csus4\nUma frase que reconheço')
    assert out.harmonicSummary.blocos[0].acordes==['C','Csus4']
    assert out.harmonicSummary.blocos[0].fraseGuia is None
    assert 'D#7' not in out.fullChordSheet.model_dump_json()
    assert 'METADADOS' not in out.fullChordSheet.model_dump_json()


def test_hook_suffix_and_duplicate_chorus_are_removed_without_invented_repeat():
    value=response(hook='Uma frase que reconheço / Verso')
    value.harmonicSummary.blocos.append(value.harmonicSummary.blocos[0].model_copy(deep=True))
    out=normalize_response(value,'texto',clean_musical_text(SOURCE))
    assert len(out.harmonicSummary.blocos)==1
    assert out.harmonicSummary.blocos[0].fraseGuia=='Uma frase que reconheço'
    assert out.harmonicSummary.blocos[0].repeticoes is None


@pytest.mark.parametrize('name',['Seção','Seção 1','Trecho','Trecho 2'])
def test_no_invented_section(name):
    assert normalize_response(response(section=name),'texto',SOURCE).harmonicSummary.blocos[0].secao is None


def test_repeat_requires_original_source_evidence():
    out=normalize_response(response(['C','G','C','G'],hook=None),'texto','C G')
    assert out.harmonicSummary.blocos[0].repeticoes is None
    out=normalize_response(response(['C','G','C','G'],hook=None),'texto','C G C G')
    assert out.harmonicSummary.blocos[0].repeticoes==2


def test_distinct_parts_are_not_truncated_to_twelve():
    value=response()
    base=value.harmonicSummary.blocos[0]
    value.harmonicSummary.blocos=[base.model_copy(update={'fraseGuia':f'Frase real número {i}'}) for i in range(15)]
    source='C Csus4 Am7 G F\n'+'\n'.join(f'Frase real número {i}' for i in range(15))
    assert len(normalize_response(value,'texto',source).harmonicSummary.blocos)==15


def test_cleaning_runs_before_provider_and_after_visual_transcription():
    from app.services.ia_service import IaService
    from app.services.content_extractor import ExtractedContent
    from app.schemas.resumo_harmonico import ResumoHarmonicoRequest
    class Stub:
        def generate(self, system, prompt, media=None, context=None):
            self.prompt=prompt
            return response()
    provider=Stub()
    out=IaService(provider).generate(ResumoHarmonicoRequest(tipo='texto',conteudo=SOURCE))
    assert 'Afinação:' not in provider.prompt
    assert 'METADADOS' not in out.fullChordSheet.content
    assert 'Csus4' in out.fullChordSheet.content
    visual=IaService(provider).generate(ResumoHarmonicoRequest(tipo='arquivo'),ExtractedContent('image',None,'image/png','data:image/png;base64,AAAA'))
    assert 'METADADOS' not in visual.fullChordSheet.content
    assert 'Csus4' in visual.fullChordSheet.content
    assert visual.fullChordSheet.sections[0].linhas[0].acordes[1].posicao==6


def test_chord_parentheses_and_unlabelled_diagram_footer():
    text='[Solo]\nF#m7(11) C/E\nUma frase real\nAm Am7 C C/E Csus4 Dm Dm7\n0 1 2 3 0 0'
    cleaned=clean_musical_text(text)
    assert 'F#m7(11)' in cleaned
    assert 'Dm7' not in cleaned
    out=normalize_response(response(['F#m7(11)','C/E'],hook=None),'texto',cleaned)
    assert out.harmonicSummary.blocos[0].acordes==['F#m7(11)','C/E']


def test_title_used_as_actual_lyric_is_preserved():
    assert clean_musical_text('C G\nUma frase real',('Uma frase real',)) == 'C G\nUma frase real'


def test_inline_visual_legend_does_not_become_progression():
    from app.schemas.resumo_harmonico import LinhaCifraCompleta, AcordePosicionado
    value=response()
    value.fullChordSheet.sections[0].linhas.extend([
        LinhaCifraCompleta(letra='Diagramas de acordes'),
        LinhaCifraCompleta(letra='',acordes=[AcordePosicionado(acorde='D#7',posicao=0)]),
        LinhaCifraCompleta(letra='5')])
    out=normalize_response(value,'arquivo')
    assert 'D#7' not in out.fullChordSheet.model_dump_json()
