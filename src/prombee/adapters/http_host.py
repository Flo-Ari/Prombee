"""Embedded Uvicorn host with deterministic loopback binding for GTK and WebView2."""
from pathlib import Path
import socket
from threading import Thread
import time

import uvicorn

from ..api.app import create_app
from ..services.application import ApplicationServices


class EmbeddedServer:
    """Keep the desktop host's stable lifecycle and native callback contracts."""
    def __init__(self, root, data_dir, port=0, dev=False, native_bridge=False):
        self.services = ApplicationServices(Path(root), Path(data_dir), dev=dev)
        self.app = create_app(root, data_dir, dev=dev, native_bridge=native_bridge, services=self.services)
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(('127.0.0.1', port))
            self.socket.listen(128)
        except BaseException:
            self.socket.close()
            self.services.close()
            raise
        self.server_port = self.socket.getsockname()[1]
        self.server_address = ('127.0.0.1', self.server_port)
        self.engine = uvicorn.Server(uvicorn.Config(self.app, host='127.0.0.1', port=self.server_port,
                                                  log_level='error', log_config=None, access_log=False, loop='asyncio',
                                                  http='h11', ws='none', timeout_graceful_shutdown=10))
        self.thread = None

    @property
    def attachments(self): return self.services.attachments
    @property
    def speech(self): return self.services.speech
    @property
    def other(self): return self.services.other
    @property
    def pick_path(self): return self.services.pick_path
    @pick_path.setter
    def pick_path(self, callback): self.services.pick_path = callback
    @property
    def floating_changed(self): return self.services.floating_changed
    @floating_changed.setter
    def floating_changed(self, callback): self.services.floating_changed = callback

    def serve_forever(self):
        self.engine.run(sockets=[self.socket])

    def start(self):
        self.thread = Thread(target=self.serve_forever, daemon=True, name='prombee-api')
        self.thread.start()
        deadline = time.monotonic() + 15
        while not self.engine.started:
            if not self.thread.is_alive() or time.monotonic() > deadline:
                self.server_close()
                raise RuntimeError('Prombee API failed to start')
            time.sleep(.01)
        return self

    def shutdown(self):
        self.engine.should_exit = True
        if self.thread and self.thread.is_alive(): self.thread.join(timeout=15)

    def server_close(self):
        self.shutdown()
        self.socket.close()
        self.services.close()
