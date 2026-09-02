from django.conf import settings
from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models import F


# ─────────────────────────────────────────────
# CONFIGURACIÓN GLOBAL DEL SISTEMA (NUEVO)
# ─────────────────────────────────────────────
class ConfiguracionSistema(models.Model):  # NUEVO
    # Datos del colegio
    nombre_colegio   = models.CharField(max_length=200, blank=True, default='')
    rif              = models.CharField(max_length=20, blank=True, default='')
    direccion_colegio = models.TextField(blank=True, default='')
    telefono_colegio  = models.CharField(max_length=20, blank=True, default='')
    correo_colegio    = models.EmailField(blank=True, default='')
    municipio         = models.CharField(max_length=100, blank=True, default='')
    estado_colegio    = models.CharField(max_length=100, blank=True, default='')

    # Períodos escolares
    fecha_inicio_inscripciones = models.DateField()
    fecha_fin_inscripciones    = models.DateField()
    fecha_inicio_ano_escolar   = models.DateField()
    fecha_fin_ano_escolar      = models.DateField()
    periodo_escolar_activo     = models.CharField(max_length=20, default="2025-2026")
    dia_limite_pago            = models.PositiveSmallIntegerField(default=5)
    notificaciones_activas     = models.BooleanField(default=True)

    # Personalización visual del portal de representantes
    color_primario   = models.CharField(max_length=7, default='#0fa3b1', help_text='Color hex, ej: #0fa3b1')
    color_secundario = models.CharField(max_length=7, default='#1f3864', help_text='Color hex secundario')
    logo_url         = models.URLField(blank=True, default='', help_text='URL del logo del colegio (externo)')
    logo_colegio     = models.ImageField(upload_to='configuracion/logos/', null=True, blank=True, help_text='Logo del colegio para recibos de pago')
    logo_avec        = models.ImageField(upload_to='configuracion/logos/', null=True, blank=True, help_text='Logo de AVEC para recibos de pago')

    # Branding dinámico: título del navegador, meta descripción y favicon
    titulo_web       = models.CharField(max_length=200, blank=True, default='', help_text='Título mostrado en la pestaña del navegador. Si está vacío, se usa nombre_colegio.')
    descripcion_web  = models.CharField(max_length=300, blank=True, default='', help_text='Meta descripción del sitio (SEO).')
    favicon_url      = models.URLField(blank=True, default='', help_text='URL del favicon (externo)')
    favicon          = models.ImageField(upload_to='configuracion/favicons/', null=True, blank=True, help_text='Favicon del colegio')

    class Meta:
        verbose_name = "Configuración del Sistema"

    def __str__(self):
        return f"Configuración {self.periodo_escolar_activo}"

    @property
    def inscripciones_abiertas(self):
        from datetime import date
        hoy = date.today()
        return self.fecha_inicio_inscripciones <= hoy <= self.fecha_fin_inscripciones

    @property
    def ano_escolar_activo(self):
        from datetime import date
        hoy = date.today()
        return self.fecha_inicio_ano_escolar <= hoy <= self.fecha_fin_ano_escolar


# ─────────────────────────────────────────────
# REPRESENTANTE
# ─────────────────────────────────────────────
class Representante(models.Model):
    PARENTESCOS = (
        ('padre', 'Padre'),
        ('madre', 'Madre'),
        ('tutor', 'Tutor'),
        ('otro',  'Otro'),
    )

    cedula    = models.CharField(max_length=15, unique=True)
    nombre    = models.CharField(max_length=100)
    apellido  = models.CharField(max_length=100)
    telefono  = models.CharField(max_length=20)
    correo    = models.EmailField()
    direccion = models.TextField()

    # Datos de planilla (NUEVO)
    nacionalidad  = models.CharField(max_length=50, blank=True, default='')
    nivel_estudio = models.CharField(max_length=100, blank=True, default='')

    # Soft Delete — evita que on_delete=CASCADE de Alumno.representante borre
    # físicamente el historial de alumnos retirados al eliminar un representante.
    activo         = models.BooleanField(default=True)
    fecha_eliminacion = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.cedula} - {self.nombre} {self.apellido}"


# ─────────────────────────────────────────────
# MANAGERS PARA SOFT DELETE
# ─────────────────────────────────────────────
class AlumnoManager(models.Manager):
    """Manager por defecto — solo alumnos activos."""
    def get_queryset(self):
        return super().get_queryset().filter(activo=True)


class AlumnoManagerCompleto(models.Manager):
    """Manager alternativo — todos incluyendo retirados."""
    def get_queryset(self):
        return super().get_queryset()


