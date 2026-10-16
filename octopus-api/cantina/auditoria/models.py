"""
Modelos de la Auditoría de Cantina.

Pertenecen a la app `cantina` (app_label explícito) y se importan al final
de `cantina/models.py` para que Django los descubra. Todas las FK a modelos
de cantina usan referencias en texto ('cantina.X') para no crear un import
circular con `cantina.models`.

Regla de oro: nada de lo que se guarda aquí se borra. La bitácora
(`EventoAuditoriaCantina`) es append-only y encadenada por hash; las
revisiones, adjuntos, alertas y reaperturas solo avanzan de estado.
"""
import os
from datetime import time
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

AREAS = (('cantina', 'Cantina'), ('libreria', 'Librería'))


class RegistroInalterableError(Exception):
    """Se intentó modificar o borrar un registro de auditoría."""


# ─────────────────────────────────────────────
# Bitácora append-only
# ─────────────────────────────────────────────
class EventoAuditoriaQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise RegistroInalterableError('La bitácora de cantina no admite modificaciones.')

    def delete(self):
        raise RegistroInalterableError('La bitácora de cantina no admite borrados.')


class EventoAuditoriaCantina(models.Model):
    """
    Un evento crítico de la cantina. NUNCA se crea directamente: la única
    puerta de escritura es `cantina.auditoria.bitacora.registrar_evento`,
    que calcula el encadenamiento por hash.

    Protección en tres capas:
      1. `save()` rechaza cualquier escritura sobre una fila existente y
         `delete()` lanza error (también en el QuerySet).
      2. El admin es de solo lectura.
      3. En PostgreSQL, un trigger BEFORE UPDATE OR DELETE (migración 0007).
    """
    TIPOS = (
        ('cambio_precio', 'Cambio de precio o costo'),
        ('producto_creado', 'Producto creado'),
        ('anulacion_venta', 'Anulación de venta'),
        ('descuento_venta', 'Venta con descuento'),
        ('venta_manual', 'Venta manual'),
        ('movimiento_inventario', 'Entrada de inventario'),
        ('ajuste_inventario', 'Ajuste de inventario'),
        ('merma', 'Merma'),
        ('apertura_caja', 'Apertura de caja'),
        ('cierre_caja', 'Cierre de caja'),
        ('reapertura_caja', 'Reapertura de caja'),
        ('cierre_modificado', 'Modificación de cierre'),
        ('revision_cierre', 'Revisión de cierre'),
        ('adjunto_cierre', 'Adjunto en revisión de cierre'),
        ('alerta_atendida', 'Alerta atendida'),
        ('parametros_auditoria', 'Cambio de parámetros de auditoría'),
    )

    tipo = models.CharField(max_length=30, choices=TIPOS, db_index=True)
    creado_en = models.DateTimeField(default=timezone.now, db_index=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='eventos_auditoria_cantina',
    )
    # Snapshots: si el usuario cambia de nombre o rol (o se desactiva), el
    # evento conserva quién era al momento de actuar.
    usuario_nombre = models.CharField(max_length=150, blank=True)
    usuario_rol = models.CharField(max_length=30, blank=True)
    area = models.CharField(max_length=10, choices=AREAS, null=True, blank=True, db_index=True)
    # Referencia genérica al objeto afectado, ej. ('venta', '123').
    objeto_tipo = models.CharField(max_length=40)
    objeto_id = models.CharField(max_length=40)
    antes = models.JSONField(null=True, blank=True)
    despues = models.JSONField(null=True, blank=True)
    motivo = models.TextField(blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    hash_anterior = models.CharField(max_length=64, blank=True)
    hash = models.CharField(max_length=64, unique=True)

    objects = EventoAuditoriaQuerySet.as_manager()

    class Meta:
        app_label = 'cantina'
        ordering = ['-creado_en', '-id']
        indexes = [
            models.Index(fields=['objeto_tipo', 'objeto_id']),
            models.Index(fields=['usuario', 'creado_en']),
        ]
        verbose_name = 'Evento de auditoría de cantina'
        verbose_name_plural = 'Bitácora de auditoría de cantina'

    def __str__(self):
        return f'{self.get_tipo_display()} — {self.objeto_tipo}#{self.objeto_id}'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RegistroInalterableError('La bitácora de cantina no admite modificaciones.')
        if not self.hash:
            raise RegistroInalterableError(
                'Los eventos se crean solo con cantina.auditoria.bitacora.registrar_evento().'
            )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RegistroInalterableError('La bitácora de cantina no admite borrados.')


# ─────────────────────────────────────────────
# Revisión de cierres por el Director
# ─────────────────────────────────────────────
class RevisionCierre(models.Model):
    """
    Estado de revisión de un `CierreCajaCantina`. Se crea en 'pendiente'
    automáticamente al guardarse el cierre (signal en auditoria/signals.py).
    Cada transición queda en la bitácora con el comentario del Director;
    `comentario_director` solo guarda el último para mostrarlo rápido.
    """
    ESTADOS = (
        ('pendiente', 'Pendiente'),
        ('revisado', 'Revisado'),
        ('aprobado', 'Aprobado'),
        ('observado', 'Observado'),
    )
    # Transiciones válidas. 'aprobado' es terminal.
    TRANSICIONES = {
        'pendiente': {'revisado', 'aprobado', 'observado'},
        'revisado': {'aprobado', 'observado'},
        'observado': {'revisado', 'aprobado'},
        'aprobado': set(),
    }

    cierre = models.OneToOneField('cantina.CierreCajaCantina', on_delete=models.PROTECT, related_name='revision')
    estado = models.CharField(max_length=10, choices=ESTADOS, default='pendiente', db_index=True)
    comentario_director = models.TextField(blank=True)
    revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='revisiones_cierre_cantina',
    )
    revisado_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'cantina'
        ordering = ['-creado_en']
        verbose_name = 'Revisión de cierre de cantina'
        verbose_name_plural = 'Revisiones de cierres de cantina'

    def __str__(self):
        return f'Revisión cierre #{self.cierre_id} — {self.get_estado_display()}'

    def puede_pasar_a(self, nuevo_estado):
        return nuevo_estado in self.TRANSICIONES.get(self.estado, set())

    def delete(self, *args, **kwargs):
        raise RegistroInalterableError('Las revisiones de cierre no se borran.')


