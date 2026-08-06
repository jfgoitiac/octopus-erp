from datetime import date
from django.db import models
from django.db.models import Sum
from secretaria.models import Alumno
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal
import uuid

from simple_history.models import HistoricalRecords

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
        ('transferencia',  'Transferencia Bancaria'),
        ('pago_movil',     'Pago Móvil'),
        ('punto_de_venta', 'Punto de Venta'),
        ('zelle',          'Zelle'),
    )

    nombre        = models.CharField(max_length=50, unique=True)
    numero_cuenta = models.CharField(max_length=20, blank=True, null=True)
    activo        = models.BooleanField(default=True)
    # Un mismo banco puede aceptar varios métodos de pago a la vez
    # (ej. Banesco con Punto de Venta y Transferencia).
    tipos         = models.JSONField(default=list, blank=True)

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
        ('stripe', 'Stripe (Pago Online)'),
    )

    ESTATUS_PAGO = (
        ('completado', 'Completado'),
        ('anulado', 'Anulado'),
        ('en_revision', 'En Revisión'),
    )

    CONCEPTOS = (
        ('mensualidad', 'Mensualidad Escolar'),
        ('inscripcion', 'Inscripción'),
        ('solvencia', 'Solvencia'),
        ('materiales', 'Materiales'),
        ('proyecto_inversion', 'Proyecto de Inversión'),
        ('multa', 'Multa'),
        ('mixto', 'Pago Mixto (varios conceptos)'),
        ('otro', 'Otro'),
    )

    alumno = models.ForeignKey(Alumno, on_delete=models.PROTECT, related_name='pagos')
    usuario_receptor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    operacion_uuid = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    factura_id = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False, db_index=True)
    banco_receptor = models.ForeignKey(BancoInstitucional, on_delete=models.PROTECT, null=True, blank=True)
    banco_procedencia = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="Banco emisor del pagador (distinto de banco_receptor, que es el banco destino del colegio)"
    )
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
    fecha_pago = models.DateTimeField(default=timezone.now, db_index=True)
    referencia = models.CharField(max_length=100, blank=True, null=True)
    numero_lote = models.CharField(
        max_length=10, blank=True, null=True,
        help_text="Número de lote del cierre de punto de venta (agrupa varias transacciones del mismo corte/día, no es único)"
    )
    observaciones = models.TextField(blank=True, null=True)
    representante_documento = models.CharField(max_length=30, blank=True, null=True)
    estatus = models.CharField(
        max_length=20,
        choices=ESTATUS_PAGO,
        default='completado',
        db_index=True # Mejora: Indexado para reportes de auditoría rápidos
    )
    representante_nombre = models.CharField(max_length=150, blank=True, null=True)
    vuelto_usd = models.DecimalField(
        max_digits=10, decimal_places=2,
        default=Decimal('0.00'), null=True, blank=True,
        help_text="Vuelto entregado al representante en USD"
    )
    vuelto_ves = models.DecimalField(
        max_digits=20, decimal_places=2,
        default=Decimal('0.00'), null=True, blank=True,
        help_text="Vuelto entregado al representante en Bolívares"
    )
    # Multi-sede
    sede = models.ForeignKey(
        'multisede.Sede',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='pagos',
        verbose_name='Sede',
    )

    # Auditoría automática: registra cada cambio con usuario, fecha y valores anteriores
    history = HistoricalRecords()

    class Meta:
        constraints = [
            # Cubre pagos activos: completado y en_revision.
            # Los anulados quedan fuera para no bloquear reutilización de refs
            # en casos de reverso bancario legítimo.
            models.UniqueConstraint(
                fields=['referencia'],
                condition=models.Q(estatus__in=['completado', 'en_revision']),
                name='unique_referencia_pago_activo'
            )
        ]

    def __str__(self):
        return f"Pago {self.id} - {self.alumno.nombre} ({self.monto_usd} USD) - {self.operacion_uuid}"

    @staticmethod
    def normalizar_referencia(ref: str) -> str:
        """
        Normaliza una referencia bancaria para comparación uniforme:
        elimina espacios extremos, convierte a mayúsculas y colapsa
        espacios internos. Así 'abc 123', 'ABC123' y ' ABC 123 ' son iguales.
        """
        return ' '.join(ref.upper().split()) if ref else ''

    def clean(self):
        if self.metodo_pago == 'punto_de_venta':
            ref_pos = (self.referencia or '').strip()
            lote_pos = (self.numero_lote or '').strip()
            if not ref_pos.isdigit() or len(ref_pos) != 4:
                raise ValidationError({
                    'referencia': "Punto de Venta requiere un número de referencia de 4 dígitos."
                })
            if not lote_pos.isdigit() or len(lote_pos) != 4:
                raise ValidationError({
                    'numero_lote': "Punto de Venta requiere un número de lote de 4 dígitos."
                })
            self.numero_lote = lote_pos

        ref_limpia = self.normalizar_referencia(self.referencia) if self.referencia else None

        # Persistir la referencia normalizada para que el UniqueConstraint
        # a nivel de BD también opere sobre el valor limpio.
        if ref_limpia:
            self.referencia = ref_limpia

        if ref_limpia:
            duplicado_qs = Pago.objects.filter(
                referencia=ref_limpia,
                estatus__in=['completado', 'en_revision'],
            ).exclude(pk=self.pk)

            if duplicado_qs.exists():
                dup = duplicado_qs.first()
                raise ValidationError({
                    'referencia': (
                        f"Referencia duplicada: '{ref_limpia}' ya existe en el pago "
                        f"#{dup.pk} (factura {dup.factura_id or 'N/A'}, "
                        f"estatus: {dup.estatus}). "
                        "Verifique el número de transacción antes de continuar."
                    )
                })

        if self.monto_usd is not None and self.tasa_aplicada is not None and self.monto_ves is not None:
            if self.tasa_aplicada > 0:
                # Determinar dirección según método de pago para evitar error de redondeo inverso
                metodo = getattr(self, 'metodo_pago', None)
                pago_en_divisas = metodo in ('efectivo', 'zelle')

                if pago_en_divisas and self.monto_usd > 0:
                    # USD primario: VES debe derivarse de USD × tasa
                    monto_esperado_ves = (self.monto_usd * self.tasa_aplicada).quantize(Decimal('0.01'))
                    if abs(self.monto_ves - monto_esperado_ves) > Decimal('0.05'):
                        raise ValidationError({
                            'monto_ves': (
                                f"Discrepancia de integridad: El monto en bolívares ({self.monto_ves}) "
                                f"no coincide con el cálculo esperado ({monto_esperado_ves}). "
                                f"Diferencia: {abs(self.monto_ves - monto_esperado_ves)}."
                            )
                        })
                elif not pago_en_divisas and self.monto_ves > 0:
                    # VES primario: USD debe derivarse de VES / tasa
                    monto_esperado_usd = (self.monto_ves / self.tasa_aplicada).quantize(Decimal('0.01'))
                    if abs(self.monto_usd - monto_esperado_usd) > Decimal('0.05'):
                        raise ValidationError({
                            'monto_usd': (
                                f"Discrepancia de integridad: El equivalente en USD ({self.monto_usd}) "
                                f"no coincide con el cálculo esperado ({monto_esperado_usd}). "
                                f"Diferencia: {abs(self.monto_usd - monto_esperado_usd)}."
                            )
                        })

    def save(self, *args, **kwargs):
        """
        Lógica unificada de guardado: Generación de referencia para efectivo,
        validación de limpieza y cálculo de conversión VES.
        """
        is_new = self.pk is None

        # 1. Referencia automática para pagos en efectivo (USD y Bs.)
        if self.metodo_pago in ('efectivo', 'efectivo_ves') and not self.referencia:
            prefijo = 'EFECT' if self.metodo_pago == 'efectivo' else 'EFEBS'
            self.referencia = f"{prefijo}-{uuid.uuid4().hex[:8].upper()}"

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
            from django.db import transaction
            fecha = self.fecha_pago if self.fecha_pago else tz.now()
            date_prefix = fecha.strftime('%Y%m%d')
            with transaction.atomic():
                # select_for_update evita race condition en entornos multi-worker
                count = (
                    Pago.objects
                    .select_for_update()
                    .filter(factura_id__startswith=date_prefix)
                    .count()
                )
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
    pagado = models.BooleanField(default=False, db_index=True)
    fecha_pago = models.DateTimeField(blank=True, null=True)
    pagos = models.ManyToManyField(Pago, blank=True, related_name='mensualidades_pagadas')
    # Auditoría automática: registra cada cambio con usuario, fecha y valores anteriores
    history = HistoricalRecords()

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
    # Auditoría automática: registra cada cambio de monto con usuario, fecha y valores anteriores
    history = HistoricalRecords()

    class Meta:
        unique_together = ('alumno', 'periodo_escolar')
        ordering = ['-periodo_escolar']

    def __str__(self):
        return f"{self.alumno.nombre} - Inscripción {self.periodo_escolar} - {'Pagada' if self.pagado else 'Pendiente'}"


