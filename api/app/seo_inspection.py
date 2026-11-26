"""Bounded first-party SSR inspections. No arbitrary URLs, paid APIs or notifications."""
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from urllib.parse import unquote, urljoin, urlparse
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException
from sqlalchemy import select, update

from .config import settings
from .db import SessionLocal
from .models import Record, User, now


def safe_path(path):
    decoded = unquote(path)
    return bool(re.fullmatch(r'/[A-Za-z0-9/_\-.]*', path) and not path.startswith('//')
                and '..' not in decoded and '\\' not in decoded
                and not re.match(r'^/(?:en/)?(?:admin|publisher|api|account|auth|uploads|_next)(?:/|$)', path))


def validate_task(db, data, row=None):
    if not isinstance(data.get('locales'), list) or not data['locales'] or set(data['locales']) - {'中文', '英文'}:
        raise HTTPException(422, '请选择中文或英文巡检')
    try:
        maximum = float(data.get('maxPages') or 1000)
        if not maximum.is_integer() or not 20 <= maximum <= 10000: raise ValueError()
    except (ValueError, TypeError): raise HTTPException(422, '每轮最多页面需为20–10000的整数')
    if data.get('schedule') not in ['仅手动', '每日定时']: raise HTTPException(422, '巡检周期无效')
    if data.get('schedule') == '每日定时' and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', data.get('dailyTime', '')):
        raise HTTPException(422, '请选择北京时间每日巡检时间')
    if row and db.scalar(select(Record.id).where(Record.module == 'seo-inspection-runs', Record.slug == row.id)):
        raise HTTPException(409, '巡检正在运行，请完成后再编辑')
    from .testing import next_run
    data.update(maxPages=int(maximum), timezone='Asia/Shanghai')
    data['_nextRun'] = next_run(data) if data.get('status') == '启用' else None


def queue_inspection(db, task, user=None):
    from .catalog import module
    from .security import check_permission
    user = user or db.get(User, task.owner_id)
    role = check_permission(db, user, module('seo-inspection-tasks'), 'run') if user and user.enabled else None
    if not role or role.scope != 'all': raise HTTPException(403, '巡检需要全站运行权限')
    if task.status != '启用': raise HTTPException(409, '请先启用巡检配置')
    if db.scalar(select(Record.id).where(Record.module == 'seo-inspection-runs', Record.status.in_(['排队中', '巡检中']))):
        raise HTTPException(409, '已有SEO巡检正在排队或执行')
    run = Record(module='seo-inspection-runs', slug=task.id, name=task.name, owner_id=user.id, status='排队中',
        data={'taskId': task.id, 'checked': 0, 'total': 0, 'issueCount': 0, 'linksChecked': 0, '_config': dict(task.data), '_paths': [], '_seenIssues': [], '_titles': {}, '_descriptions': {}, '_links': [], '_pageStatuses': {}, '_linkCursor': 0})
    db.add(run)
    return run


def queue_issue_recheck(db, issue, user):
    task = db.get(Record, issue.data.get('taskId'))
    if not task or task.status != '启用': raise HTTPException(409, '原巡检配置已删除或停用，请先启用对应配置')
    job = db.scalar(select(Record).where(Record.module == 'seo-inspection-runs', Record.slug == task.id, Record.status == '排队中'))
    if job and not job.data.get('_config', {}).get('_targeted'): raise HTTPException(409, '已有全站巡检排队，请完成后再复检')
    if not job:
        job = queue_inspection(db, task, user)
        db.flush()
        job.name = '问题复检 · ' + task.name
        job.data = {**job.data, '_config': {**job.data['_config'], '_targeted': True}}
    else:
        from .catalog import module
        from .security import check_permission
        if check_permission(db, user, module('seo-inspection-tasks'), 'run').scope != 'all':
            raise HTTPException(403, '问题复检需要全站巡检运行权限')
    paths = list(job.data['_paths'])
    for path in [issue.data.get('path'), issue.data.get('evidence', {}).get('otherPath')]:
        if path and safe_path(path) and path not in paths: paths.append(path)
    if not paths: raise HTTPException(422, '问题没有有效的公开路径')
    job.data = {**job.data, '_paths': paths, 'total': len(paths), 'discovered': len(paths), 'startedAt': ''}
    issue.data = {**issue.data, 'recheckRunId': job.id}
    return job