ADJUNTO_EXTENSIONES = {'.jpg', '.jpeg', '.png', '.webp', '.pdf'}
ADJUNTO_MAX_BYTES = 5 * 1024 * 1024  # D6: imagen o PDF hasta 5 MB


def _firma_coincide(ext, cabecera):
    """Firma mágica real del archivo según su extensión declarada."""
    if ext in ('.jpg', '.jpeg'):
        return cabecera.startswith(b'\xff\xd8\xff')
    if ext == '.png':
        return cabecera.startswith(b'\x89PNG\r\n\x1a\n')
    if ext == '.webp':
        return cabecera[:4] == b'RIFF' and cabecera[8:12] == b'WEBP'
    if ext == '.pdf':
        return cabecera.startswith(b'%PDF')
    return False


def validar_adjunto_revision(archivo):
    """Valida extensión (imagen/PDF), tamaño máximo (5 MB) y que el
    contenido real coincida con la extensión (firma mágica): un ejecutable
    renombrado a .pdf se rechaza."""
    ext = os.path.splitext(archivo.name)[1].lower()
    if ext not in ADJUNTO_EXTENSIONES:
        raise ValidationError('Solo se admiten imágenes (JPG, PNG, WEBP) o PDF.')
    if archivo.size > ADJUNTO_MAX_BYTES:
        raise ValidationError('El archivo supera el máximo de 5 MB.')
    posicion = archivo.tell() if hasattr(archivo, 'tell') else 0
    archivo.seek(0)
    cabecera = archivo.read(12)
    archivo.seek(posicion)
    if not _firma_coincide(ext, cabecera):
        raise ValidationError('El contenido del archivo no corresponde a su extensión.')


class AdjuntoRevision(models.Model):
    """Respaldo que el Director adjunta a una revisión. Nunca se borra: si se
    corrige, el nuevo adjunto apunta al anterior con `reemplaza_a`."""
    revision = models.ForeignKey(RevisionCierre, on_delete=models.PROTECT, related_name='adjuntos')
    archivo = models.FileField(upload_to='cantina/auditoria/adjuntos/%Y/%m/', validators=[validar_adjunto_revision])
    nombre_original = models.CharField(max_length=255)
    tipo_mime = models.CharField(max_length=100, blank=True)
    tamano_bytes = models.PositiveIntegerField(default=0)
    descripcion = models.CharField(max_length=255, blank=True)
    reemplaza_a = models.OneToOneField(
        'self', null=True, blank=True, on_delete=models.PROTECT, related_name='reemplazado_por',
    )
    subido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='adjuntos_auditoria_cantina',
    )
    subido_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'cantina'
        ordering = ['-subido_en']

    def __str__(self):
        return self.nombre_original

    def delete(self, *args, **kwargs):
        raise RegistroInalterableError('Los adjuntos de auditoría no se borran.')


