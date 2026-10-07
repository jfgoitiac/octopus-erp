from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from finanzas.monedas import convertir, redondear


MONEDAS = (('USD', 'USD'), ('VES', 'Bolívares'))
METODOS_PAGO = (
    ('transferencia', 'Transferencia bancaria'), ('pago_movil', 'Pago móvil'),
    ('punto_de_venta', 'Punto de venta'), ('zelle', 'Zelle'),
    ('efectivo_usd', 'Efectivo USD'), ('efectivo_ves', 'Efectivo VES'), ('otro', 'Otro'),
)


class Egreso(models.Model):
    TIPOS_DOCUMENTO = (('factura', 'Factura'), ('nota_credito', 'Nota de crédito'), ('recibo', 'Recibo'), ('otro', 'Otro'))
    CONDICIONES = (('contado', 'Contado'), ('credito', 'Crédito'))
    ESTADOS = (('borrador', 'Borrador'), ('pendiente_pago', 'Pendiente de pago'), ('registrado', 'Registrado'), ('anulado', 'Anulado'))
    ORIGENES = (('factura', 'Factura de contado'), ('cuenta_por_pagar', 'Cuenta por pagar'))

    proveedor = models.ForeignKey('finanzas.Proveedor', on_delete=models.PROTECT, related_name='egresos')
    categoria = models.ForeignKey('finanzas.CategoriaGasto', on_delete=models.PROTECT, related_name='egresos')
    sede = models.ForeignKey('multisede.Sede', null=True, blank=True, on_delete=models.PROTECT, related_name='egresos', verbose_name='Sede')
    tipo_documento = models.CharField(max_length=20, choices=TIPOS_DOCUMENTO, default='factura')
    numero_documento = models.CharField(max_length=80, blank=True)
    numero_control = models.CharField(max_length=80, blank=True)
    fecha_emision = models.DateField(default=timezone.localdate, db_index=True)
    descripcion = models.TextField(blank=True)
    moneda = models.CharField(max_length=3, choices=MONEDAS, default='USD')
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, validators=[MinValueValidator(Decimal('0.0001'))])
    motivo_cambio_tasa = models.TextField(blank=True)
    total_documento = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_iva = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    porcentaje_iva = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    monto_igtf = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    aplica_igtf = models.BooleanField(default=False)
    retiene_iva = models.BooleanField(default=False)
    porcentaje_retencion_iva = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    monto_retencion_iva = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    retiene_islr = models.BooleanField(default=False)
    porcentaje_retencion_islr = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    monto_retencion_islr = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    total_pagado = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_usd = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_ves = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    condicion = models.CharField(max_length=10, choices=CONDICIONES, default='contado')
    dias_credito = models.PositiveSmallIntegerField(default=0)
    fecha_vencimiento = models.DateField(null=True, blank=True)
    fecha_egreso = models.DateField(null=True, blank=True, db_index=True)
    tasa_pago = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    monto_usd_pagado = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    monto_ves_pagado = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO, blank=True)
    banco_pago = models.CharField(max_length=100, blank=True)
    referencia_pago = models.CharField(max_length=100, blank=True)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='borrador', db_index=True)
    origen = models.CharField(max_length=20, choices=ORIGENES, default='factura')
    cuenta_por_pagar_id = models.PositiveBigIntegerField(null=True, blank=True)
    motivo_anulacion = models.TextField(blank=True)
    anulado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='egresos_anulados')
    anulado_en = models.DateTimeField(null=True, blank=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='egresos_creados')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha_egreso', '-fecha_emision', '-id']
        indexes = [models.Index(fields=['fecha_egreso']), models.Index(fields=['fecha_emision']), models.Index(fields=['sede']), models.Index(fields=['estado'])]
        constraints = [
            models.UniqueConstraint(fields=['proveedor', 'tipo_documento', 'numero_documento'], condition=~models.Q(estado='anulado') & ~models.Q(numero_documento=''), name='egreso_proveedor_tipo_numero_activo_unico'),
            models.UniqueConstraint(fields=['cuenta_por_pagar_id'], condition=models.Q(origen='cuenta_por_pagar') & ~models.Q(estado='anulado'), name='egreso_cxp_activa_unica'),
            models.CheckConstraint(condition=~models.Q(estado='registrado') | models.Q(fecha_egreso__isnull=False), name='egreso_registrado_requiere_fecha'),
        ]
        verbose_name = 'Egreso'
        verbose_name_plural = 'Egresos'

    def clean(self):
        if self.origen == 'factura' and self.condicion != 'contado':
            raise ValidationError({'condicion': 'Egresos solo permite alta directa de facturas de contado.'})
        if self.origen == 'factura' and self.cuenta_por_pagar_id:
            raise ValidationError({'cuenta_por_pagar_id': 'Solo los egresos creados por Cuentas por Pagar pueden tener este identificador.'})
        if self.origen == 'cuenta_por_pagar' and not self.cuenta_por_pagar_id:
            raise ValidationError({'cuenta_por_pagar_id': 'El origen Cuentas por Pagar requiere su identificador.'})
        if self.tasa_aplicada and self.tasa_aplicada <= 0:
            raise ValidationError({'tasa_aplicada': 'La tasa debe ser mayor que cero.'})
        if self.estado == 'registrado' and not self.fecha_egreso:
            raise ValidationError({'fecha_egreso': 'Un egreso registrado requiere fecha de egreso.'})

    def actualizar_montos(self):
        """Persiste ambos snapshots monetarios sin convertir de nuevo en reportes."""
        self.total_pagado = redondear(self.total_documento - self.monto_retencion_iva - self.monto_retencion_islr)
        if self.moneda == 'USD':
            self.monto_usd = redondear(self.total_documento)
            self.monto_ves = convertir(self.total_documento, 'USD', 'VES', self.tasa_aplicada)
        else:
            self.monto_ves = redondear(self.total_documento)
            self.monto_usd = convertir(self.total_documento, 'VES', 'USD', self.tasa_aplicada)

    def __str__(self):
        return f'Egreso {self.pk or "nuevo"} - {self.proveedor}'


