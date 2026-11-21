from decimal import Decimal, ROUND_HALF_UP

from simple_history.models import HistoricalRecords
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class PeriodoEscolar(models.Model):
    ESTADOS = (
        ('planificado', 'Planificado'),
        ('activo', 'Activo'),
        ('cerrado', 'Cerrado'),
    )

    sede = models.ForeignKey(
        'multisede.Sede', on_delete=models.PROTECT, related_name='periodos_escolares'
    )
    nombre = models.CharField(max_length=20)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    estado = models.CharField(max_length=12, choices=ESTADOS, default='planificado')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('sede', 'nombre'), name='academico_periodo_sede_nombre_unico'
            ),
            models.UniqueConstraint(
                fields=('sede',), condition=models.Q(estado='activo'),
                name='academico_un_periodo_activo_por_sede',
            ),
            models.CheckConstraint(
                condition=models.Q(fecha_fin__gte=models.F('fecha_inicio')),
                name='academico_periodo_fechas_validas',
            ),
        ]
        ordering = ['-fecha_inicio', 'sede__nombre']

    def clean(self):
        super().clean()
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValidationError({'fecha_fin': 'La fecha de fin no puede preceder al inicio.'})
        if self.sede_id and self.fecha_inicio and self.fecha_fin:
            solapado = PeriodoEscolar.objects.filter(
                sede_id=self.sede_id,
                fecha_inicio__lte=self.fecha_fin,
                fecha_fin__gte=self.fecha_inicio,
            ).exclude(pk=self.pk)
            if solapado.exists():
                raise ValidationError('El período se solapa con otro período de la sede.')

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.nombre} — {self.sede}'


class GradoSeccion(models.Model):
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, related_name='grados_secciones'
    )
    nombre = models.CharField(max_length=50)
    codigo = models.CharField(max_length=50)
    activo = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('periodo', 'nombre'), name='academico_grado_periodo_nombre_unico'
            ),
            models.UniqueConstraint(
                fields=('periodo', 'codigo'), name='academico_grado_periodo_codigo_unico'
            ),
        ]
        ordering = ['periodo__fecha_inicio', 'nombre']

    @property
    def sede_id(self):
        return self.periodo.sede_id

    def __str__(self):
        return f'{self.nombre} — {self.periodo}'


class IncidenciaMigracionAcademica(models.Model):
    """Fila legacy que no pudo reconciliarse sin adivinar sede/período/grado."""

    tipo = models.CharField(max_length=40)
    modelo = models.CharField(max_length=80)
    objeto_id = models.PositiveBigIntegerField(null=True, blank=True)
    detalle = models.JSONField(default=dict)
    resuelta = models.BooleanField(default=False)
    creada_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['tipo', 'modelo', 'objeto_id']
        constraints = [
            models.UniqueConstraint(
                fields=('tipo', 'modelo', 'objeto_id'),
                name='academico_incidencia_migracion_unica',
            ),
        ]


