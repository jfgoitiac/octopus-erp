from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from cobranza.models import Pago
from secretaria.models import Alumno

# Cantina y Librería son dos cajas sobre la misma app (D1). Default 'cantina'
# para que los datos existentes queden en Cantina.
AREAS = (('cantina', 'Cantina'), ('libreria', 'Librería'))


class ParametroCantina(models.Model):
    """Configuración global de cantina — equivalente a cobranza.ParametroGlobal."""
    limite_credito_default = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('5.00'))
    dias_alerta_saldo_negativo = models.CharField(
        max_length=50, default='1,3,7',
        help_text='Días de saldo negativo sostenido en que se envía recordatorio, separados por coma.'
    )
    limite_credito_representante_default = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('20.00'),
        help_text='Límite de crédito (USD) por representante para ventas cargadas a cuenta (CxC).'
    )

    class Meta:
        verbose_name = 'Parámetro de Cantina'
        verbose_name_plural = 'Parámetros de Cantina'

    def __str__(self):
        return 'Parámetros de Cantina'


class LoteTarjetas(models.Model):
    """Agrupa un lote de tarjetas QR generadas de una sola vez.

    Se define aquí (Fase 0) porque TarjetaPrepago.lote depende de esta tabla
    a nivel de esquema, pero su flujo de generación (§5.1/Fase 2) no se
    implementa todavía — la tabla queda vacía hasta la Fase 2.
    """
    cantidad = models.PositiveIntegerField()
    generado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    creado_en = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Lote #{self.id} — {self.cantidad} tarjetas'


class TarjetaPrepago(models.Model):
    ESTADOS = (
        ('sin_asignar', 'Sin asignar'),   # impresa, sin alumno vinculado todavía
        ('activa', 'Activa'),
        ('bloqueada', 'Bloqueada'),
        ('extraviada', 'Extraviada'),
    )
    # OJO: null=True es obligatorio — una tarjeta se genera e imprime ANTES de
    # saber a qué alumno se le va a entregar (provisioning en lote). Si este
    # campo fuera NOT NULL, generar el lote de 50 tarjetas en blanco sería
    # imposible. Se asigna después vía el flujo de "Asignar tarjeta" (§5.1).
    alumno = models.OneToOneField(Alumno, null=True, blank=True, on_delete=models.CASCADE, related_name='tarjeta_cantina')
    lote = models.ForeignKey(LoteTarjetas, null=True, blank=True, on_delete=models.SET_NULL, related_name='tarjetas')
    serial = models.CharField(max_length=20, unique=True, db_index=True)  # identificador humano, ej. 'L003-0007' — NUNCA es credencial de cobro
    codigo = models.CharField(max_length=50, unique=True, db_index=True)  # payload real del QR — CANT-XXXXXXXXXX, única credencial válida para vender
    saldo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))  # puede ser negativo
    estado = models.CharField(max_length=15, choices=ESTADOS, default='sin_asignar')
    limite_credito = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('5.00'))
    saldo_negativo_desde = models.DateField(null=True, blank=True)  # se setea cuando cruza a negativo, se limpia al volver a 0+
    asignada_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['codigo']), models.Index(fields=['serial'])]

    def __str__(self):
        return f'{self.serial} — {self.alumno or "sin asignar"}'


class HistorialCodigoTarjeta(models.Model):
    """Auditoría de reposición: cada vez que el `codigo` de una tarjeta se
    regenera (extravío/daño), queda registro del código anterior invalidado.

    Se define aquí (Fase 0) por la misma razón que LoteTarjetas: dependencia
    de esquema con TarjetaPrepago. El flujo de reposición (§5.1/Fase 2) no
    se implementa todavía.
    """
    tarjeta = models.ForeignKey(TarjetaPrepago, on_delete=models.CASCADE, related_name='historial_codigos')
    codigo_anterior = models.CharField(max_length=50)
    motivo = models.CharField(max_length=30, choices=(('extravio', 'Extravío'), ('dano', 'Tarjeta dañada')))
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']


class MovimientoTarjeta(models.Model):
    TIPOS = (
        ('recarga', 'Recarga'),
        ('consumo', 'Consumo'),
        ('ajuste', 'Ajuste manual'),
        ('reverso', 'Reverso'),
    )
    tarjeta = models.ForeignKey(TarjetaPrepago, on_delete=models.CASCADE, related_name='movimientos')
    tipo = models.CharField(max_length=15, choices=TIPOS)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    saldo_antes = models.DecimalField(max_digits=10, decimal_places=2)
    saldo_despues = models.DecimalField(max_digits=10, decimal_places=2)
    venta = models.ForeignKey('VentaCantina', null=True, blank=True, on_delete=models.SET_NULL, related_name='movimientos')
    recarga = models.ForeignKey('RecargaTarjeta', null=True, blank=True, on_delete=models.SET_NULL, related_name='movimientos')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']


