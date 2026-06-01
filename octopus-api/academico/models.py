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

    # Multi-sede
    sede = models.ForeignKey(
        'multisede.Sede',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='materias',
        verbose_name='Sede',
    )

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
# ASISTENCIA
# ─────────────────────────────────────────────
class Asistencia(models.Model):
    alumno    = models.ForeignKey(
        'secretaria.Alumno',
        on_delete=models.CASCADE,
        related_name='asistencias'
    )
    fecha     = models.DateField()
    presente  = models.BooleanField(default=True)
    # justificada solo tiene sentido cuando presente=False
    justificada  = models.BooleanField(default=False)
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
