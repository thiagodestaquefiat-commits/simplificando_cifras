from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AnthropicSongAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    song: str = Field(min_length=1, max_length=160)
    artist: str = Field(min_length=1, max_length=160)

    @field_validator("song", "artist", mode="before")
    @classmethod
    def clean_text(cls, value):
        if not isinstance(value, str):
            return value
        return " ".join(value.replace("\x00", "").split()).strip()


class AnthropicSongSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["intro", "verse", "pre_chorus", "chorus", "bridge", "solo", "outro", "other"]
    name: str = Field(max_length=80)
    progression: list[str] = Field(max_length=32)
    order: int = Field(ge=1, le=99)
    note: str = Field(max_length=240)
    hook: str = Field(max_length=80)
    repetitions: int | None = Field(ge=1, le=99)


class AnthropicChordPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chord: str = Field(min_length=1, max_length=32)
    position: int = Field(ge=0, le=500)


class AnthropicChordSheetLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(max_length=2000)
    chords: list[AnthropicChordPlacement] = Field(max_length=24)
    repetitions: int | None = Field(ge=1, le=99)


class AnthropicChordSheetSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["intro", "verse", "pre_chorus", "chorus", "bridge", "solo", "outro", "other"]
    name: str = Field(max_length=80)
    order: int = Field(ge=1, le=99)
    lines: list[AnthropicChordSheetLine] = Field(max_length=80)


class AnthropicContentRights(BaseModel):
    model_config = ConfigDict(extra="forbid")

    can_locate: bool
    can_structure: bool
    integral_display_authorized: bool
    integral_persistence_authorized: bool
    basis: str = Field(max_length=300)


class AnthropicChordSheet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    available: bool
    completeness: Literal["none", "partial", "complete"]
    sections: list[AnthropicChordSheetSection] = Field(max_length=24)
    rights: AnthropicContentRights

    @model_validator(mode="after")
    def enforce_external_content_boundary(self):
        authorized = (
            self.rights.integral_display_authorized
            and self.rights.integral_persistence_authorized
        )
        if authorized:
            return self

        # A busca pode comprovar estrutura e posições sem devolver uma letra
        # integral de terceiro. Mantemos somente excertos curtos para revisão.
        self.completeness = "none" if not self.sections else "partial"
        remaining = 240
        for section in self.sections:
            for line in section.lines:
                excerpt = line.text.strip()
                if remaining <= 0:
                    line.text = ""
                    continue
                line.text = excerpt[: min(80, remaining)]
                remaining -= len(line.text)
        return self


class AnthropicAnalysisConfidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall: float = Field(ge=0, le=1)
    key: float = Field(ge=0, le=1)
    chords: float = Field(ge=0, le=1)
    structure: float = Field(ge=0, le=1)


class AnthropicAnalysisSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2000)
    title: str = Field(min_length=1, max_length=300)


class AnthropicNormalizedSongAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    song: str = Field(min_length=1, max_length=160)
    artist: str = Field(min_length=1, max_length=160)
    key: str | None
    capo: int | None = Field(ge=0, le=24)
    tuning: str | None = Field(max_length=80)
    chords: list[str] = Field(max_length=64)
    sections: list[AnthropicSongSection] = Field(max_length=40)
    chord_sheet: AnthropicChordSheet
    harmonic_summary: list[str] = Field(max_length=24)
    confidence: AnthropicAnalysisConfidence
    sources: list[AnthropicAnalysisSource] = Field(max_length=20)
    warnings: list[str] = Field(max_length=20)
