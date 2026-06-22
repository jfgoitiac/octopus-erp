#!/usr/bin/env python3
"""
Script para importar docentes desde Excel directamente a la BD.
Ejecutar en el servidor donde esta Django.

INSTRUCCIONES:
1. Copiar este script a la carpeta del proyecto Django (octopus-api/)
2. Copiar el archivo Excel a un lugar accesible en el servidor
3. Ejecutar: python manage.py shell < import_docentes_django.py

O ejecutar directamente:
   python manage.py shell
   exec(open('import_docentes_django.py').read())
"""

import pandas as pd
from django.utils import timezone
from rrhh.models import Empleado

# ===== CONFIGURACION =====
EXCEL_FILE = r"C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx"


def limpiar_nombre(nombre_completo):
    """Divide 'APELLIDO NOMBRE' en apellido y nombre."""
    if not nombre_completo or pd.isna(nombre_completo):
        return "", ""

    partes = str(nombre_completo).strip().split()
    if len(partes) == 0:
        return "", ""
    elif len(partes) == 1:
        return partes[0], ""
    else:
        return " ".join(partes[:-1]), partes[-1]


def limpiar_cedula(cedula):
    """Limpia y normaliza la cedula."""
    if pd.isna(cedula):
        return ""
    cedula_str = str(cedula).strip().upper()
    cedula_str = cedula_str.replace(" ", "").replace(".", "")
    return cedula_str


def limpiar_correo(correo):
    """Limpia el correo."""
    if pd.isna(correo):
        return ""
    correo_str = str(correo).strip()
    if "@" not in correo_str and "." in correo_str:
        if not correo_str.endswith(".com"):
            correo_str += ".com"
    return correo_str


def limpiar_telefono(telefono):
    """Limpia el numero telefonico."""
    if pd.isna(telefono):
        return ""
    return str(telefono).strip()


def importar():
    print("=" * 60)
    print("[*] IMPORTADOR DE DOCENTES - OCTOPUS (Django ORM)")
    print("=" * 60)

    print("\n[*] Leyendo archivo Excel...")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=0, header=4)
        print("[OK] Archivo leido: {} filas".format(len(df)))
    except Exception as e:
        print("[ERROR] {}".format(e))
        return

    if len(df.columns) >= 4:
        df.columns = ['nombre_completo', 'cedula', 'correo', 'telefono'] + list(df.columns[4:])

    df = df.dropna(subset=['nombre_completo'])

    print("[INFO] Total a importar: {}".format(len(df)))

    exitosos = 0
    errores = 0

    for idx, row in df.iterrows():
        try:
            apellido, nombre = limpiar_nombre(row['nombre_completo'])
            cedula = limpiar_cedula(row['cedula'])
            correo = limpiar_correo(row['correo'])
            telefono = limpiar_telefono(row['telefono'])

            if not cedula and not correo:
                print("[SKIP] Fila {}: sin cedula ni correo".format(idx + 5))
                errores += 1
                continue

            empleado, created = Empleado.objects.get_or_create(
                cedula=cedula,
                defaults={
                    'nombre': nombre.strip() if nombre else "",
                    'apellido': apellido.strip() if apellido else "",
                    'cargo': "",
                    'tipo_personal': 'docente',
                    'telefono': telefono,
                    'correo': correo,
                    'activo': True,
                }
            )

            if created:
                print("[OK] Fila {}: {} {} (ID: {})".format(
                    idx + 5, apellido, nombre, empleado.id
                ))
                exitosos += 1
            else:
                print("[UPDATE] Fila {}: {} {} (ya existe)".format(
                    idx + 5, apellido, nombre
                ))
                exitosos += 1

        except Exception as e:
            print("[ERROR] Fila {}: {}".format(idx + 5, str(e)))
            errores += 1

    print("\n" + "=" * 60)
    print("[RESUMEN]")
    print("=" * 60)
    print("[OK] Exitosos: {}".format(exitosos))
    print("[FAIL] Errores: {}".format(errores))
    print("[INFO] Total: {}".format(exitosos + errores))


# Ejecutar
importar()
