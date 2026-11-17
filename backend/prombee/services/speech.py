"""Best-effort system dictation fallback; never installs a speech engine."""
import ctypes
import platform
import re
import shutil
import subprocess
import threading
from pathlib import Path
import time


class Speech:
    def __init__(self, folder):
        self.lock = threading.RLock()
        self.engine = None
        self.previous = None
        self.process = None
        self.cookie = str(Path(folder or ".") / "speech-session.cookie")

    def status(self):
        return dict(state='listening' if self.engine else 'idle', text='', message='')

    @staticmethod
    def command(*arguments):
        return subprocess.run(arguments, capture_output=True, text=True, timeout=8, check=True).stdout.strip()

    @staticmethod
    def windows_dictation():
        user = ctypes.windll.user32
        # Windows' own voice typing panel handles microphone permission and text.
        user.keybd_event(0x5B, 0, 0, 0)
        user.keybd_event(0x48, 0, 0, 0)
        user.keybd_event(0x48, 0, 2, 0)
        user.keybd_event(0x5B, 0, 2, 0)

    def start(self):
        with self.lock:
            if self.engine:return self.status()
            try:
                if platform.system() == 'Windows':
                    self.windows_dictation();self.engine='windows'
                elif shutil.which('nerd-dictation'):
                    self.process=subprocess.Popen(['nerd-dictation','begin','--cookie',self.cookie,'--timeout','90'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    time.sleep(.1)
                    if self.process.poll() is not None:raise RuntimeError()
                    self.engine='nerd-dictation'
                elif shutil.which('ibus'):
                    listing = self.command('ibus','list-engine')
                    candidates=[]
                    for line in listing.splitlines():
                        if ' - ' not in line:continue
                        name,description=line.strip().split(' - ',1)
                        if re.search(r'voice|speech|dictation|语音',name+' '+description,re.I):candidates.append(name)
                    if not candidates:raise RuntimeError()
                    previous=self.command('ibus','engine')
                    self.command('ibus','engine',candidates[0]);self.previous=previous;self.engine='ibus'
                else:raise RuntimeError()
                return self.status()
            except (OSError,subprocess.SubprocessError,RuntimeError,AttributeError):
                return dict(state='error',text='',message='语音输入不可用')

    def stop(self):
        with self.lock:
            try:
                if self.engine=='windows':self.windows_dictation()
                elif self.engine=='nerd-dictation':
                    self.command('nerd-dictation','end','--cookie',self.cookie)
                    if self.process:
                        try:self.process.wait(timeout=2)
                        except subprocess.TimeoutExpired:self.process.terminate()
                elif self.engine=='ibus' and self.previous:self.command('ibus','engine',self.previous)
            except (OSError,subprocess.SubprocessError,AttributeError):pass
            self.engine=None;self.previous=None
            return self.status()
