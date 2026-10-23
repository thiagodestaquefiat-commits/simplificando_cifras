from app.services.shared_songs_service import CONTRIBUTABLE_FULL_SHEET_SOURCES, SHAREABLE_SOURCE_TYPES


def test_pr105_integration_does_not_expand_catalog_policy():
    assert SHAREABLE_SOURCE_TYPES == {"online", "upload"}
    assert CONTRIBUTABLE_FULL_SHEET_SOURCES == {"user_upload", "web_source"}
