"""Opt-in real GTK/WebKit regression: saving fails, recovery persists, window exits."""
from pathlib import Path
import json
import os
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'backend')]
from prombee.adapters.linux import host
from prombee.adapters.linux.floating import GtkFloating
from prombee.services.library import decode_workspace

folder = ROOT / '.cache/prombee/native-close' / str(os.getpid())
exec(compile((ROOT / 'backend/prombee/adapters/linux/host.py').read_text().replace(
    'app.prombee.Prombee', 'app.prombee.CloseTest' + str(os.getpid())), str(ROOT / 'backend/prombee/adapters/linux/host.py'), 'exec'), host.__dict__)
unresponsive = '--unresponsive-editor' in sys.argv
original = GtkFloating.__init__
triggered = []

def init(self, *args):
    original(self, *args)
    self.preferences.orb_enabled = False
    self.x.activate(self.window)
    deadline = time.monotonic() + 15
    def poll():
        if time.monotonic() > deadline:
            self.app.quit()
            return False
        def ready(view, result, _):
            if view.evaluate_javascript_finish(result).to_string() != 'true':
                self.GLib.timeout_add(100, poll)
                return
            script = """const originalFetch=window.fetch.bind(window);window.fetch=(url,options)=>
                url==='/api/state'&&options?.method==='PUT'
                ?Promise.resolve(new Response(JSON.stringify({error:'模拟保存失败'}),{status:400,headers:{'Content-Type':'application/json'}}))
                :originalFetch(url,options);
                const field=document.querySelector('.content');field.focus();field.textContent='Native close recovery fixture';
                field.dispatchEvent(new Event('input',{bubbles:true}));"""
            if unresponsive:
                script += "window.addEventListener('prombee-close',e=>e.stopImmediatePropagation(),true);"
            def edited(view, result, _):
                view.evaluate_javascript_finish(result)
                triggered.append(time.monotonic())
                self.window.close()
            view.evaluate_javascript(script, -1, None, None, None, edited, None)
        self.editor.evaluate_javascript('!!window.prombeeReady', -1, None, None, None, ready, None)
        return False
    self.GLib.timeout_add(100, poll)

GtkFloating.__init__ = init
sys.argv = ['native-close', '--data-dir', str(folder)]
host.main()
assert triggered, 'Editor did not initialize'
assert time.monotonic() - triggered[0] < 9, 'Failed save blocked close'
copies = list((folder / 'recovery').glob('*.txt'))
if not unresponsive:
    assert copies, 'Failed save lost the durable recovery copy'
    state = decode_workspace(copies[0].read_text(), {})['state']
    assert any(node['html'] == 'Native close recovery fixture' for doc in state['documents'] for node in doc['nodes'])
print(json.dumps({'closedAfterSaveFailure': True, 'nativeTimeout': unresponsive, 'recoveryCopies': len(copies), 'seconds': round(time.monotonic()-triggered[0], 2)}))
