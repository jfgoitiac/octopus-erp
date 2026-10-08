from datetime import time
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import IntegrityError, models, transaction
from django.utils import timezone

from finanzas.monedas import convertir, redondear


MONEDAS = (('USD', 'USD'), ('VES', 'Bolívares'))
METODOS_PAGO = (
    ('transferencia', 'Transferencia bancaria'), ('pago_movil', 'Pago móvil'),
    ('punto_de_venta', 'Punto de venta'), ('zelle', 'Zelle'),
    ('efectivo_usd', 'Efectivo USD'), ('efectivo_ves', 'Efectivo VES'), ('otro', 'Otro'),
)


def dias_recordatorio_default():
    return [7, 3, 1, 0]


class PlantillaRecurrente(models.Model):
    proveedor = models.ForeignKey('finanzas.Proveedor', on_delete=models.PROTECT, related_name='plantillas_cxp')
    categoria = models.ForeignKey('finanzas.CategoriaGasto', on_delete=models.PROTECT, related_name='plantillas_cxp')
    sede = models.ForeignKey('multisede.Sede', null=True, blank=True, on_delete=models.PROTECT, related_name='plantillas_cxp')
    nombre = models.CharField(max_length=160)
    concepto = models.CharField(max_length=255)
    moneda = models.CharField(max_length=3, choices=MONEDAS, default='USD')
    monto = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    dia_emision = models.PositiveSmallIntegerField(default=1)
    dia_vencimiento = models.PositiveSmallIntegerField(default=1)
    activa = models.BooleanField(default=True)
    notas = models.TextField(blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='plantillas_cxp_creadas')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nombre']

    def clean(self):
        if not 1 <= self.dia_emision <= 31 or not 1 <= self.dia_vencimiento <= 31:
            raise ValidationError('Los días de plantilla deben estar entre 1 y 31.')

    def __str__(self):
        return self.nombre


class CuentaPorPagar(models.Model):
    ORIGENES = (('factura', 'Factura'), ('manual', 'Manual'), ('recurrente', 'Recurrente'))
    ESTADOS = (('pendiente', 'Pendiente'), ('parcial', 'Parcial'), ('pagada', 'Pagada'), ('anulada', 'Anulada'))
    PRIORIDADES = (('baja', 'Baja'), ('normal', 'Normal'), ('alta', 'Alta'), ('urgente', 'Urgente'))
    numero = models.CharField(max_length=20, unique=True, editable=False)
    origen = models.CharField(max_length=12, choices=ORIGENES, default='manual')
    proveedor = models.ForeignKey('finanzas.Proveedor', on_delete=models.PROTECT, related_name='cuentas_por_pagar')
    categoria = models.ForeignKey('finanzas.CategoriaGasto', on_delete=models.PROTECT, related_name='cuentas_por_pagar')
    sede = models.ForeignKey('multisede.Sede', null=True, blank=True, on_delete=models.PROTECT, related_name='cuentas_por_pagar')
    concepto = models.CharField(max_length=255)
    descripcion = models.TextField(blank=True)
    moneda = models.CharField(max_length=3, choices=MONEDAS, default='USD')
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, validators=[MinValueValidator(Decimal('0.0001'))])
    monto_documento = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    monto_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_ves = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    saldo = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    fecha_emision = models.DateField(default=timezone.localdate)
    fecha_vencimiento = models.DateField(db_index=True)
    prioridad = models.CharField(max_length=10, choices=PRIORIDADES, default='normal')
    responsable = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='cuentas_cxp_responsable')
    notas = models.TextField(blank=True)
    documento = models.FileField(upload_to='cuentas_pagar/documentos/', blank=True, validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp', 'pdf'])])
    etiquetas = models.JSONField(default=list, blank=True)
    monto_por_confirmar = models.BooleanField(default=False)
    estado = models.CharField(max_length=10, choices=ESTADOS, default='pendiente', db_index=True)
    recordatorio_pospuesto_hasta = models.DateField(null=True, blank=True)
    veces_aplazada = models.PositiveSmallIntegerField(default=0)
    egreso_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    plantilla = models.ForeignKey(PlantillaRecurrente, null=True, blank=True, on_delete=models.PROTECT, related_name='cuentas_generadas')
    periodo = models.CharField(max_length=7, blank=True, help_text='YYYY-MM')
    motivo_anulacion = models.TextField(blank=True)
    anulada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='cuentas_cxp_anuladas')
    anulada_en = models.DateTimeField(null=True, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='cuentas_cxp_creadas')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['fecha_vencimiento', 'id']
        indexes = [models.Index(fields=['fecha_vencimiento']), models.Index(fields=['estado']), models.Index(fields=['sede']), models.Index(fields=['proveedor'])]
        constraints = [
            models.UniqueConstraint(fields=['plantilla', 'periodo'], condition=models.Q(plantilla__isnull=False), name='cxp_plantilla_periodo_unico'),
        ]

    def clean(self):
        if self.fecha_vencimiento and self.fecha_emision and self.fecha_vencimiento < self.fecha_emision:
            raise ValidationError({'fecha_vencimiento': 'No puede ser anterior a la emisión.'})
        if self.tasa_aplicada and self.tasa_aplicada <= 0:
            raise ValidationError({'tasa_aplicada': 'La tasa debe ser mayor que cero.'})

    def actualizar_snapshots(self):
        if self.moneda == 'USD':
            self.monto_usd = redondear(self.monto_documento)
            self.monto_ves = convertir(self.monto_documento, 'USD', 'VES', self.tasa_aplicada)
        else:
            self.monto_ves = redondear(self.monto_documento)
            self.monto_usd = convertir(self.monto_documento, 'VES', 'USD', self.tasa_aplicada)

    def save(self, *args, **kwargs):
        if self.numero or self.pk:
            return super().save(*args, **kwargs)
        # Alta concurrente: se reintenta con el siguiente número si otro proceso tomó el mismo.
        for intento in range(5):
            ultimo = CuentaPorPagar.objects.order_by('-id').values_list('id', flat=True).first() or 0
            self.numero = f'CXP-{ultimo + 1 + intento:06d}'
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError as exc:
                if 'numero' not in str(exc).lower() and 'unique' not in str(exc).lower(): raise
                self.numero = ''
        raise IntegrityError('No se pudo asignar un número único a la cuenta.')

    def __str__(self):
        return f'{self.numero} - {self.proveedor}'