# ─────────────────────────────────────────────
# MATERIA
# ─────────────────────────────────────────────
class Materia(models.Model):
    nombre       = models.CharField(max_length=100)
    # Se autogenera en save() si se deja vacío
    codigo       = models.CharField(max_length=20, blank=True)
    # Debe coincidir con ConfiguracionGrado.grado_seccion
    grado_seccion = models.CharField(max_length=50)
    docente      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='materias'
    )
    activa = models.BooleanField(default=True)
    # Cantidad de bloques de 45 min que la materia ocupa por semana
    horas_academicas = models.PositiveSmallIntegerField(default=4)

    # Multi-sede
    sede = models.ForeignKey(
        'multisede.Sede',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='materias',
        verbose_name='Sede',
    )
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='materias',
    )
    grado = models.ForeignKey(
        GradoSeccion, on_delete=models.PROTECT, null=True, blank=True,
        related_name='materias',
    )

    # ── Plan de Evaluación (sistema nuevo, opcional por materia+lapso) ──────
    TIPO_EVALUACION_CHOICES = (
        ('numerica', 'Numérica'),
        ('literal',  'Literal (A/B/C)'),
    )
    # Define si la materia se califica con escala 0-20 (numerica) o con
    # letras A/B/C (literal). Lo define el admin/control de estudios al
    # cargar la materia — no lo edita el docente.
    tipo_evaluacion = models.CharField(
        max_length=10, choices=TIPO_EVALUACION_CHOICES, default='numerica'
    )
    # "Puntos EREC": si está activo, los bloques de esta materia se suman
    # automáticamente al total de TODAS las demás materias del mismo
    # grado_seccion+lapso (ver services de cálculo del plan de evaluación).
    aporta_a_todas_las_materias = models.BooleanField(default=False)
    # Si es False, la materia queda fuera de los cálculos de promedio general
    # (ej. rendimiento por sección) aunque siga teniendo notas cargadas.
    cuenta_para_promedio = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('sede', 'periodo', 'codigo'),
                condition=(models.Q(sede__isnull=False) & models.Q(periodo__isnull=False)),
                name='academico_materia_codigo_contexto_unico',
            ),
            models.UniqueConstraint(
                fields=('sede', 'periodo', 'grado', 'nombre'),
                condition=(models.Q(sede__isnull=False) & models.Q(periodo__isnull=False)
                           & models.Q(grado__isnull=False)),
                name='academico_materia_contexto_unica',
            ),
            models.UniqueConstraint(
                fields=('nombre', 'grado_seccion'),
                condition=models.Q(grado__isnull=True),
                name='academico_materia_legacy_unica',
            ),
        ]
        ordering = ['grado_seccion', 'nombre']
        verbose_name = 'Materia'
        verbose_name_plural = 'Materias'

    def save(self, *args, **kwargs):
        if self.grado_id:
            self.periodo = self.grado.periodo
            self.sede = self.grado.periodo.sede
            self.grado_seccion = self.grado.nombre
        # Autogenerar código si no se proporcionó
        if not self.codigo:
            prefijo = self.nombre[:3].upper().replace(' ', '')
            base = f"{prefijo}-{self.grado_seccion[:6].upper().replace(' ', '')}"
            # Asegurar unicidad añadiendo sufijo numérico si es necesario
            codigo = base
            contador = 1
            while Materia.objects.exclude(pk=self.pk).filter(codigo=codigo).exists():
                codigo = f"{base}-{contador}"
                contador += 1
            self.codigo = codigo
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.grado_id:
            if self.periodo_id and self.grado.periodo_id != self.periodo_id:
                raise ValidationError({'grado': 'El grado no pertenece al período de la materia.'})
            if self.sede_id and self.grado.periodo.sede_id != self.sede_id:
                raise ValidationError({'grado': 'El grado no pertenece a la sede de la materia.'})

    def __str__(self):
        return f"{self.grado_seccion} — {self.nombre}"


# ─────────────────────────────────────────────
# LAPSO
# ─────────────────────────────────────────────
class Lapso(models.Model):
    LAPSO_CHOICES = (
        ('1er Lapso', '1er Lapso'),
        ('2do Lapso', '2do Lapso'),
        ('3er Lapso', '3er Lapso'),
    )

    nombre          = models.CharField(max_length=20, choices=LAPSO_CHOICES)
    periodo_escolar = models.CharField(max_length=20, default='2025-2026')
    fecha_inicio    = models.DateField()
    fecha_fin       = models.DateField()
    activo          = models.BooleanField(default=True)
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='lapsos',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('periodo', 'nombre'), condition=models.Q(periodo__isnull=False),
                name='academico_lapso_periodo_nombre_unico',
            ),
            models.UniqueConstraint(
                fields=('periodo_escolar', 'nombre'), condition=models.Q(periodo__isnull=True),
                name='academico_lapso_legacy_nombre_unico',
            ),
            models.CheckConstraint(
                condition=models.Q(fecha_fin__gte=models.F('fecha_inicio')),
                name='academico_lapso_fechas_validas',
            ),
        ]
        ordering = ['periodo_escolar', 'nombre']
        verbose_name = 'Lapso'
        verbose_name_plural = 'Lapsos'

    def __str__(self):
        return f"{self.nombre} ({self.periodo_escolar})"

    def clean(self):
        super().clean()
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValidationError({'fecha_fin': 'La fecha final no puede preceder al inicio.'})
        if self.periodo_id and self.fecha_inicio and self.fecha_fin:
            if self.fecha_inicio < self.periodo.fecha_inicio or self.fecha_fin > self.periodo.fecha_fin:
                raise ValidationError('Las fechas del lapso deben estar dentro del período escolar.')
            solapado = Lapso.objects.filter(
                periodo_id=self.periodo_id,
                fecha_inicio__lte=self.fecha_fin,
                fecha_fin__gte=self.fecha_inicio,
            ).exclude(pk=self.pk)
            if solapado.exists():
                raise ValidationError('El lapso se solapa con otro lapso del período.')


