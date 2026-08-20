# Módulo Cantina — Especificación Técnica Completa

> Documento de requerimientos para implementar el módulo de Cantina (POS + Inventario + Tarjeta Prepago) siguiendo los mismos estándares de arquitectura, UI/UX y calidad que los módulos `cobranza`, `notificaciones`, `portal` (representantes) y `portal-docente` ya existentes en Octopus.
>
> **Nota:** este proyecto no usa Stripe ni ninguna pasarela de pago con tarjeta de crédito/débito online. Todo pago (venta, recarga) es efectivo en caja o transferencia/pago móvil/zelle con comprobante manual, igual que en `cobranza`. No se recomienda ni se contempla Stripe en ninguna fase.

---

## 1. Contexto y objetivo

La cantina del colegio necesita un punto de venta (POS) donde el cajero cobra productos a estudiantes usando una **tarjeta prepago** cuyo saldo recarga el representante (o el propio cajero en efectivo). El módulo incluye inventario con control de stock, y reutiliza al máximo la lógica ya construida en `cobranza` (métodos de pago, comprobantes, cierre de caja, mora) y en `notificaciones` (email, push, Celery) para no duplicar código ni criterios.

**No es una re-implementación de cobranza** — es un dominio nuevo (`cantina`) que **referencia** patrones de `cobranza`/`notificaciones` pero no depende de sus modelos.

---

## 2. Actores y roles

| Actor | Rol existente reutilizado | Acceso |
|---|---|---|
| Cajero de cantina | `ROLES.CAJERO` (mismo rol ya existente, embebido en el JWT propio de cantina) | Login propio en `/cantina/login`, ruta `/cantina/pos` únicamente |
| Director / Administrador | `ROLES.DIRECTOR`, `ROLES.ADMINISTRADOR` | Login propio en `/cantina/login`, todo `/cantina/*` (inventario, tarjetas, reportes, cierre) |
| Representante | Auth del `/portal` ya existente (sin cambios) | Nueva pestaña "Cantina" en el dashboard del portal |
| Estudiante | Sin login | Se identifica en el POS por tarjeta escaneada o búsqueda manual |

**No se crea ningún rol nuevo** — se reutilizan `ROLES.CAJERO`/`ROLES.ADMINISTRADOR`/`ROLES.DIRECTOR` tal cual existen hoy.

**Sí se crea un sistema de auth/JWT separado para cantina — decisión deliberada, confirmada explícitamente.** Motivo: la cantina se opera desde una PC/tablet fija en el mostrador, muchas veces con el cajero logueado ahí todo el turno; ese dispositivo **no debe compartir sesión con el panel administrativo** — si alguien deja la cantina abierta, no expone el resto del sistema, y viceversa, un admin logueado en su oficina no arrastra automáticamente acceso al POS. Mismo patrón ya usado en `/portal` (representantes) y `/portal-docente` (docentes), extendido aquí a `/cantina`:

- Backend: `CantinaTokenView` (`POST /api/cantina/login/`) + `CantinaTokenRefreshView` (`POST /api/cantina/token/refresh/`), reutilizando `MyTokenObtainPairSerializer` (el mismo emisor de JWT del panel admin — no se reinventa la emisión de tokens, solo se agrega el rechazo explícito de usuarios cuyo rol no sea `cajero`/`administrador`/`director`). Las vistas de negocio de `cantina` (`views.py`) no verifican de dónde salió el token, solo el rol embebido — cualquier JWT válido con rol permitido funciona, sin importar qué endpoint de login lo emitió.
- Frontend: módulo separado bajo `src/cantina/` (`CantinaAuthContext`, `CantinaProtectedRoute` con soporte de `allowedRoles`, `CantinaLayout`, `cantinaApiClient`/`cantinaAuthClient`), con token propio en `localStorage` bajo las claves `cantina_token`/`cantina_refresh_token` (separadas de las que usa el panel admin y de `portal_token`). `CantinaLogin.jsx` vive en `/cantina/login`.

Esta sección reemplaza cualquier mención previa (o futura) de "reutilizar `ProtectedRoute`/JWT del panel admin sin login aparte" para `/cantina/*` — si en algún punto de este documento aparece esa idea, **no aplica**, prevalece lo descrito acá.

---

## 3. Alcance

**Incluido:**
- Tarjeta prepago por alumno con saldo (permite negativo/crédito hasta un límite configurable).
- Recarga desde `/portal` (transferencia, pago móvil, zelle, con comprobante) y recarga en efectivo/transferencia/pago móvil/zelle desde el cajero, con **moneda dual (USD/VES) igual que cobranza** y reutilizando su catálogo de bancos institucionales y tasa de cambio.
- **Validación de referencia bancaria duplicada CRUZADA entre cobranza y cantina** (una referencia usada en un módulo no se puede reutilizar en el otro), reciclando y extendiendo la lógica antifraude que ya existe en `cobranza`.
- Inventario de productos con código de barras.
- POS con doble lector tipo teclado (producto por barcode, estudiante por tarjeta) + búsqueda manual de respaldo.
- **Datos del cliente (alumno/cédula) son opcionales en cada venta** — solo se piden si el pago es con tarjeta prepago; una venta en efectivo se cobra sin identificar a nadie.
- Venta con descuento automático de stock y de saldo de tarjeta, con total en USD y equivalente en VES según tasa vigente.
- Cierre de caja diario por cajero.
- Reportes: ventas, productos más vendidos, stock crítico, saldo total emitido en tarjetas (pasivo), **reimpresión de tickets históricos**.
- Extensión del portal de representantes: ver saldo, recargar, historial de consumo.
- **Generación de tarjetas QR en lote** (el admin pide una cantidad, el sistema genera N códigos únicos y entrega un `.zip` con las imágenes QR listas para imprimir) y **flujo de asignación** de cada tarjeta física a un alumno (por cédula del representante).
- **Notificación por email/push al representante** cuando su recarga es aprobada y cuando el saldo de su hijo queda negativo.
- **Recordatorios automáticos de mora de cantina** (saldo negativo sostenido), reutilizando el motor de Celery + `notificaciones` que ya usa `cobranza`.

**Fuera de alcance explícito (no construir sin confirmación):**
- Cualquier pasarela de pago con tarjeta de crédito/débito online (Stripe u otra) — **descartado para este proyecto**.
- Integración nativa con hardware NFC (se asume lector HID tipo teclado).
- Menú/planificación de comidas — solo venta de productos con stock.
- Cobro de interés/recargo por mora de cantina — solo se notifica y se bloquea el pago con tarjeta al superar el límite de crédito, no se cobra nada extra.

---

## 4. Reutilización explícita (no reinventar)

| Necesidad | Se reutiliza de |
|---|---|
| Métodos de pago para recarga (transferencia, pago móvil, zelle, efectivo) + estado de comprobante | Patrón de `cobranza.Pago` (`METODOS`, `ESTATUS_PAGO`) — mismos choices, nuevo modelo |
| Cierre de caja diario | Patrón de `cobranza.CierreCaja` |
| Uploader de comprobante + preview | `portal/components/ComprobantePagoModal.jsx` (mismo componente, o copia adaptada) |
| Skeleton loaders, toasts, AbortController en fetch | Convención ya usada en `PortalDashboard.jsx` |
| Widgets de dashboard (tarjetas de resumen) | Patrón `portal/components/widgets/Widget*.jsx` |
| Rutas protegidas + lazy loading | `App.jsx` (`ProtectedRoute`, `lazy()`, `ROLES`) |
| PDFs (tickets/recibos) | `jsPDF` + `jspdf-autotable`, mismo patrón que recibos de cobranza |
| Export Excel | `xlsx`, mismo patrón que `ExportarAuditoriaExcelView` |
| Formato de fechas en español | `date-fns` con locale `es`, obligatorio en toda fecha visible |
| **Envío de email/push** | `notificaciones/services.py` (`enviar_email`, `enviar_push`, `_render_email`) — **no se crea un sistema de envío nuevo** |
| **Regla de mora/días de atraso** | Patrón de `cobranza/mora.py` (módulo centralizado de criterio) + `cobranza/tasks.py` (`task_notificar_mora`, `shared_task` de Celery) |
| **Templates de email** | `notificaciones/templates/notificaciones/*.html` — se agregan `cantina_recarga_aprobada.html`, `cantina_saldo_negativo_dia_X.html` en la misma carpeta |
| **Celery Beat** | `config/settings.py` → `CELERY_BEAT_SCHEDULE` (mismo diccionario donde ya vive `verificar_solvencia_estudiantil_automatica`) |
| **Búsqueda de representante por cédula (para asignar tarjeta)** | `secretaria.models.Representante` (campo `cedula`, único) + `Alumno.representante` — mismo criterio de búsqueda que ya usa `BuscarAlumnoCobranzaView` en `cobranza`, no se crea un buscador nuevo |

