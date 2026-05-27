from datetime import date
from django.db import models
from django.db.models import Sum
from secretaria.models import Alumno
from django.conf import settings
from django.core.exceptions import ValidationError
from decimal import Decimal
import uuid

class ParametroGlobal(models.Model):
    """Almacena configuraciones globales como el monto base de mensualidad"""
    clave = models.CharField(max_length=50, unique=True)
    valor = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.clave}: {self.valor}"

class TransferenciaInterna(models.Model):
    """Modelo para registrar movimientos entre cuentas propias de la institución"""
    banco_origen = models.ForeignKey(
        'BancoInstitucional', 
        on_delete=models.PROTECT, 
        related_name='transferencias_salientes',
        null=True
    )
    banco_destino = models.ForeignKey(
        'BancoInstitucional', 
        on_delete=models.PROTECT, 
        related_name='transferencias_entrantes',
        null=True
    )
    monto_ves = models.DecimalField(max_digits=20, decimal_places=2)
    fecha = models.DateTimeField(auto_now_add=True)
    observaciones = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Transferencia {self.id} - {self.monto_ves} VES"

class BancoInstitucional(models.Model):
    TIPOS = (
        ('general',        'General (todos los métodos)'),
        ('transferencia',  'Transferencia Bancaria'),
        ('pago_movil',     'Pago Móvil'),
        ('punto_de_venta', 'Punto de Venta'),
        ('zelle',          'Zelle'),
    )

    nombre        = models.CharField(max_length=50, unique=True)
    numero_cuenta = models.CharField(max_length=20, blank=True, null=True)
    activo        = models.BooleanField(default=True)
    tipo          = models.CharField(max_length=20, choices=TIPOS, default='general')

    def __str__(self):
        return self.nombre


class TasaCambio(models.Model):
    fecha = models.DateTimeField(auto_now_add=True)
    valor_bs = models.DecimalField(max_digits=12, decimal_places=4)
    fuente = models.CharField(max_length=50, default='BCV')

    class Meta:
        verbose_name_plural = "Tasas de Cambio"
        ordering = ['-fecha']

    def __str__(self):
        return f"{self.valor_bs} VES - {self.fecha.strftime('%d/%m/%Y')}"

class Pago(models.Model):
    METODOS = (
        ('transferencia', 'Transferencia Bancaria'),
        ('pago_movil', 'Pago Móvil'),
        ('punto_de_venta', 'Punto de Venta'),
        ('zelle', 'Zelle'),
        ('efectivo', 'Efectivo Divisas'),
        ('efectivo_ves', 'Efectivo Bolívares'),
    )

    ESTATUS_PAGO = (
        ('completado', 'Completado'),
        ('anulado', 'Anulado'),
        ('en_revision', 'En Revisión'),
    )

    CONCEPTOS = (
        ('mensualidad', 'Mensualidad Escolar'),
        ('inscripcion', 'Inscripción'),
        ('materiales', 'Materiales'),
        ('actividades', 'Actividades Extraescolares'),
        ('multa', 'Multa'),
        ('otro', 'Otro'),
    )

    alumno = models.ForeignKey(Alumno, on_delete=models.PROTECT, related_name='pagos')
    usuario_receptor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    operacion_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    factura_id = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False, db_index=True)
    banco_receptor = models.ForeignKey(BancoInstitucional, on_delete=models.PROTECT, null=True, blank=True)
    metodo_pago = models.CharField(max_length=20, choices=METODOS)
    concepto = models.CharField(max_length=20, choices=CONCEPTOS, default='mensualidad')
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2, help_text="Monto captado en divisas")
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, help_text="Tasa BCV del momento de la transacción")
    monto_ves = models.DecimalField(
        max_digits=20,
        decimal_places=2,
        editable=False,
        help_text="Equivalente contable en Bolívares"
    )
    fecha_pago = models.DateTimeField(auto_now_add=True)
    referencia = models.CharField(max_length=100, blank=True, null=True)
    observaciones = models.TextField(blank=True, null=True)
    representante_documento = models.CharField(max_length=30, blank=True, null=True)
    estatus = models.CharField(
        max_length=20,
        choices=ESTATUS_PAGO,
        default='completado',
        db_index=True # Mejora: Indexado para reportes de auditoría rápidos
    )
    representante_nombre = models.CharField(max_length=150, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['referencia'],
                condition=models.Q(estatus='completado'),
                name='unique_referencia_pago_completado'
            )
        ]

    def __str__(self):
        return f"Pago {self.id} - {self.alumno.nombre} ({self.monto_usd} USD) - {self.operacion_uuid}"
    
    def clean(self):
        # Validación extra de seguridad: evitar referencias duplicadas ignorando espacios
        ref_limpia = self.referencia.strip() if self.referencia else None
        if ref_limpia:
            if Pago.objects.filter(referencia=ref_limpia, estatus='completado').exclude(pk=self.pk).exists():
                raise ValidationError({
                    'referencia': f"Error Crítico: La referencia {ref_limpia} ya fue procesada anteriormente."
                })

        # Validación de integridad matemática: Consistencia entre USD, Tasa y VES
        # Se tolera un margen de error centesimal (0.05 VES) para compensar redondeos en la UI.
        if self.monto_usd is not None and self.tasa_aplicada is not None and self.monto_ves is not None:
            monto_esperado_ves = (self.monto_usd * self.tasa_aplicada).quantize(Decimal('0.01'))
            discrepancia = abs(self.monto_ves - monto_esperado_ves)

            if discrepancia > Decimal('0.05'):
                raise ValidationError({
                    'monto_ves': (
                        f"Discrepancia de integridad: El monto en bolívares ({self.monto_ves}) "
                        f"no coincide con el cálculo esperado ({monto_esperado_ves}) según la "
                        f"tasa aplicada ({self.tasa_aplicada}). Diferencia: {discrepancia}."
                    )
                })

    def save(self, *args, **kwargs):
        """
        Lógica unificada de guardado: Generación de referencia para efectivo,
        validación de limpieza y cálculo de conversión VES.
        """
        is_new = self.pk is None

        # 1. Referencia automática para efectivo en divisas
        if self.metodo_pago == 'efectivo' and not self.referencia:
            self.referencia = f"EFECT-{uuid.uuid4().hex[:8].upper()}"

        # 2. Validación (ejecuta clean())
        self.full_clean()

        # Asegurar precisión decimal para los valores almacenados
        if self.monto_usd and not self.monto_ves:
            self.monto_ves = (self.monto_usd * self.tasa_aplicada).quantize(Decimal('0.01'))
        elif self.monto_ves and not self.monto_usd:
            self.monto_usd = (self.monto_ves / self.tasa_aplicada).quantize(Decimal('0.01'))

        self.monto_usd = Decimal(str(self.monto_usd)).quantize(Decimal('0.01'))
        self.monto_ves = Decimal(str(self.monto_ves)).quantize(Decimal('0.01'))
        self.tasa_aplicada = Decimal(str(self.tasa_aplicada or 0)).quantize(Decimal('0.0001'))

        super().save(*args, **kwargs)

        # 3. Generar factura_id después del primer guardado (requiere pk)
        if is_new and not self.factura_id:
            from django.utils import timezone as tz
            fecha = self.fecha_pago if self.fecha_pago else tz.now()
            date_prefix = fecha.strftime('%Y%m%d')
            count = Pago.objects.filter(factura_id__startswith=date_prefix).count()
            self.factura_id = f"{date_prefix}{count + 1:04d}"
            Pago.objects.filter(pk=self.pk).update(factura_id=self.factura_id)