# ─────────────────────────────────────────────
# NOTA
# ─────────────────────────────────────────────
class Nota(models.Model):
    alumno   = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='notas'
    )
    materia  = models.ForeignKey(
        Materia,
        on_delete=models.CASCADE,
        related_name='notas'
    )
    lapso    = models.ForeignKey(
        Lapso,
        on_delete=models.CASCADE,
        related_name='notas'
    )
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='notas_legacy',
    )

    # Evaluaciones parciales (escala 0-20)
    evaluacion_1 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    evaluacion_2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    evaluacion_3 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    evaluacion_4 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    # Calculada automáticamente en save() — no editable manualmente
    definitiva   = models.DecimalField(
        max_digits=5, decimal_places=2,
        null=True, editable=False
    )
    observaciones = models.TextField(blank=True)
    # Auditoría automática: registra cada cambio con usuario, fecha y valores anteriores
    history = HistoricalRecords()

    class Meta:
        unique_together = ('alumno', 'materia', 'lapso')
        verbose_name = 'Nota'
        verbose_name_plural = 'Notas'

    def save(self, *args, **kwargs):
        # Calcular definitiva como promedio de las evaluaciones no nulas
        evaluaciones = [
            v for v in [
                self.evaluacion_1, self.evaluacion_2,
                self.evaluacion_3, self.evaluacion_4
            ] if v is not None
        ]
        if evaluaciones:
            promedio = sum(evaluaciones) / len(evaluaciones)
            self.definitiva = Decimal(str(promedio)).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
        else:
            self.definitiva = None
        super().save(*args, **kwargs)

    @property
    def aprobado(self):
        """Retorna True si la nota definitiva es mayor o igual a 10."""
        if self.definitiva is None:
            return None
        return self.definitiva >= Decimal('10')

    def __str__(self):
        return (
            f"{self.alumno.nombre} {self.alumno.apellido} — "
            f"{self.materia.nombre} ({self.lapso.nombre}): {self.definitiva}"
        )


class ConfiguracionCalificacion(models.Model):
    """Autoridad explícita del motor usado por una materia en un lapso.

    ``motor`` permanece nullable durante la reconciliación: representa pares
    sin fuente activada o con coexistencia que requiere decisión humana. La
    migración inicial nunca elimina ni modifica calificaciones existentes.
    """

    MOTOR_CHOICES = (('legacy', 'Legacy (Evaluaciones 1–4)'), ('plan', 'Plan de evaluación'))

    materia = models.ForeignKey(
        Materia, on_delete=models.CASCADE, related_name='configuraciones_calificacion'
    )
    lapso = models.ForeignKey(
        Lapso, on_delete=models.CASCADE, related_name='configuraciones_calificacion'
    )
    motor = models.CharField(max_length=10, choices=MOTOR_CHOICES, null=True, blank=True)
    evaluaciones_esperadas = models.PositiveSmallIntegerField(default=4)
    origen = models.CharField(max_length=20, default='manual')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('materia', 'lapso'), name='academico_config_calificacion_unica'
            ),
            models.CheckConstraint(
                condition=models.Q(evaluaciones_esperadas__gte=1),
                name='academico_evaluaciones_esperadas_positivas',
            ),
        ]
        verbose_name = 'Configuración de calificación'
        verbose_name_plural = 'Configuraciones de calificación'

    def __str__(self):
        return f'{self.materia} / {self.lapso}: {self.motor or "sin resolver"}'


class ObservacionCalificacion(models.Model):
    """Observación canónica preservada durante la transición legacy."""

    alumno = models.ForeignKey(
        'secretaria.Alumno', on_delete=models.CASCADE,
        related_name='observaciones_calificacion',
    )
    materia = models.ForeignKey(
        Materia, on_delete=models.CASCADE, related_name='observaciones_calificacion'
    )
    lapso = models.ForeignKey(
        Lapso, on_delete=models.CASCADE, related_name='observaciones_calificacion'
    )
    texto = models.TextField(blank=True)
    origen = models.CharField(max_length=20, default='manual')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('alumno', 'materia', 'lapso'),
                name='academico_observacion_calificacion_unica',
            ),
        ]
        verbose_name = 'Observación de calificación'
        verbose_name_plural = 'Observaciones de calificación'


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN (sistema nuevo, opcional por materia+lapso)
# ─────────────────────────────────────────────
# Coexiste con Nota/evaluacion_1..4: Nota sigue siendo el fallback para
# materias sin PlanEvaluacion configurado. Una materia+lapso usa uno u
# otro sistema, nunca ambos a la vez (a criterio de quien arma el plan).
class PlanEvaluacion(models.Model):
    materia = models.ForeignKey(
        Materia,
        on_delete=models.CASCADE,
        related_name='planes_evaluacion'
    )
    lapso = models.ForeignKey(
        Lapso,
        on_delete=models.CASCADE,
        related_name='planes_evaluacion'
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ('materia', 'lapso')
        verbose_name = 'Plan de Evaluación'
        verbose_name_plural = 'Planes de Evaluación'

    def __str__(self):
        return f"Plan — {self.materia.nombre} ({self.lapso.nombre})"


class VersionPlanEvaluacion(models.Model):
    """Copia inmutable del árbol anterior a cada edición del plan."""

    plan = models.ForeignKey(PlanEvaluacion, on_delete=models.PROTECT, related_name='versiones')
    numero = models.PositiveIntegerField()
    contenido = models.JSONField()
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT,
        related_name='versiones_plan_evaluacion_creadas',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('plan', 'numero'), name='academico_version_plan_unica'),
        ]
        ordering = ['plan_id', '-numero']


