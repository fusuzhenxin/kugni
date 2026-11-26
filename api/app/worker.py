"""Database-backed worker and scheduler. Run separately: python -m app.worker."""
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

from sqlalchemy import select, update

from .cache import enqueue_invalidation, flush_invalidations
from .db import SessionLocal
from .models import Credential, Execution, Record, Report, now
from .security import decrypt
from .testing import next_run, perform_test, queue_plan, safe_error

log = logging.getLogger('kugni.worker')


def scrub(value, secret):
    if isinstance(value, str): return value.replace(secret, '[REDACTED]') if secret else value
    if isinstance(value, list): return [scrub(v, secret) for v in value]
    if isinstance(value, dict): return {scrub(k, secret): scrub(v, secret) for k, v in value.items()}
    return value


def schedule_due():
    with SessionLocal() as db:
        plans = list(db.scalars(select(Record).where(Record.module == 'plans', Record.status == '启用').with_for_update(skip_locked=True)))
        for plan in plans:
            if plan.data.get('schedule') == '仅手动': continue
            scheduled = plan.data.get('_nextRun')
            if not scheduled:
                plan.data = {**plan.data, '_nextRun': next_run(plan.data)}
            elif datetime.fromisoformat(scheduled) <= now():
                try:
                    queue_plan(db, plan.owner_id, plan, 'schedule:' + plan.id + ':' + scheduled)
                    plan.data = {**plan.data, '_nextRun': next_run(plan.data), '_scheduleError': ''}
                except Exception as exc:
                    plan.data = {**plan.data, '_nextRun': next_run(plan.data), '_scheduleError': getattr(exc, 'detail', '调度校验失败')}
        db.commit()


def claim_job():
    with SessionLocal() as db:
        row = db.scalar(select(Execution).where(Execution.status == 'queued').order_by(Execution.created_at).with_for_update(skip_locked=True).limit(1))
        if not row: return None
        # Conditional state change also protects local SQLite runs without row locks.
        result = db.execute(update(Execution).where(Execution.id == row.id, Execution.status == 'queued').values(status='running', started_at=now(), heartbeat_at=now()))
        db.commit()
        return row.id if result.rowcount == 1 else None


def process_target(job_id, target):
    with SessionLocal() as db:
        job = db.get(Execution, job_id)
        if not job or job.status != 'running': return []
        cfg = dict(job.settings)
        key = db.get(Record, target.get('keyId')) if target.get('keyId') else None
        credential = db.get(Credential, key.id) if key else None
        if key and key.status == '启用' and credential and (not key.data.get('expires') or key.data['expires'] >= now().date().isoformat()):
            base, secret = key.data['baseUrl'], decrypt(credential.encrypted_secret)
        elif not target.get('keyId') and cfg.get('ephemeralSecret'):
            base, secret = cfg['baseUrl'], decrypt(cfg['ephemeralSecret'])
        else:
            return [(kind, None, {'success': False, 'error': '凭证不存在、已停用或已过期'}) for kind in target['items']]
    results = []
    for kind in target['items']:
        with SessionLocal() as db:
            job = db.get(Execution, job_id)
            if not job or job.status != 'running': break
        score, evidence = perform_test(base, secret, target['protocol'], target['model'], kind, int(cfg.get('timeout') or 30), int(cfg.get('retries') or 0), cfg.get('questionCount'))
        # Remove accidental credential echoes before persisting provider-controlled text.
        evidence = scrub(evidence, secret)
        if kind == '模型指纹' and evidence.get('success'):
            from .fingerprint import match_fingerprint
            with SessionLocal() as db:
                match = match_fingerprint(db, evidence['samples'], target['protocol'])
                evidence.update(fingerprint=match, conclusion=match['conclusion'])
        results.append((kind, score, evidence))
    return results


def run_job(job_id):
    with SessionLocal() as db:
        job = db.get(Execution, job_id)
        if not job or job.status != 'running': return
        targets, concurrency = job.targets, int(job.settings.get('concurrency') or 1)
    try:
        with ThreadPoolExecutor(max_workers=min(4, concurrency)) as pool:
            futures = {pool.submit(process_target, job_id, t): t for t in targets}
            for future in as_completed(futures):
                target = futures[future]
                results = future.result()
                with SessionLocal() as db:
                    job = db.get(Execution, job_id)
                    if job.status != 'running': continue
                    for kind, score, evidence in results:
                        automatic = job.settings.get('publishPolicy') == '自动公开'
                        station_id = target.get('station')
                        if station_id and not db.get(Record, station_id): station_id = None
                        db.add(Report(execution_id=job_id, owner_id=job.owner_id, station_id=station_id, model=target['model'], test_type=kind, score=score, evidence=evidence, status='已通过' if automatic else '待审核', visibility='公开可见' if automatic else '内部可见'))
                        job.completed += 1
                    if results and job.settings.get('publishPolicy') == '自动公开': enqueue_invalidation(db, 'reports')
                    job.heartbeat_at = now()
                    db.commit()
        with SessionLocal() as db:
            job = db.get(Execution, job_id)
            if job.status == 'running':
                success = any(r.evidence.get('success') for r in db.scalars(select(Report).where(Report.execution_id == job_id)))
                job.status = 'completed' if success else 'failed'
                job.error = '' if success else '检测全部失败，请查看报告证据与接口配置'
            job.finished_at = now()
            job.settings = {k: v for k, v in job.settings.items() if k not in ['ephemeralSecret', 'baseUrl']}
            db.commit()
    except Exception:
        log.exception('Job %s failed', job_id)
        with SessionLocal() as db:
            job = db.get(Execution, job_id)
            if job and job.status == 'running':
                job.status, job.error, job.finished_at = 'failed', '执行进程异常，请查看服务日志后重试', now()
                job.settings = {k: v for k, v in job.settings.items() if k not in ['ephemeralSecret', 'baseUrl']}
                db.commit()


def recover_stale():
    with SessionLocal() as db:
        rows = db.scalars(select(Execution).where(Execution.status == 'running', Execution.heartbeat_at < now() - timedelta(hours=1)))
        for row in rows:
            row.status, row.error = 'failed', '执行进程失联，请人工确认后重试'
            row.settings = {k: v for k, v in row.settings.items() if k not in ['ephemeralSecret', 'baseUrl']}
        # Cancelled queued public checks must not retain temporary secrets forever.
        cancelled = db.scalars(select(Execution).where(Execution.status == 'cancelled'))
        for row in cancelled:
            if row.settings.get('ephemeralSecret'):
                row.settings = {k: v for k, v in row.settings.items() if k not in ['ephemeralSecret', 'baseUrl']}
        db.commit()


def tick():
    from .alerts import evaluate_alerts
    schedule_due()
    recover_stale()
    evaluate_alerts()
    flush_invalidations()
    job_id = claim_job()
    if job_id: run_job(job_id)
    if not job_id:
        from .account_connector import account_tick
        from .fingerprint import fingerprint_tick
        if account_tick(): return 'accounts'
        if fingerprint_tick(): return 'fingerprints'
        from .station_sources import station_tick
        if station_tick(): return 'stations'
        from .collection import collection_tick
        if collection_tick(): return 'collection'
        from .seo_inspection import inspect_tick
        if inspect_tick(): return 'seo'
    return job_id


if __name__ == '__main__':
    from threading import Thread
    from .localization import run_loop
    Thread(target=run_loop, name='translations', daemon=True).start()
    logging.basicConfig(level=logging.INFO)
    log.info('KUGNI worker running')
    while True:
        try:
            worked = tick()
        except Exception:
            log.exception('Worker tick failed')
            worked = None
        if not worked: time.sleep(2)
