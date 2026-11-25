"""Native GTK data-folder selection."""

def choose_gtk_folder(Gtk, Gio, GLib):
    Gtk.init()
    loop = GLib.MainLoop()
    result = [None]
    chooser = Gtk.FileChooserNative.new('选择提示蜂数据保存文件夹', None,
                                        Gtk.FileChooserAction.SELECT_FOLDER, '选择', '取消')
    def response(dialog, code):
        if code == Gtk.ResponseType.ACCEPT and dialog.get_file(): result[0] = dialog.get_file().get_path()
        dialog.destroy(); loop.quit()
    chooser.connect('response', response)
    chooser.show(); loop.run()
    return result[0]