# ─────────────────────────────────────────────
# ALUMNO
# ─────────────────────────────────────────────
class Alumno(models.Model):
    GENEROS = (
        ('masculino', 'Masculino'),
        ('femenino',  'Femenino'),
    )
    ESTATUS_PAGO = (
        ('solvente', 'Solvente'),
        ('mora',     'En Mora'),
        ('becado',   'Becado Total'),
    )

    # Identificación
    cedula_escolar   = models.CharField(max_length=20, unique=True, blank=True, null=True)
    nombre           = models.CharField(max_length=100)
    apellido         = models.CharField(max_length=100)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    genero           = models.CharField(max_length=15, choices=GENEROS, default='masculino')
    direccion        = models.TextField(blank=True, default='')  # NUEVO
    foto             = models.ImageField(upload_to='alumnos/fotos/', null=True, blank=True)

    # Datos de nacimiento y procedencia (NUEVO — planilla física)
    lugar_nacimiento       = models.CharField(max_length=100, blank=True, default='')
    pais_nacimiento        = models.CharField(max_length=100, blank=True, default='')
    estado_nacimiento      = models.CharField(max_length=100, blank=True, default='')
    peso                     = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    estatura                 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    institucion_procedencia  = models.CharField(max_length=150, blank=True, default='')
    bautizado                = models.BooleanField(null=True, blank=True, default=None)
    alergico                 = models.TextField(blank=True, null=True)

    # Parentesco de ESTE alumno con su representante — vive en Alumno (no en
    # Representante) porque un mismo representante puede tener varios alumnos
    # a cargo con parentescos distintos (ej: padre de uno, tío de otro).
    parentesco = models.CharField(max_length=10, choices=Representante.PARENTESCOS, blank=True, default='')

    # Académico — grado_seccion ahora es opcional (alumno puede existir sin inscripción)
    grado_seccion      = models.CharField(max_length=50, blank=True, null=True, db_index=True)  # MODIFICADO
    representante      = models.ForeignKey(
        Representante, on_delete=models.CASCADE, related_name='alumnos'
    )

    # Financiero
    estatus_financiero = models.CharField(max_length=15, choices=ESTATUS_PAGO, default='solvente')
    dia_limite_pago    = models.PositiveSmallIntegerField(default=5)
    porcentaje_beca    = models.PositiveIntegerField(default=0)

    # Soft Delete (NUEVO)
    activo        = models.BooleanField(default=True)
    fecha_retiro  = models.DateTimeField(null=True, blank=True)
    motivo_retiro = models.TextField(blank=True, default='')

    # Multi-sede
    sede = models.ForeignKey(
        'multisede.Sede',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='alumnos',
        verbose_name='Sede',
    )

    # Managers
    objects = AlumnoManager()       # Por defecto: solo activos
    todos   = AlumnoManagerCompleto()  # Todos: activos + retirados

    @transaction.atomic
    def retirar(self, motivo=''):
        """Soft delete — preserva historial de pagos y libera cupo de forma atómica."""
        self.activo        = False
        self.fecha_retiro  = timezone.now()
        self.motivo_retiro = motivo
        self.save(update_fields=['activo', 'fecha_retiro', 'motivo_retiro'])

        if self.grado_seccion:
            # Mismo patrón de locking que reactivar(), por simetría (auditoría
            # 2026-07-07): bloqueamos la fila antes de decrementar el cupo.
            config = ConfiguracionGrado.objects.select_for_update().filter(
                grado_seccion=self.grado_seccion
            ).first()
            if config and config.cupos_utilizados > 0:
                ConfiguracionGrado.objects.filter(pk=config.pk).update(
                    cupos_utilizados=F('cupos_utilizados') - 1
                )

    @transaction.atomic
    def reactivar(self):
        """Reactiva un alumno retirado recuperando el cupo de forma atómica."""
        if self.grado_seccion:
            # Bloqueamos la fila de configuración para evitar condiciones de carrera (Race Conditions)
            config = ConfiguracionGrado.objects.select_for_update().filter(
                grado_seccion=self.grado_seccion
            ).first()

            if not config:
                raise ValidationError(
                    f"El grado {self.grado_seccion} no existe en la configuración del sistema."
                )

            if config.cupos_disponibles <= 0:
                raise ValidationError(
                    f"No hay cupos disponibles en {self.grado_seccion} para reactivar al alumno."
                )

            # Incremento del cupo mediante actualización atómica
            ConfiguracionGrado.objects.filter(pk=config.pk).update(
                cupos_utilizados=F('cupos_utilizados') + 1
            )

        self.activo        = True
        self.fecha_retiro  = None
        self.motivo_retiro = ''
        self.save(update_fields=['activo', 'fecha_retiro', 'motivo_retiro'])

    @property
    def estado_inscripcion(self):
        """Retorna el estado de inscripción del alumno para el período escolar activo.

        `grado_seccion` no se limpia al cambiar de año (la promoción masiva y la
        asignación de grado lo mutan directamente), así que no sirve para saber si
        el alumno ya tiene una inscripción vigente. La fuente de verdad es
        `Inscripcion.periodo_escolar` comparado contra el período activo.
        """
        if not self.activo:
            return 'retirado'
        config = ConfiguracionSistema.objects.first()
        periodo_activo = config.periodo_escolar_activo if config else None
        if periodo_activo and Inscripcion.objects.filter(alumno=self, periodo_escolar=periodo_activo).exists():
            return 'inscrito'
        return 'sin_inscribir'

    def __str__(self):
        estado = '' if self.activo else ' [RETIRADO]'
        return f"{self.nombre} {self.apellido} ({self.grado_seccion or 'Sin grado'}){estado}"


