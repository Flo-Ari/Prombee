"""Operating-system file selection for the browser development host."""
from pathlib import Path
import shutil
import subprocess


def choose_path(kind, initial=''):
    title = '选择保存位置' if kind == 'folder' else '打开 TXT 词集'
    if shutil.which('zenity'):
        args = ['zenity', '--file-selection', '--title=' + title]
        args += ['--directory'] if kind == 'folder' else ['--file-filter=TXT | *.txt *.TXT']
        if initial and Path(initial).is_dir(): args += ['--filename=' + str(Path(initial).resolve()) + '/']
    elif shutil.which('kdialog'):
        args = ['kdialog', '--getexistingdirectory' if kind == 'folder' else '--getopenfilename', initial or str(Path.home())]
        if kind == 'file': args += ['*.txt|TXT']
        args += ['--title', title]
    else:
        raise ValueError('系统文件选择器不可用')
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode == 1: return None
    if result.returncode: raise ValueError('无法打开系统文件选择器')
    return result.stdout.strip() or None
