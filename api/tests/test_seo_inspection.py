from datetime import timedelta

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import Record, Role, User, now
from app.seo_inspection import inspect_html, inspect_tick, queue_inspection, safe_path, queue_issue_recheck
from .conftest import login


def page(path='/', title='Unique title', link=''):
    origin = settings().site_url
    return f'''<!doctype html><html lang="{'en' if path.startswith('/en/') else 'zh-CN'}"><head>
    <title>{title}</title><meta name="description" content="Description {path}">
    <link rel="canonical" href="{origin}{path}">
    <link rel="alternate" hreflang="zh-CN" href="{origin}/"><link rel="alternate" hreflang="en" href="{origin}/en/">
    <link rel="alternate" hreflang="x-default" href="{origin}/">
    <meta property="og:title" content="Title"><meta property="og:description" content="Description"><meta property="og:url" content="{origin}{path}">
    <script type="application/ld+json">{{"@type":"WebSite"}}</script></head><body><main><h1>Heading</h1>{link}</main></body></html>'''


class Reader:
    def read(self, path):
        if path == '/sitemap.xml':
            return 200, {}, f'<urlset><url><loc>{settings().site_url}/</loc></url><url><loc>{settings().site_url}/stations/</loc></url><url><loc>https://evil.example/private/</loc></url></urlset>'
        if path == '/missing/': return 404, {}, 'Not found'
        return 200, {}, page(path, 'Repeated title', '<a href="/missing/">Broken</a><a href="http://127.0.0.1/admin/">External</a>')


def task():
    with SessionLocal() as db:
        row = Record(module='seo-inspection-tasks', owner_id='admin-root', name='SEO fixture', status='启用', data={
            'locales': ['中文'], 'maxPages': 20, 'schedule': '仅手动', 'checkLinks': '开启'})
        db.add(row); db.flush()
        job = queue_inspection(db, row)
        db.flush(); jid = job.id
        db.commit()
        return row.id, jid


def test_inspection_checks_real_head_content_json_and_language_without_external_crawls():
    assert not inspect_html('/', 200, {}, page())[0]
    html = page().replace('<h1>Heading</h1>', '').replace('https://www.kugni.com/"', 'https://wrong.example/"')
    findings, _ = inspect_html('/', 200, {}, html)
    assert {'h1-count', 'canonical'} <= {r['rule'] for r in findings}
    assert inspect_html('/', 404, {}, '')[0][0]['severity'] == '错误'
    for path in ['//evil.example/', '/admin/', '/en/account/', '/a/../admin/', '/%2e%2e/', '/api/']:
        assert not safe_path(path)
    assert safe_path('/en/stations/aruhub/')


def test_worker_records_broken_links_duplicate_titles_and_resolves_only_rechecked_pages():
    tid, jid = task()
    assert inspect_tick(Reader())
    with SessionLocal() as db:
        run = db.get(Record, jid)
        assert run.status == '已完成' and run.data['checked'] == 2 and run.data['linksChecked'] == 1
        issues = list(db.scalars(select(Record).where(Record.module == 'seo-issues')))
        assert any(r.data['rule'] == 'duplicate-title' for r in issues)
        assert sum(r.data['rule'].startswith('broken-link') for r in issues) == 2
        assert all(r.data['evidence'].get('target') != '/admin/' for r in issues)
        db.add(Record(module='seo-issues', slug='unchecked', name='Old unchecked issue', status='待处理', data={'taskId':tid,'path':'/unchecked/'}))
        db.commit()
    class Fixed(Reader):
        def read(self, path):
            if path == '/sitemap.xml': return super().read(path)
            return 200, {}, page(path, 'Title ' + path)
    with SessionLocal() as db:
        job = queue_inspection(db, db.get(Record, tid)); db.flush(); second = job.id; db.commit()
    inspect_tick(Fixed())
    with SessionLocal() as db:
        assert db.get(Record, second).status == '已完成'
        checked = list(db.scalars(select(Record).where(Record.module == 'seo-issues', Record.slug != 'unchecked')))
        assert all(r.status == '已恢复' for r in checked)
        assert db.scalar(select(Record).where(Record.slug == 'unchecked')).status == '待处理'


def test_health_and_inspections_require_platform_permissions_and_csrf(client):
    login(client, 'local-publisher@kugni.com')
    assert client.get('/api/v1/admin/operations/collection-health/').status_code == 403
    assert client.get('/api/v1/admin/operations/translation-health/').status_code == 403
    assert client.get('/api/v1/admin/records/seo-issues/').status_code == 403
    login(client)
    response = client.get('/api/v1/admin/operations/collection-health/')
    assert response.status_code == 200 and response.json()['summary']['stations'] == 20
    assert 'password' not in response.text and 'managementToken' not in response.text
    client.headers.pop('x-csrf-token')
    assert client.post('/api/v1/admin/operations/translation-health/reconcile/', json={}).status_code == 403


def test_revoked_or_disabled_task_owner_cannot_run_a_scheduled_chunk():
    tid, jid = task()
    with SessionLocal() as db:
        db.get(User, 'admin-root').enabled = False
        db.commit()
    assert inspect_tick(Reader())
    with SessionLocal() as db:
        assert db.get(Record, jid).status == '已取消'


def test_issue_rechecks_merge_paths_and_do_not_advance_the_full_site_cursor():
    tid, jid = task()
    inspect_tick(Reader())
    with SessionLocal() as db:
        parent = db.get(Record, tid)
        parent.data = {**parent.data, '_cursor': 17}
        issues = list(db.scalars(select(Record).where(Record.module == 'seo-issues')))
        owner = db.get(User, 'admin-root')
        first = queue_issue_recheck(db, issues[0], owner)
        second = queue_issue_recheck(db, issues[-1], owner)
        assert first.id == second.id and first.data['_config']['_targeted']
        recheck = first.id
        db.commit()
    class Fixed(Reader):
        def read(self, path): return 200, {}, page(path, 'Fixed ' + path)
    inspect_tick(Fixed())
    with SessionLocal() as db:
        assert db.get(Record, recheck).status == '已完成'
        assert db.get(Record, tid).data['_cursor'] == 17