class WebReader:
    def __init__(self):
        self.base = settings().web_internal_url.rstrip('/')
        self.client = httpx.Client(timeout=8, trust_env=False, follow_redirects=False,
            headers={'User-Agent': 'KugniSEOInspection/1.0', 'x-kugni-inspection': '1'})

    def read(self, path):
        if not safe_path(path): raise ValueError('巡检仅允许公开站内路径')
        with self.client.stream('GET', self.base + path, timeout=60 if path == '/sitemap.xml' else 15) as response:
            content = bytearray()
            for chunk in response.iter_bytes():
                content.extend(chunk)
                if len(content) > 6_000_000: raise ValueError('页面超过6MB巡检上限')
            return response.status_code, dict(response.headers), bytes(content).decode('utf-8', errors='replace')

    def close(self): self.client.close()


def discover_paths(reader, locales):
    code, _, raw = reader.read('/sitemap.xml')
    if code != 200 or re.search(r'<!\s*(DOCTYPE|ENTITY)', raw, re.I): raise ValueError('站点地图不可读取或包含不支持的XML声明')
    try: document = ElementTree.fromstring(raw)
    except ElementTree.ParseError: raise ValueError('站点地图不是有效XML')
    origin = settings().site_url.rstrip('/')
    paths = []
    for item in document.iter():
        if item.tag.rsplit('}', 1)[-1] != 'loc' or not item.text: continue
        parsed = urlparse(item.text)
        if parsed.netloc != urlparse(origin).netloc or not safe_path(parsed.path): continue
        path = parsed.path
        if ('英文' if path.startswith('/en/') else '中文') in locales: paths.append(path)
    if '英文' in locales:
        # Also inspect the English counterpart of Chinese pages currently held
        # out of the sitemap, so untranslated pages have an actionable finding.
        for item in document.iter():
            if item.tag.rsplit('}', 1)[-1] == 'loc' and item.text:
                parsed = urlparse(item.text)
                if parsed.netloc == urlparse(origin).netloc and safe_path(parsed.path) and not parsed.path.startswith('/en/'):
                    paths.append('/en' + parsed.path if parsed.path != '/' else '/en/')
    return list(dict.fromkeys(paths))


def inspect_html(path, status, headers, html):
    issues = []
    def add(rule, message, severity='警告', **evidence):
        issues.append({'rule': rule, 'message': message, 'severity': severity, 'evidence': evidence})
    if status in [301, 302, 307, 308]:
        add('redirect', '站点地图页面发生重定向，请直接使用规范地址', '警告', location=headers.get('location', ''))
        return issues, {'links': [], 'title': '', 'description': ''}
    if status != 200:
        add('http-status', f'页面返回 HTTP {status}', '错误')
        return issues, {'links': [], 'title': '', 'description': ''}
    soup = BeautifulSoup(html, 'html.parser')
    title = soup.title.get_text(' ', strip=True) if soup.title else ''
    description = soup.find('meta', attrs={'name': 'description'})
    description = description.get('content', '').strip() if description else ''
    if not title: add('title-missing', '缺少页面标题', '错误')
    elif len(title) > 120: add('title-length', '标题过长，请检查重复拼接', length=len(title))
    if not description: add('description-missing', '缺少页面描述', '错误')
    elif len(description) > 350: add('description-length', '页面描述过长', length=len(description))
    main = soup.find('main')
    headings = (main or soup).find_all('h1')
    if len(headings) != 1: add('h1-count', f'主要内容应有一个H1，当前{len(headings)}个', '错误')
    canonical = soup.find('link', rel='canonical')
    expected = settings().site_url.rstrip('/') + path
    actual = canonical.get('href', '') if canonical else ''
    if actual != expected: add('canonical', '规范链接与正式页面地址不一致', '错误', expected=expected, actual=actual)
    robots = soup.find('meta', attrs={'name': 'robots'})
    robots = robots.get('content', '').lower() if robots else ''
    withheld = 'noindex' in robots
    if withheld: add('english-pending' if path.startswith('/en/') else 'unexpected-noindex', '英文内容尚未完成，当前暂不收录' if path.startswith('/en/') else '站点地图中文页被标记为不收录', '警告' if path.startswith('/en/') else '错误')
    html_lang = soup.html.get('lang', '') if soup.html else ''
    if html_lang.lower() not in (['en', 'en-us'] if path.startswith('/en/') else ['zh-cn', 'zh-hans']):
        add('html-lang', '页面语言属性与路径不一致', '错误', actual=html_lang)
    alternatives = {n.get('hreflang'): n.get('href') for n in soup.find_all('link', rel='alternate') if n.get('hreflang')}
    if not withheld and not {'zh-CN', 'en', 'x-default'} <= alternatives.keys(): add('hreflang', '缺少完整的中英文对应链接')
    for language, url in alternatives.items():
        if urlparse(url).netloc != urlparse(settings().site_url).netloc:
            add('hreflang-origin', '语言链接指向其他域名', '错误', language=language, url=url)
    for prop in ['og:title', 'og:description', 'og:url']:
        if not soup.find('meta', attrs={'property': prop}): add('open-graph', f'缺少{prop}')
    schema = soup.find_all('script', attrs={'type': 'application/ld+json'})
    if not schema: add('schema-missing', '缺少结构化数据')
    for tag in schema:
        try:
            value = json.loads(tag.string or tag.get_text())
            if not isinstance(value, (dict, list)): raise ValueError()
        except (ValueError, TypeError): add('schema-invalid', '结构化数据不是有效JSON', '错误')
    links = []
    for anchor in (main or soup).find_all('a', href=True):
        href = anchor['href']
        if href.startswith(('#', 'mailto:', 'tel:', 'javascript:')): continue
        parsed = urlparse(urljoin(expected, href))
        if parsed.netloc != urlparse(expected).netloc or parsed.query or not safe_path(parsed.path): continue
        if parsed.path.endswith(('.svg', '.png', '.jpg', '.pdf', '.xml', '.txt', '.webmanifest')): continue
        links.append(parsed.path)
    return issues, {'title': title, 'description': description, 'links': list(dict.fromkeys(links))[:100]}