class RecargaTarjeta(models.Model):
    # Mismos métodos que cobranza.Pago.METODOS, MENOS 'stripe' (no se usa en
    # este proyecto). No se define un choices propio a mano: se reutiliza
    # directamente para que un método nuevo agregado en cobranza (o quitado)
    # no obligue a mantener dos listas sincronizadas a mano.
    #   from cobranza.models import Pago
    #   METODOS = tuple(m for m in Pago.METODOS if m[0] != 'stripe')
    # Se conecta en la Fase 3 (§5.9) cuando existen las vistas de recarga.
    ESTATUS = (
        ('pendiente', 'Pendiente de revisión'),
        ('aprobado', 'Aprobado'),
        ('rechazado', 'Rechazado'),
    )
    tarjeta = models.ForeignKey(TarjetaPrepago, on_delete=models.CASCADE, related_name='recargas')
    metodo_pago = models.CharField(max_length=20)  # choices = METODOS (importado de cobranza, ver arriba)
    # --- Moneda dual, mismo criterio que cobranza.Pago ---
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2, help_text='Monto captado en divisas (canónico)')
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, help_text='Tasa BCV vigente al momento de la recarga (snapshot de cobranza.TasaCambio)')
    monto_ves = models.DecimalField(max_digits=20, decimal_places=2, editable=False, help_text='Equivalente contable en Bolívares')
    # --- Datos bancarios de la transacción (solo aplica según metodo_pago) ---
    banco_receptor = models.ForeignKey('cobranza.BancoInstitucional', on_delete=models.PROTECT, null=True, blank=True,
                                        help_text='Banco/cuenta del colegio que recibió — mismo catálogo que usa cobranza, no se duplica')
    banco_procedencia = models.CharField(max_length=100, blank=True, null=True, help_text='Banco emisor del pagador (transferencia/pago móvil)')
    referencia = models.CharField(max_length=100, blank=True, null=True)
    numero_lote = models.CharField(max_length=10, blank=True, null=True, help_text='Solo Punto de Venta — 4 dígitos, igual que cobranza')
    estatus = models.CharField(max_length=15, choices=ESTATUS, default='pendiente')
    comprobante = models.FileField(upload_to='cantina/comprobantes/%Y/%m/', null=True, blank=True)
    registrado_por_portal = models.BooleanField(default=False)
    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='recargas_cantina')
    revisado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='recargas_revisadas')
    creado_en = models.DateTimeField(auto_now_add=True)
    revisado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-creado_en']