class CuotaCuentaPagar(models.Model):
    cuenta = models.ForeignKey(CuentaPorPagar, on_delete=models.PROTECT, related_name='cuotas')
    numero = models.PositiveSmallIntegerField()
    fecha_vencimiento = models.DateField()
    monto = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    pagado = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    estado = models.CharField(max_length=10, choices=(('pendiente', 'Pendiente'), ('pagada', 'Pagada'), ('anulada', 'Anulada')), default='pendiente')

    class Meta:
        ordering = ['numero']
        constraints = [models.UniqueConstraint(fields=['cuenta', 'numero'], name='cxp_cuota_numero_unico')]


class PagoCuentaPagar(models.Model):
    ESTADOS = (('valido', 'Válido'), ('anulado', 'Anulado'), ('por_aprobar', 'Por aprobar'))
    cuenta = models.ForeignKey(CuentaPorPagar, on_delete=models.PROTECT, related_name='pagos')
    cuota = models.ForeignKey(CuotaCuentaPagar, null=True, blank=True, on_delete=models.PROTECT, related_name='pagos')
    fecha_pago = models.DateField(default=timezone.localdate)
    moneda = models.CharField(max_length=3, choices=MONEDAS)
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, validators=[MinValueValidator(Decimal('0.0001'))])
    motivo_cambio_tasa = models.TextField(blank=True)
    monto_pagado = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    monto_aplicado = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    monto_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_ves = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO)
    banco = models.CharField(max_length=100, blank=True)
    referencia = models.CharField(max_length=100, blank=True)
    nota = models.TextField(blank=True)
    estado = models.CharField(max_length=12, choices=ESTADOS, default='valido')
    pago_multiple = models.UUIDField(null=True, blank=True, db_index=True)
    registrado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='pagos_cxp_registrados')
    motivo_anulacion = models.TextField(blank=True)
    anulado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='pagos_cxp_anulados')
    anulado_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fecha_pago', 'id']
        indexes = [models.Index(fields=['cuenta', 'estado']), models.Index(fields=['fecha_pago'])]

    def actualizar_snapshots(self):
        if self.moneda == 'USD':
            self.monto_usd = redondear(self.monto_pagado)
            self.monto_ves = convertir(self.monto_pagado, 'USD', 'VES', self.tasa_aplicada)
        else:
            self.monto_ves = redondear(self.monto_pagado)
            self.monto_usd = convertir(self.monto_pagado, 'VES', 'USD', self.tasa_aplicada)