class CuotaSolvencia(models.Model):
    """
    Cargo anual de solvencia por período escolar. El monto se define por
    alumno (por defecto 0, no exigible) y, si es mayor a 0, debe pagarse
    antes de poder inscribir al alumno en ese período (ver InscripcionSerializer).

    `pagado`/`fecha_pago` NO se asignan a mano en ningún lugar del código:
    se derivan siempre en `save()` a partir de `monto_pagado` vs `monto_usd`
    (mismo patrón que `CuotaProyectoInversion`). Esto evita que quedara
    "pagado=True" desactualizado cuando alguien sube el monto después de
    cobrado (ej. desde ModalEditarAlumno) — antes eso dejaba deuda real
    invisible para el criterio de mora (ver cobranza/mora.py).
    """
    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE, related_name='cuotas_solvencia')
    periodo_escolar = models.CharField(max_length=20)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    monto_pagado = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    concepto = models.CharField(max_length=255, blank=True, default='')
    pagado = models.BooleanField(default=False)
    fecha_pago = models.DateTimeField(blank=True, null=True)
    pagos = models.ManyToManyField(Pago, blank=True, related_name='cuotas_solvencia_pagadas')

    class Meta:
        unique_together = ('alumno', 'periodo_escolar')
        ordering = ['-periodo_escolar']

    def __str__(self):
        return f"{self.alumno.nombre} - Solvencia {self.periodo_escolar} - {'Pagada' if self.pagado else 'Pendiente'}"

    def save(self, *args, **kwargs):
        """
        Deriva `pagado`/`fecha_pago` de `monto_pagado` vs `monto_usd` en cada
        guardado, sin importar qué código haya tocado el registro. Un monto
        de $0 sigue sin ser exigible (igual que el criterio de mora.py).

        Si el caller pasa `update_fields` (ej. `update_or_create()` desde
        AlumnoUpdateSerializer, que solo lista monto_usd/concepto), hay que
        agregarle 'pagado' y 'fecha_pago' a mano: si no, Django calcula estos
        campos en memoria pero el UPDATE en SQL ignora esas columnas y el
        cambio nunca se persiste.
        """
        saldado = self.monto_usd <= 0 or self.monto_pagado >= self.monto_usd
        if saldado:
            if not self.pagado:
                from django.utils import timezone
                self.fecha_pago = self.fecha_pago or timezone.now()
            self.pagado = True
        else:
            self.pagado = False
            self.fecha_pago = None

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {'pagado', 'fecha_pago'}

        super().save(*args, **kwargs)