# ─────────────────────────────────────────────
# BIEN NACIONAL
# ─────────────────────────────────────────────
class BienNacional(models.Model):
    ESTADOS = (
        ('optimo',         'Óptimo'),
        ('regular',        'Regular'),
        ('deteriorado',    'Deteriorado'),
        ('desincorporado', 'Desincorporado'),
    )

    codigo_inventario    = models.CharField(max_length=50, unique=True)
    descripcion          = models.CharField(max_length=255)
    estado_conservacion  = models.CharField(max_length=20, choices=ESTADOS, default='optimo')
    ubicacion            = models.CharField(max_length=100)
    valor_estimado_usd   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    fecha_adquisicion    = models.DateField()
    responsable_asignado = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='bienes_responsabilidad'
    )

    class Meta:
        verbose_name        = "Bien Nacional"
        verbose_name_plural = "Bienes Nacionales"

    def __str__(self):
        return f"{self.codigo_inventario} - {self.descripcion}"


# ─────────────────────────────────────────────
# CONFIGURACIÓN DE GRADO
# ─────────────────────────────────────────────
class ConfiguracionGrado(models.Model):
    grado_seccion    = models.CharField(max_length=50, unique=True)
    cupos_maximos    = models.PositiveIntegerField(default=30)
    cupos_utilizados = models.PositiveIntegerField(default=0, editable=False)

    @property
    def cupos_disponibles(self):
        return self.cupos_maximos - self.cupos_utilizados

    def __str__(self):
        return f"{self.grado_seccion} ({self.cupos_utilizados}/{self.cupos_maximos})"


# ─────────────────────────────────────────────
# INSCRIPCIÓN
# ─────────────────────────────────────────────
class Inscripcion(models.Model):
    TIPOS_INGRESO = (
        ('nuevo',   'Nuevo Ingreso'),
        ('regular', 'Estudiante Regular'),
    )

    alumno               = models.ForeignKey(Alumno, on_delete=models.PROTECT)
    periodo_escolar      = models.CharField(max_length=20, default="2025-2026")
    grado_seccion        = models.CharField(max_length=50)
    tipo_ingreso         = models.CharField(max_length=15, choices=TIPOS_INGRESO)
    fecha_inscripcion    = models.DateTimeField(auto_now_add=True)
    documentos_completos = models.BooleanField(default=False)
    nro_solvencia        = models.CharField(max_length=50, blank=True, default='')  # NUEVO — dato manual de planilla
    usuario_registro     = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['alumno', 'periodo_escolar'],
                name='unica_inscripcion_por_periodo',
            ),
        ]

    def clean(self):
        # Evitar inscripción duplicada para el mismo alumno y período
        qs = Inscripcion.objects.filter(alumno=self.alumno, periodo_escolar=self.periodo_escolar)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError(
                f"{self.alumno.nombre} {self.alumno.apellido} ya tiene una inscripción "
                f"registrada para el período {self.periodo_escolar}."
            )

        try:
            config = ConfiguracionGrado.objects.get(grado_seccion=self.grado_seccion)
            if config.cupos_disponibles <= 0:
                raise ValidationError(
                    f"No hay cupos disponibles para {self.grado_seccion}. "
                    f"Capacidad máxima de {config.cupos_maximos} alcanzada."
                )
            self._config_cache = config
        except ConfiguracionGrado.DoesNotExist:
            raise ValidationError(
                f"El grado {self.grado_seccion} no ha sido configurado en el sistema."
            )

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        self.full_clean()

        # Al inscribirse actualizar grado en el alumno
        self.alumno.grado_seccion = self.grado_seccion
        self.alumno.save()

        # La fuente de verdad del estatus financiero es cobranza.mora, no un
        # valor fijo aquí (ver auditoría 2026-07-07): forzar 'solvente' dejaba
        # el campo persistido desactualizado frente a mensualidades/cuotas
        # impagas ya existentes del alumno.
        from cobranza.mora import sincronizar_estatus_alumno
        sincronizar_estatus_alumno(self.alumno)

        super().save(*args, **kwargs)

        if is_new:
            # Incremento atómico para evitar condiciones de carrera (Race Conditions)
            ConfiguracionGrado.objects.filter(pk=self._config_cache.pk).update(
                cupos_utilizados=F('cupos_utilizados') + 1
            )

    def __str__(self):
        return f"{self.alumno.nombre} - {self.grado_seccion} ({self.periodo_escolar})"