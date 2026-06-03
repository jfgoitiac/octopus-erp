from django.db import models


class TipoCargo(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    descripcion = models.CharField(max_length=255, blank=True, default='')
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Tipo de Cargo"
        verbose_name_plural = "Tipos de Cargo"
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class BancoNomina(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Banco de Nómina"
        verbose_name_plural = "Bancos de Nómina"
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Empleado(models.Model):
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    cedula = models.CharField(max_length=15, unique=True)
    cargo = models.CharField(max_length=100)

    TIPOS_PERSONAL = [
        ('docente', 'Docente'),
        ('apoyo', 'Personal de Apoyo'),
        ('administrativo', 'Administrativo'),
    ]
    TIPO_CUENTA_CHOICES = [('CTE', 'Corriente'), ('AHO', 'Ahorro')]

    tipo_personal = models.CharField(max_length=20, choices=TIPOS_PERSONAL, default='docente')
    fecha_ingreso = models.DateField(null=True, blank=True)
    titulo = models.CharField(max_length=100, blank=True, default='')
    categoria_docente = models.CharField(max_length=50, blank=True, default='')
    anos_servicio = models.PositiveIntegerField(null=True, blank=True, default=0)
    numero_hijos = models.PositiveIntegerField(default=0)
    nivel = models.CharField(max_length=100, blank=True, default='')
    horas_semanales = models.PositiveSmallIntegerField(null=True, blank=True)

    banco = models.ForeignKey(BancoNomina, null=True, blank=True, on_delete=models.SET_NULL, related_name='empleados')
    numero_cuenta = models.CharField(max_length=30, blank=True, default='')
    tipo_cuenta = models.CharField(max_length=3, choices=TIPO_CUENTA_CHOICES, blank=True, default='')
    telefono = models.CharField(max_length=20, blank=True, default='')
    correo = models.EmailField(blank=True, default='')
    sueldo_base = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fecha_contratacion = models.DateField(auto_now_add=True)
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Empleado"
        verbose_name_plural = "Empleados"
        ordering = ['apellido', 'nombre']

    def __str__(self):
        return f"{self.nombre} {self.apellido} ({self.cedula})"