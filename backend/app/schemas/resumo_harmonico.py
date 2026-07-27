from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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

    tipo: Literal["pesquisa", "texto"]
    titulo: str | None = Field(default=None, max_length=160)
    artista: str | None = Field(default=None, max_length=160)
    conteudo: str | None = None

    @field_validator("titulo", "artista", mode="before")
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
        if self.tipo == "texto" and not self.conteudo:
            raise ValueError("conteudo é obrigatório para texto")
        if self.conteudo and len(self.conteudo) > max_text_length:
            raise ValueError(f"conteudo deve ter no máximo {max_text_length} caracteres")
        return self


class TrechoHarmonico(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    acordes: list[str] = Field(default_factory=list, max_length=64)
    repeticoes: int | None = Field(default=None, ge=1, le=99)
    fraseGuia: str = Field(default="", max_length=80)
    secao: str | None = Field(default=None, max_length=80)

    @field_validator("fraseGuia")
    @classmethod
    def limit_guide_words(cls, value: str) -> str:
        words = value.split()
        return " ".join(words[:12])[:80].strip()


class ResumoHarmonicoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    schemaVersion: Literal[1] = 1
    titulo: str = Field(min_length=1, max_length=160)
    artista: str | None = Field(default=None, max_length=160)
    tom: str | None = Field(default=None, max_length=20)
    trechos: list[TrechoHarmonico] = Field(default_factory=list, max_length=40)
    observacoes: list[str] = Field(default_factory=list, max_length=20)
    confianca: Literal["alta", "media", "baixa"]
