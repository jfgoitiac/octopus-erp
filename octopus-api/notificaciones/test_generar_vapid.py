import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from notificaciones.management.commands import generar_vapid as gv

FAKE = ('pub-fake', 'priv-fake')


class GenerarVapidTests(SimpleTestCase):
    def correr(self, contenido, *args):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            if contenido is not None:
                (base / '.env').write_text(contenido, encoding='utf-8')
            with override_settings(BASE_DIR=base), patch.object(gv, 'generar_par', return_value=FAKE):
                call_command('generar_vapid', *args, stdout=StringIO())
            return (base / '.env').read_text(encoding='utf-8') if (base / '.env').exists() else None

    def test_rellena_claves_vacias_sin_tocar_el_resto(self):
        out = self.correr('A=1\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nVAPID_EMAIL=x@y.z\n')
        self.assertEqual(out, 'A=1\nVAPID_PUBLIC_KEY=pub-fake\nVAPID_PRIVATE_KEY=priv-fake\nVAPID_EMAIL=x@y.z\n')

    def test_agrega_si_no_existen_o_no_hay_env(self):
        self.assertIn('VAPID_PRIVATE_KEY=priv-fake', self.correr('A=1'))
        self.assertIn('VAPID_PUBLIC_KEY=pub-fake', self.correr(None))

    def test_nunca_sobrescribe_un_par_existente(self):
        original = 'VAPID_PUBLIC_KEY=viejaP\nVAPID_PRIVATE_KEY=viejaS\n'
        self.assertEqual(self.correr(original), original)

    def test_falla_si_solo_hay_una_clave(self):
        with self.assertRaises(CommandError):
            self.correr('VAPID_PUBLIC_KEY=solo\nVAPID_PRIVATE_KEY=\n')

    def test_par_real_es_valido(self):
        publica, privada = gv.generar_par()
        self.assertEqual(len(publica), 87)   # 65 bytes P-256 sin comprimir en base64 url-safe
        self.assertEqual(len(privada), 43)   # 32 bytes
