from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher

from pydantic import ValidationError
from sqlalchemy import text

from ..database import db
from ..models import PersonalSong, SharedSong, SharedSongReport
from ..schemas.resumo_harmonico import ResumoHarmonicoResponse, SecaoCifraCompleta

MAX_CANDIDATES = 10
# Só vai para o catálogo compartilhado o que veio de fonte real: Busca por IA (Cifra Club/catálogo) ou arquivo/foto.
# Músicas digitadas (aba Texto) ou criadas à mão são versões pessoais: ficam só na biblioteca do usuário.
SHAREABLE_SOURCE_TYPES = {"online", "upload"}
# Letra + Cifras que o catálogo aceita receber (digitada pelo usuário = versão pessoal, não entra).
CONTRIBUTABLE_FULL_SHEET_SOURCES = {"user_upload", "web_source"}
# Fontes que podem ser LIDAS na busca (inclusive da biblioteca pessoal).
# Isso não autoriza publicar conteúdo de Texto no catálogo.
CATALOG_FULL_SHEET_SOURCES = {"user_upload", "user_text", "web_source"}
# Música COMPLETADA (ganhou Letra + Cifras sem mudar título, artista e tom) vai ao catálogo com qualquer
# letra, inclusive colada (decisão do Thiago, 30/10/2026). Edições continuam pessoais.
COMPLETION_FULL_SHEET_SOURCES = {"user_upload", "user_text", "web_source"}
# Origens que podem ser completadas. "manual" (biblioteca base/antiga) só completa uma entrada que já
# está no catálogo; nunca cria entrada nova, porque música feita do zero pelo usuário é pessoal.
COMPLETION_SOURCE_TYPES = {"online", "upload", "manual"}
# Observação gravada nos rascunhos gerados só pela IA (fluxo antigo, antes de exigir fonte real).
AI_ONLY_MARKER = "Gerado somente por IA"
# Cifra completa que entra no catálogo público: enviada pelo usuário (upload/texto) ou obtida da web
# (web_source, ex.: Cifra Club). Decisão de produto do MVP (29/09/2026), ciente do risco de direitos
# autorais; SCRAPER_ENABLED=false desliga a busca na web se houver reclamação. Conteúdo gerado pela IA
# (model_knowledge) continua fora.


# Artistas com nome parecido ("Luiz Gonzaga" x "Luiz Gonzaga e Banda") são a mesma música no catálogo.
SAME_ARTIST_MIN_RATIO = 0.8
# Diferença de pontuação em que duas entradas do catálogo contam como a mesma música na busca.
SAME_SONG_SCORE_MARGIN = 0.1


def open_contribution() -> bool:
    """Compatibilidade legada: contribuição aberta foi encerrada por privacidade."""
    return False


def same_artist(first: str | None, second: str | None) -> bool:
    if not first or not second:
        return True
    if first == second or first in second or second in first:
        return True
    return SequenceMatcher(None, first, second).ratio() >= SAME_ARTIST_MIN_RATIO


_NOTE_NUMBERS = {"C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "F": 5, "F#": 6, "GB": 6,
                 "G": 7, "G#": 8, "AB": 8, "A": 9, "A#": 10, "BB": 10, "B": 11}


def key_identity(value) -> str | None:
    """Tom comparável: nota (com enarmonia) + menor. "Db" == "C#", "Am" != "A". Vazio = desconhecido."""
    raw = str(value or "").strip().replace("♯", "#").replace("♭", "b")
    match = re.match(r"^([A-Ga-g])([#b]?)(m(?!aj))?", raw)
    if not match:
        return None
    number = _NOTE_NUMBERS.get((match.group(1) + match.group(2)).upper())
    return None if number is None else f"{number}{'m' if match.group(3) else ''}"


def same_key(first, second) -> bool:
    """Versões do catálogo (decisão 24/10): mesmo título + artista + TOM é a mesma música.
    Tom desconhecido em um dos lados não separa versões (é a entrada que pode ser completada)."""
    a, b = key_identity(first), key_identity(second)
    return a is None or b is None or a == b