def save_issue(db, task_id, run_id, path, finding):
    identity = hashlib.sha256((task_id + '\0' + path + '\0' + finding['rule']).encode()).hexdigest()
    row = db.scalar(select(Record).where(Record.module == 'seo-issues', Record.slug == identity))
    if not row:
        row = Record(module='seo-issues', slug=identity, name=finding['message'], status='待处理', data={})
        db.add(row)
    row.status, row.name = '待处理', finding['message']
    row.data = {**row.data, **finding, 'path': path, 'taskId': task_id, 'runId': run_id,
                'firstSeenAt': row.data.get('firstSeenAt') or now().isoformat(), 'lastSeenAt': now().isoformat()}
    return identity


def link_status(reader, path):
    visited = set()
    for _ in range(5):
        if path in visited: return 508
        visited.add(path)
        code, headers, _ = reader.read(path)
        if code not in [301, 302, 307, 308]: return code
        parsed = urlparse(urljoin(settings().site_url.rstrip('/') + path, headers.get('location', '')))
        if parsed.netloc != urlparse(settings().site_url).netloc or not safe_path(parsed.path): return 409
        path = parsed.path
    return 508


def inspect_tick(reader=None):
    from .testing import next_run
    with SessionLocal() as db:
        for task in db.scalars(select(Record).where(Record.module == 'seo-inspection-tasks', Record.status == '启用')):
            if task.data.get('_nextRun') and task.data['_nextRun'] <= now().isoformat():
                try: queue_inspection(db, task)
                except HTTPException: pass
                task.data = {**task.data, '_nextRun': next_run(task.data)}
        for abandoned in db.scalars(select(Record).where(Record.module == 'seo-inspection-runs', Record.status == '巡检中', Record.updated_at < now() - timedelta(minutes=5))):
            abandoned.status, abandoned.slug = '失败', None
            abandoned.data = {**abandoned.data, 'error': '巡检进程失联，可重新运行', 'finishedAt': now().isoformat()}
        db.commit()
        job = db.scalar(select(Record).where(Record.module == 'seo-inspection-runs', Record.status.in_(['排队中', '巡检中'])).order_by(Record.created_at).limit(1))
        if not job: return False
        # The run version leases each small chunk, so two workers cannot inspect
        # the same chunk and overwrite one another's progress.
        if job.data.get('_leasedUntil', '') > now().isoformat(): return False
        version, jid = job.version, job.id
        values = {**job.data, '_leasedUntil': (now() + timedelta(minutes=3)).isoformat()}
        claimed = db.execute(update(Record).where(Record.id == jid, Record.version == version).values(data=values, status='巡检中', version=version + 1))
        db.commit()
        if not claimed.rowcount: return False
        task = db.get(Record, values['taskId'])
        if not task or task.status != '启用':
            job.status, job.slug = '已取消', None
            db.commit()
            return True
        # Revalidate owner permissions for every chunk, including scheduled runs.
        from .security import check_permission
        from .catalog import module
        owner = db.get(User, job.owner_id)
        try:
            if not owner or not owner.enabled: raise HTTPException(403, '巡检所属用户已停用')
            role = check_permission(db, owner, module('seo-inspection-tasks'), 'run')
            if role.scope != 'all': raise HTTPException(403, '巡检所属用户不再具有全站权限')
        except HTTPException as exc:
            job.status, job.slug = '已取消', None
            job.data = {**values, 'error': exc.detail, 'finishedAt': now().isoformat()}
            db.commit()
            return True
    owned = reader is None
    reader = reader or WebReader()
    try:
        if not values['_paths']:
            all_paths = discover_paths(reader, values['_config']['locales'])
            cursor = int(values['_config'].get('_cursor') or 0) % max(1, len(all_paths))
            maximum = int(values['_config'].get('maxPages') or 1000)
            values['_paths'] = (all_paths[cursor:] + all_paths[:cursor])[:maximum]
            values.update(total=len(values['_paths']), discovered=len(all_paths), startedAt=now().isoformat())
            if not all_paths: raise ValueError('没有找到可巡检的公开页面')
        batch = values['_paths'][values['checked']:values['checked'] + 5]
        findings = []
        with ThreadPoolExecutor(max_workers=3) as pool:
            responses = list(pool.map(reader.read, batch))
        for path, (status, headers, body) in zip(batch, responses):
            values['_pageStatuses'][path] = status
            issues, page = inspect_html(path, status, headers, body)
            for field, rule in [('title', 'duplicate-title'), ('description', 'duplicate-description')]:
                text = page[field]
                previous = values['_' + field + 's'].get(text) if text else None
                if previous and previous != path:
                    issues.append({'rule': rule, 'severity': '警告', 'message': '标题重复' if field == 'title' else '描述重复', 'evidence': {'otherPath': previous}})
                elif text: values['_' + field + 's'][text] = path
            if values['_config'].get('checkLinks', '开启') == '开启':
                values['_links'] += [{'from': path, 'to': target} for target in page['links']]
            findings += [(path, issue) for issue in issues]
            values['checked'] += 1
        if values['checked'] == values['total']:
            targets = list(dict.fromkeys(link['to'] for link in values['_links']))
            allowed = targets[:2000]
            values['linkTargets'], values['linksSkipped'] = len(allowed), max(0, len(targets) - len(allowed))
            for target in allowed[values['_linkCursor']:values['_linkCursor'] + 8]:
                code = values['_pageStatuses'].get(target)
                if code is None: code = link_status(reader, target)
                if code >= 400:
                    for source in dict.fromkeys(link['from'] for link in values['_links'] if link['to'] == target):
                        findings.append((source, {'rule': 'broken-link-' + hashlib.sha256(target.encode()).hexdigest()[:12],
                            'severity': '错误', 'message': f'站内链接不可访问（HTTP {code}）', 'evidence': {'target': target, 'httpStatus': code}}))
                values['_linkCursor'] += 1
                values['linksChecked'] += 1
        with SessionLocal() as db:
            job = db.get(Record, jid)
            if job.status != '巡检中' or job.version != version + 1: return True
            for path, finding in findings:
                values['_seenIssues'].append(save_issue(db, values['taskId'], jid, path, finding))
            values['issueCount'] += len(findings)
            values['_leasedUntil'] = ''
            task = db.get(Record, values['taskId'])
            if values['checked'] == values['total'] and values['_linkCursor'] >= values.get('linkTargets', 0):
                # Resolve only rechecked pages; a rotating batch cannot declare
                # unchecked pages repaired. Link HTTP checks are bounded separately.
                for issue in db.scalars(select(Record).where(Record.module == 'seo-issues', Record.data['taskId'].as_string() == values['taskId'])):
                    if issue.data.get('path') in values['_paths'] and issue.slug not in values['_seenIssues']:
                        issue.status = '已恢复'
                job.status, job.slug = '已完成', None
                values['finishedAt'] = now().isoformat()
                if task:
                    task.data = {**task.data, '_cursor': task.data.get('_cursor', 0) if values['_config'].get('_targeted') else (int(values['_config'].get('_cursor') or 0) + values['checked']) % values['discovered'],
                                 'lastResult': '发现问题' if values['issueCount'] else '通过', 'lastRun': jid}
            job.data = values
            job.version += 1
            db.commit()
        return True
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        with SessionLocal() as db:
            job = db.get(Record, jid)
            if job and job.status == '巡检中':
                job.status, job.slug = '失败', None
                job.data = {**values, 'error': str(exc)[:200] if isinstance(exc, ValueError) else '站内页面暂不可读取，请核对前端服务', 'errorType': type(exc).__name__, 'finishedAt': now().isoformat()}
                task = db.get(Record, values['taskId'])
                if task: task.data = {**task.data, 'lastResult': '失败'}
                db.commit()
        return True
    finally:
        if owned: reader.close()
