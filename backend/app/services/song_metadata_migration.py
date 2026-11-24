"""Recuperação privada em lotes, retomável, com backup transacional e sem avisos."""
import hashlib
import json
import os
from threading import Thread
import time
from datetime import datetime, timezone, timedelta

import click
from sqlalchemy import select, text, cast, String
from sqlalchemy.orm import Session
from ..database import db
from .song_metadata import classify, reset_bpm_to_source

JOB = "explicit-sheet-metadata-v3-source-bpm-reset"


class SongMetadataMigration(db.Model):
    # Marcador legado: preservar o esquema anterior.
    __tablename__ = "song_metadata_migrations"
    name = db.Column(db.String(80), primary_key=True)


class MetadataRepairJob(db.Model):
    __tablename__ = "song_metadata_repair_jobs"
    name = db.Column(db.String(80), primary_key=True)
    status = db.Column(db.String(24), nullable=False)
    progress = db.Column(db.JSON, nullable=False)
    error_type = db.Column(db.String(80))


class MetadataRepairBackup(db.Model):
    __tablename__ = "song_metadata_repair_backups"
    __table_args__ = (db.UniqueConstraint("job_name", "table_name", "record_id", name="uq_metadata_repair_backup"),)
    id = db.Column(db.Integer, primary_key=True)
    job_name = db.Column(db.String(80), nullable=False, index=True)
    table_name = db.Column(db.String(80), nullable=False)
    record_id = db.Column(db.String(160), nullable=False)
    before = db.Column(db.JSON, nullable=False)
    after_hash = db.Column(db.String(64), nullable=False)
    restored_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def tables():
    from ..models import PersonalSong, SharedSong, PersonalPlaylist, SharedPlaylist, EventRepertoireItem, PersonalRepertoireOverride
    from ..models.playlist_collaboration import CollaborativePlaylist
    return [(PersonalSong,"song_data"),(SharedSong,"song_data"),(PersonalPlaylist,"playlist_data"),
            (SharedPlaylist,"playlist_data"),(CollaborativePlaylist,"data"),
            (EventRepertoireItem,"shared_song_data"),(PersonalRepertoireOverride,"personal_song_data")]


def fresh_progress():
    return {"table_index":0,"last_id":None,"scanned":0,"changed":0,"unchanged":0,"skipped":0,"ambiguous":0,"invalid":0,"batches":0}


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(",", ":")).encode()).hexdigest()


def record_fingerprint(row):
    # Guarda também os campos não alterados pela migração: se depois alguém muda
    # tom/notas em um item sem versionamento próprio, a restauração deve parar.
    return fingerprint({column.name:getattr(row,column.name) for column in row.__table__.columns
                        if column.name not in {"created_at","updated_at","times_searched"}})


def ambiguous(value):
    if isinstance(value,list):
        return any(ambiguous(item) for item in value)
    if not isinstance(value,dict):
        return False
    sheet=value.get("fullChordSheet")
    if isinstance(sheet,dict):
        groups={key:set() for key in ("artist","composer","bpm")}
        source=sheet.get("bpmEvidenceText") if sheet.get("bpmEvidenceText") is not None else sheet.get("sourceContent") or sheet.get("content") or ""
        for line in str(source).splitlines():
            item=classify(line)
            if item and item[0] in groups:
                groups[item[0]].add(item[1])
        if any(len(values)>1 for values in groups.values()):
            return True
    return any(ambiguous(item) for key,item in value.items() if key not in {"fullChordSheet","sourceContent"})