def parse_capo(value) -> int | None:
    """Casa do capotraste a partir de 2, "2", "Capotraste casa 2" ou "2ª casa"."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        number = value
    else:
        match = re.search(r"\d{1,2}", str(value or ""))
        if not match:
            return None
        number = int(match.group(0))
    return number if 1 <= number <= 12 else None


def canonical_section(value) -> str | None:
    """Mapeia rótulos livres (\"refrao 2\", \"Introdução\") para os nomes de seção aceitos pela IA."""
    key = normalize_text(value)
    aliases = (("pre refrao", "Pré-Refrão"), ("intro", "Intro"), ("verso", "Verso"), ("estrofe", "Verso"), ("refrao", "Refrão"),
               ("ponte", "Ponte"), ("interludio", "Interlúdio"), ("solo", "Solo"), ("final", "Final"), ("outro", "Final"))
    return next((name for prefix, name in aliases if key.startswith(prefix)), None)


def normalize_text(value) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char)).lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_text).split())[:255]


@dataclass(frozen=True)
class SharedSongMatch:
    song: SharedSong
    score: float


@dataclass(frozen=True)
class PersonalSongMatch:
    song: PersonalSong
    summary: dict


class SharedSongService:
    @classmethod
    def search_personal(cls, user_id, title, artist=None) -> PersonalSongMatch | None:
        """Procura na biblioteca do próprio usuário: título igual (normalizado) e, se informado, artista igual."""
        normalized_title, normalized_artist = normalize_text(title), normalize_text(artist)
        if not user_id or not normalized_title:
            return None
        songs = (PersonalSong.query.filter_by(owner_user_id=user_id, deleted_at=None)
                 .order_by(PersonalSong.updated_at.desc()).all())
        for song in songs:
            data = song.song_data if isinstance(song.song_data, dict) else {}
            if normalize_text(data.get("title")) != normalized_title:
                continue
            if normalized_artist and normalize_text(data.get("artist")) != normalized_artist:
                continue
            summary = cls._personal_response(data)
            if summary is not None:
                return PersonalSongMatch(song, summary)
        return None

    @staticmethod
    def _score(song: SharedSong, title: str, artist: str) -> float:
        title_score = SequenceMatcher(None, title, song.normalized_title).ratio()
        if not artist or not song.normalized_artist:
            return title_score
        artist_score = SequenceMatcher(None, artist, song.normalized_artist).ratio()
        return 0.75 * title_score + 0.25 * artist_score

    @staticmethod
    def _candidates(title: str, artist: str) -> list[SharedSong]:
        # Título exatamente igual entra sempre: o FULLTEXT do MySQL ignora palavras curtas e às vezes
        # não traz a versão com letra entre os primeiros resultados.
        found = {song.id: song for song in SharedSong.query.filter_by(normalized_title=title).limit(50).all()}
        if db.engine.dialect.name == "mysql":
            try:
                ids = db.session.execute(
                    text(
                        "SELECT id FROM shared_songs "
                        "WHERE MATCH(normalized_title, normalized_artist) AGAINST (:query IN NATURAL LANGUAGE MODE) "
                        "ORDER BY MATCH(normalized_title, normalized_artist) AGAINST (:query IN NATURAL LANGUAGE MODE) DESC "
                        "LIMIT :limit"
                    ),
                    {"query": f"{title} {artist}".strip(), "limit": MAX_CANDIDATES},
                ).scalars().all()
            except Exception:  # noqa: BLE001 - sem índice FULLTEXT, fica a busca por título igual
                db.session.rollback()
                ids = []
            missing = [song_id for song_id in ids if song_id not in found]
            if missing:
                found.update({song.id: song for song in SharedSong.query.filter(SharedSong.id.in_(missing)).all()})
        else:
            # Fallback LIKE para PostgreSQL e SQLite (sem índice FULLTEXT).
            found.update({song.id: song for song in SharedSong.query.filter(SharedSong.normalized_title.contains(title)).limit(MAX_CANDIDATES).all()})
        return list(found.values())

    @staticmethod
    def _has_full_sheet(song: SharedSong) -> bool:
        sheet = (song.song_data or {}).get("fullChordSheet")
        return isinstance(sheet, dict) and bool(str(sheet.get("content") or "").strip())

    @classmethod
    def search(cls, title, artist=None) -> SharedSongMatch | None:
        normalized_title, normalized_artist = normalize_text(title), normalize_text(artist)
        if not normalized_title:
            return None
        scored = [SharedSongMatch(song, cls._score(song, normalized_title, normalized_artist))
                  for song in cls._candidates(normalized_title, normalized_artist)]
        if not scored:
            return None
        # Entre versões praticamente iguais da mesma música (ex.: uma só com resumo e outra completada),
        # entrega a que tem Letra + Cifras.
        top = max(match.score for match in scored)
        best = max(scored, key=lambda match: (match.score >= top - SAME_SONG_SCORE_MARGIN and cls._has_full_sheet(match.song), match.score))
        best.song.times_searched = (best.song.times_searched or 0) + 1
        db.session.commit()
        return best

    VERSION_MIN_TITLE_RATIO = 0.85
    MAX_VERSIONS = 12

    @classmethod
    def versions(cls, title, artist=None) -> list[SharedSong]:
        """Todas as versões do catálogo para um nome (artistas e tons diferentes), para a pessoa escolher.
        Ordem: artista buscado primeiro, depois as com Letra + Cifras, depois as mais buscadas."""
        normalized_title, normalized_artist = normalize_text(title), normalize_text(artist)
        if not normalized_title:
            return []
        found = []
        for song in cls._candidates(normalized_title, normalized_artist):
            ratio = SequenceMatcher(None, normalized_title, song.normalized_title).ratio()
            if ratio >= cls.VERSION_MIN_TITLE_RATIO or song.normalized_title.startswith(normalized_title):
                found.append((song, ratio))
        artist_first = (lambda song: 0 if normalized_artist and same_artist(song.normalized_artist, normalized_artist) else 1)
        found.sort(key=lambda item: (artist_first(item[0]), -round(item[1], 2), not cls._has_full_sheet(item[0]), -(item[0].times_searched or 0), item[0].created_at.timestamp() if item[0].created_at else 0))
        return [song for song, _ratio in found[: cls.MAX_VERSIONS]]

    @staticmethod
    def _full_sheet_sections(song_data: dict) -> list[dict]:
        """Seções no formato fullChordSheet; cai para as seções do editor quando a música não tem cifra completa."""
        sheet = song_data.get("fullChordSheet")
        if isinstance(sheet, dict) and isinstance(sheet.get("sections"), list) and sheet["sections"]:
            return sheet["sections"]
        sections = song_data.get("sections")
        if not isinstance(sections, list):
            sections = (song_data.get("editorData") or {}).get("sections")
        result = []
        for section in sections if isinstance(sections, list) else []:
            if not isinstance(section, dict):
                continue
            result.append({
                "nome": None if section.get("hideLabel") else section.get("label"),
                "linhas": [{
                    "letra": str((line or {}).get("lyrics") or ""),
                    "acordes": [{"acorde": item.get("chord"), "posicao": item.get("position") or 0}
                                for item in (line or {}).get("chords") or [] if isinstance(item, dict) and item.get("chord")],
                } for line in section.get("lines") or []],
            })
        return result

    @classmethod
    def _personal_response(cls, song_data: dict) -> dict | None:
        """Música da biblioteca do próprio usuário no mesmo formato da resposta da IA, com cifra completa."""
        try:
            sections = [SecaoCifraCompleta.model_validate(section) for section in cls._full_sheet_sections(song_data)[:80]]
        except ValidationError:
            return None
        blocos = []
        for section in sections:
            chords = [item.acorde for line in section.linhas for item in sorted(line.acordes, key=lambda chord: chord.posicao)][:64]
            if not chords:
                continue
            first_lyric = next((line.letra for line in section.linhas if line.letra.strip()), None)
            blocos.append({"acordes": chords, "repeticoes": None, "fraseGuia": first_lyric,
                           "secao": canonical_section(section.nome)})
        if not blocos:
            return None
        sheet = song_data.get("fullChordSheet") if isinstance(song_data.get("fullChordSheet"), dict) else {}
        source = sheet.get("source") if sheet.get("source") in {"user_upload", "user_text", "model_knowledge", "web_source"} else "user_text"
        # Só há Letra + Cifras quando a música salva tem a cifra completa de verdade (mesma regra do app).
        # Sem ela, as seções do editor são só o resumo harmônico: devolver isso como "letra" impedia o
        # botão "Completar cifra" de buscar no catálogo/Cifra Club.
        content = str(sheet.get("content") or "").strip()
        capo = parse_capo(song_data.get("capo"))
        try:
            response = ResumoHarmonicoResponse.model_validate({
                "titulo": str(song_data.get("title") or "").strip()[:160],
                "artista": str(song_data.get("artist") or "").strip()[:160] or None,
                "tom": str(song_data.get("key") or song_data.get("currentKey") or song_data.get("originalKey") or "").strip()[:20] or None,
                "capotraste": capo,
                "harmonicSummary": {"blocos": blocos[:40]},
                "observacoes": ["Encontrada na sua biblioteca pessoal."],
                "confianca": "alta",
                "fullChordSheet": {"source": source, "content": content[:50000],
                                   "sections": [section.model_dump(mode="json") for section in sections]} if content else None,
            })
        except ValidationError:
            return None
        return response.model_dump(mode="json")

    @staticmethod
    def _summary_from_song(song_data: dict, accepted_sources=CONTRIBUTABLE_FULL_SHEET_SOURCES) -> dict | None:
        """Converte a música salva no editor em resumo harmônico com cifra completa para o catálogo compartilhado."""
        sections = song_data.get("sections")
        if not isinstance(sections, list):
            sections = (song_data.get("editorData") or {}).get("sections")
        blocos = []
        for section in sections if isinstance(sections, list) else []:
            if not isinstance(section, dict):
                continue
            label = None if section.get("hideLabel") else (str(section.get("label") or "").strip()[:80] or None)
            for line in section.get("lines") or []:
                chords = [str(item.get("chord") or "").strip() for item in (line or {}).get("chords") or [] if isinstance(item, dict)]
                chords = [chord for chord in chords if chord][:64]
                if chords:
                    blocos.append({"acordes": chords, "repeticoes": line.get("repeticoes"), "fraseGuia": None, "secao": label})
        # Fallback: formato legado com campo "blocos" direto na raiz (músicas antigas).
        # Cada bloco tem "c" (string de acordes separados por espaço) e "l" (letra/frase).
        if not blocos:
            for bloco in song_data.get("blocos") or []:
                if not isinstance(bloco, dict):
                    continue
                # Formato legado: "c" é string com acordes separados por espaço
                c = bloco.get("c") or bloco.get("acordes") or ""
                if isinstance(c, str):
                    acordes = [a.strip() for a in c.split() if a.strip()]
                elif isinstance(c, list):
                    acordes = [str(a).strip() for a in c if str(a).strip()]
                else:
                    acordes = []
                if acordes:
                    frase = bloco.get("l") or bloco.get("fraseGuia") or None
                    blocos.append({
                        "acordes": acordes[:64],
                        "repeticoes": bloco.get("r") or bloco.get("repeticoes"),
                        "fraseGuia": str(frase).strip()[:100] if frase else None,
                        "secao": bloco.get("s") or bloco.get("secao"),
                    })
        if not blocos:
            return None
        capo = song_data.get("capo")
        # Cifra completa (letra) só vai ao catálogo quando foi enviada pelo usuário.
        # Web e IA: somente resumo harmônico, com o link da fonte nas observações.
        full_sheet = song_data.get("fullChordSheet")
        full_sheet_payload = None
        observacoes = ["Cifra do catálogo compartilhado; revise antes de usar."]
        source_info = song_data.get("sourceInfo") if isinstance(song_data.get("sourceInfo"), dict) else {}
        source_url = str(source_info.get("url") or "").strip()
        if not source_url:
            # Busca por IA com cifra da web: o link só vem nas observações ("Cifra obtida de <url>;").
            found = re.search(r"Cifra obtida de (https://\S+?);", str(song_data.get("notes") or ""))
            source_url = found.group(1) if found else ""
        if isinstance(full_sheet, dict):
            content = str(full_sheet.get("content") or "").strip()
            source = full_sheet.get("source")
            accepted = accepted_sources
            if content and source in accepted:
                full_sheet_payload = {
                    "source": source,
                    "content": content[:50000],
                    "sections": full_sheet.get("sections") or [],
                }
        if source_url.startswith("https://") and (not full_sheet_payload or full_sheet_payload["source"] == "web_source"):
            observacoes.append(f"Fonte: {source_url[:300]}")
        try:
            response = ResumoHarmonicoResponse.model_validate({
                "titulo": str(song_data.get("title") or "").strip()[:160],
                "artista": str(song_data.get("artist") or "").strip()[:160] or None,
                "tom": str(song_data.get("originalKey") or song_data.get("key") or "").strip()[:20] or None,
                "capotraste": parse_capo(capo),
                "harmonicSummary": {"blocos": blocos[:40]},
                "observacoes": observacoes,
                "confianca": "media",
                "fullChordSheet": full_sheet_payload,
            })
        except ValidationError:
            return None
        return response.model_dump(mode="json")

    @staticmethod
    def _existing(normalized_title: str, normalized_artist: str | None, key=None) -> SharedSong | None:
        """Mesma VERSÃO no catálogo: título igual, artista igual/parecido e mesmo tom.
        Mesmo nome com outro artista ou outro tom é outra versão e entra no catálogo (decisão 24/10)."""
        same_title = SharedSong.query.filter_by(normalized_title=normalized_title).all()
        exact = [song for song in same_title if song.normalized_artist == normalized_artist and same_key(song.song_key, key)]
        if exact:
            exact.sort(key=lambda song: (song.song_data or {}).get("fullChordSheet") is not None)
            return exact[0]
        similar = [song for song in same_title if same_artist(song.normalized_artist, normalized_artist) and same_key(song.song_key, key)]
        # Prefere a versão que ainda não tem letra: é ela que precisa ser completada.
        similar.sort(key=lambda song: (song.song_data or {}).get("fullChordSheet") is not None)
        return similar[0] if similar else None

    @staticmethod
    def has_full_sheet_data(song_data) -> bool:
        sheet = song_data.get("fullChordSheet") if isinstance(song_data, dict) else None
        return isinstance(sheet, dict) and bool(str(sheet.get("content") or "").strip())

    @classmethod
    def is_completion(cls, previous, current) -> bool:
        """A música ganhou Letra + Cifras e continua sendo a mesma (título, artista e tom iguais)."""
        if not isinstance(previous, dict) or not isinstance(current, dict):
            return False
        if cls.has_full_sheet_data(previous) or not cls.has_full_sheet_data(current):
            return False
        if normalize_text(previous.get("title")) != normalize_text(current.get("title")):
            return False
        if normalize_text(previous.get("artist")) != normalize_text(current.get("artist")):
            return False
        key = lambda data: data.get("originalKey") or data.get("key")
        return key_identity(key(previous)) == key_identity(key(current))

    @classmethod
    def contribute_completion(cls, song_data, user_id) -> SharedSong | None:
        """Envia ao catálogo a música que acabou de ser completada (força-tarefa e uso normal)."""
        source_type = (song_data.get("sourceInfo") or {}).get("type") or "manual"
        if source_type not in COMPLETION_SOURCE_TYPES:
            return None  # aba Texto: versão pessoal
        normalized_title = normalize_text(song_data.get("title"))
        normalized_artist = normalize_text(song_data.get("artist")) or None
        if not normalized_title:
            return None
        summary = cls._summary_from_song(song_data, COMPLETION_FULL_SHEET_SOURCES)
        if summary is None or summary.get("fullChordSheet") is None:
            return None
        existing = cls._existing(normalized_title, normalized_artist, summary.get("tom"))
        if existing is not None:
            if cls._has_full_sheet(existing):
                return None  # outra pessoa já completou esta versão
            existing.song_data = summary
            existing.song_key = summary.get("tom")
            existing.capo = str(summary["capotraste"]) if summary.get("capotraste") is not None else None
            return existing
        if source_type == "manual":
            return None
        return cls._new_entry(summary, normalized_title, normalized_artist, user_id)

    @staticmethod
    def _new_entry(summary, normalized_title, normalized_artist, user_id) -> SharedSong:
        song = SharedSong(
            id=str(uuid.uuid4()),
            title=summary["titulo"][:255],
            artist=summary["artista"],
            normalized_title=normalized_title,
            normalized_artist=normalized_artist,
            song_key=summary["tom"],
            capo=str(summary["capotraste"]) if summary["capotraste"] is not None else None,
            song_data=summary,
            contributed_by=user_id,
            times_searched=0,
        )
        db.session.add(song)
        return song

    @classmethod
    def contribute(cls, song_data, user_id) -> SharedSong | None:
        if not isinstance(song_data, dict):
            return None
        source_type = (song_data.get("sourceInfo") or {}).get("type") or "manual"
        full_sheet = song_data.get("fullChordSheet") if isinstance(song_data.get("fullChordSheet"), dict) else {}
        has_real_lyrics = bool(str(full_sheet.get("content") or "").strip()) and full_sheet.get("source") in CONTRIBUTABLE_FULL_SHEET_SOURCES
        # Música da biblioteca base/antiga (origem "manual") completada com letra do Cifra Club ou de arquivo
        # também vai ao catálogo: a letra veio de fonte real. Só letra digitada continua pessoal.
        if source_type not in SHAREABLE_SOURCE_TYPES:
            return None
        if AI_ONLY_MARKER in str(song_data.get("notes") or "") and not has_real_lyrics:
            # Rascunho do fluxo antigo "somente IA": acordes inventados não vão para o catálogo público.
            # Com letra de fonte real (PDF/arquivo ou Cifra Club) a música já foi corrigida e entra.
            return None
        normalized_title = normalize_text(song_data.get("title"))
        normalized_artist = normalize_text(song_data.get("artist")) or None
        if not normalized_title:
            return None
        summary = cls._summary_from_song(song_data)
        if summary is None:
            return None
        new_has_full = summary.get("fullChordSheet") is not None
        existing = cls._existing(normalized_title, normalized_artist, summary.get("tom"))
        if existing is not None:
            # Atualiza o catálogo apenas se a nova versão é mais completa:
            # tem cifra completa e a versão existente não tem.
            existing_has_full = (existing.song_data or {}).get("fullChordSheet") is not None
            if not existing_has_full and new_has_full:
                existing.song_data = summary
                existing.song_key = summary.get("tom")
                existing.capo = str(summary["capotraste"]) if summary.get("capotraste") is not None else None
                return existing
            return None
        return cls._new_entry(summary, normalized_title, normalized_artist, user_id)


