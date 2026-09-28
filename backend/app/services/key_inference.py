"""Estimativa do tom pelos acordes, usada quando a página não informa o tom.

Pontua cada tom maior pelos acordes diatônicos (I ii iii IV V vi vii°), com peso extra para o
primeiro e o último acorde, e escolhe entre o maior e o relativo menor pelo acorde de abertura/fecho.
"""
from __future__ import annotations

import re

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
# (intervalo em semitons a partir da tônica maior, é menor?)
_DIATONIC = {(0, False), (2, True), (4, True), (5, False), (7, False), (9, True), (11, True)}


def _root_and_minor(chord: str) -> tuple[int, bool] | None:
    match = re.match(r"^([A-G][#b]?)(.*)$", chord or "")
    if not match:
        return None
    root = FLATS.get(match.group(1), match.group(1))
    if root not in NOTES:
        return None
    quality = match.group(2).split("/")[0]
    minor = quality.startswith("m") and not quality.startswith("maj")
    return NOTES.index(root), minor


def transpose_note(key: str, semitones: int) -> str:
    match = re.match(r"^([A-G][#b]?)(m?)$", key or "")
    if not match:
        return key
    root = FLATS.get(match.group(1), match.group(1))
    return NOTES[(NOTES.index(root) + semitones) % 12] + match.group(2)


def infer_key(chords: list[str]) -> str | None:
    parsed = [item for item in (_root_and_minor(chord) for chord in chords) if item]
    if not parsed:
        return None
    best, best_score = None, -1.0
    for tonic in range(12):
        score = sum(1 for root, minor in parsed if ((root - tonic) % 12, minor) in _DIATONIC)
        for edge in (parsed[0], parsed[-1]):
            if edge[0] == tonic and not edge[1]:
                score += 1.5
            if edge[0] == (tonic + 9) % 12 and edge[1]:
                score += 1.0
        if score > best_score:
            best, best_score = tonic, score
    # Relativo menor quando a música abre e fecha no vi.
    relative = (best + 9) % 12
    if parsed[0] == (relative, True) and parsed[-1] == (relative, True):
        return NOTES[relative] + "m"
    return NOTES[best]