**Dependencia nueva requerida (única de todo el módulo):** el paquete Python `qrcode` (genera las imágenes QR en el backend). `Pillow` ya está en `requirements.txt` (`pillow==12.2.0`), que es lo único que `qrcode` necesita además de sí mismo. **No se agrega nada al frontend** — las imágenes se generan 100% en el backend y se descargan como archivos, confirmado contigo para no tocar el stack de React sin avisar.

---

## 5. Backend — esquema completo (Django, app `cantina`)

```
octopus-api/cantina/
├── __init__.py
├── apps.py
├── admin.py
├── models.py
├── serializers.py
├── permissions.py
├── mora_cantina.py      # criterio de saldo negativo sostenido (equivalente a cobranza/mora.py)
├── signals.py
├── tasks.py             # Celery: recordatorios de saldo negativo
├── views.py
├── urls.py
└── migrations/
```

Registrar `'cantina'` en `INSTALLED_APPS` e incluir `path('api/cantina/', include('cantina.urls'))` en `config/urls.py`, mismo prefijo que `cobranza`.

### 5.1 Ciclo de vida del código QR — generación, formato y asignación

Este apartado responde a una pregunta que el diseño original no se hacía: **¿qué lleva el QR y cómo se registra?** Definir esto mal introduce bugs de seguridad reales (no solo de UX), así que se detalla aparte antes de los modelos.

**Qué NO lleva el QR — regla dura:**
El QR **nunca** codifica cédula, nombre, ID interno del alumno ni ningún dato personal. Codifica únicamente un **token opaco aleatorio** (`TarjetaPrepago.codigo`). Razón: si el QR se fotografía, se cae al suelo o se traspapela, no debe revelar de quién es ni servir para nada fuera del sistema. El backend es el único que sabe a qué alumno corresponde.

**Formato del token:**
- Prefijo fijo `CANT-` (nunca choca con un `codigo_barras` de producto, que es numérico tipo EAN-13 — esto es lo que le permite al POS distinguir "esto es una tarjeta" de "esto es un producto" sin depender de qué lector fue).
- 10 caracteres en un alfabeto Base32 sin ambigüedad (sin `0/O`, `1/I/L`) — así, si un cajero necesita teclearlo a mano porque el QR está dañado, no hay confusión visual.
- Ejemplo: `CANT-7K9M2XQPRT`.
- Generado con `secrets.choice` (criptográficamente aleatorio, no secuencial — un código secuencial sería adivinable). Se reintenta en el remoto caso de colisión contra el `unique=True` de la base de datos.

**Vector de fraude propio del QR (no existe con NFC):** a diferencia de un chip físico, un QR se puede fotografiar y mostrar desde la pantalla de otro celular para hacerse pasar por el dueño de la tarjeta. La única mitigación realista sin hardware adicional es de **proceso, no de código**: el POS, al leer cualquier tarjeta, siempre muestra en pantalla la foto (si existe en `Alumno`) y el nombre completo del estudiante antes de habilitar el botón de cobro — ver §7.2. El cajero es la barrera humana.

**Ciclo de vida — provisioning en lote (decisión confirmada):**
1. Admin/director entra a `CantinaTarjetas.jsx` → "Generar lote" → indica una cantidad (ej. 50).
2. Backend crea un `LoteTarjetas` (agrupa el lote) y N filas de `TarjetaPrepago` con `alumno=None`, `estado='sin_asignar'`, cada una con su `codigo` (el token QR, aleatorio) y su `serial` (identificador humano secuencial dentro del lote, ej. `L003-0001`..`L003-0050`, impreso en texto plano junto al QR para inventario físico y como referencia si el QR se daña — **el `serial` nunca sirve para cobrar**, solo para ubicar la tarjeta física durante la asignación o en un inventario; la única credencial válida para una venta es el `codigo` leído del QR).
3. El backend responde con un `.zip` descargable: una imagen `PNG` por tarjeta (nombrada por `serial`), generada con `qrcode` + `Pillow`, lista para imprimir/laminar.
4. Cuando se entrega una tarjeta física a un representante, el admin/cajero hace clic en "Asignar tarjeta": escanea el QR (o busca por `serial` si el QR no lee), el sistema resuelve la `TarjetaPrepago` en `sin_asignar` correspondiente, pide la **cédula del representante**, busca en la misma base ya usada por `secretaria.Representante`/`Alumno` (igual que `BuscarAlumnoCobranzaView` en `cobranza`), muestra sus hijos inscritos, el admin selecciona el alumno y confirma → el backend setea `alumno` y `estado='activa'`.
5. Si el alumno seleccionado **ya tiene** una tarjeta activa (viola el `OneToOneField`), el flujo no deja completar la asignación silenciosamente — muestra el conflicto y ofrece el flujo de "reposición" (§8.3) en vez de fallar con un error 500 genérico.

**Reposición de tarjeta extraviada/dañada (con auditoría):**
No se sobrescribe el `codigo` a ciegas. El endpoint de reposición: genera un nuevo `codigo` para la `TarjetaPrepago` existente (mismo `alumno`, mismo `saldo` — el saldo no se pierde), registra el cambio en `HistorialCodigoTarjeta` (código anterior, motivo, quién lo hizo, cuándo), y marca la tarjeta física vieja como inválida de forma permanente — si alguien intenta escanear el QR extraviado después, el `codigo` viejo ya no resuelve a ninguna tarjeta activa (el nuevo código es el único vigente en la fila).

### 5.2 Modelos (`cantina/models.py`)

```python
from decimal import Decimal
from django.db import models
from django.conf import settings
from secretaria.models import Alumno


class ParametroCantina(models.Model):
    """Configuración global de cantina — equivalente a cobranza.ParametroGlobal."""
    limite_credito_default = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('5.00'))
    dias_alerta_saldo_negativo = models.CharField(
        max_length=50, default='1,3,7',
        help_text='Días de saldo negativo sostenido en que se envía recordatorio, separados por coma.'
    )

    class Meta:
        verbose_name = 'Parámetro de Cantina'
        verbose_name_plural = 'Parámetros de Cantina'


class LoteTarjetas(models.Model):
    """Agrupa un lote de tarjetas QR generadas de una sola vez (ej. 'lote 50 tarjetas agosto 2026')."""
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
    regenera (extravío/daño), queda registro del código anterior invalidado."""
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


class VentaCantina(models.Model):
    METODOS_PAGO = (
        ('tarjeta_prepago', 'Tarjeta Prepago'),
        ('efectivo', 'Efectivo Divisas (USD)'),
        ('efectivo_ves', 'Efectivo Bolívares (VES)'),
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
    cajero = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='ventas_cantina')
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO)
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
    fecha = models.DateField()
    total_ventas = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_tarjeta = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_recargas_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    conteo_fisico = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    diferencia = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    observaciones = models.TextField(blank=True)
    cerrado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('cajero', 'fecha')
        ordering = ['-fecha']
```

**Reglas de negocio (en `serializers.py`/servicios, no en el modelo):**
- `TarjetaPrepago.saldo` no puede bajar de `-limite_credito`.
- Todo cambio de saldo pasa por un servicio `aplicar_movimiento_tarjeta(tarjeta, tipo, monto, ...)` dentro de `transaction.atomic()` + `select_for_update()`, que crea el `MovimientoTarjeta`, actualiza `saldo`, y mantiene `saldo_negativo_desde` (lo setea la primera vez que `saldo < 0`, lo limpia cuando vuelve a `>= 0`).
- Venta con `metodo_pago='tarjeta_prepago'`: descuenta stock y saldo en la misma transacción — si falla el stock, no se toca el saldo, y viceversa.
- Nunca se permite stock negativo (a diferencia del saldo de tarjeta, que sí admite negativo dentro del límite).
- `ProductoCantina.precio` vive siempre en **USD** (igual que `Mensualidad.monto_usd` en cobranza) — es la moneda canónica del sistema. El VES es siempre un valor derivado con la tasa del momento, nunca se persiste un precio "nativo" en bolívares.
- **`alumno`/`tarjeta` en `VentaCantina` son opcionales SOLO si `metodo_pago` es `efectivo` o `efectivo_ves`.** Si `metodo_pago == 'tarjeta_prepago'`, `tarjeta` es obligatorio (no se puede descontar saldo de nadie). Esta es una validación condicional en el serializer, no una restricción de base de datos — ver §7.2.
- `RegistrarVentaView` obtiene la tasa vigente con `TasaCambio.objects.latest('fecha')` (mismo criterio que `cobranza`) y la congela en `VentaCantina.tasa_aplicada` — nunca recalcula la tasa de una venta pasada al mostrarla después.

