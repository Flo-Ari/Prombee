import io
from pathlib import Path
import sys
import tempfile
import threading
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
try:
    from gi.repository import Gio, GLib
except ImportError:
    Gio = GLib = None
from prombee.services.attachments import Attachments
from prombee.adapters.clipboard_gtk import read_clipboard


@unittest.skipIf(GLib is None, 'GTK clipboard is Linux-only')
class ClipboardTests(unittest.TestCase):
    def read(self, folder, payload, mime, *, timeout=1000, delay=30):
        loop = GLib.MainLoop()
        released = threading.Event()
        ticks = []
        result = []
        class Stream:
            def __init__(self): self.data = io.BytesIO(payload)
            def read_bytes(self, size, cancel):
                # Simulates a clipboard owner needing the GUI loop to supply data.
                released.wait(2)
                cancel.set_error_if_cancelled()
                return GLib.Bytes.new(self.data.read(size))
            def close(self, cancel): pass
        class Formats:
            def contain_mime_type(self, value): return value == mime
        class Clipboard:
            def get_formats(self): return Formats()
            def read_async(self, types, priority, cancel, done, data):
                GLib.idle_add(lambda: (done(self, None, None), False)[1])
            def read_finish(self, result): return Stream(), mime
        def release():
            ticks.append('responsive'); released.set(); return False
        def answer(paths, error): result.append((paths, error)); loop.quit()
        GLib.timeout_add(delay, release)
        watchdog = GLib.timeout_add(2500, lambda: (loop.quit(), False)[1])
        read_clipboard(Clipboard(), Attachments(folder), answer, timeout_ms=timeout)
        loop.run()
        GLib.source_remove(watchdog)
        released.set()
        return result, ticks

    def test_screenshot_is_saved_without_blocking_gui_loop(self):
        with tempfile.TemporaryDirectory() as folder:
            payload = b'\x89PNG\r\n' + b'pixels' * 20000
            result, ticks = self.read(folder, payload, 'image/png')
            self.assertEqual(ticks, ['responsive'])
            self.assertIsNone(result[0][1])
            self.assertEqual(Path(result[0][0][0]).read_bytes(), payload)
            self.assertEqual(len(Attachments(folder).entries()), 1)

    def test_full_uri_stream_is_consumed_not_just_first_chunk(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'图.png'; file.write_bytes(b'png')
            payload = ('#'+'x'*300000+'\r\n'+file.as_uri()+'\r\n').encode()
            result, ticks = self.read(folder, payload, 'text/uri-list')
            self.assertEqual(result, [([str(file)], None)])
            self.assertTrue(ticks)

    def test_stalled_owner_times_out_and_returns_only_one_result(self):
        with tempfile.TemporaryDirectory() as folder:
            result, _ = self.read(folder, b'png', 'image/png', timeout=20, delay=100)
            self.assertEqual(len(result), 1)
            self.assertIn('超时', result[0][1])
