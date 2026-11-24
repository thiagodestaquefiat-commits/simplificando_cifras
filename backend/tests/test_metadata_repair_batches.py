from copy import deepcopy
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

from app.database import db
from app.models import PersonalSong
from app.services.song_metadata_migration import (
    JOB, MetadataRepairJob, MetadataRepairBackup, process_batch, repair_saved_metadata,
    simulate, status, restore_backups, purge_expired_backups,
)
from test_song_metadata import song
from test_event_permissions import register


@pytest.mark.parametrize("branch", ["codex/revisao", "feature/teste"])
def test_preview_branch_never_starts_background_migration(app, monkeypatch, branch):
    from app.services.song_metadata_migration import start_background_repair
    app.testing = False
    app.config["SONG_METADATA_AUTO_REPAIR"] = True
    monkeypatch.delenv("FLASK_RUN_FROM_CLI", raising=False)
    monkeypatch.setenv("RAILWAY_GIT_BRANCH", branch)
    with patch("app.services.song_metadata_migration.Thread") as thread:
        start_background_repair(app)
        thread.assert_not_called()


def seed(app, count=3):
    register(app.test_client(),"repair-owner","Pessoa")
    with app.app_context():
        for index in range(count):
            db.session.add(PersonalSong(id=f"repair-{index}",client_id=f"local-{index}",owner_user_id="repair-owner",song_data=song(),version=1))
        db.session.commit()


def test_simulation_is_read_only_and_has_no_personal_content(app):
    seed(app)
    with app.app_context():
        result=simulate(batch_size=1)
        assert result["scanned"]==result["changed"]==3
        assert result["estimatedBackupBytes"]>0
        assert MetadataRepairJob.query.count()==MetadataRepairBackup.query.count()==0
        assert db.session.get(PersonalSong,"repair-0").version==1
        assert "Anderson" not in str(result) and "repair-owner" not in str(result)


def test_resume_uses_atomic_checkpoints_and_one_backup_per_record(app):
    seed(app)
    with app.app_context():
        assert repair_saved_metadata(batch_size=1,max_batches=1)==1
        checkpoint=status()
        assert checkpoint["status"]=="running"
        assert checkpoint["progress"]["last_id"]=="repair-0"
        assert checkpoint["progress"]["changed"]==1
        assert repair_saved_metadata(batch_size=1)==2
        assert status()["status"]=="completed"
        assert status()["progress"]["changed"]==3
        assert MetadataRepairBackup.query.count()==3
        assert all(row.version==2 for row in PersonalSong.query.all())
        assert repair_saved_metadata(batch_size=1)==0
        assert MetadataRepairBackup.query.count()==3


def test_failed_batch_does_not_leave_partial_changes_or_backup(app):
    seed(app)
    with app.app_context():
        process_batch(1)
        first=status()
        def fail():
            raise RuntimeError("simulated interruption")
        with pytest.raises(RuntimeError):
            process_batch(1,before_commit=fail)
        assert status()==first
        assert MetadataRepairBackup.query.count()==1
        assert db.session.get(PersonalSong,"repair-1").version==1
        db.session.rollback()
        assert repair_saved_metadata(batch_size=1)==2


def test_backup_precedes_change_and_restore_preserves_later_edits(app):
    seed(app)
    with app.app_context():
        repair_saved_metadata(batch_size=1)
        backup=MetadataRepairBackup.query.filter_by(record_id="repair-0").one()
        assert backup.before["song_data"]==song()
        newer=db.session.get(PersonalSong,"repair-1")
        newer.song_data={**newer.song_data,"artist":"Escolha posterior"};newer.version+=1
        db.session.commit()
        result=restore_backups(batch_size=1)
        assert result=={"restored":2,"conflicts":1}
        assert db.session.get(PersonalSong,"repair-0").song_data==song()
        assert db.session.get(PersonalSong,"repair-0").version==3
        assert db.session.get(PersonalSong,"repair-1").song_data["artist"]=="Escolha posterior"
        assert status()["status"]=="rolled_back"
        assert repair_saved_metadata()==0