def _keeper_rank(song: SharedSong):
    """Qual entrada fica: a que tem Letra + Cifras, depois a mais buscada, depois a mais antiga."""
    created = song.created_at.timestamp() if song.created_at else 0
    return (not SharedSongService._has_full_sheet(song), -(song.times_searched or 0), created, song.id)


def duplicate_groups(normalized_title: str | None = None) -> list[list[SharedSong]]:
    """Entradas repetidas do catálogo: mesmo título, artista igual/parecido (ou sem artista) e mesmo tom.

    A primeira entrada de cada grupo é a que fica. Entrada sem artista só entra num grupo quando o
    título tem um único artista; com artistas diferentes ela é ambígua e fica de fora.
    """
    by_title: dict[str, list[SharedSong]] = {}
    query = SharedSong.query
    if normalized_title is not None:
        query = query.filter_by(normalized_title=normalized_title)
    for song in query.order_by(SharedSong.created_at, SharedSong.id).all():
        by_title.setdefault(song.normalized_title, []).append(song)
    groups = []
    for songs in by_title.values():
        if len(songs) < 2:
            continue
        clusters: list[list[SharedSong]] = []
        for song in (item for item in songs if item.normalized_artist):
            target = next((cluster for cluster in clusters
                           if any(same_artist(song.normalized_artist, other.normalized_artist) for other in cluster)), None)
            if target is None:
                clusters.append([song])
            else:
                target.append(song)
        no_artist = [song for song in songs if not song.normalized_artist]
        if len(clusters) == 1:
            clusters[0].extend(no_artist)
        elif not clusters:
            clusters.append(no_artist)
        # Versões com tons diferentes não são duplicatas (decisão 24/10): separa por tom.
        for cluster in clusters:
            by_key: list[list[SharedSong]] = []
            for song in cluster:
                target = next((group for group in by_key if all(same_key(song.song_key, other.song_key) for other in group)), None)
                if target is None:
                    by_key.append([song])
                else:
                    target.append(song)
            groups.extend(sorted(group, key=_keeper_rank) for group in by_key if len(group) > 1)
    return groups


