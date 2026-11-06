#!/usr/bin/env python3
import sys
from pathlib import Path
import argparse
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from prombee.server import create_server

parser=argparse.ArgumentParser(description='Prombee 浏览器开发预览')
parser.add_argument('--port',type=int,default=8765)
parser.add_argument('--data-dir',type=Path,default=ROOT/'data')
args=parser.parse_args()
server=create_server(ROOT,args.data_dir,args.port,dev=True)
print(f'Prombee · 提示蜂 → http://127.0.0.1:{server.server_port}',flush=True)
try:server.serve_forever()
except KeyboardInterrupt:server.server_close()