### 5.3 Mora de cantina (`cantina/mora_cantina.py`)

Módulo centralizado, mismo espíritu que `cobranza/mora.py`, pero mucho más simple (una sola regla, no cuatro tipos de deuda):

```python
"""
Fuente de verdad para el criterio de "saldo negativo sostenido" en cantina.
Un alumno entra en este estado cuando TarjetaPrepago.saldo < 0.
Los días de recordatorio (por defecto 1, 3 y 7) son configurables en
ParametroCantina.dias_alerta_saldo_negativo.
No genera intereses ni bloquea nada por sí mismo — solo decide CUÁNDO notificar.
El bloqueo real del pago con tarjeta ya ocurre en el momento de la venta
cuando el saldo proyectado excede `limite_credito` (ver views.RegistrarVentaView).
"""
from datetime import date

def dias_en_negativo(tarjeta):
    if tarjeta.saldo_negativo_desde is None:
        return 0
    return (date.today() - tarjeta.saldo_negativo_desde).days

def debe_notificarse_hoy(tarjeta, dias_configurados):
    return dias_en_negativo(tarjeta) in dias_configurados
```

### 5.4 Notificaciones — integración con `notificaciones/services.py`

**No se crea un servicio de envío nuevo.** Se agregan solo las funciones específicas de contenido en `cantina`, que llaman a `notificaciones.services.enviar_email` / `enviar_push` (las mismas que usa `cobranza`):

```python
# cantina/notificaciones_cantina.py
from notificaciones.services import enviar_email, enviar_push, _render_email, _push_representante

def notificar_recarga_aprobada(recarga):
    tarjeta = recarga.tarjeta
    rep = tarjeta.alumno.representante
    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{tarjeta.alumno.nombre} {tarjeta.alumno.apellido}',
        'monto': str(recarga.monto),
        'saldo_actual': str(tarjeta.saldo),
    }
    html = _render_email('cantina_recarga_aprobada.html', ctx)
    enviar_email(rep.correo, 'Recarga de cantina aprobada', html)
    _push_representante(rep, 'cantina', 'Recarga aprobada', f'Se acreditaron ${recarga.monto} a la tarjeta de {ctx["nombre_alumno"]}')

def notificar_saldo_negativo(tarjeta, dias_mora):
    rep = tarjeta.alumno.representante
    ctx = {
        'nombre_representante': f'{rep.nombre} {rep.apellido}',
        'nombre_alumno': f'{tarjeta.alumno.nombre} {tarjeta.alumno.apellido}',
        'saldo': str(tarjeta.saldo),
        'dias_mora': dias_mora,
    }
    tmpl = f'cantina_saldo_negativo_dia_{dias_mora}.html'  # o una plantilla genérica con dias_mora en contexto
    html = _render_email(tmpl, ctx)
    enviar_email(rep.correo, f'Saldo de cantina en negativo — {ctx["nombre_alumno"]}', html)
    _push_representante(rep, 'cantina', 'Saldo de cantina negativo', f'La tarjeta de {ctx["nombre_alumno"]} está en ${tarjeta.saldo}')
```

Templates nuevos en `octopus-api/notificaciones/templates/notificaciones/`:
- `cantina_recarga_aprobada.html`
- `cantina_saldo_negativo.html` (una sola plantilla genérica que recibe `dias_mora` en el contexto, en vez de una por día — más simple que el patrón de mora_dia_0/5/10/15 de cobranza porque cantina no tiene cuatro tipos de deuda distintos, solo uno).

### 5.5 Tareas Celery (`cantina/tasks.py`)

```python
from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task
def task_notificar_recarga_aprobada(recarga_id):
    from cantina.models import RecargaTarjeta
    from cantina.notificaciones_cantina import notificar_recarga_aprobada
    try:
        recarga = RecargaTarjeta.objects.select_related('tarjeta__alumno__representante').get(id=recarga_id)
        notificar_recarga_aprobada(recarga)
    except Exception:
        logger.exception('Error notificando recarga aprobada id=%s', recarga_id)


@shared_task
def verificar_saldos_negativos_cantina():
    """Recorre tarjetas en negativo y notifica según ParametroCantina.dias_alerta_saldo_negativo."""
    from cantina.models import TarjetaPrepago, ParametroCantina
    from cantina.mora_cantina import dias_en_negativo, debe_notificarse_hoy
    from cantina.notificaciones_cantina import notificar_saldo_negativo

    parametros = ParametroCantina.objects.first()
    dias_config = [int(d) for d in (parametros.dias_alerta_saldo_negativo if parametros else '1,3,7').split(',')]

    for tarjeta in TarjetaPrepago.objects.filter(saldo__lt=0, saldo_negativo_desde__isnull=False):
        dias = dias_en_negativo(tarjeta)
        if debe_notificarse_hoy(tarjeta, dias_config):
            notificar_saldo_negativo(tarjeta, dias)
```

`task_notificar_recarga_aprobada` se dispara desde `AprobarRecargaView` (llamada `.delay(recarga.id)` justo después de aprobar, mismo patrón que `task_notificar_pago_exitoso` en `cobranza`).

`verificar_saldos_negativos_cantina` se agrega a `config/settings.py → CELERY_BEAT_SCHEDULE`, junto a `verificar_solvencia_estudiantil_automatica`, corriendo una vez al día:

```python
CELERY_BEAT_SCHEDULE['verificar-saldos-negativos-cantina'] = {
    'task': 'cantina.tasks.verificar_saldos_negativos_cantina',
    'schedule': crontab(hour=7, minute=0),  # mismo horario que el resto de jobs diarios de cobranza
}
```

### 5.6 Vistas (`cantina/views.py`)

Estilo `APIView` explícita por acción, igual que `cobranza/views.py`:

| Vista | Método | Descripción |
|---|---|---|
| `GenerarLoteTarjetasView` | POST `{cantidad}` | Crea `LoteTarjetas` + N `TarjetaPrepago(estado='sin_asignar')`, devuelve un `.zip` con un PNG por tarjeta (generado con `qrcode`+`Pillow`, nombrado por `serial`) |
| `BuscarTarjetaSinAsignarView` | GET `?codigo=` o `?serial=` | Ubica una tarjeta `sin_asignar` durante el proceso de asignación |
| `BuscarRepresentantePorCedulaView` | GET `?cedula=` | Devuelve representante + lista de sus alumnos (mismo criterio que `BuscarAlumnoCobranzaView` de `cobranza`) |
| `AsignarTarjetaView` | POST `<tarjeta_id>/asignar/` `{alumno_id}` | Vincula la tarjeta al alumno, `estado='activa'`; si el alumno ya tiene tarjeta activa, devuelve el conflicto explícito en vez de un error genérico |
| `ReponerTarjetaView` | POST `<tarjeta_id>/reponer/` `{motivo}` | Regenera `codigo` (mismo alumno y saldo), registra `HistorialCodigoTarjeta`, invalida el código viejo |
| `BuscarTarjetaView` | GET `?codigo=` | Busca tarjeta activa por código escaneado (uso en el POS) |
| `ProductoBuscarPorCodigoView` | GET `?codigo=` | Busca producto por código de barras (para el POS) |
| `ProductosListCreateView` | GET / POST | Listado e inventario (admin) |
| `ProductoDetailView` | GET/PUT/DELETE `<pk>` | Editar producto |
| `MovimientoInventarioCreateView` | POST | Registrar entrada/ajuste manual de stock |
| `RegistrarVentaView` | POST | Crea venta + detalle, descuenta stock y saldo en transacción. `alumno`/`tarjeta` **opcionales** salvo `metodo_pago='tarjeta_prepago'` (§5.9) — un cobro en efectivo no pide ningún dato del cliente |
| `AnularVentaView` | POST `<venta_id>/anular/` | Reversa stock y saldo |
| `TarjetasListView` | GET | Listado de tarjetas (admin) |
| `BancosCantinaView` | GET | Devuelve el catálogo de `cobranza.BancoInstitucional` activo, para poblar el selector de banco en el formulario de recarga (sin duplicar el modelo) |
| `RecargarTarjetaCajeroView` | POST | Recarga en efectivo desde el POS/admin (aprobada al instante). Valida duplicidad de referencia vía `buscar_referencia_duplicada` si el método la requiere |
| `RecargasPendientesView` | GET | Recargas del portal en estado `pendiente` |
| `AprobarRecargaView` / `RechazarRecargaView` | POST `<pk>/aprobar/` `/rechazar/` | Revisión; `AprobarRecargaView` dispara `task_notificar_recarga_aprobada.delay(...)` |
| `CierreCajaCantinaView` | GET/POST | Cierre del día del cajero autenticado |
| `ReporteVentasView` | GET | Ventas por rango, productos más vendidos |
| `ReporteStockCriticoView` | GET | Productos bajo `stock_minimo` |
| `ReciboVentaPDFView` | GET `<venta_id>/recibo/` | Genera/**regenera** el ticket en PDF — sirve tanto para el ticket recién cobrado como para la **reimpresión histórica** desde reportes |
| `ExportarVentasExcelView` | GET | Export Excel del rango |

Endpoints del portal (extendiendo `portal/views.py`):

| Vista | Método | Descripción |
|---|---|---|
| `PortalSaldoTarjetaView` | GET | Saldo y estado de tarjeta del/los hijo(s) |
| `PortalHistorialConsumoView` | GET (paginado) | Consumos del alumno |
| `PortalRecargarTarjetaView` | POST (multipart) | Crea `RecargaTarjeta` en `pendiente`, `registrado_por_portal=True`. Pide los campos bancarios según el método elegido (tabla de §5.9) y valida duplicidad de referencia contra cobranza + cantina antes de aceptar el comprobante |

### 5.7 URLs (`cantina/urls.py`)

```python
from django.urls import path
from .views import (
    BuscarTarjetaView, ProductoBuscarPorCodigoView, ProductosListCreateView,
    ProductoDetailView, MovimientoInventarioCreateView, RegistrarVentaView,
    AnularVentaView, TarjetasListView, RecargarTarjetaCajeroView,
    RecargasPendientesView, AprobarRecargaView, RechazarRecargaView,
    CierreCajaCantinaView, ReporteVentasView, ReporteStockCriticoView,
    ReciboVentaPDFView, ExportarVentasExcelView,
    GenerarLoteTarjetasView, BuscarTarjetaSinAsignarView,
    BuscarRepresentantePorCedulaView, AsignarTarjetaView, ReponerTarjetaView,
    BancosCantinaView,
)

urlpatterns = [
    path('bancos/',                       BancosCantinaView.as_view(),            name='cantina-bancos'),
    path('tarjetas/generar-lote/',        GenerarLoteTarjetasView.as_view(),      name='cantina-generar-lote'),
    path('tarjetas/sin-asignar/buscar/',  BuscarTarjetaSinAsignarView.as_view(),  name='cantina-buscar-sin-asignar'),
    path('representantes/buscar/',        BuscarRepresentantePorCedulaView.as_view(), name='cantina-buscar-representante'),
    path('tarjetas/<int:tarjeta_id>/asignar/', AsignarTarjetaView.as_view(),      name='cantina-asignar-tarjeta'),
    path('tarjetas/<int:tarjeta_id>/reponer/', ReponerTarjetaView.as_view(),      name='cantina-reponer-tarjeta'),
    path('tarjetas/buscar/',              BuscarTarjetaView.as_view(),            name='cantina-buscar-tarjeta'),
    path('tarjetas/',                     TarjetasListView.as_view(),             name='cantina-tarjetas-lista'),
    path('tarjetas/recargar/',            RecargarTarjetaCajeroView.as_view(),    name='cantina-recargar-cajero'),
    path('recargas/pendientes/',          RecargasPendientesView.as_view(),       name='cantina-recargas-pendientes'),
    path('recargas/<int:pk>/aprobar/',    AprobarRecargaView.as_view(),           name='cantina-recarga-aprobar'),
    path('recargas/<int:pk>/rechazar/',   RechazarRecargaView.as_view(),          name='cantina-recarga-rechazar'),
    path('productos/',                    ProductosListCreateView.as_view(),      name='cantina-productos'),
    path('productos/<int:pk>/',           ProductoDetailView.as_view(),           name='cantina-producto-detalle'),
    path('productos/buscar-codigo/',      ProductoBuscarPorCodigoView.as_view(),  name='cantina-producto-buscar-codigo'),
    path('inventario/movimiento/',        MovimientoInventarioCreateView.as_view(), name='cantina-inventario-movimiento'),
    path('ventas/registrar/',             RegistrarVentaView.as_view(),           name='cantina-registrar-venta'),
    path('ventas/<int:venta_id>/anular/', AnularVentaView.as_view(),              name='cantina-anular-venta'),
    path('ventas/<int:venta_id>/recibo/', ReciboVentaPDFView.as_view(),           name='cantina-recibo'),
    path('cierre-caja/',                  CierreCajaCantinaView.as_view(),        name='cantina-cierre-caja'),
    path('reportes/ventas/',              ReporteVentasView.as_view(),            name='cantina-reporte-ventas'),
    path('reportes/stock-critico/',       ReporteStockCriticoView.as_view(),      name='cantina-stock-critico'),
    path('reportes/ventas/excel/',        ExportarVentasExcelView.as_view(),      name='cantina-exportar-ventas-excel'),
]
```

### 5.8 Permisos (`cantina/permissions.py`)

**Ya implementado — el esquema real difiere del borrador original de abajo.** El rol NO vive en `request.user.rol` (ese atributo no existe en el modelo de usuario del proyecto); vive en `request.user.perfil.rol`, con `request.user.perfil.esta_activo` como flag de cuenta activa, y `request.user.is_superuser` pasa siempre. Mismo patrón que `EsPersonalCobranza` en `authentication/views.py` — no inventar un esquema nuevo:

```python
from rest_framework import permissions

class EsCajeroOAdmin(permissions.BasePermission):
    """Cajero de cantina, administrador o director."""
    ROLES = {'director', 'administrador', 'cajero'}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in self.ROLES
        except Exception:
            return False

class EsAdminCantina(permissions.BasePermission):
    """Solo administrador o director — gestión de inventario, tarjetas y reportes."""
    ROLES = {'director', 'administrador'}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return request.user.perfil.esta_activo and request.user.perfil.rol in self.ROLES
        except Exception:
            return False
```

Nota: estas clases no verifican de dónde salió el JWT (login de cantina, del portal, del admin) — solo el rol embebido en el token, siguiendo el criterio de §2. En la práctica solo se emiten tokens con estos roles desde `CantinaTokenView` (`/api/cantina/login/`), que además rechaza explícitamente cualquier rol fuera de `{'cajero','administrador','director'}` antes de emitir el token.

Las vistas de generación/asignación/reposición de tarjetas (§5.6, Fase 2) usan `EsAdminCantina` — el Cajero no gestiona tarjetas, solo vende con ellas en el POS (Fase 4).

### 5.9 Métodos de pago, moneda dual y validación de referencias duplicadas (compartido con cobranza)

**No se crea una configuración de métodos de pago nueva para cantina.** Se reutiliza tal cual el catálogo que ya existe en el panel administrativo:
- `cobranza.BancoInstitucional` — mismos bancos institucionales del colegio, mismos métodos que soporta cada uno (`tipos`). `RecargaTarjeta.banco_receptor` apunta directo a este modelo (FK cross-app, `'cobranza.BancoInstitucional'`).
- `cobranza.TasaCambio` — misma fuente de la tasa BCV vigente. `RecargaTarjeta` y `VentaCantina` toman `TasaCambio.objects.latest('fecha')` igual que `cobranza`, nunca mantienen una tasa propia.
- `cobranza.Pago.METODOS` — cantina reutiliza esta misma tupla de choices menos `'stripe'`, en vez de mantener una lista de métodos de pago duplicada y potencialmente desincronizada.

**Moneda dual (igual que cobranza):** tanto `RecargaTarjeta` como `VentaCantina` guardan el monto canónico en USD (`monto_usd`/`total_usd`) + la tasa aplicada como snapshot (`tasa_aplicada`) + el equivalente en VES ya calculado (`monto_ves`/`total_ves`, campos `editable=False`, calculados en el serializer/servicio al crear, nunca en el modelo). El usuario puede ingresar el monto en USD o en VES según el método (transferencia/pago móvil/efectivo_ves suelen ser en bolívares; zelle/efectivo/tarjeta en divisas) — mismo criterio que `PagoItemSerializer` en `cobranza/serializers.py` ("se requiere monto en USD o VES").

**Datos bancarios de la recarga, según método (igual que el formulario de cobranza):**
| Método | Campos que pide el formulario |
|---|---|
| Transferencia Bancaria | `banco_receptor` (cuál cuenta del colegio), `banco_procedencia` (banco del representante), `referencia` |
| Pago Móvil | `banco_receptor`, `banco_procedencia`, `referencia` (teléfono/cédula asociados quedan en `observaciones` si aplica, no se modela aparte) |
| Punto de Venta | `referencia` + `numero_lote`, ambos de 4 dígitos — mismo formato exacto que valida hoy `PagoItemSerializer` en cobranza para este método |
| Zelle | `referencia` (número de confirmación), sin banco institucional |
| Efectivo (USD) / Efectivo Bolívares (VES) | ningún dato bancario — solo el monto y de qué moneda, se recibe físicamente en caja |

**Validación de duplicidad de referencias — CRUZADA entre cobranza y cantina (no solo dentro de cada módulo):**

El problema real que resuelve esto: hoy `cobranza/serializers.py` (líneas ~520-583) ya valida que una referencia no se repita dentro de `cobranza.Pago` ni en `portal.ComprobantePago` pendientes/aprobados — pero **no sabe que existe `cantina`**. Si no se corrige, alguien podría pagar una mensualidad con un comprobante de transferencia y reutilizar el mismo número de referencia para "pagar" una recarga de cantina (o viceversa), y el sistema no lo detectaría porque cada módulo solo mira su propia tabla.

**Solución: extraer la lógica de duplicidad a un módulo neutral, usado por los dos.**

```python
# octopus-api/pagos_comunes/referencias.py
# Módulo plano (sin modelos, sin migraciones) — punto único de verdad para
# "esta referencia ya fue usada en cualquier módulo de pagos del sistema".
# Los imports son locales a la función para evitar dependencias circulares
# entre cobranza y cantina (ninguna de las dos apps importa modelos de la
# otra a nivel de módulo, solo dentro de esta función neutral).

def normalizar_referencia(raw):
    return ' '.join((raw or '').strip().upper().split())

def buscar_referencia_duplicada(ref_normalizada, excluir_pago_id=None, excluir_recarga_id=None):
    """Devuelve un dict describiendo dónde se usó, o None si está libre."""
    from cobranza.models import Pago
    from portal.models import ComprobantePago
    from cantina.models import RecargaTarjeta

    dup_pago = Pago.objects.filter(
        referencia=ref_normalizada, estatus__in=['completado', 'en_revision'],
    ).exclude(pk=excluir_pago_id).first()
    if dup_pago:
        return {'origen': 'cobranza.Pago', 'id': dup_pago.pk, 'detalle': f'factura {dup_pago.factura_id or dup_pago.pk}'}

    dup_comp = ComprobantePago.objects.filter(
        referencia_bancaria=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    ).first()
    if dup_comp:
        return {'origen': 'portal.ComprobantePago', 'id': dup_comp.pk, 'detalle': f'estatus {dup_comp.estatus}'}

    dup_recarga = RecargaTarjeta.objects.filter(
        referencia=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    ).exclude(pk=excluir_recarga_id).first()
    if dup_recarga:
        return {'origen': 'cantina.RecargaTarjeta', 'id': dup_recarga.pk, 'detalle': f'estatus {dup_recarga.estatus}'}

    return None
```

**Cambios requeridos (uno es a código YA EXISTENTE, hay que tocarlo con cuidado):**
1. `cantina`: el serializer de `RecargaTarjeta` llama a `buscar_referencia_duplicada(...)` antes de crear — igual de estricto que cobranza, cero código nuevo de comparación.
2. `cobranza/serializers.py`: el bloque de "Validación antifraude de referencia" (líneas ~549-573 actuales) se **reemplaza** para llamar a esta misma función en vez de repetir la consulta a `Pago`/`ComprobantePago` inline — así cobranza también queda protegida contra una referencia ya usada en cantina. **Esto es una modificación a un archivo de cobranza que ya está en producción — se hace en un commit aislado y pequeño, y se prueba explícitamente que el comportamiento actual de cobranza (duplicados dentro de cobranza y contra el portal) sigue funcionando igual antes de agregar el chequeo nuevo contra cantina.**
3. Formato por método: se recicla también la regla exacta que ya existe para Punto de Venta (`referencia` y `numero_lote` de 4 dígitos) — se aplica igual en `RecargaTarjeta`. Para Pago Móvil/Transferencia, agregamos en `cantina` una validación de que la referencia sea numérica de 6 dígitos (convención local de comprobantes bancarios) — **cobranza hoy no exige esto para esos dos métodos**, así que no se toca su validación existente sin que lo confirmes aparte; si quieres que cobranza también lo exija, es un cambio de una línea una vez que definamos si no rompe referencias ya cargadas con otro formato.

---

## 6. Frontend — árbol de archivos completo

**Actualizado para reflejar el módulo de auth separado de §2** — `cantina` vive en su propio subárbol `src/cantina/` (mismo patrón que `src/portal/` y `src/portal-docente/`), NO dentro de `src/pages/` genérico como decía el borrador original.

```
octopus-frontend/src/
├── cantina/                          # módulo separado, login/JWT propios (§2)
│   ├── api/
│   │   ├── cantinaAuthClient.js      # cliente axios solo para login/refresh (sin interceptor de token)
│   │   └── cantinaApiClient.js       # cliente axios de negocio, baseURL /api/cantina/, interceptor cantina_token
│   ├── context/
│   │   └── CantinaAuthContext.jsx    # login/logout, persiste cantina_token/cantina_refresh_token
│   ├── components/
│   │   ├── CantinaProtectedRoute.jsx # soporta allowedRoles, redirige a /cantina/login
│   │   └── CantinaLayout.jsx         # sidebar desktop-first (§7.1), NAV_ITEMS con disabled hasta que cada fase se construye
│   └── pages/
│       ├── CantinaLogin.jsx
│       ├── CantinaPOS.jsx
│       ├── CantinaInventario.jsx
│       ├── CantinaTarjetas.jsx
│       ├── CantinaCierreCaja.jsx
│       └── CantinaReportes.jsx        # incluye botón "Reimprimir ticket" por venta
│
├── components/cantina/                # componentes de negocio (no de auth/layout), fuera de src/cantina/ por convención del proyecto — mismo criterio que components/cobranza/ vs pages/Cobranza.jsx
│   ├── pos/
│   │   ├── CarritoVenta.jsx
│   │   ├── ScannerProducto.jsx
│   │   ├── ScannerTarjeta.jsx
│   │   ├── BuscadorProductoManual.jsx
│   │   ├── BuscadorAlumnoManual.jsx
│   │   ├── ResumenCobro.jsx
│   │   └── TicketVenta.jsx
│   ├── inventario/
│   │   ├── ProductosTable.jsx
│   │   ├── ProductoFormModal.jsx
│   │   ├── MovimientoStockModal.jsx
│   │   └── AlertaStockBajo.jsx
│   ├── tarjetas/
│   │   ├── TarjetasTable.jsx
│   │   ├── RecargaCajeroModal.jsx
│   │   ├── RecargasPendientesList.jsx
│   │   ├── GenerarLoteModal.jsx        # pide cantidad, dispara la descarga del .zip
│   │   ├── AsignarTarjetaModal.jsx     # escanea/serial → cédula representante → seleccionar alumno
│   │   └── ReponerTarjetaModal.jsx     # extravío/daño → nuevo código, mismo saldo
│   ├── cierre/
│   │   └── ResumenCierreCaja.jsx
│   └── reportes/
│       ├── VentasChart.jsx
│       ├── ProductosMasVendidos.jsx
│       └── HistorialVentasTable.jsx   # tabla con botón "Reimprimir" por fila
│
├── api/
│   └── cantina.service.js             # funciones de negocio (usa cantinaApiClient de src/cantina/api/)
│
├── portal/
│   ├── pages/
│   │   └── PortalCantina.jsx
│   ├── components/
│   │   ├── SaldoTarjetaCard.jsx
│   │   ├── RecargarTarjetaModal.jsx
│   │   └── HistorialConsumoList.jsx
│   └── api/
│       └── portal.service.js       # agregar getSaldoTarjeta, getHistorialConsumo, recargarTarjeta
```

Regla de aislamiento (aplica desde ya, no solo en la Fase 8 de pulido): ningún archivo bajo `src/cantina/` o `src/components/cantina/` importa de `src/portal/` ni de `src/components/` (admin general), ni al revés. El único punto de contacto entre `cantina` y `portal` es la pestaña "Cantina" dentro de `PortalDashboard.jsx` (Fase 3+), que consume el mismo backend pero vive del lado del portal, con el JWT del portal — no con `cantina_token`.

### 6.1 Rutas (`App.jsx`)

```jsx
// Módulo Cantina (login/JWT propios — ver src/cantina/)
const CantinaLogin       = lazy(() => import('./cantina/pages/CantinaLogin'));
const CantinaPOS         = lazy(() => import('./cantina/pages/CantinaPOS'));
const CantinaInventario  = lazy(() => import('./cantina/pages/CantinaInventario'));
const CantinaTarjetas    = lazy(() => import('./cantina/pages/CantinaTarjetas'));
const CantinaCierreCaja  = lazy(() => import('./cantina/pages/CantinaCierreCaja'));
const CantinaReportes    = lazy(() => import('./cantina/pages/CantinaReportes'));
const PortalCantina      = lazy(() => import('./portal/pages/PortalCantina'));

{/* ── Cantina (módulo separado, login/JWT propios) ── */}
<Route path="/cantina/login" element={<CantinaLogin />} />
<Route
  path="/cantina"
  element={
    <CantinaProtectedRoute>
      <CantinaLayout />
    </CantinaProtectedRoute>
  }