class CierreLapso(models.Model):
    """Snapshot auditable de un cierre. Nunca se modifica salvo al reabrirlo."""

    lapso = models.ForeignKey(Lapso, on_delete=models.PROTECT, related_name='cierres')
    version = models.PositiveIntegerField()
    checklist = models.JSONField()
    snapshot = models.JSONField()
    override = models.BooleanField(default=False)
    justificacion = models.TextField(blank=True)
    cerrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cierres_lapso_realizados'
    )
    cerrado_en = models.DateTimeField(auto_now_add=True)
    reabierto_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name='reaperturas_lapso_realizadas',
    )
    reabierto_en = models.DateTimeField(null=True, blank=True)
    motivo_reapertura = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('lapso', 'version'), name='academico_cierre_lapso_version_unica'),
        ]
        ordering = ['-cerrado_en']


class BloqueEvaluacion(models.Model):
    MODO_CHOICES = (
        ('puntos',   'Suma de puntos'),
        ('promedio', 'Promedio'),
    )

    plan = models.ForeignKey(
        PlanEvaluacion,
        on_delete=models.CASCADE,
        related_name='bloques'
    )
    nombre = models.CharField(max_length=100)  # ej. "Contenido", "Rasgos", "EREC"
    # Solo tiene sentido si Materia.tipo_evaluacion == 'numerica'.
    total_puntos = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    # Ignorado si la materia es literal: en ese caso el bloque siempre se
    # resuelve por moda de letras (ver ItemEvaluacion.services de cálculo).
    modo = models.CharField(max_length=10, choices=MODO_CHOICES, default='puntos')
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Bloque de Evaluación'
        verbose_name_plural = 'Bloques de Evaluación'

    def __str__(self):
        return f"{self.plan.materia.nombre} — {self.nombre}"


class ItemEvaluacion(models.Model):
    bloque = models.ForeignKey(
        BloqueEvaluacion,
        on_delete=models.CASCADE,
        related_name='items'
    )
    nombre = models.CharField(max_length=150)
    fecha = models.DateField(null=True, blank=True)
    # Solo relevante cuando bloque.modo == 'puntos' y la materia es numérica.
    valor_maximo = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Ítem de Evaluación'
        verbose_name_plural = 'Ítems de Evaluación'

    def __str__(self):
        return f"{self.bloque.nombre} — {self.nombre}"


class NotaItemEvaluacion(models.Model):
    LETRA_CHOICES = (('A', 'A'), ('B', 'B'), ('C', 'C'))

    item = models.ForeignKey(
        ItemEvaluacion,
        on_delete=models.CASCADE,
        related_name='notas'
    )
    alumno = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='notas_item_evaluacion'
    )
    # Se usa uno u otro según Materia.tipo_evaluacion.
    valor_numerico = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    valor_letra = models.CharField(
        max_length=1, choices=LETRA_CHOICES, null=True, blank=True
    )
    # Auditoría de cambios — mismo criterio que Nota (evaluacion_1..4), ya que
    # este modelo es su equivalente en el sistema nuevo de plan de evaluación
    # y puede ser igual de sensible ante disputas de calificación.
    history = HistoricalRecords()

    class Meta:
        unique_together = ('item', 'alumno')
        constraints = [
            models.CheckConstraint(
                condition=(
                    (models.Q(valor_numerico__isnull=False) & models.Q(valor_letra__isnull=True))
                    | (models.Q(valor_numerico__isnull=True) & models.Q(valor_letra__isnull=False))
                ),
                name='academico_nota_item_un_solo_valor',
            ),
            models.CheckConstraint(
                condition=models.Q(valor_numerico__isnull=True) | models.Q(valor_numerico__gte=0),
                name='academico_nota_item_numerica_no_negativa',
            ),
        ]
        verbose_name = 'Nota de Ítem de Evaluación'
        verbose_name_plural = 'Notas de Ítems de Evaluación'

    def __str__(self):
        valor = self.valor_numerico if self.valor_numerico is not None else self.valor_letra
        return f"{self.alumno.nombre} {self.alumno.apellido} — {self.item.nombre}: {valor}"


