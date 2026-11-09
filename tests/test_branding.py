import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.branding import app_name, ui_language


class BrandingTests(unittest.TestCase):
    def test_names_are_single_language(self):
        for language in ('zh','zh_CN.UTF-8','zh-TW','zh-Hant'):
            self.assertEqual(app_name(language),'提示蜂')
        for language in ('en','en_US.UTF-8','en-GB','C','fr_FR'):
            self.assertEqual(app_name(language),'Prombee')

    def test_locale_precedence_and_explicit_native_override(self):
        self.assertEqual(ui_language({'LANG':'zh_CN.UTF-8'}),'zh')
        self.assertEqual(ui_language({'LANG':'en_US.UTF-8','LANGUAGE':'zh_CN:en'}),'zh')
        self.assertEqual(ui_language({'LC_ALL':'C','LANGUAGE':'zh_CN','LANG':'zh_CN.UTF-8'}),'en')
        self.assertEqual(ui_language({'PROMBEE_LANGUAGE':'zh','LC_ALL':'C'}),'zh')
        self.assertEqual(ui_language({}),'en')
