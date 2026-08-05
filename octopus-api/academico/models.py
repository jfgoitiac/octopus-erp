from decimal import Decimal, ROUND_HALF_UP

from simple_history.models import HistoricalRecords
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


# ─────────────────────────────────────────────
# MATERIA
# ─────────────────────────────────────────────
class Materia(models.Model):
    nombre       = models.CharField(max_length=100)
    # Se autogenera en save() si se deja vacío
    codigo       = models.CharField(max_length=20, unique=True, blank=True)
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
        unique_together = ('nombre', 'grado_seccion')
        ordering = ['grado_seccion', 'nombre']
        verbose_name = 'Materia'
        verbose_name_plural = 'Materias'

    def save(self, *args, **kwargs):
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

    class Meta:
        unique_together = ('nombre', 'periodo_escolar')
        ordering = ['periodo_escolar', 'nombre']
        verbose_name = 'Lapso'
        verbose_name_plural = 'Lapsos'

    def __str__(self):
        return f"{self.nombre} ({self.periodo_escolar})"


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

    class Meta:
        unique_together = ('materia', 'lapso')
        verbose_name = 'Plan de Evaluación'
        verbose_name_plural = 'Planes de Evaluación'

    def __str__(self):
        return f"Plan — {self.materia.nombre} ({self.lapso.nombre})"


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
        verbose_name = 'Nota de Ítem de Evaluación'
        verbose_name_plural = 'Notas de Ítems de Evaluación'

    def __str__(self):
        valor = self.valor_numerico if self.valor_numerico is not None else self.valor_letra
        return f"{self.alumno.nombre} {self.alumno.apellido} — {self.item.nombre}: {valor}"


# ─────────────────────────────────────────────
# ASISTENCIA
# ─────────────────────────────────────────────
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
    # Auditoría automática: registra cada cambio con usuario, fecha y valores anteriores
    history = HistoricalRecords()
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='asistencias_registradas'
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

    class Meta:
        ordering = ['dia_semana', 'hora_inicio']
        verbose_name = 'Horario de Clase'
        verbose_name_plural = 'Horarios de Clases'

    def clean(self):
        # Validar que la hora de fin sea posterior a la hora de inicio
        if self.hora_inicio and self.hora_fin:
            if self.hora_fin <= self.hora_inicio:
                raise ValidationError(
                    'La hora de fin debe ser posterior a la hora de inicio.'
                )

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