# ─────────────────────────────────────────────
# ASISTENCIA
# ─────────────────────────────────────────────
class DiaCalendarioEscolar(models.Model):
    """Excepción al calendario lectivo base (lunes a viernes)."""

    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.CASCADE, related_name='dias_calendario'
    )
    fecha = models.DateField()
    es_lectivo = models.BooleanField(default=False)
    motivo = models.CharField(max_length=160, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('periodo', 'fecha'), name='academico_calendario_periodo_fecha_unico'
            ),
        ]
        ordering = ['fecha']

    def clean(self):
        super().clean()
        if self.periodo_id and self.fecha:
            if not self.periodo.fecha_inicio <= self.fecha <= self.periodo.fecha_fin:
                raise ValidationError({'fecha': 'La fecha debe pertenecer al período escolar.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class JornadaAsistencia(models.Model):
    """Cabecera diaria que congela el contexto y versiona el pase de lista."""

    sede = models.ForeignKey(
        'multisede.Sede', on_delete=models.PROTECT, related_name='jornadas_asistencia'
    )
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, related_name='jornadas_asistencia'
    )
    grado = models.ForeignKey(
        GradoSeccion, on_delete=models.PROTECT, related_name='jornadas_asistencia'
    )
    fecha = models.DateField(db_index=True)
    version = models.PositiveIntegerField(default=0)
    creada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='jornadas_asistencia_creadas',
    )
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('sede', 'periodo', 'grado', 'fecha'),
                name='academico_jornada_asistencia_contexto_unico',
            ),
        ]
        ordering = ['-fecha', 'grado__nombre']

    def clean(self):
        super().clean()
        if self.grado_id and self.periodo_id and self.grado.periodo_id != self.periodo_id:
            raise ValidationError({'grado': 'La sección no pertenece al período indicado.'})
        if self.periodo_id and self.sede_id and self.periodo.sede_id != self.sede_id:
            raise ValidationError({'sede': 'La sede no coincide con el período indicado.'})
        if self.periodo_id and self.fecha:
            if not self.periodo.fecha_inicio <= self.fecha <= self.periodo.fecha_fin:
                raise ValidationError({'fecha': 'La fecha debe pertenecer al período escolar.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Asistencia(models.Model):
    ESTADOS = [('P', 'Presente'), ('A', 'Ausente'), ('J', 'Justificado'), ('R', 'Retardado')]

    alumno    = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='asistencias'
    )
    fecha     = models.DateField(db_index=True)
    presente  = models.BooleanField(default=True)
    # justificada solo tiene sentido cuando presente=False
    justificada  = models.BooleanField(default=False)
    # Fuente de verdad para escrituras nuevas; presente/justificada se derivan
    # de este campo para no romper reportes existentes que ya los leen.
    estado    = models.CharField(max_length=1, choices=ESTADOS, null=True, blank=True)
    observacion  = models.CharField(max_length=200, blank=True)
    # Marca de versión para detectar guardados hechos sobre datos viejos (el
    # portal docente y el panel escriben el mismo registro). null en registros
    # anteriores a este campo.
    actualizado_en = models.DateTimeField(auto_now=True, null=True)
    # Auditoría automática: registra cada cambio con usuario, fecha y valores anteriores
    history = HistoricalRecords()
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='asistencias_registradas'
    )
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='asistencias',
    )
    grado = models.ForeignKey(
        GradoSeccion, on_delete=models.PROTECT, null=True, blank=True,
        related_name='asistencias',
    )
    sede = models.ForeignKey(
        'multisede.Sede', on_delete=models.PROTECT, null=True, blank=True,
        related_name='asistencias_academicas',
    )
    jornada = models.ForeignKey(
        JornadaAsistencia, on_delete=models.PROTECT, null=True, blank=True,
        related_name='registros',
    )

    class Meta:
        unique_together = ('alumno', 'fecha')
        ordering = ['-fecha']
        verbose_name = 'Asistencia'
        verbose_name_plural = 'Asistencias'

    def __str__(self):
        estado = 'Presente' if self.presente else 'Ausente'
        return f"{self.alumno.nombre} {self.alumno.apellido} — {self.fecha} ({estado})"