class CuotaProyectoInversion(models.Model):
    """
    Cargo por período escolar del "Proyecto de Inversión", a nivel de
    REPRESENTANTE (no de alumno): si un representante tiene varios hijos
    inscritos, se cobra una sola vez por período, no una vez por hijo.

    Se genera junto con CuotaInscripcion (al abrir inscripciones o al cargar
    cuotas manualmente) usando el monto por defecto de ParametroGlobal
    (MONTO_PROYECTO_INVERSION_DEFECTO). El monto es ajustable por
    representante (ver secretaria.serializers.RepresentanteSerializer /
    módulo de Representantes) sin afectar a otros representantes. No es
    editable desde la ficha del alumno (Lista de Alumnos).

    Si está impaga, bloquea la inscripción de CUALQUIER alumno de ese
    representante (ver InscripcionSerializer), igual que una mensualidad o
    cuota de inscripción vencida.
    """
    representante = models.ForeignKey(
        'secretaria.Representante', on_delete=models.CASCADE,
        related_name='cuotas_proyecto_inversion'
    )
    periodo_escolar = models.CharField(max_length=20)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    monto_pagado = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    pagado = models.BooleanField(default=False)
    fecha_pago = models.DateTimeField(blank=True, null=True)
    pagos = models.ManyToManyField(Pago, blank=True, related_name='proyectos_inversion_pagados')
    # Auditoría automática: registra cada cambio de monto con usuario, fecha y valores anteriores
    history = HistoricalRecords()

    class Meta:
        unique_together = ('representante', 'periodo_escolar')
        ordering = ['-periodo_escolar']

    def __str__(self):
        return f"{self.representante.nombre} {self.representante.apellido} - Proyecto de Inversión {self.periodo_escolar} - {'Pagado' if self.pagado else 'Pendiente'}"

    def save(self, *args, **kwargs):
        """
        Deriva `pagado`/`fecha_pago` de `monto_pagado` vs `monto_usd` en cada
        guardado, igual que `CuotaSolvencia.save()`. Antes `pagado` se
        asignaba a mano en views.py al registrar el pago, así que subir
        `monto_usd` después (ver RepresentanteSerializer.update(), que hace
        update_or_create con defaults={'monto_usd': ...}) dejaba la cuota en
        pagado=True con deuda real pendiente, invisible para cobranza/mora.py.

        Igual que en CuotaSolvencia: si el caller pasa `update_fields` hay
        que agregarle 'pagado' y 'fecha_pago' a mano, si no el UPDATE de SQL
        de update_or_create() ignora esas columnas aunque Django las calcule
        en memoria.
        """
        saldado = self.monto_usd <= 0 or self.monto_pagado >= self.monto_usd
        if saldado:
            if not self.pagado:
                from django.utils import timezone
                self.fecha_pago = self.fecha_pago or timezone.now()
            self.pagado = True
        else:
            self.pagado = False
            self.fecha_pago = None

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {'pagado', 'fecha_pago'}

        super().save(*args, **kwargs)


