import uuid
from test_event_permissions import auth, register
from app.routes.bug_reports import BugReport

URL='/api/collaboration/bug-reports'

def payload():
    return {'clientId':str(uuid.uuid4()),'description':'O sino mostra avisos que já li.', 'steps':'Abrir e ler todas.'}

def test_auth_validation_and_idempotency(client, app, monkeypatch):
    assert client.post(URL,json=payload()).status_code==401
    token=register(client,'bug-a','A')
    assert client.post(URL,headers=auth(token),json={}).status_code==400
    calls=[]
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report: calls.append(report.id) or 'accepted')
    body=payload()
    result=client.post(URL,headers=auth(token),json=body)
    assert result.status_code==201
    assert result.json['emailStatus']=='accepted'
    assert client.post(URL,headers=auth(token),json=body).status_code==200
    assert len(calls)==1
    other=register(client,'bug-b','B')
    assert client.post(URL,headers=auth(other),json=body).status_code==409

def test_mail_failure_preserves_report(client,app,monkeypatch):
    token=register(client,'bug-c','C')
    monkeypatch.setattr('app.routes.bug_reports.deliver',lambda report:'failed')
    body=payload()
    assert client.post(URL,headers=auth(token),json=body).json['emailStatus']=='failed'
    with app.app_context():
        from app.database import db
        report=db.session.get(BugReport,body['clientId'])
        assert report.description==body['description']
        assert report.email_status=='failed'

def test_brevo_request(app,monkeypatch):
    from app.routes.bug_reports import deliver
    from datetime import datetime, timezone
    from urllib.error import URLError
    import json
    app.config.update(BREVO_API_KEY='fake-key',BUG_REPORT_SENDER_EMAIL='sender@example.com',BUG_REPORT_RECIPIENT_EMAIL='support@example.com')
    class Response:
        status=201
        def __enter__(self): return self
        def __exit__(self,*args): pass
    def send(req,timeout):
        assert req.full_url=='https://api.brevo.com/v3/smtp/email'
        data=json.loads(req.data)
        assert data['to']==[{'email':'support@example.com'}]
        assert 'textContent' in data and 'htmlContent' not in data
        assert timeout==10
        return Response()
    monkeypatch.setattr('app.routes.bug_reports.urlopen',send)
    report=BugReport(id=str(uuid.uuid4()),description='<script>test</script>',steps='',created_at=datetime.now(timezone.utc))
    with app.app_context():
        assert deliver(report)=='accepted'
        monkeypatch.setattr('app.routes.bug_reports.urlopen',lambda *a,**k: (_ for _ in ()).throw(URLError('offline')))
        assert deliver(report)=='uncertain'
