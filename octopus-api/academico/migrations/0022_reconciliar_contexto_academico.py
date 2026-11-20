from django.db import migrations
from django.db.models import Max, Min


def reconciliar_contexto(apps, schema_editor):
    Periodo = apps.get_model('academico', 'PeriodoEscolar')
    Grado = apps.get_model('academico', 'GradoSeccion')
    Incidencia = apps.get_model('academico', 'IncidenciaMigracionAcademica')
    Lapso = apps.get_model('academico', 'Lapso')
    Materia = apps.get_model('academico', 'Materia')
    Nota = apps.get_model('academico', 'Nota')
    Asistencia = apps.get_model('academico', 'Asistencia')
    Horario = apps.get_model('academico', 'HorarioClase')
    Paquete = apps.get_model('academico', 'PaqueteHorario')
    PaqueteGrado = apps.get_model('academico', 'PaqueteHorarioGrado')
    Inscripcion = apps.get_model('secretaria', 'Inscripcion')
    Sede = apps.get_model('multisede', 'Sede')

    def incidencia(tipo, obj, detalle):
        Incidencia.objects.get_or_create(
            tipo=tipo, modelo=obj._meta.label, objeto_id=obj.pk,
            defaults={'detalle': detalle},
        )

    # Solo se crean períodos con fechas respaldadas por configuración o lapsos.
    for sede in Sede.objects.select_related('configuracion').all():
        nombres = set(Paquete.objects.filter(sede_id=sede.id).values_list('periodo_escolar', flat=True))
        nombres.update(Inscripcion.objects.filter(alumno__sede_id=sede.id).values_list('periodo_escolar', flat=True))
        if sede.configuracion_id:
            nombres.add(sede.configuracion.periodo_escolar_activo)
        for nombre in filter(None, nombres):
            inicio = fin = None
            estado = 'planificado'
            if sede.configuracion_id and sede.configuracion.periodo_escolar_activo == nombre:
                inicio = sede.configuracion.fecha_inicio_ano_escolar
                fin = sede.configuracion.fecha_fin_ano_escolar
                estado = 'activo'
            if not inicio or not fin:
                rango = Lapso.objects.filter(periodo_escolar=nombre).aggregate(
                    inicio=Min('fecha_inicio'), fin=Max('fecha_fin')
                )
                inicio, fin = rango['inicio'], rango['fin']
            if inicio and fin:
                Periodo.objects.get_or_create(
                    sede_id=sede.id, nombre=nombre,
                    defaults={'fecha_inicio': inicio, 'fecha_fin': fin, 'estado': estado},
                )

    for lapso in Lapso.objects.all():
        candidatos = list(Periodo.objects.filter(nombre=lapso.periodo_escolar).values_list('id', flat=True))
        if len(candidatos) == 1:
            lapso.periodo_id = candidatos[0]
            lapso.save(update_fields=['periodo'])
        else:
            incidencia('periodo_ambiguo', lapso, {
                'valor_legacy': lapso.periodo_escolar, 'candidatos': candidatos,
            })

    for paquete in Paquete.objects.all():
        periodo = Periodo.objects.filter(
            sede_id=paquete.sede_id, nombre=paquete.periodo_escolar
        ).first() if paquete.sede_id else None
        if periodo:
            paquete.periodo_id = periodo.id
            paquete.save(update_fields=['periodo'])
        else:
            incidencia('periodo_no_resuelto', paquete, {
                'sede_id': paquete.sede_id, 'valor_legacy': paquete.periodo_escolar,
            })

    for materia in Materia.objects.all():
        candidatos = list(Periodo.objects.filter(sede_id=materia.sede_id).values_list('id', flat=True)) if materia.sede_id else []
        if len(candidatos) == 1:
            materia.periodo_id = candidatos[0]
            grado, _ = Grado.objects.get_or_create(
                periodo_id=candidatos[0], nombre=materia.grado_seccion,
                defaults={'codigo': materia.grado_seccion.strip().upper()},
            )
            materia.grado_id = grado.id
            materia.save(update_fields=['periodo', 'grado'])
        else:
            incidencia('contexto_materia_ambiguo', materia, {
                'sede_id': materia.sede_id, 'grado_legacy': materia.grado_seccion,
                'periodos_candidatos': candidatos,
            })

    for inscripcion in Inscripcion.objects.select_related('alumno').all():
        periodo = Periodo.objects.filter(
            sede_id=inscripcion.alumno.sede_id, nombre=inscripcion.periodo_escolar
        ).first() if inscripcion.alumno.sede_id else None
        if periodo:
            grado, _ = Grado.objects.get_or_create(
                periodo_id=periodo.id, nombre=inscripcion.grado_seccion,
                defaults={'codigo': inscripcion.grado_seccion.strip().upper()},
            )
            inscripcion.periodo_id = periodo.id
            inscripcion.grado_id = grado.id
            inscripcion.save(update_fields=['periodo', 'grado'])
        else:
            incidencia('contexto_inscripcion_ambiguo', inscripcion, {
                'sede_id': inscripcion.alumno.sede_id,
                'periodo_legacy': inscripcion.periodo_escolar,
                'grado_legacy': inscripcion.grado_seccion,
            })

    for asignacion in PaqueteGrado.objects.select_related('paquete').all():
        if asignacion.paquete.periodo_id:
            grado, _ = Grado.objects.get_or_create(
                periodo_id=asignacion.paquete.periodo_id, nombre=asignacion.grado_seccion,
                defaults={'codigo': asignacion.grado_seccion.strip().upper()},
            )
            asignacion.grado_id = grado.id
            asignacion.save(update_fields=['grado'])
        else:
            incidencia('grado_paquete_ambiguo', asignacion, {'grado_legacy': asignacion.grado_seccion})

    for nota in Nota.objects.select_related('lapso', 'materia').all():
        periodo_id = nota.lapso.periodo_id
        if periodo_id and (not nota.materia.periodo_id or nota.materia.periodo_id == periodo_id):
            nota.periodo_id = periodo_id
            nota.save(update_fields=['periodo'])
        else:
            incidencia('periodo_nota_ambiguo', nota, {
                'lapso_periodo_id': periodo_id, 'materia_periodo_id': nota.materia.periodo_id,
            })

    for asistencia in Asistencia.objects.select_related('alumno').all():
        periodos = Periodo.objects.filter(
            sede_id=asistencia.alumno.sede_id,
            fecha_inicio__lte=asistencia.fecha, fecha_fin__gte=asistencia.fecha,
        ) if asistencia.alumno.sede_id else Periodo.objects.none()
        if periodos.count() == 1:
            periodo = periodos.first()
            asistencia.periodo_id = periodo.id
            asistencia.sede_id = asistencia.alumno.sede_id
            grado = Grado.objects.filter(
                periodo_id=periodo.id, nombre=asistencia.alumno.grado_seccion
            ).first()
            asistencia.grado_id = grado.id if grado else None
            asistencia.save(update_fields=['periodo', 'sede', 'grado'])
        else:
            incidencia('contexto_asistencia_ambiguo', asistencia, {
                'sede_id': asistencia.alumno.sede_id, 'fecha': str(asistencia.fecha),
            })

    for horario in Horario.objects.select_related('materia', 'bloque__paquete').all():
        periodo_id = horario.bloque.paquete.periodo_id if horario.bloque_id else horario.materia.periodo_id
        grado_id = horario.materia.grado_id
        if periodo_id:
            horario.periodo_id = periodo_id
            horario.grado_id = grado_id
            horario.save(update_fields=['periodo', 'grado'])
        else:
            incidencia('contexto_horario_ambiguo', horario, {'materia_id': horario.materia_id})


def revertir_contexto(apps, schema_editor):
    for nombre in ('Nota', 'Asistencia', 'HorarioClase', 'Materia', 'Lapso', 'PaqueteHorario'):
        modelo = apps.get_model('academico', nombre)
        campos = [campo for campo in ('periodo', 'grado', 'sede') if any(f.name == campo for f in modelo._meta.fields)]
        if campos:
            modelo.objects.update(**{campo: None for campo in campos})
    apps.get_model('academico', 'PaqueteHorarioGrado').objects.update(grado=None)
    apps.get_model('secretaria', 'Inscripcion').objects.update(periodo=None, grado=None)
    apps.get_model('academico', 'IncidenciaMigracionAcademica').objects.all().delete()
    apps.get_model('academico', 'GradoSeccion').objects.all().delete()
    apps.get_model('academico', 'PeriodoEscolar').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('academico', '0021_gradoseccion_alter_lapso_unique_together_and_more'),
        ('secretaria', '0033_inscripcion_grado_inscripcion_periodo'),
    ]

    operations = [
        migrations.RunPython(reconciliar_contexto, revertir_contexto),
    ]
