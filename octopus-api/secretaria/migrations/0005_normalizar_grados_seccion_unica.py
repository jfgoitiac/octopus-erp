from django.db import migrations

MAPA_NORMALIZACION = {
    '1er Grado A': '1er Grado',
    '1er Grado B': '1er Grado',
    '2do Grado A': '2do Grado',
    '2do Grado B': '2do Grado',
    '3er Grado A': '3er Grado',
    '3er Grado B': '3er Grado',
    '4to Grado A': '4to Grado',
    '4to Grado B': '4to Grado',
    '5to Grado A': '5to Grado',
    '5to Grado B': '5to Grado',
    '6to Grado A': '6to Grado',
    '6to Grado B': '6to Grado',
}

GRADOS_CORRECTOS = [
    '1er Grado', '2do Grado', '3er Grado', '4to Grado', '5to Grado', '6to Grado',
    '1er Año',   '2do Año',   '3er Año',   '4to Año',   '5to Año',
]


def normalizar_grados(apps, schema_editor):
    Alumno             = apps.get_model('secretaria', 'Alumno')
    Inscripcion        = apps.get_model('secretaria', 'Inscripcion')
    ConfiguracionGrado = apps.get_model('secretaria', 'ConfiguracionGrado')

    # 1. Normalizar Alumno.grado_seccion
    for old, new in MAPA_NORMALIZACION.items():
        Alumno.objects.filter(grado_seccion=old).update(grado_seccion=new)

    # 2. Normalizar Inscripcion.grado_seccion
    for old, new in MAPA_NORMALIZACION.items():
        Inscripcion.objects.filter(grado_seccion=old).update(grado_seccion=new)

    # 3. Normalizar ConfiguracionGrado (merge A/B si el destino ya existe)
    for old, new in MAPA_NORMALIZACION.items():
        old_rec = ConfiguracionGrado.objects.filter(grado_seccion=old).first()
        if not old_rec:
            continue
        existing = ConfiguracionGrado.objects.filter(grado_seccion=new).first()
        if existing:
            existing.cupos_utilizados += old_rec.cupos_utilizados
            existing.save(update_fields=['cupos_utilizados'])
            old_rec.delete()
        else:
            old_rec.grado_seccion = new
            old_rec.save(update_fields=['grado_seccion'])

    # 4. Crear los grados faltantes (principalmente los de Media General)
    for grado in GRADOS_CORRECTOS:
        ConfiguracionGrado.objects.get_or_create(
            grado_seccion=grado,
            defaults={'cupos_maximos': 30, 'cupos_utilizados': 0},
        )

    # 5. Eliminar cualquier registro con nombre no estándar (ya sin referencias en Alumno/Inscripcion)
    ConfiguracionGrado.objects.exclude(grado_seccion__in=GRADOS_CORRECTOS).delete()


def revertir_normalizacion(apps, schema_editor):
    pass  # La reversión de datos de texto no es determinista; se omite.


class Migration(migrations.Migration):

    dependencies = [
        ('secretaria', '0004_configuracionsistema_and_more'),
    ]

    operations = [
        migrations.RunPython(normalizar_grados, revertir_normalizacion),
    ]
