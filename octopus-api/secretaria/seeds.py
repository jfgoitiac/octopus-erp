import random
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

fake = Faker('es_ES')

User = get_user_model()

GRADOS = {
    # Primaria (sección única)
    "1er Grado": (6,  7),
    "2do Grado": (7,  8),
    "3er Grado": (8,  9),
    "4to Grado": (9,  10),
    "5to Grado": (10, 11),
    "6to Grado": (11, 12),
    # Media General (sección única)
    "1er Año":   (12, 13),
    "2do Año":   (13, 14),
    "3er Año":   (14, 15),
    "4to Año":   (15, 16),
    "5to Año":   (16, 17),
}

ESTATUS = ['solvente', 'mora', 'becado']


@transaction.atomic
def ejecutar_seed(cantidad=50):

    usuario = User.objects.first()

    if not usuario:
        raise Exception(
            "Debes crear un usuario primero."
        )

    representantes = []

    # =====================================
    # CREAR REPRESENTANTES
    # =====================================

    for i in range(max(10, cantidad // 3)):

        representante = Representante.objects.create(
            cedula=f"V-{random.randint(1000000, 30000000)}",
            nombre=fake.first_name(),
            apellido=fake.last_name(),
            telefono=f"04{random.randint(12, 24)}-{random.randint(1000000, 9999999)}",
            correo=fake.email(),
            direccion=fake.address()
        )

        representantes.append(representante)

    # =====================================
    # CONFIGURAR GRADOS
    # =====================================

    for grado in GRADOS:

        ConfiguracionGrado.objects.get_or_create(
            grado_seccion=grado,
            defaults={
                'cupos_maximos': 40
            }
        )

    # =====================================
    # CREAR ALUMNOS
    # =====================================

    for i in range(cantidad):

        grado = random.choice(list(GRADOS.keys()))

        edad_min, edad_max = GRADOS[grado]

        edad = random.randint(edad_min, edad_max)

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

        representante = random.choice(
            representantes
        )

        estatus = random.choices(
            ESTATUS,
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
            apellido=fake.last_name(),
            fecha_nacimiento=fecha_nacimiento,
            grado_seccion=grado,
            representante=representante,
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

        if not alumno.activo:
            alumno.motivo_retiro = fake.sentence()
            alumno.save()

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
                usuario_registro=usuario
            )

        except Exception as e:
            print(
                f"Error en inscripción: {e}"
            )

    print(f"✅ {cantidad} estudiantes generados.")