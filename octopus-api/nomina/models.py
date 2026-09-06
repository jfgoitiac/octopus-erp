from decimal import Decimal, ROUND_HALF_UP
from django.core.exceptions import ValidationError
from django.db import models
from django.core.validators import MinValueValidator
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import date

CENTAVO = Decimal('0.01')


def redondear(valor):
    """Redondeo comercial (0.005 siempre sube), no el ROUND_HALF_EVEN por defecto de Decimal."""
    return valor.quantize(CENTAVO, rounding=ROUND_HALF_UP)


class ParametroLegalNomina(models.Model):
    vigente_desde = models.DateField(unique=True)
    porcentaje_sso = models.DecimalField(max_digits=6, decimal_places=4, validators=[MinValueValidator(Decimal('0'))])
    porcentaje_lph = models.DecimalField(max_digits=6, decimal_places=4, validators=[MinValueValidator(Decimal('0'))])
    descripcion = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['-vigente_desde']
        verbose_name = 'Parámetro legal de nómina'
        verbose_name_plural = 'Parámetros legales de nómina'

    def __str__(self):
        return f'Vigente desde {self.vigente_desde}'

    @classmethod
    def vigente_para(cls, periodo):
        return cls.objects.filter(vigente_desde__lte=periodo).order_by('-vigente_desde').first()


class Empleado(models.Model):
    TIPOS_PERSONAL = (
        ('administrativo', 'Administrativo'),
        ('obrero', 'Obrero'),
        ('docente', 'Docente'),
        ('directivo', 'Directivo'),
    )
    
    cedula = models.CharField(max_length=15, unique=True)
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    tipo_personal = models.CharField(max_length=20, choices=TIPOS_PERSONAL)
    fecha_ingreso = models.DateField()
    sueldo_base_ves = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    es_pensionado = models.BooleanField(default=False)

    empleado_rrhh = models.ForeignKey(
        'rrhh.Empleado',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='registros_nomina',
        help_text='Ficha maestra correspondiente en el módulo de RRHH.',
    )

    def __str__(self):
        return f"{self.cedula} - {self.nombre} {self.apellido}"

    def clean(self):
        if self.empleado_rrhh_id and Empleado.objects.filter(
            empleado_rrhh_id=self.empleado_rrhh_id
        ).exclude(pk=self.pk).exists():
            raise ValidationError(
                'Este empleado de RRHH ya está vinculado a otra ficha de nómina.'
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class ConceptoNomina(models.Model):
    """
    Parametrización de un concepto de nómina (asignación o deducción) para el
    motor de cálculo que hoy vive en el frontend (constants/avec.js + convenios/).
    Este modelo NO calcula nómina: solo almacena las tasas/montos que el
    frontend lee para armar el `config` que pasa a calcAVEC/calcSueldoBase.
    """
    TIPO_CHOICES = (('asignacion', 'Asignación'), ('deduccion', 'Deducción'))
    BASE_CALCULO_CHOICES = (
        ('sueldo_base', 'Porcentaje del sueldo base'),
        ('monto_fijo', 'Monto fijo'),
        ('otro_concepto', 'Igual a otro concepto (ej. prima geográfica = prima docente)'),
    )
    MONEDA_CHOICES = (('USD', 'USD'), ('VES', 'VES'))
    ALCANCE_CHOICES = (
        ('todos', 'Todos'),
        ('docente', 'Docente'),
        ('administrativo', 'Administrativo'),
    )
    # Códigos reconocidos por el motor de cálculo del frontend (calcAVEC en
    # avec.js) para los conceptos universales *escalares* (una sola tasa/monto).
    # Postgrado NO está aquí: es una tabla por título (DR/PHD/MSC/...), no un
    # escalar — sigue hardcodeada en avec.js hasta que se modele aparte.
    CODIGO_CHOICES = (
        ('', 'Sin código (concepto libre, no afecta cálculo automático)'),
        ('ANTIGUEDAD_PCT_ANIO', 'Antigüedad — % del sueldo base por año de servicio'),
        ('HIJO_FIJO', 'Prima por hijo — monto fijo por hijo'),
        ('ASISTENCIAL_FIJO', 'Prima asistencial — monto fijo'),
    )
    codigo = models.CharField(
        max_length=30, choices=CODIGO_CHOICES, blank=True, default='',
        help_text='Si se selecciona, este concepto alimenta directamente el cálculo de nómina del frontend (calcAVEC) en vez de ser solo informativo.',
    )

    configuracion = models.ForeignKey(
        'secretaria.ConfiguracionSistema', null=True, blank=True,
        on_delete=models.CASCADE, related_name='conceptos_nomina',
        help_text='Configuración del sistema a la que pertenece este concepto. Nulo = concepto universal de referencia.',
    )
    convenio = models.CharField(
        max_length=20, blank=True, default='',
        help_text="Vacío = universal (Capa 1, disponible en cualquier convenio). 'avec_ve' = exclusivo del convenio AVEC (Capa 2).",
    )
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=15, choices=TIPO_CHOICES)
    base_calculo = models.CharField(max_length=20, choices=BASE_CALCULO_CHOICES, default='monto_fijo')
    concepto_referencia = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='derivados',
        help_text="Solo si base_calculo='otro_concepto': el concepto del que deriva su monto.",
    )
    porcentaje = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    monto = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    moneda = models.CharField(max_length=3, choices=MONEDA_CHOICES, default='USD')
    alcance_personal = models.CharField(max_length=20, choices=ALCANCE_CHOICES, default='todos')
    orden_aplicacion = models.PositiveSmallIntegerField(default=0)
    vigente_desde = models.DateField(null=True, blank=True)
    vigente_hasta = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        ordering = ['orden_aplicacion', 'nombre']

    def __str__(self):
        return self.nombre


