import base64
import io
import json
import uuid
from datetime import datetime, timezone, timedelta
from PIL import Image, PngImagePlugin
from test_event_permissions import auth, register
from app.database import db
from app.errors import ApiError
from app.routes.bug_reports import BugReport, SupportAttempt, SupportMemoryRequest
from app.services.support_images import normalize_image, MAX_INPUT, _processing
import pytest

URL='/api/collaboration/bug-reports'

def picture(size=(2400,1200)):
    image=Image.new('RGB',size,'white'); output=io.BytesIO()
    tags=PngImagePlugin.PngInfo();tags.add_text('personal','secret')
    image.save(output,'PNG',pnginfo=tags)
    return output.getvalue()

def body(raw=None):
    data={'clientId':str(uuid.uuid4()),'description':'O sino mantém um aviso depois de ler.'}
    if raw is not None: data['image']=(io.BytesIO(raw),'fake.jpeg')
    return data

def test_normalization_and_metadata():
    raw,ext=normalize_image(picture())
    with Image.open(io.BytesIO(raw)) as image:
        assert image.size==(2000,1000)
        assert not image.info and not image.getexif()
    assert ext=='png' and len(raw)<=1024*1024
    for invalid in (b'<svg/>',b'GIF89a',b'not an image',b'x'*(MAX_INPUT+1),picture((4100,4000))):
        with pytest.raises(ApiError): normalize_image(invalid)
    oriented=Image.new('RGB',(100,200),'blue');exif=oriented.getexif();exif[274]=6
    buffer=io.BytesIO();oriented.save(buffer,'JPEG',exif=exif)
    processed,_=normalize_image(buffer.getvalue())
    with Image.open(io.BytesIO(processed)) as image:
        assert image.size==(200,100) and not image.getexif()
    animation=io.BytesIO();Image.new('RGB',(5,5),'red').save(animation,'PNG',save_all=True,append_images=[Image.new('RGB',(5,5),'blue')])
    with pytest.raises(ApiError): normalize_image(animation.getvalue())

def test_upload_is_memory_only_and_attached(client,app,monkeypatch):
    app.config.update(BREVO_API_KEY='fake',BUG_REPORT_SENDER_EMAIL='sender@example.com',BUG_REPORT_RECIPIENT_EMAIL='support@example.com')
    assert client.post(URL,data=body(picture())).status_code==401
    token=register(client,'image-a','A');calls=[]
    class Response:
        status=201
        def __enter__(self): return self
        def __exit__(self,*args): pass
    def send(req,timeout):
        payload=json.loads(req.data);calls.append(payload)
        image=Image.open(io.BytesIO(base64.b64decode(payload['attachment'][0]['content'])))
        assert max(image.size)<=2000 and not image.info
        assert payload['attachment'][0]['name']=='print.png'
        return Response()
    monkeypatch.setattr('app.routes.bug_reports.urlopen',send)
    data=body(picture());report_id=data['clientId']
    response=client.post(URL,data=data,headers=auth(token))
    assert response.status_code==201,response.json
    assert response.json['emailStatus']=='accepted'
    assert client.post(URL,json={'clientId':report_id,'description':'O sino mantém um aviso depois de ler.'},headers=auth(token)).status_code==200
    assert len(calls)==1
    with app.app_context():
        row=db.session.get(SupportAttempt,report_id)
        assert len(row.fingerprint)==64
        assert set(row.__table__.columns.keys())=={'report_id','fingerprint','started_at','attempts'}
        assert 'image' not in BugReport.__table__.columns
        assert 'support_deliveries' not in db.metadata.tables
    assert client.get('/api/collaboration/bug-reports/'+report_id+'/image',headers=auth(token)).status_code==404
    # The bounded multipart stream does not spill to temporary files.
    with app.test_request_context(URL):
        from flask import request
        stream=request._get_file_stream(1000000,'image/png','test.png',1000000)
        assert isinstance(stream,io.BytesIO)

def test_multiple_invalid_and_text_without_storage(client,monkeypatch):
    token=register(client,'image-limits','A')
    assert client.post(URL,data=body(b'<svg/>'),headers=auth(token)).status_code==400
    data=body();data['image']=[(io.BytesIO(picture()),'a.png'),(io.BytesIO(picture()),'b.png')]
    assert client.post(URL,data=data,headers=auth(token)).status_code==400
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:'accepted')
    assert client.post(URL,json=body(),headers=auth(token)).status_code==201

def test_concurrency_is_bounded():
    _processing.acquire()
    try:
        with pytest.raises(ApiError): normalize_image(picture())
    finally:
        _processing.release()

def test_retry_requires_same_image_from_browser(client,app,monkeypatch):
    token=register(client,'image-retry','A');calls=[]
    def send(report,image):
        calls.append(image[0]);return 'retry' if len(calls)==1 else 'accepted'
    monkeypatch.setattr('app.routes.bug_reports.deliver',send)
    data=body(picture());report_id=data['clientId']
    result=client.post(URL,data=data,headers=auth(token));assert result.json['emailStatus']=='retry'
    # Without the image, don't silently send a text-only retry.
    assert client.post(URL,json={'clientId':report_id,'description':data['description']},headers=auth(token)).status_code==409
    data=body(picture());data['clientId']=report_id
    assert client.post(URL,data=data,headers=auth(token)).json['emailStatus']=='accepted'
    assert len(calls)==2 and calls[0]==calls[1]
    with app.app_context(): assert db.session.get(SupportAttempt,report_id).attempts==2

def test_ambiguous_delivery_never_retried(client,app,monkeypatch):
    token=register(client,'image-uncertain','A');calls=[]
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:calls.append(report.id) or 'uncertain')
    data=body()
    assert client.post(URL,json=data,headers=auth(token)).json['emailStatus']=='uncertain'
    assert client.post(URL,json=data,headers=auth(token)).json['emailStatus']=='uncertain'
    assert len(calls)==1

def test_crashed_sender_does_not_duplicate(client,app,monkeypatch):
    token=register(client,'image-stale','A')
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:'accepted')
    data=body();client.post(URL,json=data,headers=auth(token));report_id=data['clientId']
    with app.app_context():
        db.session.get(BugReport,report_id).email_status='sending'
        db.session.get(SupportAttempt,report_id).started_at=datetime.now(timezone.utc)-timedelta(minutes=5)
        db.session.commit()
    calls=[];monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:calls.append(report.id))
    assert client.post(URL,json=data,headers=auth(token)).json['emailStatus']=='uncertain'
    assert not calls

def test_protocol_is_immutable_and_attempt_limit_explicit(client,app,monkeypatch):
    token=register(client,'audit-protocol','A');calls=[]
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:calls.append(report.id) or 'failed')
    data=body();assert client.post(URL,json=data,headers=auth(token)).status_code==201
    assert client.post(URL,json={**data,'description':'Outro conteúdo usando o mesmo protocolo.'},headers=auth(token)).status_code==409
    with app.app_context():
        db.session.get(SupportAttempt,data['clientId']).attempts=5;db.session.commit()
    limit=client.post(URL,json=data,headers=auth(token))
    assert limit.status_code==429
    assert len(calls)==1

def test_invalid_description_and_payload_limits(client):
    token=register(client,'audit-validation','A')
    for data in ([], {**body(),'description':'curto'}, {**body(),'description':'x'*4001}, {**body(),'clientId':'not-a-uuid'}):
        assert client.post(URL,json=data,headers=auth(token)).status_code==400
    assert client.post(URL,data=b'x'*(MAX_INPUT+65537),content_type='application/json',headers=auth(token)).status_code==413