# ─────────────────────────────────────────────
# HORARIO DE CLASES
# ─────────────────────────────────────────────
class HorarioClase(models.Model):
    DIAS = (
        ('lunes',     'Lunes'),
        ('martes',    'Martes'),
        ('miercoles', 'Miércoles'),
        ('jueves',    'Jueves'),
        ('viernes',   'Viernes'),
    )

    materia     = models.ForeignKey(
        Materia,
        on_delete=models.CASCADE,
        related_name='horarios'
    )
    dia_semana  = models.CharField(max_length=10, choices=DIAS)
    hora_inicio = models.TimeField()
    hora_fin    = models.TimeField()
    aula        = models.CharField(max_length=50, blank=True)

    # ── Rediseño de horarios (2026-09) ──────────────────────────────────
    # `bloque` es opcional: los HorarioClase creados antes de este cambio
    # (o creados manualmente sin pasar por un PaqueteHorario) siguen sin
    # bloque, usando hora_inicio/hora_fin propios como fuente de verdad —
    # eso NO cambia. Cuando una clase sí se crea/mueve a partir de un
    # BloqueHorario, hora_inicio/hora_fin se copian del bloque al guardar
    # (ver services/vistas del generador) para no desincronizarlos.
    bloque = models.ForeignKey(
        'BloqueHorario',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='clases',
    )
    # Si está en True, el generador automático no la toca ni la cuenta como
    # bloque libre al regenerar el paquete.
    pineado = models.BooleanField(default=False)
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='horarios',
    )
    grado = models.ForeignKey(
        GradoSeccion, on_delete=models.PROTECT, null=True, blank=True,
        related_name='horarios',
    )

    class Meta:
        ordering = ['dia_semana', 'hora_inicio']
        indexes = [
            # Cubre el filtro de _buscar_choque_horario (dia_semana) y el
            # patrón de ordering/consulta por rango horario dentro del día.
            models.Index(fields=['dia_semana', 'hora_inicio']),
        ]
        verbose_name = 'Horario de Clase'
        verbose_name_plural = 'Horarios de Clases'

    def clean(self):
        # Validar que la hora de fin sea posterior a la hora de inicio
        if self.hora_inicio and self.hora_fin:
            if self.hora_fin <= self.hora_inicio:
                raise ValidationError(
                    'La hora de fin debe ser posterior a la hora de inicio.'
                )
        if self.grado_id and self.periodo_id and self.grado.periodo_id != self.periodo_id:
            raise ValidationError({'grado': 'El grado no pertenece al período del horario.'})
        if self.materia_id and self.grado_id and self.materia.grado_id:
            if self.materia.grado_id != self.grado_id:
                raise ValidationError({'materia': 'La materia no pertenece al grado del horario.'})
        if self.bloque_id:
            paquete = self.bloque.paquete
            if self.periodo_id and paquete.periodo_id and paquete.periodo_id != self.periodo_id:
                raise ValidationError({'bloque': 'El bloque pertenece a otro período escolar.'})
            if self.materia_id and self.materia.sede_id != paquete.sede_id:
                raise ValidationError({'materia': 'La materia y el bloque pertenecen a sedes distintas.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.materia.nombre} — {self.get_dia_semana_display()} "
            f"{self.hora_inicio:%H:%M}-{self.hora_fin:%H:%M}"
        )


# ─────────────────────────────────────────────
# EVENTO DE CALENDARIO (personal del docente)
# ─────────────────────────────────────────────
class EventoCalendario(models.Model):
    TIPOS = (
        ('recordatorio', 'Recordatorio'),
        ('evaluacion',    'Evaluación'),
        ('reunion',       'Reunión'),
        ('entrega',       'Entrega'),
        ('otro',          'Otro'),
    )

    propietario  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='eventos_calendario'
    )
    titulo       = models.CharField(max_length=120)
    fecha        = models.DateField()
    hora         = models.TimeField(null=True, blank=True)
    descripcion  = models.TextField(blank=True)
    tipo         = models.CharField(max_length=15, choices=TIPOS, default='recordatorio')
    creado_en    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fecha', 'hora']
        verbose_name = 'Evento de Calendario'
        verbose_name_plural = 'Eventos de Calendario'

    def __str__(self):
        return f"{self.titulo} — {self.fecha}"


# ─────────────────────────────────────────────
# INCIDENTE DISCIPLINARIO
# ─────────────────────────────────────────────
def validar_tamano_adjunto(archivo):
    limite_mb = 5
    if archivo.size > limite_mb * 1024 * 1024:
        raise ValidationError(f'El adjunto no puede superar {limite_mb}MB.')


class IncidenteDisciplinario(models.Model):
    SEVERIDADES = [('L', 'Leve'), ('M', 'Moderado'), ('G', 'Grave')]

    alumno      = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='incidentes'
    )
    fecha       = models.DateField(auto_now_add=True)
    descripcion = models.TextField()
    severidad   = models.CharField(max_length=1, choices=SEVERIDADES)
    # Pillow valida que el contenido sea una imagen real (no solo la extensión)
    adjunto     = models.ImageField(
        upload_to='incidentes/', blank=True, null=True,
        validators=[validar_tamano_adjunto],
    )
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='incidentes_registrados'
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha', '-created_at']
        verbose_name = 'Incidente Disciplinario'
        verbose_name_plural = 'Incidentes Disciplinarios'

    def __str__(self):
        return f"{self.alumno.nombre} {self.alumno.apellido} — {self.fecha} ({self.get_severidad_display()})"


# ─────────────────────────────────────────────
# ALERTA DE RENDIMIENTO
# ─────────────────────────────────────────────
class AlertaRendimiento(models.Model):
    alumno = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='alertas_rendimiento'
    )
    materia = models.ForeignKey(
        Materia,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='alertas_rendimiento'
    )
    lapso = models.ForeignKey(
        Lapso,
        on_delete=models.CASCADE,
        related_name='alertas_rendimiento'
    )
    promedio_actual = models.DecimalField(max_digits=5, decimal_places=2)
    umbral_minimo = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resuelta_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Alerta de Rendimiento'
        verbose_name_plural = 'Alertas de Rendimiento'

    def __str__(self):
        estado = 'activa' if self.activa else 'resuelta'
        return f"{self.alumno.nombre} {self.alumno.apellido} — {self.materia} ({self.lapso.nombre}, {estado})"


