from types import SimpleNamespace

from app.schemas.resumo_harmonico import ResumoHarmonicoResponse, TrechoHarmonico
from app.services.content_extractor import ExtractedContent
from app.services.providers.openai_provider import OpenAIProvider


class FakeResponses:
    def __init__(self, result):
        self.result = result
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(output_parsed=self.result)


def result():
    return ResumoHarmonicoResponse(titulo="Teste", tom="C", trechos=[TrechoHarmonico(acordes=["C"])], confianca="alta")


def test_image_is_sent_as_multimodal_input_with_structured_output():
    responses = FakeResponses(result())
    provider = OpenAIProvider("", "test-model", 1, 500, client=SimpleNamespace(responses=responses))
    media = ExtractedContent("image", None, "image/png", "data:image/png;base64,AAAA")
    provider.generate("system", "user", media)
    content = responses.kwargs["input"][1]["content"]
    assert content[1] == {"type": "input_image", "image_url": media.data_url}
    assert responses.kwargs["text_format"] is ResumoHarmonicoResponse
    assert responses.kwargs["reasoning"] == {"effort": "low"}


def test_pdf_is_sent_as_file_without_upload_persistence():
    responses = FakeResponses(result())
    provider = OpenAIProvider("", "test-model", 1, 500, client=SimpleNamespace(responses=responses))
    media = ExtractedContent("pdf", None, "application/pdf", "data:application/pdf;base64,AAAA", 1, "cifra.pdf")
    provider.generate("system", "user", media)
    item = responses.kwargs["input"][1]["content"][1]
    assert item == {"type": "input_file", "file_data": media.data_url, "filename": "cifra.pdf"}
