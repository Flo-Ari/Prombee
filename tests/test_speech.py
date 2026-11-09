from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.speech import Speech

class SpeechTests(unittest.TestCase):
    def test_unavailable_system_engine_returns_brief_failure(self):
        service=Speech(None)
        with patch('prombee.speech.platform.system',return_value='Linux'),patch('prombee.speech.shutil.which',return_value=None):
            self.assertEqual(service.start()['state'],'error')
        self.assertEqual(service.status()['state'],'idle')

    def test_linux_ibus_uses_existing_speech_engine_and_restores_previous(self):
        service=Speech(None);calls=[]
        def command(*args):
            calls.append(args)
            if args==('ibus','list-engine'):return '  xkb:us - English\n  speech-local - Speech dictation'
            if args==('ibus','engine'):return 'xkb:us'
            return ''
        service.command=command
        with patch('prombee.speech.platform.system',return_value='Linux'),patch('prombee.speech.shutil.which',side_effect=lambda name:name=='ibus'):
            self.assertEqual(service.start()['state'],'listening')
            service.stop()
        self.assertIn(('ibus','engine','speech-local'),calls)
        self.assertEqual(calls[-1],('ibus','engine','xkb:us'))
