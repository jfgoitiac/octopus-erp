from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


# Catálogo cerrado de tipos de constancia. Se usa tanto en PlantillaConstancia
# (define la plantilla) como en ConstanciaEmitida (copiado al emitir, NO es
# FK — ver docstring de ConstanciaEmitida.tipo).
TIPOS_CONSTANCIA = (
    ('estudio', 'Estudio'),
    ('conducta', 'Buena Conducta'),
    ('retiro', 'Retiro'),
    ('trabajo', 'Trabajo'),
)

DESTINATARIOS_CONSTANCIA = (
    ('alumno', 'Alumno'),
    ('trabajador', 'Trabajador'),
)


class ConfiguracionFirmante(models.Model):
    """
    Datos del firmante (director/autoridad) que se estampan en las
    constancias, y su firma/sello como imágenes.

    Modelo GLOBAL de una sola fila: este colegio no tiene multisede activa
    (ver contexto verificado), por lo que no hay FK a sede. Se fuerza la
    fila única en save() en vez de usar una librería tipo django-solo, que
    el proyecto no tiene instalada.
    """
    nombre = models.CharField(max_length=200)
    cedula = models.CharField(max_length=15)
    nacionalidad = models.CharField(
        max_length=1,
        choices=(('V', 'V'), ('E', 'E')),
        default='V',
    )
    cargo = models.CharField(max_length=150)

    # Storage privado: igual que pagos_comunes/media_views.py con los
    # comprobantes de pago, estas imágenes (firma y sello) no deben ser
    # servidas directo por /media/ sin autenticación. El campo solo declara
    # el upload_to; la vista protegida que las sirve la implementa otro
    # agente/fase, siguiendo el mismo patrón de ComprobanteProtegidoView.
    firma_imagen = models.ImageField(
        upload_to='constancias/firmas/', null=True, blank=True
    )
    sello_imagen = models.ImageField(
        upload_to='constancias/sellos/', null=True, blank=True
    )

    estampado_global_activo = models.BooleanField(default=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='configuraciones_firmante_actualizadas',
    )

    class Meta:
        verbose_name = 'Configuración del Firmante'
        verbose_name_plural = 'Configuración del Firmante'

    def save(self, *args, **kwargs):
        # Fila única: si ya existe una fila y esta es distinta, se fuerza su
        # pk para que siempre actualice la misma fila en lugar de crear otra.
        if not self.pk:
            existente = ConfiguracionFirmante.objects.first()
            if existente:
                self.pk = existente.pk
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre} ({self.cargo})"


class PlantillaConstancia(models.Model):
    tipo = models.CharField(max_length=20, choices=TIPOS_CONSTANCIA)
    nombre = models.CharField(max_length=150)
    destinatario = models.CharField(max_length=15, choices=DESTINATARIOS_CONSTANCIA)

    # El párrafo "Quien suscribe…" NO va aquí, se compone en render (otra
    # fase). Aquí solo vive el cuerpo específico de cada tipo de constancia.
    cuerpo_html = models.TextField()
    anexo_html = models.TextField(blank=True, default='')
    anexo_habilitado = models.BooleanField(default=False)
    permite_estampado = models.BooleanField(default=False)
    activa = models.BooleanField(default=True)

    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='plantillas_constancia_creadas',
    )

    class Meta:
        verbose_name = 'Plantilla de Constancia'
        verbose_name_plural = 'Plantillas de Constancia'

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"


class ConstanciaEmitida(models.Model):
    """
    Histórico de constancias ya emitidas. Es un snapshot inmutable: guarda
    el HTML ya renderizado y los datos capturados al momento de emitir, para
    que cambios posteriores en la plantilla o en los datos del alumno/
    trabajador no alteren constancias ya emitidas.
    """
    numero = models.CharField(max_length=30, unique=True, editable=False)

    # Copiado de la plantilla al emitir (snapshot), NO es FK: si la
    # plantilla cambia de tipo o se elimina, el histórico no debe mutar.
    tipo = models.CharField(max_length=20, choices=TIPOS_CONSTANCIA)

    plantilla = models.ForeignKey(
        'constancias.PlantillaConstancia', on_delete=models.PROTECT
    )
    alumno = models.ForeignKey(
        'secretaria.Alumno', on_delete=models.PROTECT,
        null=True, blank=True,
    )
    trabajador = models.ForeignKey(
        'nomina.Empleado', on_delete=models.PROTECT,
        null=True, blank=True,
    )

    html_renderizado = models.TextField()
    datos_capturados = models.JSONField(default=dict, blank=True)
    salio_firmada = models.BooleanField(default=False)

    emitida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT
    )
    fecha_emision = models.DateTimeField(auto_now_add=True)
    periodo_escolar = models.CharField(max_length=20)

    class Meta:
        verbose_name = 'Constancia Emitida'
        verbose_name_plural = 'Constancias Emitidas'
        indexes = [
            models.Index(fields=['tipo', 'periodo_escolar']),
        ]

    def clean(self):
        destinatario = self.plantilla.destinatario if self.plantilla_id else None

        if destinatario == 'alumno':
            if self.alumno_id is None:
                raise ValidationError(
                    'La plantilla seleccionada es para alumnos: se requiere alumno.'
                )
            if self.trabajador_id is not None:
                raise ValidationError(
                    'La plantilla seleccionada es para alumnos: no debe tener trabajador asociado.'
                )
        elif destinatario == 'trabajador':
            if self.trabajador_id is None:
                raise ValidationError(
                    'La plantilla seleccionada es para trabajadores: se requiere trabajador.'
                )
            if self.alumno_id is not None:
                raise ValidationError(
                    'La plantilla seleccionada es para trabajadores: no debe tener alumno asociado.'
                )

    def __str__(self):
        return f"{self.numero} - {self.get_tipo_display()}"