class RenglonEgreso(models.Model):
    egreso = models.ForeignKey(Egreso, on_delete=models.PROTECT, related_name='renglones')
    descripcion = models.CharField(max_length=255)
    articulo = models.ForeignKey('ArticuloFrecuente', null=True, blank=True, on_delete=models.PROTECT, related_name='renglones')
    cantidad = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('1.00'), validators=[MinValueValidator(Decimal('0.01'))])
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    descuento = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'id']
        verbose_name = 'Renglón de egreso'
        verbose_name_plural = 'Renglones de egreso'

    def actualizar_total(self):
        self.total = redondear((self.cantidad * self.precio_unitario) - self.descuento)


class ComprobanteEgreso(models.Model):
    TIPOS = (('documento', 'Documento'), ('pago', 'Comprobante de pago'))
    egreso = models.ForeignKey(Egreso, on_delete=models.PROTECT, related_name='comprobantes')
    archivo = models.FileField(upload_to='egresos/comprobantes/', validators=[FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp', 'pdf'])])
    tipo = models.CharField(max_length=12, choices=TIPOS, default='documento')
    descripcion = models.CharField(max_length=255, blank=True)
    subido_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='comprobantes_egreso_subidos')
    subido_en = models.DateTimeField(auto_now_add=True)
    activo = models.BooleanField(default=True)
    eliminado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='comprobantes_egreso_eliminados')
    eliminado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-subido_en']
        verbose_name = 'Comprobante de egreso'
        verbose_name_plural = 'Comprobantes de egreso'

    def clean(self):
        if self.archivo and self.archivo.size > 10 * 1024 * 1024:
            raise ValidationError({'archivo': 'El comprobante no puede superar 10 MB.'})
        if self.activo and self.egreso_id:
            activos = ComprobanteEgreso.objects.filter(egreso_id=self.egreso_id, activo=True).exclude(pk=self.pk)
            if activos.count() >= 5:
                raise ValidationError('Cada egreso admite hasta cinco comprobantes activos.')


class ArticuloFrecuente(models.Model):
    nombre = models.CharField(max_length=200)
    proveedor = models.ForeignKey('finanzas.Proveedor', null=True, blank=True, on_delete=models.PROTECT, related_name='articulos_frecuentes')
    categoria = models.ForeignKey('finanzas.CategoriaGasto', on_delete=models.PROTECT, related_name='articulos_frecuentes')
    unidad = models.CharField(max_length=30, default='unidad')
    activo = models.BooleanField(default=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='articulos_frecuentes_creados')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Artículo frecuente'
        verbose_name_plural = 'Artículos frecuentes'


class BitacoraEgreso(models.Model):
    egreso = models.ForeignKey(Egreso, on_delete=models.PROTECT, related_name='bitacora')
    accion = models.CharField(max_length=80)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='bitacoras_egreso')
    fecha = models.DateTimeField(auto_now_add=True)
    antes = models.JSONField(default=dict, blank=True)
    despues = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-fecha']
        verbose_name = 'Bitácora de egreso'
        verbose_name_plural = 'Bitácoras de egreso'


class DetallePagoCuentaPorPagar(models.Model):
    """Snapshot de cada abono que termina componiendo el único egreso final."""
    egreso = models.ForeignKey(Egreso, on_delete=models.PROTECT, related_name='pagos_cuenta_por_pagar')
    fecha_pago = models.DateField()
    moneda = models.CharField(max_length=3, choices=MONEDAS)
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, validators=[MinValueValidator(Decimal('0.0001'))])
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO)
    banco = models.CharField(max_length=100, blank=True)
    referencia = models.CharField(max_length=100, blank=True)
    monto_documento = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    monto_usd = models.DecimalField(max_digits=14, decimal_places=2)
    monto_ves = models.DecimalField(max_digits=14, decimal_places=2)
    comprobantes = models.JSONField(default=list, blank=True, help_text='Rutas/metadatos inmutables de comprobantes del abono.')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['fecha_pago', 'id']
        verbose_name = 'Detalle de pago de cuenta por pagar'
        verbose_name_plural = 'Detalles de pago de cuentas por pagar'


class ConfiguracionEgresos(models.Model):
    fiscal_activo = models.BooleanField(default=True)
    umbral_alerta_variacion = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('15.0000'))
    alicuota_iva_default = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('16.0000'))
    alicuota_igtf_default = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('3.0000'))
    actualizado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='configuraciones_egresos_actualizadas')
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración de egresos'
        verbose_name_plural = 'Configuración de egresos'

    def clean(self):
        if self.pk not in (None, 1):
            raise ValidationError('Solo puede existir una configuración de egresos.')