def merge_duplicates(group: list[SharedSong]) -> SharedSong:
    """Junta o grupo na primeira entrada: soma as buscas, completa o artista e move os relatos.

    Apaga do catálogo as entradas repetidas. Não toca em nenhuma biblioteca pessoal.
    """
    keeper, extras = group[0], group[1:]
    for extra in extras:
        keeper.times_searched = (keeper.times_searched or 0) + (extra.times_searched or 0)
        if not keeper.normalized_artist and extra.normalized_artist:
            keeper.artist, keeper.normalized_artist = extra.artist, extra.normalized_artist
        for report in SharedSongReport.query.filter_by(song_id=extra.id).all():
            if SharedSongReport.query.filter_by(song_id=keeper.id, reporter_id=report.reporter_id).first():
                db.session.delete(report)  # a mesma pessoa já relatou a entrada que fica
            else:
                report.song_id = keeper.id
        db.session.flush()
        from .song_classifier import merge_profiles
        merge_profiles(keeper.id, extra.id)
        db.session.delete(extra)
    db.session.flush()
    return keeper


def dedupe_titles(normalized_titles) -> int:
    """Rede de segurança contra duas pessoas salvando a mesma música ao mesmo tempo.

    Roda depois do commit, só para os títulos que acabaram de entrar no catálogo: se a mesma versão
    (título + artista + tom) ficou duas vezes, junta numa só. Mesmo nome com outro tom continua separado.
    """
    merged = 0
    for title in sorted({value for value in normalized_titles if value}):
        try:
            groups = duplicate_groups(title)
            for group in groups:
                merge_duplicates(group)
                merged += len(group) - 1
            db.session.commit()
        except Exception:  # noqa: BLE001 - outra requisição pode ter juntado o mesmo grupo antes
            db.session.rollback()
    return merged


