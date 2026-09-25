import json
import tarfile
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from usuarios.backup import generar_respaldo_completo, rotar_backups_antiguos


class RespaldoExternoTests(SimpleTestCase):
    @override_settings(MEDIA_ROOT=tempfile.gettempdir())
    def test_respaldo_completo_incluye_dump_y_media_sin_respaldos_anidados(self):
        with tempfile.TemporaryDirectory() as directorio:
            media_root = Path(directorio) / 'media'
            backup_dir = media_root / 'backups'
            archivo_media = media_root / 'comprobantes' / 'prueba.txt'
            archivo_media.parent.mkdir(parents=True)
            archivo_media.write_text('contenido de prueba', encoding='utf-8')
            backup_dir.mkdir()
            (backup_dir / 'octopus_backup_anterior.tar.gz').write_bytes(b'anterior')

            def crear_dump(destino):
                ruta = Path(destino) / 'backup_prueba.sql'
                ruta.write_text('SELECT 1;\n', encoding='utf-8')
                return str(ruta), ruta.name

            with (
                override_settings(MEDIA_ROOT=media_root),
                patch('usuarios.backup.settings.DATABASES', {
                    'default': {'ENGINE': 'django.db.backends.postgresql'},
                }),
                patch('usuarios.backup.generar_backup_bd', side_effect=crear_dump),
            ):
                ruta, _ = generar_respaldo_completo(backup_dir)

            with tarfile.open(ruta, 'r:gz') as archivo_tar:
                nombres = archivo_tar.getnames()
                self.assertIn('database.sql', nombres)
                self.assertIn('manifest.json', nombres)
                self.assertIn('media/comprobantes/prueba.txt', nombres)
                self.assertNotIn('media/backups/octopus_backup_anterior.tar.gz', nombres)
                manifiesto = json.load(archivo_tar.extractfile('manifest.json'))
                self.assertEqual(manifiesto['media']['archivos'], 1)
                self.assertEqual(len(manifiesto['base_de_datos']['sha256']), 64)

    def test_rotacion_no_toca_archivos_ajenos(self):
        with tempfile.TemporaryDirectory() as directorio:
            carpeta = Path(directorio)
            antiguo = carpeta / 'octopus_backup_20200101_000000.tar.gz'
            ajeno = carpeta / 'documento_importante.tar.gz'
            antiguo.write_bytes(b'x')
            ajeno.write_bytes(b'x')
            antiguo.touch()

            with patch('usuarios.backup.os.path.getmtime', return_value=0):
                borrados = rotar_backups_antiguos(carpeta, dias_a_conservar=1)

            self.assertEqual(borrados, [antiguo.name])
            self.assertFalse(antiguo.exists())
            self.assertTrue(ajeno.exists())
