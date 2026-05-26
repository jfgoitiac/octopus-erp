from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


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
    
    def __str__(self):
        return f"{self.cedula} - {self.nombre} {self.apellido}"


class ConceptoNomina(models.Model):
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=15, choices=(('asignacion', 'Asignación'), ('deduccion', 'Deducción')))
    porcentaje = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fijo = models.BooleanField(default=False) # Si es un monto fijo en lugar de porcentaje

    def __str__(self):
        return self.nombre


class RegistroNomina(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE)
    fecha_proceso = models.DateField(auto_now_add=True)
    mes_correspondiente = models.PositiveSmallIntegerField()
    anio_correspondiente = models.PositiveSmallIntegerField()
    
    # Montos calculados
    monto_sso = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Seguro Social (4%)
    monto_lph = models.DecimalField(max_digits=12, decimal_places=2, default=0) # Ley Política Habitacional (1%)
    monto_cestaticket = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Incentivos en USD (Bonos de Guerra / Incentivos Internos)
    bono_usd = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tasa_pago_bono = models.DecimalField(max_digits=12, decimal_places=2)
    total_pagar_ves = models.DecimalField(max_digits=15, decimal_places=2)

    def calcular_deducciones(self):
        """
        Lógica según ley venezolana utilizando redondeo matemático seguro (.quantize).
        Si el empleado es pensionado, no se le descuenta SSO ni LPH.
        """
        if not self.empleado.es_pensionado:
            # Eliminadas las líneas con errores. Usamos Decimal directo y redondeamos a 2 decimales.
            self.monto_sso = (self.empleado.sueldo_base_ves * Decimal('0.04')).quantize(Decimal('0.01'))
            self.monto_lph = (self.empleado.sueldo_base_ves * Decimal('0.01')).quantize(Decimal('0.01'))
        else:
            # Si el estatus cambia a pensionado, garantizamos que las deducciones se vuelvan cero
            self.monto_sso = Decimal('0.00')
            self.monto_lph = Decimal('0.00')
        
    def save(self, *args, **kwargs):
        # 1. Forzar el cálculo de las deducciones antes de guardar
        self.calcular_deducciones()
        
        # 2. Calcular el contravalor del bono en Bolívares
        bono_en_ves = (self.bono_usd * self.tasa_pago_bono).quantize(Decimal('0.01'))
        
        # 3. Ecuación final de la nómina: (Sueldo + Bono + Cestaticket) - Deducciones de Ley
        total = (self.empleado.sueldo_base_ves + bono_en_ves + self.monto_cestaticket) - (self.monto_sso + self.monto_lph)
        self.total_pagar_ves = total.quantize(Decimal('0.01'))
        
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
            anio_correspondiente=hoy.year
        )
        
        for nomina in nominas_activas:
            # Al llamar a save(), se ejecuta la lógica de calcular_deducciones()
            nomina.save()