class SolvenciaRepresentante(models.Model):
    """
    Constancia de solvencia del representante: se emite una sola vez, es
    intransferible (OneToOne) y certifica que, al momento de completar el
    pago de inscripción + proyecto de inversión, el representante no tenía
    ninguna deuda pendiente (mora) en ninguno de sus alumnos.

    ORIGEN:
      - 'automatica': generada por el sistema al registrar el pago que
        completa el proyecto de inversión (ver cobranza/solvencia.py).
      - 'manual': emitida a mano por un Director cuando el criterio
        automático no aplica (caso excepcional).
    """
    ORIGENES = (
        ('automatica', 'Automática'),
        ('manual', 'Manual (Director)'),
    )

    representante = models.OneToOneField(
        'secretaria.Representante', on_delete=models.PROTECT,
        related_name='solvencia'
    )
    numero = models.CharField(max_length=20, unique=True, editable=False)
    periodo_escolar = models.CharField(max_length=20)
    origen = models.CharField(max_length=15, choices=ORIGENES, default='automatica')
    fecha_generacion = models.DateTimeField(auto_now_add=True)
    pago_generador = models.ForeignKey(
        Pago, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solvencias_generadas'
    )
    emitida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='solvencias_emitidas_manualmente',
        help_text="Solo aplica para origen='manual'"
    )
    observaciones = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.numero} - {self.representante.cedula}"


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


class LoteRevisionCaja(models.Model):
    """
    Lote de transacciones que un operador marcó como conciliadas contra los
    comprobantes físicos, para un rango de fechas dado. El checklist opera a
    nivel de operación (operacion_uuid), pero se guarda la relación con cada
    Pago individual para poder auditar/consultar el detalle después.
    """
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='lotes_revision_caja',
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    observaciones = models.TextField(blank=True, default='')
    pagos = models.ManyToManyField(Pago, related_name='lotes_revision')

    class Meta:
        ordering = ['-fecha_creacion']

    def __str__(self):
        return f"Lote #{self.pk} ({self.fecha_inicio} — {self.fecha_fin}) por {self.usuario}"


class ClasificacionPagoManual(models.Model):
    """
    Desglose manual de un pago que el desglose automático (M2M de
    mensualidades/cuotas) no pudo reconstruir — típicamente pagos
    concepto='mixto' registrados antes de enlazar cuotas específicas.
    El contador reparte el monto del pago en una o más líneas de este tipo.
    """
    TIPOS = (
        ('inscripcion', 'Inscripción'),
        ('proyecto_inversion', 'Proyecto de Inversión'),
        ('mes_atrasado', 'Mes Atrasado'),
        ('proyecto_inversion_atrasado', 'Proyecto de Inversión Atrasado'),
    )

    pago = models.ForeignKey(Pago, on_delete=models.CASCADE, related_name='clasificaciones_manuales')
    tipo = models.CharField(max_length=30, choices=TIPOS)
    # Solo aplican cuando tipo='mes_atrasado'.
    mes = models.PositiveSmallIntegerField(null=True, blank=True)
    anio = models.PositiveSmallIntegerField(null=True, blank=True)
    monto_usd = models.DecimalField(max_digits=10, decimal_places=2)
    nota = models.TextField(blank=True, null=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='clasificaciones_pago_manual',
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"Clasificación #{self.pk} - Pago {self.pago_id} - {self.tipo} ({self.monto_usd} USD)"

    def clean(self):
        if self.tipo == 'mes_atrasado':
            if not self.mes or not self.anio:
                raise ValidationError({
                    'mes': "Debe indicar mes y año cuando el tipo es 'Mes Atrasado'."
                })
        else:
            self.mes = None
            self.anio = None
