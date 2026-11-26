import csv
import io
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .admin_service import allowed_query, context, get_entity, mutate, serialize, store
from .cache import flush_invalidations
from .catalog import module
from .db import get_db
from .models import Record, User
from .security import check_permission, require_user

router = APIRouter(prefix='/admin', tags=['管理与站长工作台'])


@router.get('/context/')
def admin_context(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return context(db, user)


@router.get('/records/{key}/')
def records(key: str, q: str = '', status: str = '', page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), export: bool = False, user: User = Depends(require_user), db: Session = Depends(get_db)):
    m = module(key)
    query, model = allowed_query(db, user, m)
    if q and hasattr(model, 'name'): query = query.where(model.name.ilike('%' + q + '%'))
    if status and hasattr(model, 'status'): query = query.where(model.status == status)
    if export:
        check_permission(db, user, m, 'export')
        values = [serialize(db, r) for r in db.scalars(query.limit(10000))]
        columns = [c['key'] for c in m.get('columns', [])] or ['id', 'name', 'status', 'updated']
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        for row in values:
            safe = {k: (str(row.get(k, '')) if not isinstance(row.get(k), list) else ', '.join(map(str, row[k]))) for k in columns}
            # Defend against spreadsheet formula execution in user supplied fields.
            writer.writerow({k: "'" + v if v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for k, v in safe.items()})
        return Response('\ufeff' + stream.getvalue(), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{key}.csv"'})
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    order = model.created_at.desc() if hasattr(model, 'created_at') else model.id
    if key == 'model-suggestions':
        query = query.order_by(Record.data['sort'].as_integer(), Record.created_at, Record.id)
    rows = db.scalars(query.order_by(order).offset((page - 1) * page_size).limit(page_size))
    return {'items': [serialize(db, r) for r in rows], 'total': total, 'page': page, 'pageSize': page_size}


@router.get('/records/{key}/{id}/')
def detail(key: str, id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = get_entity(db, user, module(key), id, 'view')
    if key in ['p-messages', 'messages'] and row.status == '未读':
        row.status = '已读'
        db.commit()
    return serialize(db, row)


class ValuesBody(BaseModel):
    values: dict[str, Any]


@router.post('/records/{key}/', status_code=201)
def create(key: str, body: ValuesBody, background: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = mutate(db, user, module(key), 'create', values=body.values)
    db.commit()
    background.add_task(flush_invalidations)
    return serialize(db, row)


@router.patch('/records/{key}/{id}/')
def edit(key: str, id: str, body: ValuesBody, background: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = mutate(db, user, module(key), 'edit', id, body.values)
    db.commit()
    background.add_task(flush_invalidations)
    return serialize(db, row)


class ActionBody(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


@router.post('/records/{key}/{id}/actions/{action}/')
def action(key: str, id: str, action: str, body: ActionBody, background: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    m = module(key)
    if action not in m['actions'] or action.startswith('bulk'):
        raise HTTPException(403, '模块不提供该操作')
    row = mutate(db, user, m, action, id, body.values)
    data = serialize(db, row)
    db.commit()
    background.add_task(flush_invalidations)
    return {'ok': True, 'item': data}


class BulkBody(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)
    action: str
    values: dict[str, Any] = Field(default_factory=dict)


@router.post('/records/{key}/bulk/')
def bulk(key: str, body: BulkBody, background: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    m = module(key)
    if body.action not in m.get('bulkActions', []): raise HTTPException(403, '此模块不支持该批量操作')
    check_permission(db, user, m, 'bulk' + body.action[0].upper() + body.action[1:])
    if body.action == 'edit' and set(body.values) - set(m.get('bulkFields', [])):
        raise HTTPException(422, '批量修改包含不允许的字段')
    done = []
    for id in dict.fromkeys(body.ids):
        mutate(db, user, m, body.action, id, body.values)
        done.append(id)
    db.commit()
    background.add_task(flush_invalidations)
    return {'ok': True, 'processed': len(done), 'ids': done, 'atomic': True}