class ComprobantePagoCxP(models.Model):
    pago = models.ForeignKey(PagoCuentaPagar, on_delete=models.PROTECT, related_name='comprobantes')
    archivo = models.FileField(upload_to='cuentas_pagar/comprobantes/', validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp', 'pdf'])])
    descripcion = models.CharField(max_length=255, blank=True)
    activo = models.BooleanField(default=True)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='comprobantes_cxp_subidos')
    subido_en = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.archivo and self.archivo.size > 10 * 1024 * 1024:
            raise ValidationError({'archivo': 'El comprobante no puede superar 10 MB.'})


class AplazamientoCxP(models.Model):
    cuenta = models.ForeignKey(CuentaPorPagar, on_delete=models.PROTECT, related_name='aplazamientos')
    fecha_anterior = models.DateField()
    fecha_nueva = models.DateField()
    motivo = models.TextField()
    requiere_aprobacion = models.BooleanField(default=False)
    aprobado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='aplazamientos_cxp_aprobados')
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='aplazamientos_cxp_creados')
    creado_en = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.fecha_nueva <= self.fecha_anterior:
            raise ValidationError({'fecha_nueva': 'Debe ser posterior a la fecha anterior.'})


class ConfiguracionRecordatorios(models.Model):
    # Configuración propia de Cuentas por Pagar, no configuración global.
    dias_antes = models.JSONField(default=dias_recordatorio_default)
    ventana_por_vencer = models.PositiveSmallIntegerField(default=7)
    frecuencia_vencidas_dias = models.PositiveSmallIntegerField(default=3)
    max_aplazamientos_sin_director = models.PositiveSmallIntegerField(default=2)
    bandeja_activa = models.BooleanField(default=True)
    email_activo = models.BooleanField(default=True)
    whatsapp_activo = models.BooleanField(default=False)
    canales = models.JSONField(default=list, blank=True)
    usuarios_destino = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='configuraciones_recordatorios_cxp')
    roles_destino = models.JSONField(default=list, blank=True)
    resumen_diario_activo = models.BooleanField(default=False)
    hora_recordatorios = models.TimeField(default=time(7, 30))
    hora_resumen = models.TimeField(default=time(7, 0))
    requiere_aprobacion_pago_grande = models.BooleanField(default=False)
    umbral_aprobacion_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('150.00'))
    actualizado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='configuraciones_cxp_actualizadas')
    actualizado_en = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.pk not in (None, 1):
            raise ValidationError('Solo puede existir una configuración de recordatorios.')


class RecordatorioEnviado(models.Model):
    cuenta = models.ForeignKey(CuentaPorPagar, on_delete=models.PROTECT, related_name='recordatorios_enviados')
    canal = models.CharField(max_length=12, choices=(('bandeja', 'Bandeja'), ('email', 'Email'), ('whatsapp', 'WhatsApp')))
    tipo = models.CharField(max_length=24)
    fecha_referencia = models.DateField()
    enviado_en = models.DateTimeField(auto_now_add=True)
    destinatario = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['cuenta', 'canal', 'tipo', 'fecha_referencia'], name='cxp_recordatorio_unico')]


class AvisoBandeja(models.Model):
    cuenta = models.ForeignKey(CuentaPorPagar, null=True, blank=True, on_delete=models.PROTECT, related_name='avisos_bandeja')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='avisos_cxp')
    titulo = models.CharField(max_length=255)
    mensaje = models.TextField()
    leido = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)


class HistorialCxP(models.Model):
    cuenta = models.ForeignKey(CuentaPorPagar, on_delete=models.PROTECT, related_name='historial')
    accion = models.CharField(max_length=80)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='historial_cxp')
    datos = models.JSONField(default=dict, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']