# ─────────────────────────────────────────────
# Reapertura de caja (D4)
# ─────────────────────────────────────────────
class ReaperturaCajaCantina(models.Model):
    """
    Reapertura de una caja ya cerrada. El cierre original NO se toca (sigue
    siendo evidencia): se abre una apertura NUEVA (`apertura_nueva`) para el
    mismo cajero y área, cuyo cierre posterior reemplaza operativamente al
    original. El flujo (vista y permisos) se implementa en la Fase 2.
    """
    cierre_original = models.ForeignKey('cantina.CierreCajaCantina', on_delete=models.PROTECT, related_name='reaperturas')
    apertura_nueva = models.OneToOneField(
        'cantina.AperturaCajaCantina', on_delete=models.PROTECT, related_name='reapertura_origen',
    )
    motivo = models.TextField()
    autorizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='reaperturas_cantina_autorizadas',
    )
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'cantina'
        ordering = ['-creado_en']

    def __str__(self):
        return f'Reapertura del cierre #{self.cierre_original_id}'

    def delete(self, *args, **kwargs):
        raise RegistroInalterableError('Las reaperturas de caja no se borran.')


# ─────────────────────────────────────────────
# Alertas automáticas
# ─────────────────────────────────────────────
class AlertaCantina(models.Model):
    TIPOS = (
        ('diferencia_caja', 'Diferencia de caja'),
        ('exceso_anulaciones', 'Exceso de anulaciones'),
        ('exceso_descuentos', 'Exceso de descuentos'),
        ('inventario_inconsistente', 'Inventario no coincide con ventas'),
        ('cierre_faltante', 'Cierre del día no realizado'),
        ('stock_bajo_minimo', 'Producto bajo el mínimo'),
    )
    SEVERIDADES = (
        ('info', 'Informativa'),
        ('advertencia', 'Advertencia'),
        ('critica', 'Crítica'),
    )
    ESTADOS = (
        ('abierta', 'Abierta'),
        ('atendida', 'Atendida'),
    )

    tipo = models.CharField(max_length=30, choices=TIPOS, db_index=True)
    severidad = models.CharField(max_length=12, choices=SEVERIDADES, default='advertencia')
    fecha = models.DateField(db_index=True)
    area = models.CharField(max_length=10, choices=AREAS, null=True, blank=True)
    titulo = models.CharField(max_length=200)
    detalle = models.JSONField(default=dict, blank=True)
    referencia_tipo = models.CharField(max_length=40, blank=True)
    referencia_id = models.CharField(max_length=40, blank=True)
    # Evita duplicar la misma alerta en cada corrida del motor:
    # f'{tipo}:{referencia_tipo}:{referencia_id}:{fecha}'.
    clave_dedupe = models.CharField(max_length=200, unique=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default='abierta', db_index=True)
    atendida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='alertas_cantina_atendidas',
    )
    atendida_en = models.DateTimeField(null=True, blank=True)
    nota_atencion = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'cantina'
        ordering = ['-fecha', '-creado_en']
        indexes = [models.Index(fields=['estado', 'fecha'])]

    def __str__(self):
        return f'[{self.get_severidad_display()}] {self.titulo}'

    def delete(self, *args, **kwargs):
        raise RegistroInalterableError('Las alertas no se borran; se marcan como atendidas.')


# ─────────────────────────────────────────────
# Umbrales configurables por el Director
# ─────────────────────────────────────────────
class ParametroAuditoriaCantina(models.Model):
    """
    Singleton con los umbrales del motor de alertas. Separado de
    `ParametroCantina` a propósito: aquel lo edita administración/cajero,
    este solo el Director (que no se aflojen los controles desde la caja).
    """
    tolerancia_diferencia_caja = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('1.00'),
        help_text='USD. Una diferencia de caja mayor (en valor absoluto) genera alerta.',
    )
    limite_anulaciones_dia_cajero = models.PositiveIntegerField(default=3)
    limite_anulaciones_dia_total = models.PositiveIntegerField(default=10)
    limite_descuentos_dia_cajero = models.PositiveIntegerField(default=5)
    limite_descuento_porcentaje = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('10.00'),
        help_text='Un descuento mayor a este % del subtotal de la venta se considera inusual.',
    )
    hora_tope_cierre = models.TimeField(
        default=time(18, 0),
        help_text='Si a esta hora sigue habiendo cajas abiertas del día, se genera alerta.',
    )
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'cantina'
        verbose_name = 'Parámetros de auditoría de cantina'
        verbose_name_plural = 'Parámetros de auditoría de cantina'

    def __str__(self):
        return 'Parámetros de auditoría de cantina'

    @classmethod
    def obtener(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
