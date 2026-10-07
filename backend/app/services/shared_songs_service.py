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
    def _summary_from_song(song_data: dict) -> dict | None:
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
            accepted = CONTRIBUTABLE_FULL_SHEET_SOURCES
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
    def _existing(normalized_title: str, normalized_artist: str | None) -> SharedSong | None:
        """Mesma música no catálogo: título igual e artista igual ou parecido (evita duplicar ao completar)."""
        exact = SharedSong.query.filter_by(normalized_title=normalized_title, normalized_artist=normalized_artist).first()
        if exact is not None:
            return exact
        same_title = SharedSong.query.filter_by(normalized_title=normalized_title).all()
        similar = [song for song in same_title if same_artist(song.normalized_artist, normalized_artist)]
        # Prefere a versão que ainda não tem letra: é ela que precisa ser completada.
        similar.sort(key=lambda song: (song.song_data or {}).get("fullChordSheet") is not None)
        return similar[0] if similar else None

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
        existing = cls._existing(normalized_title, normalized_artist)
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


def _keeper_rank(song: SharedSong):
    """Qual entrada fica: a que tem Letra + Cifras, depois a mais buscada, depois a mais antiga."""
    created = song.created_at.timestamp() if song.created_at else 0
    return (not SharedSongService._has_full_sheet(song), -(song.times_searched or 0), created, song.id)


def duplicate_groups() -> list[list[SharedSong]]:
    """Entradas repetidas do catálogo: mesmo título e artista igual/parecido (ou sem artista).

    A primeira entrada de cada grupo é a que fica. Entrada sem artista só entra num grupo quando o
    título tem um único artista; com artistas diferentes ela é ambígua e fica de fora.
    """
    by_title: dict[str, list[SharedSong]] = {}
    for song in SharedSong.query.order_by(SharedSong.created_at, SharedSong.id).all():
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
        groups.extend(sorted(cluster, key=_keeper_rank) for cluster in clusters if len(cluster) > 1)
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
        db.session.delete(extra)
    db.session.flush()
    return keeper