class RegistroNomina(models.Model):
    ESTADO_CHOICES = (('abierto', 'Abierto'), ('cerrado', 'Cerrado'))

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE)
    fecha_proceso = models.DateField(auto_now_add=True)
    mes_correspondiente = models.PositiveSmallIntegerField()
    anio_correspondiente = models.PositiveSmallIntegerField()
    estado = models.CharField(
        max_length=10, choices=ESTADO_CHOICES, default='abierto',
        help_text='Un registro cerrado ya no se recalcula automáticamente si cambian los datos maestros del empleado.',
    )

    # Montos calculados
    monto_sso = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Seguro Social (4%)
    monto_lph = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Ley Política Habitacional (1%)
    monto_cestaticket = models.DecimalField(
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    porcentaje_sso_aplicado = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    porcentaje_lph_aplicado = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)

    # Incentivos en USD (Bonos de Guerra / Incentivos Internos)
    bono_usd = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    tasa_pago_bono = models.DecimalField(
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
    )
    total_pagar_ves = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['empleado', 'mes_correspondiente', 'anio_correspondiente'],
                name='nomina_empleado_periodo_unico',
            )
        ]

    def calcular_deducciones(self):
        """
        Lógica según ley venezolana utilizando redondeo matemático seguro (.quantize).
        Si el empleado es pensionado, no se le descuenta SSO ni LPH.
        """
        parametro = ParametroLegalNomina.vigente_para(
            date(self.anio_correspondiente, self.mes_correspondiente, 1)
        )
        if not parametro:
            raise ValidationError(
                f'No hay parámetros legales de nómina (SSO/LPH) configurados para '
                f'{self.mes_correspondiente}/{self.anio_correspondiente}. '
                f'Configura un ParametroLegalNomina vigente para ese período antes de generar la nómina.'
            )
        self.porcentaje_sso_aplicado = parametro.porcentaje_sso
        self.porcentaje_lph_aplicado = parametro.porcentaje_lph

        if not self.empleado.es_pensionado:
            self.monto_sso = redondear(self.empleado.sueldo_base_ves * self.porcentaje_sso_aplicado)
            self.monto_lph = redondear(self.empleado.sueldo_base_ves * self.porcentaje_lph_aplicado)
        else:
            # Si el estatus cambia a pensionado, garantizamos que las deducciones se vuelvan cero
            self.monto_sso = Decimal('0.00')
            self.monto_lph = Decimal('0.00')

    def save(self, *args, **kwargs):
        # 1. Forzar el cálculo de las deducciones antes de guardar
        self.calcular_deducciones()

        # 2. Calcular el contravalor del bono en Bolívares
        bono_en_ves = redondear(self.bono_usd * self.tasa_pago_bono)

        # 3. Ecuación final de la nómina: (Sueldo + Bono + Cestaticket) - Deducciones de Ley
        total = (self.empleado.sueldo_base_ves + bono_en_ves + self.monto_cestaticket) - (self.monto_sso + self.monto_lph)
        self.total_pagar_ves = redondear(total)

        super().save(*args, **kwargs)


# ─────────────────────────────────────────────
# SEÑALES (SIGNALS) PARA RE-CÁLCULO AUTOMÁTICO
# ─────────────────────────────────────────────

@receiver(post_save, sender=Empleado)
def actualizar_nominas_por_cambio_maestro(sender, instance, created, **kwargs):
    """
    Si el sueldo base o el estatus de pensionado cambia, recalculamos
    automáticamente los registros de nómina del mes actual.
    """
    if not created:
        hoy = timezone.now().date()
        nominas_activas = RegistroNomina.objects.filter(
            empleado=instance,
            mes_correspondiente=hoy.month,
            anio_correspondiente=hoy.year,
        ).exclude(estado='cerrado')

        for nomina in nominas_activas:
            # Al llamar a save(), se ejecuta la lógica de calcular_deducciones()
            nomina.save()