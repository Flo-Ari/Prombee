from PyInstaller.utils.hooks.gi import GiModuleInfo
def hook(api):
    info=GiModuleInfo('WebKit','6.0',hook_api=api)
    binaries,datas,hidden=info.collect_typelib_data()
    api.add_binaries(binaries)
    api.add_datas(datas)
    api.add_imports(*hidden)