# ─────────────────────────────────────────────
# MATERIAL DE ESTUDIO
# ─────────────────────────────────────────────
class MaterialEstudio(models.Model):
    materia     = models.ForeignKey(
        Materia,
        on_delete=models.CASCADE,
        related_name='materiales'
    )
    titulo      = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    archivo     = models.FileField(
        upload_to='materiales/', blank=True, null=True,
        validators=[validar_tamano_adjunto],
    )
    enlace      = models.URLField(blank=True)
    publicado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='materiales_publicados'
    )
    fecha       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        verbose_name = 'Material de Estudio'
        verbose_name_plural = 'Materiales de Estudio'

    def __str__(self):
        return f"{self.materia.nombre} — {self.titulo}"


# ─────────────────────────────────────────────
# DOCENTE
# ─────────────────────────────────────────────
class Docente(models.Model):
    user     = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='docente',
    )
    empleado = models.OneToOneField(
        'rrhh.Empleado',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='docente',
    )

    titulo_academico    = models.CharField(max_length=120, blank=True, default='')
    especialidad        = models.CharField(max_length=120, blank=True, default='')
    fecha_ingreso        = models.DateField(null=True, blank=True)
    telefono             = models.CharField(max_length=30, blank=True, default='')
    email_institucional  = models.EmailField(blank=True, default='')
    observaciones        = models.TextField(blank=True, default='')
    activo                = models.BooleanField(default=True)

    sede = models.ForeignKey(
        'multisede.Sede',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='docentes',
    )

    history = HistoricalRecords()

    # ── Rediseño de horarios (2026-09) ──────────────────────────────────
    # Topes usados por el generador automático de horarios para no saturar
    # a un docente. Ambos opcionales: si quedan en null, el generador no
    # aplica ningún límite de carga horaria semanal para ese docente.
    horas_semanales_tope = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Máximo de bloques de 45 min que puede dictar por semana.',
    )
    horas_semanales_objetivo = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Cantidad de bloques semanales deseada (referencia, no un tope duro).',
    )

    class Meta:
        ordering = ['user__first_name']
        verbose_name = 'Docente'
        verbose_name_plural = 'Docentes'

    def __str__(self):
        nombre_completo = f"{self.user.first_name} {self.user.last_name}".strip()
        return nombre_completo or self.user.username

    @property
    def materias_asignadas(self):
        return Materia.objects.filter(docente=self.user, activa=True)


# ─────────────────────────────────────────────
# REDISEÑO DE HORARIOS (2026-09)
# ─────────────────────────────────────────────
class PaqueteHorario(models.Model):
    """
    Agrupa el horario de uno o más grados (PaqueteHorarioGrado) bajo un mismo
    periodo escolar, con sus propios bloques/recesos (BloqueHorario). Un
    grado_seccion no puede pertenecer a dos paquetes del mismo periodo_escolar
    a la vez — ver PaqueteHorarioGrado y la validación en la vista de grados.
    """
    ESTADO_CHOICES = (
        ('borrador',  'Borrador'),
        ('publicado', 'Publicado'),
    )

    nombre          = models.CharField(max_length=150)
    periodo_escolar = models.CharField(max_length=20)
    sede = models.ForeignKey(
        'multisede.Sede',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='paquetes_horario',
    )
    periodo = models.ForeignKey(
        PeriodoEscolar, on_delete=models.PROTECT, null=True, blank=True,
        related_name='paquetes_horario',
    )
    estado = models.CharField(max_length=10, choices=ESTADO_CHOICES, default='borrador')
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='paquetes_horario_creados',
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado_en']
        verbose_name = 'Paquete de Horario'
        verbose_name_plural = 'Paquetes de Horario'

    def __str__(self):
        return f"{self.nombre} ({self.periodo_escolar}) — {self.get_estado_display()}"


class PaqueteHorarioGrado(models.Model):
    """
    Un grado_seccion incluido dentro de un PaqueteHorario. La regla de
    "un solo paquete vigente por grado+periodo" se valida a nivel de
    aplicación (no puede ser unique_together de BD porque cruza distintos
    PaqueteHorario) — ver PaqueteHorarioGradosView.post en views.py.
    """
    paquete = models.ForeignKey(
        PaqueteHorario, on_delete=models.CASCADE, related_name='grados'
    )
    grado_seccion = models.CharField(max_length=50)
    grado = models.ForeignKey(
        GradoSeccion, on_delete=models.PROTECT, null=True, blank=True,
        related_name='asignaciones_paquete',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=('paquete', 'grado_seccion'),
                name='academico_paquete_grado_legacy_unico',
            ),
            models.UniqueConstraint(
                fields=('grado',), condition=models.Q(grado__isnull=False),
                name='academico_seccion_un_paquete_por_periodo',
            ),
        ]
        verbose_name = 'Grado de Paquete de Horario'
        verbose_name_plural = 'Grados de Paquete de Horario'

    def __str__(self):
        return f"{self.grado_seccion} — {self.paquete.nombre}"


