"""
Segunda barrera de inmutabilidad para la bitácora de cantina: en PostgreSQL
un trigger rechaza cualquier UPDATE o DELETE sobre la tabla, incluso desde
SQL directo. En SQLite (desarrollo) no aplica; ahí protege el modelo.
"""
from django.db import migrations

TABLA = 'cantina_eventoauditoriacantina'

# El % se escribe %% porque schema_editor.execute interpreta % como parámetro.
CREAR = f"""
CREATE OR REPLACE FUNCTION cantina_bitacora_inalterable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La bitacora de auditoria de cantina es inalterable (%% bloqueado)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cantina_bitacora_inalterable_trg ON {TABLA};
CREATE TRIGGER cantina_bitacora_inalterable_trg
    BEFORE UPDATE OR DELETE ON {TABLA}
    FOR EACH ROW EXECUTE FUNCTION cantina_bitacora_inalterable();
"""

BORRAR = f"""
DROP TRIGGER IF EXISTS cantina_bitacora_inalterable_trg ON {TABLA};
DROP FUNCTION IF EXISTS cantina_bitacora_inalterable();
"""


def crear(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(CREAR)


def borrar(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute(BORRAR)


class Migration(migrations.Migration):
    dependencies = [('cantina', '0006_auditoria_datos_iniciales')]
    operations = [migrations.RunPython(crear, borrar)]
