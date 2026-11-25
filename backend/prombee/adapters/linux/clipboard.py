"""Read clipboard streams off the GTK thread (including screenshot image data)."""
import tempfile
import threading
import uuid

IMAGE_TYPES = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
               'image/bmp': '.bmp', 'image/gif': '.gif', 'image/tiff': '.tiff'}
URI_LIMIT = 4 * 1024 * 1024


def read_clipboard(clipboard, attachments, callback, timeout_ms=15000):
    from gi.repository import Gio, GLib
    from ...services.attachments import MAX_SIZE
    formats = clipboard.get_formats()
    types = [mime for mime in ('text/uri-list', *IMAGE_TYPES)
             if formats.contain_mime_type(mime)]
    if not types:
        callback([], None)
        return
    cancellable = Gio.Cancellable()
    finished = False
    timer = None

    def finish(paths, error=None):
        nonlocal finished
        if finished:
            return False
        finished = True
        if timer is not None:
            GLib.source_remove(timer)
        callback(paths, error)
        return False

    def expired():
        nonlocal timer
        timer = None
        cancellable.cancel()
        finish([], '读取剪贴板超时，请重试或使用添加附件')
        return False

    def ready(source, result, _):
        try:
            stream, mime = source.read_finish(result)
        except Exception as error:
            finish([], str(error))
            return

        def consume():
            try:
                # A clipboard owner may need the GTK event loop to supply the next
                # chunk. Blocking read_bytes on that loop can deadlock the window.
                with tempfile.SpooledTemporaryFile(max_size=4 * 1024 * 1024) as data:
                    size = 0
                    limit = URI_LIMIT if mime == 'text/uri-list' else MAX_SIZE
                    while True:
                        chunk = stream.read_bytes(64 * 1024, cancellable).get_data()
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > limit:
                            raise ValueError('剪贴板内容过大，请使用添加附件')
                        data.write(chunk)
                    cancellable.set_error_if_cancelled()
                    data.seek(0)
                    if mime == 'text/uri-list':
                        from pathlib import Path
                        paths = []
                        for uri in data.read().decode('utf-8').splitlines():
                            if uri.startswith('file:'):
                                path = Gio.File.new_for_uri(uri).get_path()
                                if path and Path(path).is_file():
                                    paths.append(path)
                            if len(paths) >= 100:
                                break
                    else:
                        if not size:
                            raise ValueError('剪贴板图片为空')
                        asset = attachments.add('粘贴图片-' + uuid.uuid4().hex[:8] + IMAGE_TYPES[mime], data, size)
                        paths = [asset['path']]
                GLib.idle_add(finish, paths)
            except Exception as error:
                GLib.idle_add(finish, [], str(error))
            finally:
                try:
                    stream.close(cancellable)
                except Exception:
                    pass
        threading.Thread(target=consume, name='clipboard-reader', daemon=True).start()

    timer = GLib.timeout_add(timeout_ms, expired)
    clipboard.read_async(types, GLib.PRIORITY_DEFAULT, cancellable, ready, None)