def test_restore_never_recreates_deleted_data_and_backups_expire(app):
    seed(app,1)
    with app.app_context():
        repair_saved_metadata()
        db.session.delete(db.session.get(PersonalSong,"repair-0"));db.session.commit()
        assert restore_backups()=={"restored":0,"conflicts":1}
        assert PersonalSong.query.count()==0
        backup=MetadataRepairBackup.query.one()
        backup.created_at=datetime.now(timezone.utc)-timedelta(days=31);db.session.commit()
        assert purge_expired_backups()==1
        assert MetadataRepairBackup.query.count()==0


def test_ambiguous_and_deleted_records_are_counted(app):
    seed(app,2)
    with app.app_context():
        row=db.session.get(PersonalSong,"repair-0")
        value=deepcopy(song());value["fullChordSheet"]["content"]+="\nBPM: 80"
        row.song_data=value
        db.session.get(PersonalSong,"repair-1").deleted_at=datetime.now(timezone.utc)
        db.session.commit()
        result=simulate(1)
        assert result["ambiguous"]==result["skipped"]==1
        repair_saved_metadata(1)
        assert status()["progress"]["ambiguous"]==status()["progress"]["skipped"]==1
        assert "bpm" not in db.session.get(PersonalSong,"repair-0").song_data
        assert db.session.get(PersonalSong,"repair-1").version==1


def test_cli_simulation_status_and_restore_confirmation(app):
    seed(app,1)
    runner=app.test_cli_runner()
    result=runner.invoke(args=["metadata-repair","simulate"])
    assert result.exit_code==0 and '"changed": 1' in result.output
    assert runner.invoke(args=["metadata-repair","status"]).exit_code==0
    assert runner.invoke(args=["metadata-repair","restore"]).exit_code!=0
    with app.app_context():
        assert MetadataRepairJob.query.count()==0
    assert runner.invoke(args=["metadata-repair","run","--batch-size","1"]).exit_code==0
    assert runner.invoke(args=["metadata-repair","restore","--yes"]).exit_code==0


def test_account_deletion_removes_repair_backups(app):
    from app.services.account_deletion import delete_account_data
    seed(app,1)
    with app.app_context():
        repair_saved_metadata()
        assert MetadataRepairBackup.query.count()==1
        delete_account_data("repair-owner");db.session.commit()
        assert MetadataRepairBackup.query.count()==0


def test_initialization_does_not_scan_or_migrate_synchronously():
    from app import create_app
    from conftest import TestConfig
    with patch("app.services.song_metadata_migration.simulate") as dry_run, patch("app.services.song_metadata_migration.repair_saved_metadata") as run:
        app=create_app(TestConfig)
        assert app.test_client().get("/health").status_code==200
        dry_run.assert_not_called();run.assert_not_called()


def test_two_workers_do_not_duplicate_backups(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from app import create_app
    from conftest import TestConfig
    class FileConfig(TestConfig):
        SQLALCHEMY_DATABASE_URI="sqlite:///"+str(tmp_path/"concurrent-repair.sqlite")
    app=create_app(FileConfig)
    seed(app,4)
    def worker():
        with app.app_context():
            return repair_saved_metadata(batch_size=1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:worker(),range(2)))
    with app.app_context():
        assert sum(results)==4
        assert MetadataRepairBackup.query.count()==4
        assert status()["progress"]["changed"]==4
        assert all(row.version==2 for row in PersonalSong.query.all())


def test_production_start_schedules_worker_without_waiting():
    from app import create_app
    from conftest import TestConfig
    class LiveConfig(TestConfig):
        TESTING=False
    with patch("app.services.song_metadata_migration.Thread") as thread, patch("app.services.song_metadata_migration.repair_saved_metadata") as run:
        app=create_app(LiveConfig)
        thread.return_value.start.assert_called_once()
        assert thread.call_args.kwargs["daemon"] is True
        run.assert_not_called()
        assert app.test_client().get("/health").status_code==200


def test_worker_errors_do_not_log_private_error_details(app, caplog):
    from app.services.song_metadata_migration import start_background_repair
    app.testing=False
    with patch("app.services.song_metadata_migration.Thread") as thread, patch("app.services.song_metadata_migration.time.sleep"), patch("app.services.song_metadata_migration.simulate",side_effect=RuntimeError("private_song_text_and_credentials")):
        start_background_repair(app)
        thread.call_args.kwargs["target"]()
    assert "RuntimeError" in caplog.text
    assert "private_song_text_and_credentials" not in caplog.text