class Mensualidad(models.Model):
    MESES = [
        (1, 'Enero'), (2, 'Febrero'), (3, 'Marzo'), (4, 'Abril'),
        (5, 'Mayo'), (6, 'Junio'), (7, 'Julio'), (8, 'Agosto'),
        (9, 'Septiembre'), (10, 'Octubre'), (11, 'Noviembre'), (12, 'Diciembre')
    ]

    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE, related_name='mensualidades')
    mes = models.PositiveSmallIntegerField(choices=MESES)
    anio = models.PositiveSmallIntegerField(default=date.today().year)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    pagado = models.BooleanField(default=False)
    fecha_pago = models.DateTimeField(blank=True, null=True)
    pagos = models.ManyToManyField(Pago, blank=True, related_name='mensualidades_pagadas')

    class Meta:
        unique_together = ('alumno', 'mes', 'anio')
        ordering = ['anio', 'mes']

    def __str__(self):
        return f"{self.alumno.nombre} - {self.get_mes_display()} {self.anio} - {'Pagado' if self.pagado else 'Pendiente'}"


class CuotaInscripcion(models.Model):
    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE, related_name='cuotas_inscripcion')
    periodo_escolar = models.CharField(max_length=20)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    pagado = models.BooleanField(default=False)
    fecha_pago = models.DateTimeField(blank=True, null=True)
    pagos = models.ManyToManyField(Pago, blank=True, related_name='cuotas_inscripcion_pagadas')

    class Meta:
        unique_together = ('alumno', 'periodo_escolar')
        ordering = ['-periodo_escolar']

    def __str__(self):
        return f"{self.alumno.nombre} - Inscripción {self.periodo_escolar} - {'Pagada' if self.pagado else 'Pendiente'}"


class CierreCaja(models.Model):
    usuario_cierre = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    fecha_cierre = models.DateTimeField(auto_now_add=True) # Cambio a DateTime para soportar turnos exactos
    
    # Lo que el sistema dice que debería haber
    monto_sistema_ves = models.DecimalField(max_digits=20, decimal_places=2, editable=False)
    
    # Lo que el cajero cuenta físicamente
    monto_declarado_ves = models.DecimalField(max_digits=20, decimal_places=2)
    
    # Cálculo de descuadre
    diferencia = models.DecimalField(max_digits=20, decimal_places=2, editable=False)
    
    observaciones = models.TextField(blank=True, null=True)
    validado_por_director = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # BENEFICIO TÉCNICO: Se resuelve el "Midnight Bug". 
        # Al usar el último registro como punto de partida en lugar de la fecha calendario,
        # se garantiza que no se pierdan pagos realizados después de medianoche 
        # si el arqueo ocurre tarde.
        
        ultimo_cierre = CierreCaja.objects.filter(
            usuario_cierre=self.usuario_cierre
        ).order_by('-fecha_cierre').first()

        filtros = models.Q(usuario_receptor=self.usuario_cierre, estatus='completado')
        
        if ultimo_cierre:
            # Sumamos todos los pagos realizados DESDE el último arqueo hasta este momento
            filtros &= models.Q(fecha_pago__gt=ultimo_cierre.fecha_cierre)
        else:
            # Si es el primer arqueo del usuario, tomamos los pagos del día calendario actual
            filtros &= models.Q(fecha_pago__date=date.today())

        total_arqueo = Pago.objects.filter(filtros).aggregate(total=models.Sum('monto_ves'))['total'] or Decimal('0.00')
        
        self.monto_sistema_ves = total_arqueo
        self.diferencia = Decimal(str(self.monto_declarado_ves)) - Decimal(str(self.monto_sistema_ves))
        
        super().save(*args, **kwargs)        
