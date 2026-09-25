from django.db import migrations, models


def crear_plantillas_iniciales(apps, schema_editor):
    PlantillaWhatsApp = apps.get_model('notificaciones', 'PlantillaWhatsApp')
    if PlantillaWhatsApp.objects.exists():
        return
    PlantillaWhatsApp.objects.create(
        nombre='Recordatorio amable',
        tipo='recordatorio',
        predeterminada=True,
        activa=True,
        cuerpo=(
            'Hola {{representante.nombre}}, le saludamos de *{{colegio.nombre}}*.\n\n'
            'Le recordamos que tiene un saldo pendiente de *{{monto}}* '
            'correspondiente a {{meses}} mes(es) de {{alumno.nombre}}.\n\n'
            'Puede revisar el detalle en el portal: {{portal.link}}\n\n'
            'Si ya realizó su pago, por favor ignore este mensaje. ¡Gracias!'
        ),
    )
    PlantillaWhatsApp.objects.create(
        nombre='Segundo aviso',
        tipo='segundo_aviso',
        predeterminada=False,
        activa=True,
        cuerpo=(
            '*Segundo aviso de pago pendiente*\n\n'
            'Estimado/a {{representante.nombre}}, la deuda de {{alumno.nombre}} '
            'con *{{colegio.nombre}}* tiene *{{dias_atraso}} días de atraso*.\n\n'
            'Monto pendiente: *{{monto}}*\n\n'
            '{{datos_bancarios}}\n\n'
            'Agradecemos regularizar a la brevedad.'
        ),
    )
    PlantillaWhatsApp.objects.create(
        nombre='Aviso final',
        tipo='aviso_final',
        predeterminada=False,
        activa=True,
        cuerpo=(
            '*Aviso final de morosidad*\n\n'
            'Representante: {{representante.nombre}}\n'
            'Alumno(s): {{alumno.nombre}}\n'
            'Meses adeudados: {{meses}} | Días de atraso: {{dias_atraso}}\n'
            'Monto total: *{{monto}}*\n\n'
            'Por favor comuníquese con {{colegio.nombre}} a la brevedad para '
            'evitar la suspensión de servicios.\n\n'
            '{{datos_bancarios}}'
        ),
    )


def eliminar_plantillas_iniciales(apps, schema_editor):
    PlantillaWhatsApp = apps.get_model('notificaciones', 'PlantillaWhatsApp')
    PlantillaWhatsApp.objects.filter(
        nombre__in=['Recordatorio amable', 'Segundo aviso', 'Aviso final']
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('notificaciones', '0008_configuracionnotificaciones_dias_alerta_director_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PlantillaWhatsApp',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100)),
                ('tipo', models.CharField(
                    choices=[
                        ('recordatorio', 'Recordatorio amable'),
                        ('segundo_aviso', 'Segundo aviso'),
                        ('aviso_final', 'Aviso final'),
                        ('personalizada', 'Personalizada'),
                    ],
                    default='personalizada', max_length=20,
                )),
                ('cuerpo', models.TextField(
                    help_text='Texto plano con tokens {{grupo.campo}}. Máximo recomendado ~1000 caracteres.')),
                ('predeterminada', models.BooleanField(default=False)),
                ('activa', models.BooleanField(default=True)),
                ('nombre_plantilla_meta', models.CharField(blank=True, default='', max_length=100)),
                ('idioma_meta', models.CharField(blank=True, default='es', max_length=10)),
                ('orden_parametros_meta', models.JSONField(blank=True, default=list)),
                ('creada_en', models.DateTimeField(auto_now_add=True)),
                ('actualizada_en', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Plantilla de WhatsApp',
                'verbose_name_plural': 'Plantillas de WhatsApp',
                'ordering': ['-predeterminada', 'nombre'],
            },
        ),
        migrations.AddField(
            model_name='notificacionlog',
            name='modo',
            field=models.CharField(
                blank=True, default='',
                choices=[('', ''), ('manual', 'Enlace manual (wa.me)'), ('automatico', 'API automática')],
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='notificacionlog',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('mora_dia_0', 'Aviso factura (Dia 0)'),
                    ('mora_dia_5', 'Recordatorio (Dia 5)'),
                    ('mora_dia_10', 'Segundo aviso (Dia 10)'),
                    ('mora_dia_15', 'Alerta director (Dia 15)'),
                    ('comprobante', 'Comprobante subido'),
                    ('comprobante_inscripcion', 'Comprobante de inscripción'),
                    ('bienvenida', 'Bienvenida portal'),
                    ('reset_password', 'Recuperación de contraseña'),
                    ('pago_exitoso', 'Pago confirmado'),
                    ('prueba', 'Mensaje de prueba'),
                    ('cobro_whatsapp', 'Cobro por WhatsApp'),
                    ('otro', 'Otro'),
                ],
                default='otro', max_length=30,
            ),
        ),
        migrations.RunPython(crear_plantillas_iniciales, eliminar_plantillas_iniciales),
    ]