>
  <Route index element={<Navigate to="inventario" replace />} />
  <Route path="pos" element={
    <CantinaProtectedRoute allowedRoles={['cajero', 'administrador', 'director']}>
      <CantinaPOS />
    </CantinaProtectedRoute>
  } />
  <Route path="inventario" element={
    <CantinaProtectedRoute allowedRoles={['administrador', 'director']}>
      <CantinaInventario />
    </CantinaProtectedRoute>
  } />
  <Route path="tarjetas" element={
    <CantinaProtectedRoute allowedRoles={['administrador', 'director']}>
      <CantinaTarjetas />
    </CantinaProtectedRoute>
  } />
  <Route path="cierre-caja" element={
    <CantinaProtectedRoute allowedRoles={['cajero', 'administrador', 'director']}>
      <CantinaCierreCaja />
    </CantinaProtectedRoute>
  } />
  <Route path="reportes" element={
    <CantinaProtectedRoute allowedRoles={['administrador', 'director']}>
      <CantinaReportes />
    </CantinaProtectedRoute>
  } />
</Route>
```

Nota: la ruta de Tarjetas quedó restringida a `administrador`/`director` (no `cajero`) porque §2 asigna la gestión de tarjetas (generar lote, asignar, reponer) exclusivamente a Director/Administrador — el Cajero solo opera `/cantina/pos`.

Dentro del `<Outlet>` del `/portal`, agregar la ruta anidada `cantina` junto a `historial-pagos`, `rendimiento`, etc., con ítem de navegación con ícono `lucide-react` (`ShoppingCart` o `CreditCard`) — esa ruta SÍ usa el `PortalProtectedRoute`/JWT del portal, no el de cantina (ver regla de aislamiento arriba).

---

## 7. UI/UX

### 7.1 Principios
- **Admin (POS, inventario, reportes):** desktop-first — PC/tablet fija en la cantina.
- **Portal del representante:** mobile-first obligatorio, igual que el resto de `/portal`.
- Colores: `var(--portal-primary, #0fa3b1)` en el portal; paleta Tailwind ya usada en `components/cobranza` en el admin.
- Iconografía `lucide-react`: `ShoppingCart` (POS), `CreditCard` (tarjeta), `Package` (inventario), `ScanLine` (escaneo), `AlertTriangle` (stock bajo/saldo negativo), `Wallet` (saldo), `Printer` (reimpresión), `Bell` (notificaciones).
- Loaders: skeletons `animate-pulse`, nunca spinners genéricos.
- Errores/confirmaciones: `react-toastify`.
- Fechas: `date-fns` locale `es`.

### 7.2 Pantalla POS (`CantinaPOS.jsx`)

**Camino rápido por defecto — sin pedir NINGÚN dato del cliente:**

```
┌─────────────────────────────────────────────────────────┐
│  [Cajero: Nombre]  [Fecha/hora]        [Cerrar caja del día] │
├───────────────────────────────┬───────────────────────────┤
│  🔍 Buscar producto (manual)   │   CARRITO                  │
│  📷 [input oculto autofocus]   │   1x Jugo natural   $1.50  │
│     escaneo de barcode         │   2x Empanada       $3.00  │
│  [Grid de productos frecuentes │   Total:      $4.50 / Bs.X │
│   con imagen + precio]         │   ( ) Efectivo USD          │
│                                 │   ( ) Efectivo VES          │
│                                 │   ( ) Tarjeta prepago       │
│                                 │   [  COBRAR  ]              │
└───────────────────────────────┴───────────────────────────┘
```

Este es el estado inicial de toda venta: el cajero carga productos y, si el pago es en efectivo (USD o VES), **cobra directo sin que el sistema pida cédula, nombre ni nada del estudiante** — es la regla explícita que pediste, y ya era compatible con el modelo (`VentaCantina.alumno`/`tarjeta` siempre fueron `null=True`), pero ahora queda como el **camino por defecto**, no como un caso especial.

**Solo si el cajero marca "Tarjeta prepago"** aparece el bloque de identificación, y ahí sí es obligatorio:

```
│                                 │   [Buscar alumno/Escanear   │
│                                 │    tarjeta]                 │
│                                 │   [📷 foto]  Juan Pérez     │
│                                 │   3° B — confirmar identidad│
│                                 │   Saldo tarjeta: $12.30     │
│                                 │   Saldo después:  $7.80     │
```

**Reglas de foco:**
1. Foco por defecto en `ScannerProducto` (input oculto, `autoFocus`, se re-enfoca solo si ningún modal/input visible tiene el foco).
2. `Enter` en `ScannerProducto` busca por `codigo_barras`, agrega al carrito, limpia y re-enfoca.
3. `ScannerTarjeta` y su input solo se montan en el DOM cuando el método seleccionado es "Tarjeta prepago" — así el lector de tarjeta no interfiere ni se activa por accidente durante una venta en efectivo.
4. Si el cajero hace foco manual en un input de texto visible, no se le retira.
5. `toast` inmediato si el código no matchea nada.

**Verificación visual obligatoria (mitigación de fraude propia del QR), solo aplica a pago con tarjeta:** a diferencia de una tarjeta NFC, un QR se puede fotografiar y mostrar desde el celular de otra persona para hacerse pasar por el dueño de la tarjeta. Como no hay hardware que lo evite, el POS **siempre muestra la foto (si `Alumno.foto` existe) y el nombre completo + grado/sección** del alumno resuelto apenas se lee la tarjeta, antes de habilitar "Cobrar" — la responsabilidad de confirmar que coincide con quien tiene enfrente recae en el cajero. Si el alumno no tiene foto cargada, se muestra un placeholder visible (no un ícono genérico silencioso) para que el cajero sepa que no hay forma de verificar visualmente y pida cédula escolar si tiene dudas.

**Saldo insuficiente (crédito permitido, solo con tarjeta):**
- Si `saldo - total < -limite_credito`: botón deshabilitado, mensaje rojo con el crédito disponible.
- Si el resultado queda negativo pero dentro del límite: aviso ámbar + confirmación extra antes de habilitar "Cobrar".

**Moneda del total en pantalla:** el carrito siempre muestra el total en USD (precio canónico) y, junto a él, el equivalente en VES calculado con la tasa vigente (`TasaCambio.objects.latest`) — igual que cualquier pantalla de cobranza. Si el cajero elige "Efectivo VES", el monto a cobrar que se resalta es el de bolívares; si elige "Efectivo USD" o "Tarjeta prepago", se resalta el de dólares (la tarjeta es una billetera en USD, ver §5.9).

### 7.3 Inventario y Cierre — sin cambios respecto a lo ya descrito en §5 (tablas CRUD estándar del sistema).

### 7.3bis Pantalla Tarjetas (`CantinaTarjetas.jsx`) — flujo de lote y asignación
- Botón **"Generar lote"** → `GenerarLoteModal.jsx`: input numérico de cantidad → al confirmar, descarga automática del `.zip` (usar el mismo patrón de descarga de blob que ya usa `ExportarAuditoriaExcelView` en el frontend de cobranza, no inventar uno nuevo). Mientras se genera, botón en estado "Generando…" (deshabilitado, no doble submit).
- Tabla de tarjetas con filtro por estado (`sin_asignar` / `activa` / `bloqueada` / `extraviada`) — el filtro `sin_asignar` es el que usa el admin para ver cuántas tarjetas del lote faltan por entregar.
- Botón **"Asignar tarjeta"** → `AsignarTarjetaModal.jsx`, wizard de 3 pasos:
  1. Escanear QR o escribir `serial` → resuelve la tarjeta `sin_asignar`.
  2. Escribir cédula del representante → `BuscarRepresentantePorCedulaView` trae sus alumnos.
  3. Seleccionar alumno de la lista → confirmar. Si el alumno ya tiene tarjeta, se muestra el conflicto con opción directa de ir a "Reponer" en vez de fallar en seco.
- Botón **"Reponer"** (por extravío/daño) en cada fila de tarjeta activa → `ReponerTarjetaModal.jsx`: pide motivo, muestra advertencia de que el código físico anterior queda inválido, genera el nuevo y ofrece descargar el nuevo PNG individual para reimprimir esa tarjeta puntual.
- Botón **"Recargar"** (cajero, efectivo) → `RecargaCajeroModal.jsx`: mismo formulario dinámico del §7.5 pero limitado a los métodos que sí puede cobrar un cajero en caja (efectivo USD, efectivo VES, y también transferencia/pago móvil/zelle si el representante paga presente frente al cajero mostrando el comprobante en el momento) — aprobación instantánea, no pasa por el estado `pendiente`.

### 7.4 Reportes con reimpresión (`CantinaReportes.jsx`)
- `HistorialVentasTable.jsx`: tabla de ventas del rango seleccionado, con columna de acciones que incluye botón **"Reimprimir"** (ícono `Printer`).
- Clic en "Reimprimir" llama `GET /api/cantina/ventas/<id>/recibo/` (la misma vista `ReciboVentaPDFView` que genera el ticket original) y abre el PDF en una nueva pestaña o dispara la descarga — no se guarda el PDF, se regenera desde los datos de `VentaCantina`/`DetalleVentaCantina`, así siempre refleja el estado real (útil si la venta fue anulada después, el ticket reimpreso debe mostrar "ANULADA" con marca de agua).
- Filtro adicional en la tabla por número de venta / alumno, para ubicar rápido un ticket específico a pedir por un representante.

### 7.5 Pestaña Cantina en el Portal (`PortalCantina.jsx`)
Estructura igual a `PortalDashboard.jsx`, con `EstudianteSelector` si hay más de un hijo.

```
┌───────────────────────────────┐
│  [Selector de estudiante]      │
├───────────────────────────────┤
│  💳 Saldo actual  $7.80          │
│     (rojo si negativo)          │
│     [ Recargar saldo ]          │
├───────────────────────────────┤
│  Historial de consumo (paginado)│
└───────────────────────────────┘
```
- Modal "Recargar saldo" (`RecargarTarjetaModal.jsx`, clona `ComprobantePagoModal.jsx`) — formulario dinámico según el método elegido, igual que el formulario de pago de `cobranza`:
  1. Selector de método: Transferencia, Pago Móvil, Zelle, Efectivo Bolívares. **"Efectivo" (USD) y "Efectivo Bolívares" en caja física no se ofrecen desde el portal** — esos dos son exclusivos del cajero presencial (`RecargarTarjetaCajeroView`); el representante que quiere pagar en efectivo lo hace directo en la cantina, no por la app.
  2. Según el método, el formulario muestra/oculta campos (igual tabla que §5.9): banco receptor (selector poblado desde `BancosCantinaView`) + banco de procedencia + referencia para transferencia/pago móvil; solo referencia para Zelle; monto en Bs. para efectivo bolívares.
  3. Selector de moneda del monto ingresado (USD o VES) cuando el método lo permite — el backend calcula el equivalente con la tasa vigente al momento de guardar, igual que `cobranza`.
  4. Uploader de comprobante (excepto si el método no lo requiere).
  5. Al enviar, si la referencia ya fue usada (en cobranza o en cantina), el backend rechaza con un mensaje claro señalando dónde ya existe (§5.9) — el frontend solo muestra ese mensaje vía `toast.error`, no reimplementa la validación.
- Toast: *"Recarga enviada, será revisada en breve"* — no se acredita saldo hasta aprobación.
- Cuando la recarga se aprueba, el representante recibe **email + push** (§5.4/§5.5) sin acción adicional del frontend — es 100% backend/Celery.
- Si el saldo del hijo entra en negativo y pasan los días configurados sin regularizar, el representante recibe el mismo tipo de notificación automáticamente.

---

## 8. Fases de implementación

El módulo se construye en fases pequeñas y verificables, cada una entregando algo funcional de punta a punta antes de pasar a la siguiente — mismo criterio que pide el proyecto ("commitea en pasos pequeños y lógicos").

### FASE 0 — Cimientos backend
- App `cantina` creada y registrada.
- Todos los modelos base de §5.2 (`ParametroCantina`, `TarjetaPrepago`, `MovimientoTarjeta`, `RecargaTarjeta`, `CategoriaProducto`, `ProductoCantina`, `MovimientoInventario`, `VentaCantina`, `DetalleVentaCantina`, `CierreCajaCantina`) — `LoteTarjetas` y `HistorialCodigoTarjeta` se migran junto con la Fase 2.
- Migraciones aplicadas.
- `admin.py` con todos los modelos registrados (permite cargar productos/tarjetas de prueba desde `/django-admin` mientras se construye el resto).
- Servicio `aplicar_movimiento_tarjeta` y `aplicar_movimiento_inventario` (funciones puras, con tests unitarios antes de exponer vistas — mismo criterio que `cobranza/mora.py`, que existe justamente para no divergir criterios).

**Entregable verificable:** se puede crear un producto, una tarjeta y simular un movimiento desde el admin de Django, con saldo/stock consistentes.

### FASE 1 — Inventario (backend + frontend)
- Vistas: `ProductosListCreateView`, `ProductoDetailView`, `ProductoBuscarPorCodigoView`, `MovimientoInventarioCreateView`, `ReporteStockCriticoView`.
- Frontend: `CantinaInventario.jsx` + componentes de `components/cantina/inventario/`.
- Ruta `/cantina/inventario` protegida.

**Entregable verificable:** admin/director puede dar de alta productos (con o sin escaneo de código de barras), editarlos, ajustar stock y ver alerta de stock bajo.

### FASE 2 — Generación y asignación de tarjetas QR
- Modelos `LoteTarjetas`, `HistorialCodigoTarjeta` (ya incluidos en §5.2, se migran aquí).
- Vistas: `GenerarLoteTarjetasView` (genera el `.zip`), `BuscarTarjetaSinAsignarView`, `BuscarRepresentantePorCedulaView`, `AsignarTarjetaView`, `ReponerTarjetaView`.
- Agregar dependencia Python `qrcode` a `requirements.txt` (única dependencia nueva de todo el módulo, ya confirmada contigo).
- Frontend: `CantinaTarjetas.jsx` con `GenerarLoteModal.jsx`, `AsignarTarjetaModal.jsx`, `ReponerTarjetaModal.jsx` (§7.3bis).

**Entregable verificable:** el admin genera un lote de N tarjetas, descarga el `.zip` con los PNG, y puede asignar al menos una de esas tarjetas a un alumno real buscando por la cédula de su representante — la tarjeta pasa de `sin_asignar` a `activa` con saldo en `0.00`.

### FASE 3 — Recargas, moneda dual y validación de referencias cruzada (sin notificaciones todavía)
- Crear `octopus-api/pagos_comunes/referencias.py` (§5.9) con `normalizar_referencia` y `buscar_referencia_duplicada`.
- **Modificar `cobranza/serializers.py`** para que su validación de duplicados llame a esta función compartida (commit aislado, con prueba explícita de que el comportamiento actual de cobranza no cambia salvo por el chequeo nuevo contra cantina — ver advertencia en §5.9).
- Vistas: `BancosCantinaView`, `BuscarTarjetaView`, `TarjetasListView`, `RecargarTarjetaCajeroView`, `RecargasPendientesView`, `AprobarRecargaView`, `RechazarRecargaView`.
- Endpoints de portal: `PortalSaldoTarjetaView`, `PortalRecargarTarjetaView`.
- Frontend admin: `RecargaCajeroModal.jsx` (formulario dinámico según método, §7.3bis).
- Frontend portal: `PortalCantina.jsx` (saldo + `RecargarTarjetaModal.jsx` con campos bancarios dinámicos §7.5 + historial, sin consumo real todavía porque el POS no existe aún).

**Entregable verificable:** un representante puede solicitar una recarga desde el portal con comprobante (en USD o VES, según método) para una tarjeta ya asignada en la Fase 2; el admin la aprueba/rechaza y el saldo se actualiza correctamente (validado contra `MovimientoTarjeta`); intentar reutilizar una referencia ya cargada en `cobranza` (o viceversa) es rechazado con el mensaje de duplicidad correcto.

### FASE 4 — POS y ventas
- Vista `RegistrarVentaView` + `AnularVentaView`.
- Frontend: `CantinaPOS.jsx` completo, camino rápido de efectivo sin pedir datos del cliente (§7.2) + flujo de tarjeta con `ScannerProducto`/`ScannerTarjeta`, manejo de foco (§7.2) y la verificación visual foto+nombre antes de cobrar.
- Ticket en PDF (`TicketVenta.jsx` + `ReciboVentaPDFView`), con total en USD y VES según la tasa aplicada en el momento.

**Entregable verificable:** una venta en efectivo se completa sin que el sistema pida ningún dato del cliente; una venta con tarjeta descuenta stock y saldo correctamente, incluyendo el caso de saldo insuficiente con crédito permitido y la confirmación visual del alumno.

### FASE 5 — Cierre de caja
- Vista `CierreCajaCantinaView`.
- Frontend: `CantinaCierreCaja.jsx`.

**Entregable verificable:** el cajero cierra su caja del día y el resumen (tarjeta vs efectivo vs recargas) cuadra con las ventas/recargas registradas ese día.

### FASE 6 — Notificaciones (recarga aprobada + saldo negativo)
- `cantina/mora_cantina.py`, `cantina/notificaciones_cantina.py`, `cantina/tasks.py`.
- Templates `cantina_recarga_aprobada.html`, `cantina_saldo_negativo.html`.
- Hook en `AprobarRecargaView` → `task_notificar_recarga_aprobada.delay(...)`.
- `verificar_saldos_negativos_cantina` agregada a `CELERY_BEAT_SCHEDULE`.

**Entregable verificable:** aprobar una recarga dispara el email/push (verificable en logs de `NotificacionLog`, mismo modelo de auditoría que usa `cobranza`); una tarjeta simulada en negativo por N días dispara el recordatorio correspondiente al correr la tarea manualmente.

### FASE 7 — Reportes y reimpresión de tickets
- Vistas: `ReporteVentasView`, `ExportarVentasExcelView`.
- Frontend: `CantinaReportes.jsx`, `VentasChart.jsx`, `ProductosMasVendidos.jsx`, `HistorialVentasTable.jsx` con botón de reimpresión (§7.4).

**Entregable verificable:** se puede filtrar ventas por fecha/alumno, exportar a Excel, y reimprimir el PDF de una venta pasada (incluyendo una anulada, mostrando su estado real).

### FASE 8 — Pulido final
- `NOTAS_TECNICAS.md` con la deuda técnica detectada durante la construcción (no solo la anotada de antemano en §9).
- Revisión de accesibilidad/responsive del POS en tablet.
- Revisión de que ningún componente de `/portal` importe de `src/components/` (admin) ni viceversa.

---

## 9. Deuda técnica / futuro (anotar en `NOTAS_TECNICAS.md`, no implementar ahora)
- Integración NFC nativa (Web NFC API) en vez de lector HID emulando teclado.
- Mora/recordatorios de cantina hoy son solo informativos — no cobran interés ni generan un cargo adicional; si el colegio pide interés por mora de cantina en el futuro, extender `mora_cantina.py` siguiendo el mismo criterio centralizado que ya usa `cobranza/mora.py`.
- Multi-sede: si el colegio tiene varias sedes (`multisede` ya existe en el backend), inventario y tarjetas deberían filtrarse por sede — no contemplado en esta fase, dejar el modelo abierto a agregar un FK `sede` después.
- Reimpresión de tickets en lote (varios a la vez) — hoy es uno por uno desde el reporte.

---

## 10. Checklist de validación (evitar errores de compilación/runtime)

**Backend**
- [ ] Todo `DecimalField` se opera con `Decimal(...)`, nunca `float`.
- [ ] Toda escritura sobre `saldo` o `stock_actual` va dentro de `transaction.atomic()` con `select_for_update()`.
- [ ] Migraciones generadas y aplicadas antes de exponer vistas.
- [ ] `related_name` de cada FK verificados como únicos en el proyecto.
- [ ] Serializers con `read_only_fields` explícitos en los campos que calcula el backend (`saldo_antes`, `saldo_despues`, `stock_antes`, `stock_despues`).
- [ ] `notificar_recarga_aprobada`/`notificar_saldo_negativo` nunca lanzan excepción que rompa la vista que las dispara — siempre vía tarea Celery con `try/except` + `logger.exception`, igual que el resto de `notificaciones/tasks.py`.
- [ ] `CELERY_BEAT_SCHEDULE` con nombre de entrada único (`verificar-saldos-negativos-cantina`, sin colisión con las claves existentes).
- [ ] `TarjetaPrepago.codigo` se genera **siempre** con `secrets.choice` sobre el alfabeto Base32 seguro (§5.1) — nunca secuencial, nunca derivado de la cédula/ID del alumno, con reintento explícito ante colisión de `unique=True`.
- [ ] El payload que se codifica en la imagen QR (`qrcode.make(...)`) es exactamente `tarjeta.codigo` y nada más — ningún serializer debe filtrar nombre/cédula del alumno dentro del QR mismo.
- [ ] `AsignarTarjetaView` maneja explícitamente el caso "el alumno ya tiene tarjeta activa" con un mensaje claro (no un `IntegrityError` de Django sin capturar) y ofrece el flujo de reposición.
- [ ] `ReponerTarjetaView` corre dentro de `transaction.atomic()`: genera el nuevo código, escribe `HistorialCodigoTarjeta` y actualiza `TarjetaPrepago.codigo` en la misma transacción — nunca deja un estado a medias si falla a mitad de camino.
- [ ] `RegistrarVentaView` valida `tarjeta` obligatoria **solo** cuando `metodo_pago == 'tarjeta_prepago'` — una venta en efectivo con `alumno=None`/`tarjeta=None` debe pasar sin error.
- [ ] `buscar_referencia_duplicada` (§5.9) se llama tanto desde `cantina` como desde el `cobranza/serializers.py` ya modificado — probar explícitamente el caso cruzado (referencia usada en cobranza, rechazada al intentar en cantina, y viceversa) antes de dar la fase por cerrada.
- [ ] La modificación a `cobranza/serializers.py` no cambia el comportamiento de los duplicados que ya validaba (dentro de `Pago` y contra `portal.ComprobantePago`) — correr los tests existentes de `cobranza/tests.py` después del cambio, no solo los nuevos de cantina.
- [ ] `monto_ves`/`total_ves` siempre se calculan en el serializer/servicio a partir de `monto_usd`/`total_usd` × `tasa_aplicada` en el momento de crear — nunca se recalculan al leer/mostrar un registro ya guardado (mismo criterio que `cobranza.Pago`).
- [ ] Referencia de Punto de Venta y de Pago Móvil/Transferencia en cantina usan el formato definido en §5.9 (4 dígitos / 6 dígitos numéricos respectivamente) — sin tocar la validación existente de `cobranza` para esos mismos métodos salvo que se confirme aparte.

**Frontend**
- [ ] `cantina.service.js` sigue la misma firma que `cobranza.service.js` (headers, interceptor de token, manejo de 401).
- [ ] Íconos `lucide-react` verificados como existentes en la versión instalada antes de usarlos.
- [ ] Ningún componente bajo `/portal` importa de `src/components/` (admin) ni viceversa.
- [ ] `ScannerProducto`/`ScannerTarjeta` con `useRef` + `useEffect` para el foco, sin loops de re-render.
- [ ] Cada ruta nueva agregada tanto en `App.jsx` como en el menú/sidebar correspondiente.
- [ ] Todas las llamadas Axios envueltas en try/catch con `toast.error` y chequeo de `CanceledError`.
