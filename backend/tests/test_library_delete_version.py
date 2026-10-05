from test_event_permissions import auth, register


def test_delete_checks_version_and_preserves_newer_edit(client):
    token=register(client, "delete-version-user", "Usuário")
    headers=auth(token)
    client.put('/api/library/songs/versioned', headers=headers, json={'songData':{'title':'Música','notes':'original'}})
    client.put('/api/library/songs/versioned', headers=headers, json={'expectedVersion':1,'songData':{'title':'Música','notes':'edição concorrente'}})
    response=client.delete('/api/library/songs/versioned?expectedVersion=1', headers=headers)
    assert response.status_code==409
    record=client.get('/api/library/songs', headers=headers).get_json()['songs'][0]
    assert record['deletedAt'] is None and record['songData']['notes']=='edição concorrente'
    assert client.delete('/api/library/songs/versioned?expectedVersion=invalid', headers=headers).status_code==409
    assert client.delete('/api/library/songs/versioned?expectedVersion=2', headers=headers).status_code==204
    assert client.get('/api/library/songs', headers=headers).get_json()['songs'][0]['deletedAt'] is not None