_COMPLETION_PREFERENCE = {"user_upload": 0, "web_source": 1, "user_text": 2}


def backfill_completions() -> list[dict]:
    """Recupera as músicas que a força-tarefa já completou antes da regra de 30/10/2026.

    Para cada entrada do catálogo que ainda só tem resumo, procura nas bibliotecas uma música igual
    (título + artista igual/parecido + mesmo tom) que já tenha Letra + Cifras de fonte aceita, e completa
    a entrada com ela. Preferência: PDF/arquivo > Cifra Club > letra colada; empate, a mais antiga.
    Não cria entradas novas (o título pode ter sido trocado numa edição pessoal) e não altera nenhuma
    biblioteca pessoal. Não faz commit: quem chama decide (simulação x gravar).
    """
    pending = [song for song in SharedSong.query.order_by(SharedSong.normalized_title).all()
               if not SharedSongService._has_full_sheet(song)]
    if not pending:
        return []
    titles = {song.normalized_title for song in pending}
    candidates: dict[str, list[tuple]] = {}
    for personal in PersonalSong.query.filter_by(deleted_at=None).all():
        data = personal.song_data if isinstance(personal.song_data, dict) else {}
        title = normalize_text(data.get("title"))
        if title not in titles:
            continue
        sheet = data.get("fullChordSheet") if isinstance(data.get("fullChordSheet"), dict) else {}
        source = sheet.get("source")
        if source not in COMPLETION_FULL_SHEET_SOURCES or not str(sheet.get("content") or "").strip():
            continue
        if ((data.get("sourceInfo") or {}).get("type") or "manual") not in COMPLETION_SOURCE_TYPES:
            continue
        candidates.setdefault(title, []).append((_COMPLETION_PREFERENCE[source], personal.updated_at, personal, data))
    report = []
    for song in pending:
        options = []
        for preference, updated, personal, data in candidates.get(song.normalized_title, []):
            if not same_artist(song.normalized_artist, normalize_text(data.get("artist")) or None):
                continue
            if not same_key(song.song_key, data.get("originalKey") or data.get("key")):
                continue
            options.append((preference, updated.timestamp() if updated else 0, personal.id, data))
        if not options:
            continue
        options.sort(key=lambda item: item[:3])
        summary = SharedSongService._summary_from_song(options[0][3], COMPLETION_FULL_SHEET_SOURCES)
        if summary is None or summary.get("fullChordSheet") is None:
            continue
        song.song_data = summary
        song.song_key = summary.get("tom") or song.song_key
        song.capo = str(summary["capotraste"]) if summary.get("capotraste") is not None else song.capo
        report.append({"id": song.id, "title": song.title, "artist": song.artist, "key": song.song_key,
                       "source": summary["fullChordSheet"]["source"], "versions": len(options)})
    return report
