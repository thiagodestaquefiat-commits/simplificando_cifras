from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator, model_serializer


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.replace("\x00", "").split()).strip()
    return cleaned or None


def _clean_content(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return cleaned or None


class ResumoHarmonicoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    tipo: Literal["pesquisa", "texto", "arquivo"]
    titulo: str | None = Field(default=None, max_length=160)
    artista: str | None = Field(default=None, max_length=160)
    conteudo: str | None = None
    sourceProvider: str | None = Field(default=None, max_length=80)
    sourceId: str | None = Field(default=None, max_length=300)
    modoGeracao: Literal["conhecimento_modelo"] | None = None

    @field_validator("titulo", "artista", "sourceProvider", "sourceId", mode="before")
    @classmethod
    def clean_strings(cls, value):
        return _clean(value)

    @field_validator("conteudo", mode="before")
    @classmethod
    def clean_content(cls, value):
        return _clean_content(value)

    @model_validator(mode="after")
    def validate_by_type(self, info):
        max_text_length = (info.context or {}).get("max_text_length", 50000)
        if self.tipo == "pesquisa" and not self.titulo:
            raise ValueError("titulo é obrigatório para pesquisa")
        if bool(self.sourceProvider) != bool(self.sourceId):
            raise ValueError("sourceProvider e sourceId devem ser enviados juntos")
        if self.modoGeracao and self.tipo != "pesquisa":
            raise ValueError("modoGeracao só pode ser usado em pesquisa")
        if self.modoGeracao and (self.sourceProvider or self.sourceId or self.conteudo):
            raise ValueError("modoGeracao não aceita fonte, URL ou conteúdo")
        if self.tipo == "texto" and not self.conteudo:
            raise ValueError("conteudo é obrigatório para texto")
        if self.conteudo and len(self.conteudo) > max_text_length:
            raise ValueError(f"conteudo deve ter no máximo {max_text_length} caracteres")
        return self


class TrechoHarmonico(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    acordes: list[str] = Field(default_factory=list, max_length=64)
    repeticoes: int | None = Field(default=None, ge=1, le=99)
    fraseGuia: str | None = Field(default=None, max_length=80)
    secao: str | None = Field(default=None, max_length=80)

    @field_validator("fraseGuia")
    @classmethod
    def limit_guide_words(cls, value: str | None) -> str | None:
        if value is None:
            return None
        words = value.split()
        return " ".join(words[:8])[:80].strip()


class AcordePosicionado(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    acorde: str = Field(min_length=1, max_length=40)
    posicao: int = Field(ge=0, le=500)


class LinhaCifraCompleta(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    letra: str = Field(default="", max_length=2000)
    acordes: list[AcordePosicionado] = Field(default_factory=list, max_length=64)


class SecaoCifraCompleta(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    nome: str | None = Field(default=None, max_length=80)
    linhas: list[LinhaCifraCompleta] = Field(default_factory=list, max_length=200)


class CifraCompleta(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    visibility: Literal["private"] = "private"
    source: Literal["user_upload", "user_text", "model_knowledge", "web_source"]
    content: str = Field(min_length=1, max_length=50000)
    sourceContent: str | None = Field(default=None, max_length=50000)
    bpmEvidenceText: str | None = Field(default=None, max_length=1000)
    sections: list[SecaoCifraCompleta] = Field(default_factory=list, max_length=80)

    @field_validator("content", mode="before")
    @classmethod
    def clean_full_content(cls, value):
        return _clean_content(value)

    @model_serializer(mode="wrap")
    def optional_metadata(self, handler):
        data=handler(self)
        if data.get("sourceContent") is None:
            data.pop("sourceContent",None)
        if data.get("bpmEvidenceText") is None:
            data.pop("bpmEvidenceText",None)
        return data


class ResumoEstruturado(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    blocos: list[TrechoHarmonico] = Field(default_factory=list, max_length=40)


class BpmSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["explicit_sheet"] = "explicit_sheet"
    value: int = Field(ge=30, le=240)
    evidence: str = Field(min_length=1,max_length=200)
    sourceType: str = Field(max_length=40)
    url: str | None = Field(default=None,max_length=2000)


class ResumoHarmonicoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    schemaVersion: Literal[2] = 2
    titulo: str = Field(min_length=1, max_length=160)
    artista: str | None = Field(default=None, max_length=160)
    composer: str | None = Field(default=None, max_length=300)
    bpm: int | None = Field(default=None, ge=30, le=240)
    bpmSource: BpmSource | None = None
    bpmResetVersion: Literal[1] | None = None
    tom: str | None = Field(default=None, max_length=20)
    capotraste: int | None = Field(default=None, ge=0, le=12)
    harmonicSummary: ResumoEstruturado
    observacoes: list[str] = Field(default_factory=list, max_length=20)
    confianca: Literal["alta", "media", "baixa"]
    fullChordSheet: CifraCompleta | None = None

    @model_serializer(mode="wrap")
    def optional_metadata(self, handler):
        data=handler(self)
        for field in ("bpm","bpmSource","bpmResetVersion","composer"):
            if data.get(field) is None:
                data.pop(field,None)
        return data

    @model_validator(mode="after")
    def extract_sheet_metadata(self):
        # Um número/proveniência sugerido pelo modelo não constitui evidência.
        # O BPM da resposta é reconstruído somente do texto explícito da fonte.
        previous_source=self.bpmSource
        self.bpm = None
        self.bpmSource = None
        if self.fullChordSheet:
            from ..services.song_metadata import repair_song
            repaired = repair_song({"artist": self.artista, "composer": self.composer,
                                    "fullChordSheet": self.fullChordSheet.model_dump(mode="json")})
            self.artista, self.composer, self.bpm = repaired.get("artist"), repaired.get("composer"), repaired.get("bpm")
            self.bpmSource = BpmSource.model_validate(repaired["bpmSource"]) if repaired.get("bpmSource") else None
            if self.bpmSource and previous_source and previous_source.value==self.bpm and previous_source.url and previous_source.url.startswith("https://"):
                self.bpmSource.url=previous_source.url
            if repaired["fullChordSheet"]["content"]:
                self.fullChordSheet = CifraCompleta.model_validate(repaired["fullChordSheet"])
        return self
