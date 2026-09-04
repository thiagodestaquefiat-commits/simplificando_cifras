from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
import pytest
from werkzeug.datastructures import FileStorage, MultiDict
from app.services import content_extractor as extractor
from app.services.providers.openai_provider import OpenAIProvider
from app.services.ia_service import IaService
from app.schemas.resumo_harmonico import ResumoHarmonicoRequest
from app.errors import ApiError
from test_api import sample_result, auth_headers

def file(data=b'\x89PNG\r\n\x1a\nphoto',name='photo.png',mime='image/png'):
    return FileStorage(stream=BytesIO(data),filename=name,content_type=mime)

def extract(files,**limits):
    return extractor.extract_uploads(files,**dict(max_bytes=1000,max_pages=20,max_text_length=50000,**limits))

def test_single_and_multiple_images_preserve_order():
    assert extract([file()]).kind=='image'
    items=extract([file(name='z.png'),file(b'\xff\xd8\xffsecond','a.jpg','image/jpeg')])
    assert [item.media_type for item in items.items]==['image/png','image/jpeg']
    assert items.page_count==2
    assert items.text is None

def test_pdf_pages_and_complementary_image(monkeypatch):
    pages=[SimpleNamespace(extract_text=lambda **kw:'C G\nPrimeira página com frase musical completa'),
           SimpleNamespace(extract_text=lambda **kw:'Am F\nSegunda página com outra frase musical')]
    monkeypatch.setattr(extractor,'PdfReader',lambda *a,**kw:SimpleNamespace(pages=pages))
    result=extract([file(b'%PDF-1.7','z.pdf','application/pdf'),file()])
    assert len(result.items)==2 and result.page_count==3
    assert result.items[0].text.index('Primeira')<result.items[0].text.index('Segunda')

def test_texts_join_as_one_source_without_sorting():
    result=extract([file(b'C G\nParte z','z.txt','text/plain'),file(b'Am F\nParte a','a.txt','text/plain')])
    assert result.text=='C G\nParte z\n\nAm F\nParte a'

def test_scanned_multipage_pdf_stays_one_intact_file(monkeypatch):
    monkeypatch.setattr(extractor,'PdfReader',lambda *a,**kw:SimpleNamespace(pages=[SimpleNamespace(extract_text=lambda **kw:'') for _ in range(3)]))
    result=extract([file(b'%PDF-1.7 scanned','pages.pdf','application/pdf')])
    assert result.kind=='pdf' and result.page_count==3
    assert result.items==()
    assert result.data_url.startswith('data:application/pdf;base64,')

@pytest.mark.parametrize('files,kwargs,code',[
    ([file() for _ in range(9)],{},'arquivos_demais'),
    ([file() for _ in range(2)],{'max_pages':1},'pdf_paginas_invalidas'),
    ([file(b'x'*600,'x.txt','text/plain'),file(b'y'*600,'y.txt','text/plain')],{},'arquivo_muito_grande'),
    ([file(b'abc','a.txt','text/plain'),file(b'def','b.txt','text/plain')],{'max_text_length':6},'arquivo_muito_grande'),
])
def test_aggregate_limits(files,kwargs,code):
    with pytest.raises(ApiError) as error:
        extractor.extract_uploads(files,max_bytes=1000,max_pages=kwargs.get('max_pages',20),max_text_length=kwargs.get('max_text_length',50000))
    assert error.value.code==code

def test_provider_sends_mixed_continuation_in_one_structured_call():
    calls=[]
    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(output_parsed=sample_result())
    provider=OpenAIProvider('', 'test', 1, 500, client=SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    parts=(extractor.ExtractedContent('text','C G\nContinuação','text/plain'),
           extractor.ExtractedContent('image',None,'image/png','data:image/png;base64,AAA'),
           extractor.ExtractedContent('pdf',None,'application/pdf','data:application/pdf;base64,BBB',2,'last.pdf'))
    provider.generate('system','Uma música',extractor.ExtractedContent('bundle',None,'multipart/mixed',items=parts))
    assert len(calls)==1
    content=calls[0]['input'][1]['content']
    assert [item['type'] for item in content]==['input_text','input_text','input_text','input_text','input_image','input_text','input_file']
    assert content[2]['text']=='C G\nContinuação'
    assert content[-1]['filename']=='last.pdf'
    assert calls[0]['text_format'].__name__=='ResumoHarmonicoResponse'

def test_route_accepts_repeated_legacy_field_and_one_result(client):
    with patch('app.services.providers.openai_provider.OpenAIProvider.generate',return_value=sample_result()) as generate:
        response=client.post('/api/resumo-harmonico',headers=auth_headers(client),data=MultiDict([
            ('arquivo',(BytesIO(b'Db B4'),'z.txt','text/plain')),
            ('arquivo',(BytesIO(b'Gb/Bb'),'a.txt','text/plain'))]),content_type='multipart/form-data')
    assert response.status_code==200
    assert generate.call_count==1
    data=response.get_json()
    assert data['schemaVersion']==2
    assert data['fullChordSheet']['content']=='Db B4\n\nGb/Bb'
    assert len(data['harmonicSummary']['blocos'])==1

def test_mixed_service_does_not_validate_images_against_partial_text():
    from app.schemas.resumo_harmonico import CifraCompleta, SecaoCifraCompleta, LinhaCifraCompleta, AcordePosicionado
    result=sample_result()
    result.fullChordSheet=CifraCompleta(source='user_upload',content='[reconstruir]',sections=[SecaoCifraCompleta(linhas=[LinhaCifraCompleta(letra='Frase real',acordes=[AcordePosicionado(acorde=c,posicao=i*5) for i,c in enumerate(['Db','B4','Gb/Bb'])])])])
    class Stub:
        def generate(self,*args,**kwargs):return result
    bundle=extract([file(b'Db','z.txt','text/plain'),file()])
    output=IaService(Stub()).generate(ResumoHarmonicoRequest(tipo='arquivo'),bundle)
    assert output.harmonicSummary.blocos[0].acordes==['Db','B4','Gb/Bb']
    assert output.fullChordSheet.content!='[reconstruir]'