class BloqueHorario(models.Model):
    """
    Un bloque de la grilla de un PaqueteHorario (clase o receso). Los
    recesos son iguales para todos los grados del paquete — se definen aquí,
    a nivel de paquete, no por grado.
    """
    TIPO_CHOICES = (
        ('clase',  'Clase'),
        ('receso', 'Receso'),
        ('inicio', 'Inicio / entonación del himno'),
    )

    paquete     = models.ForeignKey(
        PaqueteHorario, on_delete=models.CASCADE, related_name='bloques'
    )
    dia_semana  = models.CharField(max_length=10, choices=HorarioClase.DIAS)
    orden       = models.PositiveSmallIntegerField()
    hora_inicio = models.TimeField()
    hora_fin    = models.TimeField()
    tipo        = models.CharField(max_length=10, choices=TIPO_CHOICES, default='clase')

    class Meta:
        unique_together = ('paquete', 'dia_semana', 'orden')
        ordering = ['dia_semana', 'orden']
        verbose_name = 'Bloque de Horario'
        verbose_name_plural = 'Bloques de Horario'

    def clean(self):
        if self.hora_inicio and self.hora_fin:
            if self.hora_fin <= self.hora_inicio:
                raise ValidationError(
                    'La hora de fin del bloque debe ser posterior a la hora de inicio.'
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.paquete.nombre} — {self.get_dia_semana_display()} "
            f"#{self.orden} {self.hora_inicio:%H:%M}-{self.hora_fin:%H:%M} ({self.tipo})"
        )


class DisponibilidadDocente(models.Model):
    """
    Franja horaria en la que un docente declara estar disponible para
    dictar clases. Se declara por franjas libres (día + hora_inicio +
    hora_fin), no marcando celdas de una grilla. Un docente SIN ninguna
    franja declarada se trata como "disponible siempre" en el generador
    (ver _ejecutar_algoritmo_paquete), para no romper docentes que aún no
    configuraron nada.
    """
    docente     = models.ForeignKey(
        Docente, on_delete=models.CASCADE, related_name='disponibilidades'
    )
    dia_semana  = models.CharField(max_length=10, choices=HorarioClase.DIAS)
    hora_inicio = models.TimeField()
    hora_fin    = models.TimeField()

    class Meta:
        ordering = ['dia_semana', 'hora_inicio']
        verbose_name = 'Disponibilidad de Docente'
        verbose_name_plural = 'Disponibilidades de Docentes'

    def clean(self):
        if self.hora_inicio and self.hora_fin:
            if self.hora_fin <= self.hora_inicio:
                raise ValidationError(
                    'La hora de fin de la franja debe ser posterior a la hora de inicio.'
                )
            solapadas = DisponibilidadDocente.objects.filter(
                docente=self.docente, dia_semana=self.dia_semana,
            ).exclude(pk=self.pk)
            for otra in solapadas:
                if self.hora_inicio < otra.hora_fin and otra.hora_inicio < self.hora_fin:
                    raise ValidationError(
                        f"Esta franja se solapa con otra ya declarada para el "
                        f"{self.get_dia_semana_display()} de {otra.hora_inicio:%H:%M} "
                        f"a {otra.hora_fin:%H:%M}."
                    )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.docente} — {self.get_dia_semana_display()} "
            f"{self.hora_inicio:%H:%M}-{self.hora_fin:%H:%M}"
        )


class GeneracionHorarioSnapshot(models.Model):
    """
    Snapshot de una corrida de GenerarHorarioView para un PaqueteHorario,
    usado para poder deshacerla (POST horarios/generar/deshacer/).
    `horarios_creados_ids`: ids de HorarioClase creados en esa corrida
    (se eliminan al deshacer).
    `horarios_eliminados`: lista de dicts con los campos de los HorarioClase
    borrados en esa corrida (se recrean al deshacer).
    """
    paquete = models.ForeignKey(
        PaqueteHorario, on_delete=models.CASCADE, related_name='snapshots_generacion'
    )
    horarios_creados_ids = models.JSONField(default=list)
    horarios_eliminados   = models.JSONField(default=list)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='snapshots_generacion_horario',
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    deshecho  = models.BooleanField(default=False)

    class Meta:
        ordering = ['-creado_en']
        verbose_name = 'Snapshot de Generación de Horario'
        verbose_name_plural = 'Snapshots de Generación de Horario'

    def __str__(self):
        return f"Snapshot #{self.pk} — {self.paquete.nombre} ({self.creado_en:%Y-%m-%d %H:%M})"
