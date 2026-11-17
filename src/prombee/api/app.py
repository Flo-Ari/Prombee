"""FastAPI transport. Business use cases live in services; OS work lives in adapters."""
from contextlib import asynccontextmanager
import json
from pathlib import Path
import re
import subprocess
import tempfile

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..services.application import ApplicationServices
from ..services.attachments import MAX_SIZE
from ..services.library import ConflictError

READ_RESOURCES = {'state', 'library', 'display', 'floating', 'other', 'shortcuts', 'speech', 'update', 'skills', 'dev'}
WRITE_RESOURCES = {'state', 'library', 'display', 'floating', 'other', 'shortcuts', 'speech', 'update', 'picker', 'attachments', 'reset'}
MAX_JSON = 20 * 1024 * 1024


def get_services(request: Request) -> ApplicationServices:
    return request.app.state.services


def create_app(root: Path, data_dir: Path, *, dev=False, native_bridge=False,
               services: ApplicationServices | None = None) -> FastAPI:
    services = services or ApplicationServices(root, data_dir, dev=dev)

    @asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            await run_in_threadpool(services.close)

    app = FastAPI(title='Prombee API', version='1', lifespan=lifespan,
                  docs_url='/api/docs' if dev else None,
                  openapi_url='/api/openapi.json' if dev else None, redoc_url=None)
    app.state.services = services

    @app.middleware('http')
    async def security(request: Request, call_next):
        origin = request.headers.get('origin')
        if request.method in ('PUT', 'POST', 'DELETE', 'PATCH') and origin and origin != f'http://{request.headers.get("host")}':
            return JSONResponse({'error': 'Origin rejected'}, status_code=403)
        # The host is loopback-only, including Vite's same-origin proxy. Reject DNS rebinding.
        if request.url.hostname not in ('127.0.0.1', 'localhost', 'testserver'):
            return JSONResponse({'error': 'Host rejected'}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault('Cache-Control', 'no-store')
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        script_policy = "'self' 'unsafe-eval'" if native_bridge else "'self'"
        response.headers.setdefault('Content-Security-Policy', f"default-src 'self'; script-src {script_policy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        return response

    @app.exception_handler(ConflictError)
    async def conflict(request, error):
        return JSONResponse({'error': str(error)}, status_code=409)

    async def bad_request(request, error):
        message = '文件操作失败：' + str(error) if isinstance(error, OSError) else str(error) or 'Invalid request'
        return JSONResponse({'error': message}, status_code=400)

    for error in (ValueError, AttributeError, TypeError, KeyError, OSError, subprocess.TimeoutExpired):
        app.add_exception_handler(error, bad_request)

    router = APIRouter(prefix='/api')

    @router.api_route('/attachments/upload', methods=['POST', 'PUT'])
    async def upload(request: Request, service: ApplicationServices = Depends(get_services)):
        try: length = int(request.headers.get('content-length', -1))
        except ValueError: raise ValueError('附件大小无效')
        if not 0 <= length <= MAX_SIZE: raise ValueError('附件大小无效')
        query = request.query_params
        scope = service.attachments.validate_scope(query.get('scope', '').split(',') if query.get('scope') else [])
        # Spool outside the event loop. Large images never occupy a giant JSON/base64 buffer.
        with tempfile.TemporaryFile() as spool:
            received = 0
            async for chunk in request.stream():
                received += len(chunk)
                if received > length or received > MAX_SIZE: raise ValueError('附件大小无效')
                await run_in_threadpool(spool.write, chunk)
            if received != length: raise ValueError('附件大小无效')
            spool.seek(0)
            return await run_in_threadpool(service.attachments.add, query.get('name', '附件'), spool,
                                           length, temporary=query.get('temporary') == '1', scope=scope)

    @router.get('/attachments/{attachment_id}')
    def attachment(attachment_id: str, request: Request, service: ApplicationServices = Depends(get_services)):
        try:
            entry = service.attachments.get(attachment_id)
            file = Path(entry['path'])
            size = file.stat().st_size
            start, end = 0, size - 1
            header = request.headers.get('range', '')
            if header:
                match = re.fullmatch(r'bytes=(\d+)-(\d*)', header)
                if not match: raise ValueError('附件范围无效')
                start, end = int(match[1]), min(size - 1, int(match[2]) if match[2] else size - 1)
                if not 0 <= start <= end < size: raise ValueError('附件范围无效')
            def chunks():
                with file.open('rb') as stream:
                    stream.seek(start)
                    remaining = end - start + 1
                    while remaining > 0:
                        chunk = stream.read(min(1024 * 1024, remaining))
                        if not chunk: break
                        yield chunk
                        remaining -= len(chunk)
            headers = {'Accept-Ranges': 'bytes', 'Content-Length': str(max(0, end - start + 1)),
                       'Content-Security-Policy': "default-src 'none'; sandbox"}
            if header: headers['Content-Range'] = f'bytes {start}-{end}/{size}'
            return StreamingResponse(chunks(), status_code=206 if header else 200,
                                     media_type=entry['type'], headers=headers)
        except (ValueError, OSError) as error:
            return JSONResponse({'error': str(error)}, status_code=404)

    @router.get('/{resource}')
    def read(resource: str, request: Request, service: ApplicationServices = Depends(get_services)):
        if resource not in READ_RESOURCES: return JSONResponse({'error': 'Not found'}, status_code=404)
        return service.read(resource, dict(request.query_params))

    @router.api_route('/{resource}', methods=['POST', 'PUT'])
    async def write(resource: str, request: Request, service: ApplicationServices = Depends(get_services)):
        if resource not in WRITE_RESOURCES: return JSONResponse({'error': 'Not found'}, status_code=404)
        try: length = int(request.headers.get('content-length', 0))
        except ValueError: length = 0
        if not 0 < length <= MAX_JSON: return JSONResponse({'error': 'Workspace too large'}, status_code=413)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_JSON: return JSONResponse({'error': 'Workspace too large'}, status_code=413)
        payload = json.loads(body)
        return await run_in_threadpool(service.write, resource, payload)

    app.include_router(router)
    static_root = (Path(root) / 'web').resolve()

    @app.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        # Serve only the built UI directory; never expose source, TXT sets or user data.
        file = (static_root / (path or 'index.html')).resolve()
        if not file.is_relative_to(static_root) or not file.is_file():
            return JSONResponse({'error': 'Not found'}, status_code=404)
        kinds = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
                 '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png'}
        return FileResponse(file, media_type=kinds.get(file.suffix, 'application/octet-stream'))

    return app
