import random
from decimal import Decimal
from datetime import date

from faker import Faker
from django.contrib.auth import get_user_model
from django.db import transaction

from secretaria.models import (
    Alumno,
    Representante,
    ConfiguracionGrado,
    Inscripcion
)

from nomina.models import (
    Empleado,
    RegistroNomina
)

from usuarios.models import crear_log

fake = Faker('es_ES')

User = get_user_model()

# =========================================
# CONFIGURACIÓN
# =========================================

GRADOS = {
    "1er Grado A": (6, 7),
    "1er Grado B": (6, 7),
    "2do Grado A": (7, 8),
    "2do Grado B": (7, 8),
    "3er Grado A": (8, 9),
    "4to Grado A": (9, 10),
    "5to Grado A": (10, 11),
    "6to Grado A": (11, 12),
}

TIPOS_PERSONAL = [
    'administrativo',
    'obrero',
    'docente',
    'directivo'
]


# =========================================
# FUNCIÓN PRINCIPAL
# =========================================

@transaction.atomic
def seed():

    print("\n🌱 Iniciando seed...\n")

    # =====================================
    # USUARIO ADMIN
    # =====================================

    admin = User.objects.first()

    if not admin:

        admin = User.objects.create_superuser(
            username='admin',
            password='admin123',
            email='admin@colegio.com'
        )

        print("✅ Usuario admin creado")

    # =====================================
    # GRADOS
    # =====================================

    for grado in GRADOS:

        ConfiguracionGrado.objects.get_or_create(
            grado_seccion=grado,
            defaults={
                'cupos_maximos': 40
            }
        )

    print("✅ Grados configurados")

    # =====================================
    # REPRESENTANTES
    # =====================================

    representantes = []

    for i in range(20):

        representante = Representante.objects.create(
            cedula=f"V-{random.randint(1000000, 30000000)}",
            nombre=fake.first_name(),
            apellido=fake.last_name(),
            telefono=f"04{random.randint(12,24)}-{random.randint(1000000,9999999)}",
            correo=fake.email(),
            direccion=fake.address()
        )

        representantes.append(representante)

    print("✅ Representantes creados")

    # =====================================
    # ALUMNOS + INSCRIPCIONES
    # =====================================

    alumnos_creados = []

    for i in range(50):

        grado = random.choice(list(GRADOS.keys()))

        edad_min, edad_max = GRADOS[grado]

        edad = random.randint(
            edad_min,
            edad_max
        )

        fecha_nacimiento = date(
            date.today().year - edad,
            random.randint(1, 12),
            random.randint(1, 28)
        )

        genero = random.choice([
            'masculino',
            'femenino'
        ])

        if genero == 'masculino':
            nombre = fake.first_name_male()
        else:
            nombre = fake.first_name_female()

        apellido = fake.last_name()

        estatus = random.choices(
            ['solvente', 'mora', 'becado'],
            weights=[70, 20, 10]
        )[0]

        porcentaje_beca = 0

        if estatus == 'becado':
            porcentaje_beca = random.choice([
                25,
                50,
                75,
                100
            ])

        alumno = Alumno.objects.create(
            cedula_escolar=f"ESC-{10000+i}",
            nombre=nombre,
            apellido=apellido,
            fecha_nacimiento=fecha_nacimiento,
            grado_seccion=grado,
            representante=random.choice(representantes),
            porcentaje_beca=porcentaje_beca,
            genero=genero,
            estatus_financiero=estatus,
            dia_limite_pago=random.randint(1, 15),
            activo=random.choice([
                True,
                True,
                True,
                False
            ])
        )

        # =================================
        # ALUMNOS RETIRADOS
        # =================================

        if not alumno.activo:

            alumno.motivo_retiro = fake.sentence()
            alumno.save()

        alumnos_creados.append(alumno)

        # =================================
        # INSCRIPCIÓN
        # =================================

        try:

            Inscripcion.objects.create(
                alumno=alumno,
                periodo_escolar="2025-2026",
                grado_seccion=grado,
                tipo_ingreso=random.choice([
                    'nuevo',
                    'regular'
                ]),
                documentos_completos=random.choice([
                    True,
                    False
                ]),
                usuario_registro=admin
            )

        except Exception as e:

            print(
                f"❌ Error inscripción alumno {alumno.nombre}: {e}"
            )

    print("✅ Alumnos creados")

    # =====================================
    # EMPLEADOS
    # =====================================

    empleados = []

    for i in range(15):

        empleado = Empleado.objects.create(
            cedula=f"V-{random.randint(1000000,30000000)}",
            nombre=fake.first_name(),
            apellido=fake.last_name(),
            tipo_personal=random.choice(
                TIPOS_PERSONAL
            ),
            fecha_ingreso=fake.date_between(
                start_date='-10y',
                end_date='today'
            ),
            sueldo_base_ves=Decimal(
                str(random.randint(4000, 15000))
            ),
            es_pensionado=random.choice([
                False,
                False,
                False,
                True
            ])
        )

        empleados.append(empleado)

    print("✅ Empleados creados")

    # =====================================
    # NÓMINA
    # =====================================

    for empleado in empleados:

        for mes in range(1, 4):

            RegistroNomina.objects.create(
                empleado=empleado,
                mes_correspondiente=mes,
                anio_correspondiente=2026,
                monto_cestaticket=Decimal('40.00'),
                bono_usd=Decimal(
                    str(random.randint(20, 80))
                ),
                tasa_pago_bono=Decimal('36.50')
            )

    print("✅ Registros de nómina creados")

    # =====================================
    # LOGS DE AUDITORÍA
    # =====================================

    for i in range(30):

        crear_log(
            usuario=admin,
            accion=random.choice([
                'CREAR',
                'EDITAR',
                'ELIMINAR',
                'CONSULTAR'
            ]),
            modulo=random.choice([
                'SECRETARIA',
                'NOMINA',
                'RRHH',
                'COBRANZA'
            ]),
            detalles={
                "mensaje": fake.sentence()
            },
            ip="127.0.0.1"
        )

    print("✅ Logs creados")

    # =====================================
    # RESUMEN
    # =====================================

    print("\n🎉 Seed completado correctamente\n")

    print(f"👨‍🎓 Alumnos: {Alumno.todos.count()}")
    print(f"👨‍👩‍👧 Representantes: {Representante.objects.count()}")
    print(f"👨‍🏫 Empleados: {Empleado.objects.count()}")
    print(f"💰 Registros Nómina: {RegistroNomina.objects.count()}")