def proposal(row, field, session=None):
    from ..models import SharedSong, PersonalSong, PersonalPlaylist, PersonalRepertoireOverride, EventRepertoireItem
    from .shared_songs_service import normalize_text
    value=getattr(row,field)
    if isinstance(row,SharedSong) and isinstance(value,dict) and row.artist and not value.get("artista"):
        value={**value,"artista":row.artist}
    changes={field:reset_bpm_to_source(value)}
    # Playlists pessoais guardam referências, não cópias da música. Resolver
    # exclusivamente na biblioteca do dono, nunca pelo nome ou por outra conta.
    if session is not None and isinstance(row,PersonalPlaylist) and isinstance(changes[field],dict):
        from copy import deepcopy
        data=deepcopy(changes[field])
        for item in data.get("items",[]):
            if item.get("bpmResetVersion")==1:
                continue
            query=select(PersonalSong).where(PersonalSong.owner_user_id==row.owner_user_id,PersonalSong.deleted_at.is_(None))
            if item.get("songClientId"):
                query=query.where(PersonalSong.client_id==item["songClientId"])
            else:
                query=query.where(cast(PersonalSong.song_data["id"].as_string(),String)==str(item.get("songId","")))
            source=session.scalar(query)
            if source:
                from .song_metadata import repair_song
                proof=repair_song({**source.song_data,"bpm":None}).get("bpmSource")
                if proof:
                    item["playback"]={**item.get("playback",{}),"bpm":proof["value"]}
                    item["bpmResetVersion"]=1
        changes[field]=data
    if session is not None and isinstance(row,PersonalRepertoireOverride) and isinstance(changes[field],dict) and changes[field].get("bpmResetVersion")!=1:
        item=session.get(EventRepertoireItem,row.repertoire_item_id)
        if item and item.event_id==row.event_id and isinstance(item.shared_song_data,dict):
            from .song_metadata import repair_song
            proof=repair_song({**item.shared_song_data,"bpm":None}).get("bpmSource")
            if proof:
                data={**changes[field],"bpm":proof["value"],"bpmSource":proof,"bpmResetVersion":1}
                if isinstance(data.get("playbackSettings"),dict):
                    data["playbackSettings"]={**data["playbackSettings"],"bpm":proof["value"]}
                changes[field]=data
    if isinstance(row,SharedSong) and isinstance(changes[field],dict) and not row.artist and changes[field].get("artista"):
        changes.update(artist=changes[field]["artista"],normalized_artist=normalize_text(changes[field]["artista"]))
    return {key:value for key,value in changes.items() if getattr(row,key)!=value}


def begin_write(session):
    if session.bind.dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))  # SQLite não implementa FOR UPDATE.
    elif session.bind.dialect.name == "postgresql":
        session.execute(text("SET LOCAL lock_timeout = '1500ms'"))
        session.execute(text("SET LOCAL statement_timeout = '15000ms'"))


def bump_events(session, ids):
    from ..models import Event
    for event_id in sorted(ids):
        event=session.get(Event,event_id,with_for_update=True)
        if event:
            event.version += 1


def process_batch(batch_size=5, before_commit=None):
    """Backup + alteração + checkpoint: commit único, limitado a até 25 registros."""
    size=max(1,min(int(batch_size),25))
    with Session(db.engine) as session:
        begin_write(session)
        job=session.scalar(select(MetadataRepairJob).where(MetadataRepairJob.name==JOB).with_for_update())
        if job is None:
            job=MetadataRepairJob(name=JOB,status="running",progress=fresh_progress())
            session.add(job);session.flush()
        if job.status in {"completed","rolled_back"}:
            return {"done":True,"changed":0,"progress":dict(job.progress)}
        progress={**fresh_progress(),**job.progress}
        model,field=tables()[progress["table_index"]]
        query=select(model).order_by(model.id).limit(size).with_for_update()
        if progress["last_id"] is not None:
            query=query.where(model.id>progress["last_id"])
        rows=list(session.scalars(query))
        changed,events=0,set()
        for row in rows:
            progress["scanned"]+=1
            if getattr(row,"deleted_at",None) or getattr(row,"deleted",False):
                progress["skipped"]+=1;continue
            try:
                progress["ambiguous"]+=int(ambiguous(getattr(row,field)))
                changes=proposal(row,field,session)
            except (TypeError,ValueError,AttributeError,RecursionError):
                # Um registro legado inválido não pode bloquear todos os demais.
                progress["invalid"]+=1;progress["skipped"]+=1;continue
            if not changes:
                progress["unchanged"]+=1;continue
            if hasattr(row,"version"):
                changes["version"]=row.version+1
            before={key:getattr(row,key) for key in changes}
            for key,value in changes.items():
                setattr(row,key,value)
            session.add(MetadataRepairBackup(job_name=JOB,table_name=model.__tablename__,record_id=str(row.id),before=before,after_hash=record_fingerprint(row)))
            if hasattr(row,"event_id"):
                events.add(row.event_id)
            changed+=1
        progress["changed"]+=changed;progress["batches"]+=1
        if len(rows)<size:
            progress["table_index"]+=1;progress["last_id"]=None
        else:
            progress["last_id"]=rows[-1].id
        bump_events(session,events)
        job.progress=progress;job.error_type=None
        job.status="completed" if progress["table_index"]>=len(tables()) else "running"
        if before_commit:
            before_commit()  # Usado para testar falha entre o backup e o commit.
        session.commit()
        return {"done":job.status=="completed","changed":changed,"progress":progress}


def repair_saved_metadata(batch_size=5, max_batches=None, pause=0):
    changed,batches=0,0
    while max_batches is None or batches<max_batches:
        result=process_batch(batch_size)
        changed+=result["changed"];batches+=1
        if result["done"]:
            break
        if pause:
            time.sleep(pause)  # Worker/CLI apenas, nunca uma requisição HTTP.
    db.session.expire_all()
    return changed