class CategoriaProducto(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    orden = models.PositiveSmallIntegerField(default=0)
    area = models.CharField(max_length=10, choices=AREAS, default='cantina', db_index=True)

    class Meta:
        ordering = ['orden', 'nombre']

    def __str__(self):
        return self.nombre


class ProductoCantina(models.Model):
    nombre = models.CharField(max_length=100)
    categoria = models.ForeignKey(CategoriaProducto, on_delete=models.PROTECT, related_name='productos')
    codigo_barras = models.CharField(max_length=50, unique=True, null=True, blank=True, db_index=True)
    precio = models.DecimalField(max_digits=8, decimal_places=2)
    stock_actual = models.IntegerField(default=0)
    stock_minimo = models.IntegerField(default=5)
    imagen = models.ImageField(upload_to='cantina/productos/', null=True, blank=True)
    activo = models.BooleanField(default=True)
    area = models.CharField(max_length=10, choices=AREAS, default='cantina', db_index=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nombre']
        indexes = [models.Index(fields=['codigo_barras'])]

    def __str__(self):
        return self.nombre

    @property
    def stock_bajo(self):
        return self.stock_actual <= self.stock_minimo


class MovimientoInventario(models.Model):
    TIPOS = (
        ('entrada', 'Entrada (compra a proveedor)'),
        ('salida', 'Salida (venta)'),
        ('ajuste', 'Ajuste (merma / conteo)'),
    )
    producto = models.ForeignKey(ProductoCantina, on_delete=models.CASCADE, related_name='movimientos')
    tipo = models.CharField(max_length=10, choices=TIPOS)
    cantidad = models.IntegerField()
    stock_antes = models.IntegerField()
    stock_despues = models.IntegerField()
    motivo = models.CharField(max_length=200, blank=True)
    venta = models.ForeignKey('VentaCantina', null=True, blank=True, on_delete=models.SET_NULL, related_name='movimientos_inventario')
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']


class AperturaCajaCantina(models.Model):
    """
    Sesión de caja de UN cajero (apertura por cajero, no global). El
    colegio puede tener hasta `MAX_APERTURAS_SIMULTANEAS` cajeros vendiendo
    a la vez (varios puntos de venta / turnos superpuestos): cada uno abre
    su propia caja declarando su `monto_inicial`, y sus ventas quedan
    asociadas a ESA apertura (ver `VentaCantina.apertura`), nunca a una caja
    global. El límite de aperturas simultáneas es una regla de sistema que
    cruza filas — no se puede expresar como constraint de una sola tabla,
    se aplica en `AperturaCajaCantinaView.post` dentro de una transacción
    serializada contra el singleton `ParametroCantina`.
    """
    ESTADOS = (
        ('abierta', 'Abierta'),
        ('cerrada', 'Cerrada'),
    )
    MAX_APERTURAS_SIMULTANEAS = 3

    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='aperturas_cantina')
    # El área se elige al abrir y la venta/cierre la heredan (D2). El límite
    # MAX_APERTURAS_SIMULTANEAS se cuenta por área (D3).
    area = models.CharField(max_length=10, choices=AREAS, default='cantina', db_index=True)
    fecha_hora_apertura = models.DateTimeField(auto_now_add=True)
    monto_inicial = models.DecimalField(max_digits=10, decimal_places=2)
    estado = models.CharField(max_length=10, choices=ESTADOS, default='abierta')
    cerrada_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-fecha_hora_apertura']
        constraints = [
            # Un mismo cajero no puede tener dos aperturas 'abierta' a la vez.
            models.UniqueConstraint(
                fields=['cajero'], condition=models.Q(estado='abierta'),
                name='unica_apertura_abierta_por_cajero',
            ),
        ]

    def __str__(self):
        return f'Apertura #{self.id} — {self.cajero} ({self.get_estado_display()})'


class VentaCantina(models.Model):
    # D7: tarjeta prepago + los métodos de cobranza (importados, no copiados)
    # + cargo a la cuenta del representante.
    METODOS_PAGO = (
        (('tarjeta_prepago', 'Tarjeta Prepago'),)
        + tuple(Pago.METODOS)
        + (('credito_representante', 'Cargo a cuenta del representante'),)
    )
    ESTADOS = (
        ('completada', 'Completada'),
        ('anulada', 'Anulada'),
    )
    # alumno/tarjeta son OPCIONALES a propósito — ver §7.2 "Camino rápido
    # por defecto" y la regla de negocio más abajo. Solo son obligatorios
    # cuando metodo_pago es 'tarjeta_prepago' (se valida en el serializer,
    # no aquí, porque es una regla condicional según otro campo, no una
    # restricción de esquema).
    alumno = models.ForeignKey(Alumno, null=True, blank=True, on_delete=models.SET_NULL, related_name='ventas_cantina')
    tarjeta = models.ForeignKey(TarjetaPrepago, null=True, blank=True, on_delete=models.SET_NULL, related_name='ventas')
    # Apertura de caja del cajero bajo la que se registró esta venta — NUNCA
    # una caja global (§ apertura por cajero). null=True solo por
    # compatibilidad con ventas anteriores a este cambio; toda venta nueva
    # exige una apertura abierta (ver RegistrarVentaView).
    apertura = models.ForeignKey('AperturaCajaCantina', null=True, blank=True, on_delete=models.PROTECT, related_name='ventas')
    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='ventas_cantina')
    metodo_pago = models.CharField(max_length=25, choices=METODOS_PAGO)
    area = models.CharField(max_length=10, choices=AREAS, default='cantina', db_index=True)
    # Datos bancarios (solo métodos bancarios) — mismas reglas que RecargaTarjeta.
    banco_receptor = models.ForeignKey('cobranza.BancoInstitucional', on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    banco_procedencia = models.CharField(max_length=100, blank=True, null=True)
    referencia = models.CharField(max_length=100, blank=True, null=True)
    numero_lote = models.CharField(max_length=10, blank=True, null=True)
    # Solo para metodo_pago='credito_representante'.
    representante = models.ForeignKey('secretaria.Representante', null=True, blank=True, on_delete=models.PROTECT, related_name='ventas_cantina_credito')
    total_usd = models.DecimalField(max_digits=10, decimal_places=2, help_text='Total canónico en USD (el precio de cada producto vive en USD)')
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4, help_text='Tasa BCV vigente al momento de la venta (snapshot de cobranza.TasaCambio) — se usa para imprimir el ticket en VES si se cobró en efectivo_ves')
    total_ves = models.DecimalField(max_digits=20, decimal_places=2, editable=False)
    estado = models.CharField(max_length=15, choices=ESTADOS, default='completada')
    saldo_tarjeta_despues = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    anulada_en = models.DateTimeField(null=True, blank=True)
    anulada_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='ventas_anuladas')

    class Meta:
        ordering = ['-creado_en']


