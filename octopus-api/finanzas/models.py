from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


RIF_VALIDATOR = RegexValidator(
    regex=r'^[VEJPG]-\d{8}-\d$',
    message='El RIF debe tener el formato V-12345678-9.',
)


class CategoriaGasto(models.Model):
    nombre = models.CharField(max_length=120)
    padre = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='hijas')
    activa = models.BooleanField(default=True)
    orden = models.PositiveSmallIntegerField(default=0)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['padre_id', 'orden', 'nombre']
        constraints = [models.UniqueConstraint(fields=['nombre', 'padre'], name='finanzas_categoria_nombre_padre_unico')]
        verbose_name = 'Categoría de gasto'
        verbose_name_plural = 'Categorías de gasto'

    def clean(self):
        if self.padre_id and self.padre and self.padre.padre_id:
            raise ValidationError({'padre': 'Solo se permiten categorías de hasta dos niveles.'})
        if self.pk and self.padre_id == self.pk:
            raise ValidationError({'padre': 'Una categoría no puede ser su propia padre.'})

    def __str__(self):
        return f'{self.padre} > {self.nombre}' if self.padre_id else self.nombre


class Proveedor(models.Model):
    CONDICIONES = (('contado', 'Contado'), ('credito', 'Crédito'))
    razon_social = models.CharField(max_length=200)
    rif = models.CharField(max_length=12, unique=True, validators=[RIF_VALIDATOR])
    nombre_comercial = models.CharField(max_length=200, blank=True)
    telefono = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.TextField(blank=True)
    contacto = models.CharField(max_length=150, blank=True)
    banco = models.CharField(max_length=100, blank=True)
    cuenta_bancaria = models.CharField(max_length=50, blank=True)
    pago_movil = models.CharField(max_length=50, blank=True)
    zelle = models.EmailField(blank=True)
    condicion_habitual = models.CharField(max_length=10, choices=CONDICIONES, default='contado')
    dias_credito_habitual = models.PositiveSmallIntegerField(default=0)
    categoria_defecto = models.ForeignKey(CategoriaGasto, null=True, blank=True, on_delete=models.PROTECT, related_name='proveedores_predeterminados')
    notas = models.TextField(blank=True)
    activo = models.BooleanField(default=True)
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='proveedores_creados')
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['razon_social']
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'

    def __str__(self):
        return f'{self.razon_social} ({self.rif})'


class PresupuestoCategoria(models.Model):
    MONEDAS = (('USD', 'USD'), ('VES', 'Bolívares'))
    categoria = models.ForeignKey(CategoriaGasto, on_delete=models.PROTECT, related_name='presupuestos')
    sede = models.ForeignKey('multisede.Sede', null=True, blank=True, on_delete=models.PROTECT, related_name='presupuestos_categoria', verbose_name='Sede')
    anio = models.PositiveSmallIntegerField()
    mes = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    moneda = models.CharField(max_length=3, choices=MONEDAS)
    monto = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    creado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='presupuestos_categoria_creados')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-anio', '-mes', 'categoria__nombre']
        constraints = [
            models.UniqueConstraint(fields=['categoria', 'sede', 'anio', 'mes', 'moneda'], name='finanzas_presupuesto_categoria_sede_periodo_moneda_unico'),
            models.CheckConstraint(condition=models.Q(mes__gte=1, mes__lte=12), name='finanzas_presupuesto_mes_valido'),
        ]
        verbose_name = 'Presupuesto por categoría'
        verbose_name_plural = 'Presupuestos por categoría'

    def __str__(self):
        return f'{self.categoria} {self.mes}/{self.anio} {self.moneda}'

    def clean(self):
        if not 1 <= self.mes <= 12:
            raise ValidationError({'mes': 'El mes debe estar entre 1 y 12.'})
        iguales = PresupuestoCategoria.objects.filter(
            categoria=self.categoria, anio=self.anio, mes=self.mes, moneda=self.moneda,
        ).exclude(pk=self.pk)
        iguales = iguales.filter(sede__isnull=True) if self.sede_id is None else iguales.filter(sede=self.sede)
        if iguales.exists():
            raise ValidationError('Ya existe un presupuesto para esta categoría, sede, período y moneda.')