def simulate(batch_size=5):
    """Somente leitura; não cria jobs, backups ou atualizações."""
    result={key:0 for key in ("scanned","changed","unchanged","skipped","ambiguous","invalid","estimatedBackupBytes")}
    with Session(db.engine) as session:
        for model,field in tables():
            last=None
            while True:
                query=select(model).order_by(model.id).limit(max(1,min(int(batch_size),25)))
                if last is not None:
                    query=query.where(model.id>last)
                rows=list(session.scalars(query))
                if not rows:
                    break
                for row in rows:
                    result["scanned"]+=1
                    if getattr(row,"deleted_at",None) or getattr(row,"deleted",False):
                        result["skipped"]+=1;continue
                    try:
                        result["ambiguous"]+=int(ambiguous(getattr(row,field)))
                        changes=proposal(row,field,session)
                    except (TypeError,ValueError,AttributeError,RecursionError):
                        result["invalid"]+=1;result["skipped"]+=1;continue
                    result["changed" if changes else "unchanged"]+=1
                    if changes:
                        result["estimatedBackupBytes"]+=len(json.dumps({key:getattr(row,key) for key in changes},ensure_ascii=False).encode())
                last=rows[-1].id
                session.expunge_all()
    return result


def status():
    with Session(db.engine) as session:
        job=session.get(MetadataRepairJob,JOB)
        return {"status":job.status,"progress":job.progress,"errorType":job.error_type} if job else {"status":"not_started"}


def restore_backups(batch_size=5):
    """Não sobrescreve alterações posteriores nem ressuscita registros excluídos."""
    restored,conflicts,last=0,0,0
    mapping={model.__tablename__:model for model,_ in tables()}
    while True:
        with Session(db.engine) as session:
            begin_write(session)
            job=session.scalar(select(MetadataRepairJob).where(MetadataRepairJob.name==JOB).with_for_update())
            if not job:
                break
            job.status="rolled_back"
            backups=list(session.scalars(select(MetadataRepairBackup).where(MetadataRepairBackup.job_name==JOB,MetadataRepairBackup.id>last,MetadataRepairBackup.restored_at.is_(None)).order_by(MetadataRepairBackup.id).limit(max(1,min(int(batch_size),25)))))
            events=set()
            for backup in backups:
                last=backup.id
                model=mapping[backup.table_name]
                row_id=model.__table__.c.id.type.python_type(backup.record_id)
                row=session.get(model,row_id,with_for_update=True)
                if row is None or getattr(row,"deleted_at",None) or getattr(row,"deleted",False) or record_fingerprint(row)!=backup.after_hash:
                    conflicts+=1;continue
                version=getattr(row,"version",None)
                for key,value in backup.before.items():
                    setattr(row,key,version+1 if key=="version" else value)
                if hasattr(row,"event_id"):
                    events.add(row.event_id)
                backup.restored_at=datetime.now(timezone.utc);restored+=1
            bump_events(session,events);session.commit()
            if not backups:
                break
    db.session.expire_all()
    return {"restored":restored,"conflicts":conflicts}


def purge_expired_backups(days=30):
    """Retenção limitada; fora desta janela a recuperação depende do backup do provedor."""
    with Session(db.engine) as session:
        result=session.query(MetadataRepairBackup).filter(MetadataRepairBackup.created_at < datetime.now(timezone.utc)-timedelta(days=max(1,int(days)))).delete(synchronize_session=False)
        session.commit()
        return result


def purge_account_backups(user_id):
    """Parte da transação de excluir conta: backups não podem conservar seus dados."""
    from ..models import PersonalSong, PersonalPlaylist, SharedPlaylist, EventMember, Event, EventRepertoireItem, PersonalRepertoireOverride
    from ..models.playlist_collaboration import CollaborativePlaylist, PlaylistMember
    events=select(EventMember.event_id).where(EventMember.user_id==user_id).union(select(Event.id).where(Event.leader_id==user_id))
    playlists=select(PlaylistMember.playlist_id).where(PlaylistMember.user_id==user_id).union(select(CollaborativePlaylist.id).where(CollaborativePlaylist.creator_id==user_id))
    targets=[(PersonalSong,PersonalSong.owner_user_id==user_id),(PersonalPlaylist,PersonalPlaylist.owner_user_id==user_id),
             (SharedPlaylist,SharedPlaylist.owner_user_id==user_id),(CollaborativePlaylist,CollaborativePlaylist.id.in_(playlists)),
             (EventRepertoireItem,EventRepertoireItem.event_id.in_(events)),
             (PersonalRepertoireOverride,(PersonalRepertoireOverride.user_id==user_id)|(PersonalRepertoireOverride.event_id.in_(events)))]
    captured={model.__tablename__:[str(value) for value in db.session.scalars(select(model.id).where(condition))] for model,condition in targets}
    purge_record_backups(captured)
    return captured