class DetalleVentaCantina(models.Model):
    venta = models.ForeignKey(VentaCantina, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(ProductoCantina, on_delete=models.PROTECT, related_name='detalles_venta')
    cantidad = models.PositiveIntegerField()
    precio_unitario = models.DecimalField(max_digits=8, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)


class CierreCajaCantina(models.Model):
    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='cierres_cantina')
    # Cada cierre cierra EXACTAMENTE la apertura de ESE cajero — el
    # OneToOneField es lo que impide cerrar la misma apertura dos veces
    # (reemplaza el viejo unique_together=('cajero','fecha'), que asumía una
    # sola sesión de caja por cajero por día; ahora un cajero puede abrir y
    # cerrar más de una vez en el mismo día, cada apertura con su propio cierre).
    apertura = models.OneToOneField(
        AperturaCajaCantina, null=True, blank=True, on_delete=models.PROTECT, related_name='cierre',
    )
    fecha = models.DateField()
    area = models.CharField(max_length=10, choices=AREAS, default='cantina', db_index=True)
    # D11: totales por método (ventas + abonos + recargas) de la apertura.
    totales_por_metodo = models.JSONField(default=dict, blank=True)
    total_ventas = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_tarjeta = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_recargas_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    conteo_fisico = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    diferencia = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    observaciones = models.TextField(blank=True)
    cerrado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']


# ─────────────────────────────────────────────
# Cuentas por cobrar a representantes (CxC)
# ─────────────────────────────────────────────
class CreditoRepresentanteCantina(models.Model):
    """Override del límite de crédito de un representante (D6)."""
    representante = models.OneToOneField('secretaria.Representante', on_delete=models.CASCADE, related_name='credito_cantina')
    limite_usd = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                     help_text='null = usa ParametroCantina.limite_credito_representante_default')
    bloqueado = models.BooleanField(default=False)
    actualizado_en = models.DateTimeField(auto_now=True)


class CargoCantina(models.Model):
    """Deuda generada por una venta cargada a la cuenta del representante (D4).
    monto_pagado/estado se derivan en save() (patrón de cobranza.Mensualidad)."""
    ESTADOS = (('pendiente', 'Pendiente'), ('pagado', 'Pagado'), ('anulado', 'Anulado'))

    representante = models.ForeignKey('secretaria.Representante', on_delete=models.PROTECT, related_name='cargos_cantina')
    alumno = models.ForeignKey(Alumno, null=True, blank=True, on_delete=models.SET_NULL, related_name='cargos_cantina')
    venta = models.OneToOneField(VentaCantina, on_delete=models.PROTECT, related_name='cargo')
    area = models.CharField(max_length=10, choices=AREAS)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    monto_pagado = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    estado = models.CharField(max_length=10, choices=ESTADOS, default='pendiente')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['creado_en']
        indexes = [models.Index(fields=['representante', 'estado'])]

    @property
    def saldo_usd(self):
        return self.monto_usd - self.monto_pagado

    def save(self, *args, **kwargs):
        if self.estado != 'anulado':
            self.estado = 'pagado' if self.monto_pagado >= self.monto_usd else 'pendiente'
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {'estado'}
        super().save(*args, **kwargs)


class AbonoCantina(models.Model):
    """Una LÍNEA de abono; las de una misma operación comparten operacion_uuid."""
    ESTATUS = (('completado', 'Completado'), ('anulado', 'Anulado'))

    operacion_uuid = models.UUIDField(db_index=True)
    representante = models.ForeignKey('secretaria.Representante', on_delete=models.PROTECT, related_name='abonos_cantina')
    area = models.CharField(max_length=10, choices=AREAS)
    apertura = models.ForeignKey(AperturaCajaCantina, null=True, blank=True, on_delete=models.PROTECT, related_name='abonos')  # None = retroactivo
    metodo_pago = models.CharField(max_length=20, choices=Pago.METODOS)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    tasa_aplicada = models.DecimalField(max_digits=12, decimal_places=4)
    monto_ves = models.DecimalField(max_digits=20, decimal_places=2)
    banco_receptor = models.ForeignKey('cobranza.BancoInstitucional', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    banco_procedencia = models.CharField(max_length=100, blank=True, null=True)
    referencia = models.CharField(max_length=100, blank=True, null=True)
    numero_lote = models.CharField(max_length=10, blank=True, null=True)
    fecha_pago = models.DateTimeField(default=timezone.now, db_index=True)
    es_retroactivo = models.BooleanField(default=False)
    motivo = models.TextField(blank=True)
    estatus = models.CharField(max_length=12, choices=ESTATUS, default='completado')
    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='abonos_cantina')
    anulado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='abonos_cantina_anulados')
    anulado_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_pago', '-id']
        indexes = [models.Index(fields=['representante', 'estatus'])]


class AplicacionAbonoCantina(models.Model):
    abono = models.ForeignKey(AbonoCantina, on_delete=models.CASCADE, related_name='aplicaciones')
    cargo = models.ForeignKey(CargoCantina, on_delete=models.PROTECT, related_name='aplicaciones')
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
