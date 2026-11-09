"""Localized display names; storage paths and application identifiers stay stable."""
import os


def ui_language(environ=None):
    env=os.environ if environ is None else environ
    override=env.get('PROMBEE_LANGUAGE')
    if override:return 'zh' if override.lower().startswith('zh') else 'en'
    if environ is None and os.name=='nt':
        import ctypes
        return 'zh' if ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3ff == 4 else 'en'
    for key in ('LC_ALL','LANGUAGE','LC_MESSAGES','LANG'):
        value=env.get(key)
        if value:return 'zh' if value.split(':')[0].lower().startswith('zh') else 'en'
    return 'en'


def app_name(language=None):
    return '提示蜂' if (language or ui_language()).lower().startswith('zh') else 'Prombee'
