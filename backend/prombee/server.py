"""Stable desktop entry points for the layered FastAPI application."""
from .adapters.http_host import EmbeddedServer
from .api.app import create_app
from .services.validation import valid


def create_server(root, data_dir, port=0, dev=False, native_bridge=False):
    return EmbeddedServer(root, data_dir, port, dev, native_bridge)


def start_server(root, data_dir, port=0, dev=False, native_bridge=False):
    return create_server(root, data_dir, port, dev, native_bridge).start()
