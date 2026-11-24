"""Extração conservadora: somente linhas explicitamente rotuladas; sem IA/rede."""
import copy
import re


def classify(line):
    text = str(line or "").strip()
    for field, pattern in (
        ("composer", r"^(?:composi[çc][ãa]o(?:\s+de)?|compositor(?:es)?)\s*:\s*(.{1,300})$"),
        ("artist", r"^(?:artista|cantor(?:a)?|int[ée]rprete)\s*:\s*(.{1,160})$"),
    ):
        match = re.fullmatch(pattern, text, re.I)
        if match:
            return field, match[1].strip()
    match = re.fullmatch(r"(?:(?:\[?ritmo padr[ãa]o\]?|bpm|andamento)\s*:?\s*)?(\d{2,3})\s*(?:bpm|batidas por minuto)", text, re.I) or re.fullmatch(r"(?:bpm|andamento)\s*:\s*(\d{2,3})", text, re.I)
    if match and 30 <= int(match[1]) <= 240:
        return "bpm", int(match[1])
    if re.fullmatch(r"\[?ritmo padr[ãa]o\]?", text, re.I):
        return "tempoLabel", None
    return None


def repair_song(song):
    if not isinstance(song, dict):
        return song
    sheet = song.get("fullChordSheet")
    if not isinstance(sheet, dict) or not isinstance(sheet.get("content"), str):
        return song
    candidates = {key: set() for key in ("artist", "composer", "bpm")}
    evidence = {}
    authoritative = sheet.get("bpmEvidenceText") if sheet.get("bpmEvidenceText") is not None else sheet.get("sourceContent") or sheet["content"]
    for line in authoritative.splitlines():
        found = classify(line)
        if found and found[0] == "bpm" and sheet.get("source") != "model_knowledge":
            candidates["bpm"].add(found[1])
            evidence[found[1]] = str(line).strip()[:200]
    def record(line):
        found = classify(line)
        if found and found[0] in candidates and found[0] != "bpm":
            candidates[found[0]].add(found[1])
    for line in sheet["content"].splitlines():
        record(line)
    sections = sheet.get("sections") or []
    if not isinstance(sections,list) or any(not isinstance(s,dict) or not isinstance(s.get("linhas",[]),list) or any(not isinstance(line,dict) for line in s.get("linhas",[])) for s in sections):
        return song  # Registro fora do contrato: não bloquear a abertura nem tentar adivinhar.
    for section in sections:
        for line in section.get("linhas") or []:
            if not line.get("acordes"):
                record(line.get("letra"))
    if not any(candidates.values()):
        return song
    result = copy.deepcopy(song)
    for field, values in candidates.items():
        target = "artista" if field == "artist" and "titulo" in result else field
        if len(values) == 1 and not result.get(target):
            result[target] = next(iter(values))
    if len(candidates["bpm"]) == 1 and result.get("bpm") in candidates["bpm"]:
        value = next(iter(candidates["bpm"]))
        result["bpmSource"] = {"kind":"explicit_sheet", "value":value,
                               "evidence":evidence[value], "sourceType":sheet.get("source") or "saved_sheet"}
        previous=song.get("bpmSource") if isinstance(song.get("bpmSource"),dict) else {}
        source_info=song.get("sourceInfo") if isinstance(song.get("sourceInfo"),dict) else {}
        url=previous.get("url") if previous.get("value")==value else source_info.get("url")
        if isinstance(url,str) and url.startswith("https://"):
            result["bpmSource"]["url"]=url[:2000]
    def remove(line):
        found = classify(line)
        return bool(found and (len(candidates["bpm"]) == 1 if found[0] == "tempoLabel" else len(candidates[found[0]]) == 1))
    fixed = result["fullChordSheet"]
    fixed["sourceContent"] = sheet.get("sourceContent") or sheet["content"]
    fixed["content"] = "\n".join(line for line in sheet["content"].splitlines() if not remove(line)).strip()
    for section in fixed.get("sections") or []:
        section["linhas"] = [line for line in section.get("linhas") or [] if line.get("acordes") or not remove(line.get("letra"))]
    if "sections" in fixed:
        fixed["sections"] = [section for section in fixed["sections"] if section.get("linhas") or not remove(section.get("nome"))]
    return result


def repair_tree(value):
    """Cada cópia é reparada isoladamente, sem copiar preferências entre usuários."""
    if isinstance(value, list):
        return [repair_tree(item) for item in value]
    if not isinstance(value, dict):
        return value
    repaired = repair_song(value)
    return {key: repair_tree(item) if key not in {"fullChordSheet", "sourceContent"} else item for key, item in repaired.items()}


def reset_bpm_to_source(value):
    """Regra de atualização aprovada: substitui BPM antigo uma vez, só com evidência.

    Fora da migração, repair_song continua preservando escolhas posteriores.
    """
    if isinstance(value,list):
        return [reset_bpm_to_source(item) for item in value]
    if not isinstance(value,dict):
        return value
    result=repair_song(value)
    if result.get("bpmResetVersion")!=1 and isinstance(result.get("fullChordSheet"),dict):
        probe={**result,"bpm":None}
        source=repair_song(probe)
        proof=source.get("bpmSource")
        if proof and proof.get("kind")=="explicit_sheet":
            result={**result,"bpm":source["bpm"],"bpmSource":proof,"bpmResetVersion":1}
            if isinstance(result.get("playbackSettings"),dict):
                result["playbackSettings"]={**result["playbackSettings"],"bpm":source["bpm"]}
            if isinstance(result.get("editorData"),dict):
                result["editorData"]={**result["editorData"],"bpm":source["bpm"],"bpmSource":proof,"bpmResetVersion":1}
    result={key:reset_bpm_to_source(item) if key not in {"fullChordSheet","sourceContent"} else item for key,item in result.items()}
    # Nas playlists o controle fica no envelope do item, separado da música.
    embedded=result.get("song")
    if isinstance(embedded,dict) and embedded.get("bpmResetVersion")==1 and result.get("bpmResetVersion")!=1 and isinstance(result.get("playback"),dict):
        result={**result,"playback":{**result["playback"],"bpm":embedded["bpm"]},"bpmResetVersion":1}
    return result