def purge_record_backups(targets):
    # Usado novamente após apagar os registros originais: uma correção concorrente
    # pode ter concluído enquanto a exclusão aguardava o bloqueio do registro.
    for table,ids in targets.items():
        for offset in range(0,len(ids),200):
            db.session.query(MetadataRepairBackup).filter(MetadataRepairBackup.table_name==table,MetadataRepairBackup.record_id.in_(ids[offset:offset+200])).delete(synchronize_session=False)


def register_maintenance(app):
    @app.cli.group("metadata-repair")
    def commands():
        """Manutenção privada; os backups por registro não substituem um dump integral do banco."""

    @commands.command("simulate")
    def dry_run():
        click.echo(json.dumps(simulate()))

    @commands.command("status")
    def report_status():
        click.echo(json.dumps(status()))

    @commands.command("run")
    @click.option("--batch-size",default=5,type=click.IntRange(1,25))
    def run(batch_size):
        repair_saved_metadata(batch_size,pause=.1)
        click.echo(json.dumps(status()))

    @commands.command("restore")
    @click.option("--yes",is_flag=True,help="Confirma restauração, sem sobrescrever edições posteriores.")
    def restore(yes):
        if not yes:
            raise click.ClickException("Revise o status e confirme com --yes. Isso não substitui o backup integral no provedor.")
        click.echo(json.dumps(restore_backups()))

    @commands.command("purge-expired")
    def purge_expired():
        click.echo(json.dumps({"expiredBackupsRemoved":purge_expired_backups()}))


def start_background_repair(app):
    if app.testing or not app.config.get("SONG_METADATA_AUTO_REPAIR",True) or os.getenv("FLASK_RUN_FROM_CLI")=="true":
        return
    # PRs podem herdar variáveis do serviço; nunca migrar dados ao revisar uma branch.
    deployed_branch = os.getenv("RAILWAY_GIT_BRANCH", "").strip()
    if deployed_branch and deployed_branch != "main":
        return
    def worker():
        time.sleep(app.config.get("SONG_METADATA_REPAIR_DELAY",5))
        with app.app_context():
            try:
                purge_expired_backups()
                if status()["status"] in {"completed","rolled_back"}:
                    return
                preview=simulate()
                app.logger.info("metadata_repair simulation=%s",json.dumps(preview))
                if preview["estimatedBackupBytes"]>app.config.get("SONG_METADATA_REPAIR_MAX_BACKUP_BYTES",50_000_000):
                    # Não consumir espaço potencialmente ilimitado sem revisão administrativa.
                    with Session(db.engine) as session:
                        begin_write(session)
                        job=session.scalar(select(MetadataRepairJob).where(MetadataRepairJob.name==JOB).with_for_update())
                        if not job:
                            job=MetadataRepairJob(name=JOB,status="needs_review",progress=fresh_progress());session.add(job)
                        if job.status not in {"completed","rolled_back"}:
                            job.status="needs_review";job.error_type="backup_budget_exceeded"
                            job.progress={**job.progress,"estimatedBackupBytes":preview["estimatedBackupBytes"]}
                        session.commit()
                    app.logger.warning("metadata_repair paused backup_budget_exceeded")
                    return
                for attempt in range(3):
                    try:
                        repair_saved_metadata(app.config.get("SONG_METADATA_REPAIR_BATCH_SIZE",5),pause=.1)
                        app.logger.info("metadata_repair result=%s",json.dumps(status()));return
                    except Exception as error:
                        # Mensagens SQL/tracebacks podem conter conteúdo pessoal; só o tipo é registrado.
                        app.logger.warning("metadata_repair retry=%s error_type=%s",attempt+1,type(error).__name__)
                        time.sleep(1)
                with Session(db.engine) as session:
                    job=session.scalar(select(MetadataRepairJob).where(MetadataRepairJob.name==JOB).with_for_update())
                    if job and job.status not in {"completed","rolled_back"}:
                        job.status="failed";job.error_type="batch_failed";session.commit()
            except Exception as error:
                app.logger.warning("metadata_repair stopped error_type=%s",type(error).__name__)
            finally:
                db.session.remove()
    try:
        Thread(target=worker,name="roudy-metadata-repair",daemon=True).start()
    except Exception as error:
        # A manutenção nunca deve tirar o app do ar por falta de recursos para iniciar um worker.
        app.logger.warning("metadata_repair not_started error_type=%s",type(error).__name__)
