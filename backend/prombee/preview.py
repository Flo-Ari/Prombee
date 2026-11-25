"""Loopback FastAPI development host; Vite is started by frontend/tools/dev.mjs."""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prombee.paths import resource_root
from prombee.server import create_server


def main():
    root = resource_root()
    parser = argparse.ArgumentParser(description='Prombee 浏览器开发预览')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--data-dir', type=Path, default=root / 'data')
    args = parser.parse_args()
    server = create_server(root, args.data_dir, args.port, dev=True)
    print(f'Prombee → http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
