"""
Guarda contra un fallo que solo aparece en PostgreSQL (los tests corren en
SQLite): `schema_editor.execute(sql)` pasa el SQL por `cursor.mogrify`, que
trata cada `%` como marcador de parámetro. Un `%` suelto dentro de un
`RAISE EXCEPTION '...%'` provocó `IndexError: tuple index out of range` al
migrar en producción (cantina 0007). Ahí el `%` literal debe escribirse `%%`.
"""
import importlib.util
import re
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

# `%` que no forma parte de `%%`
PORCIENTO_SUELTO = re.compile(r'(?<!%)%(?!%)')
SQL_RIESGOSO = re.compile(r'\b(CREATE|DROP|ALTER|RAISE|FUNCTION|TRIGGER)\b')


class MigracionesSqlTests(SimpleTestCase):
    def test_sql_crudo_de_migraciones_no_tiene_porciento_sin_escapar(self):
        problemas = []
        for archivo in sorted(Path(settings.BASE_DIR).glob('*/migrations/0*.py')):
            fuente = archivo.read_text(encoding='utf-8')
            if 'schema_editor.execute' not in fuente:
                continue
            spec = importlib.util.spec_from_file_location(f'_mig_{archivo.stem}', archivo)
            modulo = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(modulo)
            for nombre, valor in vars(modulo).items():
                if isinstance(valor, str) and SQL_RIESGOSO.search(valor) and PORCIENTO_SUELTO.search(valor):
                    problemas.append(f'{archivo.parent.parent.name}/{archivo.name}: {nombre}')
        self.assertEqual(problemas, [], 'Escribe %% en lugar de % en el SQL que se ejecuta con schema_editor.execute.')
