from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from . import admin, analytics, auth, commerce, email_verification, files, member, operations, password_reset, public, testing
from .config import settings
from .db import SessionLocal


@asynccontextmanager
async def lifespan(app):
    (Path(settings().storage_dir) / 'uploads').mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        db.execute(text('SELECT 1'))
    yield


app = FastAPI(title='KUGNI API', version='1.0.0', lifespan=lifespan, docs_url='/docs' if settings().environment != 'production' else None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=[settings().browser_origin, settings().site_url], allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allow_headers=['Content-Type', 'X-CSRF-Token'])
for routes in [auth.router, email_verification.router, password_reset.router, public.router, member.router, admin.router, operations.router, analytics.router, testing.router, commerce.router, files.router]:
    app.include_router(routes, prefix='/api/v1')
app.mount('/uploads', StaticFiles(directory=str(Path(settings().storage_dir) / 'uploads'), check_dir=False), name='uploads')


@app.middleware('http')
async def security_headers(request: Request, call_next):
    if int(request.headers.get('content-length', '0') or 0) > 3_000_000:
        return JSONResponse({'detail': '请求体过大'}, status_code=413)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if not request.url.path.startswith('/api/v1/public/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(IntegrityError)
async def duplicate_error(request: Request, exc):
    return JSONResponse({'detail': '记录已存在、操作已处理或仍被其他数据引用，请刷新后重试'}, status_code=409)


@app.get('/healthz')
def health():
    with SessionLocal() as db:
        db.execute(text('SELECT 1'))
    return {'status': 'ok', 'database': 'postgresql' if settings().database_url.startswith('postgresql') else 'sqlite-local'}