def test_failed_worker_start_does_not_prevent_app_start(caplog):
    from app import create_app
    from conftest import TestConfig
    class LiveConfig(TestConfig):
        TESTING=False
    with patch("app.services.song_metadata_migration.Thread") as thread:
        thread.return_value.start.side_effect=RuntimeError("sensitive_internal_detail")
        app=create_app(LiveConfig)
    assert app.test_client().get("/health").status_code==200
    assert "sensitive_internal_detail" not in caplog.text


def test_auto_repair_pauses_for_large_backups(app):
    from app.services.song_metadata_migration import start_background_repair
    seed(app,1)
    app.testing=False
    app.config["SONG_METADATA_REPAIR_MAX_BACKUP_BYTES"]=1
    with patch("app.services.song_metadata_migration.Thread") as thread, patch("app.services.song_metadata_migration.time.sleep"):
        start_background_repair(app)
        thread.call_args.kwargs["target"]()
    with app.app_context():
        assert status()["status"]=="needs_review"
        assert MetadataRepairBackup.query.count()==0
        assert db.session.get(PersonalSong,"repair-0").version==1
        # Revisão administrativa pode autorizar e retomar pelo comando explícito.
        assert repair_saved_metadata()==1


def test_event_copies_restore_integer_ids_and_preserve_later_notes(app):
    from app.models import Event, EventRepertoireItem, PersonalRepertoireOverride, EventChange
    from app.models.playlist_collaboration import PlaylistNotification
    seed(app,1)
    with app.app_context():
        db.session.add(Event(id="repair-event",title="Ensaio",leader_id="repair-owner"))
        db.session.flush()
        db.session.add(EventRepertoireItem(id="repair-item",event_id="repair-event",song_id="source",position=0,shared_song_data=song()))
        db.session.flush()
        personal=PersonalRepertoireOverride(event_id="repair-event",repertoire_item_id="repair-item",user_id="repair-owner",personal_song_data=song())
        db.session.add(personal);db.session.commit()
        personal_id=personal.id
        assert repair_saved_metadata(batch_size=1)==3
        item=db.session.get(EventRepertoireItem,"repair-item")
        item.shared_notes="Anotação feita depois da recuperação";db.session.commit()
        result=restore_backups(batch_size=1)
        assert result=={"restored":2,"conflicts":1}
        assert db.session.get(PersonalRepertoireOverride,personal_id).personal_song_data==song()
        assert db.session.get(EventRepertoireItem,"repair-item").shared_notes=="Anotação feita depois da recuperação"
        assert EventChange.query.count()==PlaylistNotification.query.count()==0


def test_malformed_record_does_not_block_other_songs(app):
    seed(app,2)
    with app.app_context():
        broken=deepcopy(song());broken["fullChordSheet"]["sourceContent"]=42
        db.session.get(PersonalSong,"repair-0").song_data=broken;db.session.commit()
        assert simulate()["invalid"]==1
        assert repair_saved_metadata()==1
        assert status()["progress"]["invalid"]==1
        assert db.session.get(PersonalSong,"repair-0").version==1
        assert db.session.get(PersonalSong,"repair-1").version==2


def test_personal_playlist_resolves_bpm_only_from_its_owners_library(app):
    from app.models import PersonalPlaylist
    seed(app,1)
    register(app.test_client(),"other-owner","Outra pessoa")
    with app.app_context():
        other=song();other["fullChordSheet"]["content"]="BPM: 100\nC G\nLetra";other["fullChordSheet"]["sections"]=[]
        db.session.add(PersonalSong(id="other-song",client_id="local-0",owner_user_id="other-owner",song_data=other,version=1))
        db.session.add(PersonalPlaylist(id="personal-list",client_id="my-list",owner_user_id="repair-owner",playlist_data={"name":"Minha","items":[{"id":"item","songClientId":"local-0","playback":{"bpm":130,"capo":2}}]},version=1))
        db.session.commit()
        assert simulate()["changed"]==3
        repair_saved_metadata()
        item=db.session.get(PersonalPlaylist,"personal-list").playlist_data["items"][0]
        assert item["playback"]=={"bpm":75,"capo":2}
        assert item["bpmResetVersion"]==1
