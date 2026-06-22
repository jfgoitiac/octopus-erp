#!/usr/bin/env python3
"""
Script para importar docentes desde Excel a la base de datos.
Soporta datos incompletos y guarda lo que esta disponible.
"""

import pandas as pd
import requests
import json
from datetime import datetime

# ===== CONFIGURACION =====
API_BASE_URL = "https://bos2.hostingervps.com"
EXCEL_FILE = r"C:\Users\PC\Downloads\Base de Datos Colegio\DATOS DEL PERSONAL DOCENTE.xlsx"
JWT_TOKEN = None

# Configuracion de la API
API_EMPLEADOS = f"{API_BASE_URL}/api/rrhh/empleados/"
HEADERS = {
    "Content-Type": "application/json",
}

# Agregar token si esta disponible
if JWT_TOKEN:
    HEADERS["Authorization"] = f"Bearer {JWT_TOKEN}"


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
    """Limpia el correo (algunos estan truncados en Excel)."""
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


def validar_docente(docente):
    """Valida que el docente tenga campos minimos requeridos."""
    return bool(docente.get('cedula')) or bool(docente.get('correo'))


def importar_docentes():
    """Lee el Excel y crea docentes en la API."""

    print("[*] Leyendo archivo Excel...")
    try:
        df = pd.read_excel(EXCEL_FILE, sheet_name=0, header=4)
        print("[OK] Archivo leido correctamente: {} filas".format(len(df)))
    except Exception as e:
        print("[ERROR] Error al leer Excel: {}".format(e))
        return

    if len(df.columns) >= 4:
        df.columns = ['nombre_completo', 'cedula', 'correo', 'telefono'] + list(df.columns[4:])
    df = df.dropna(subset=['nombre_completo'])

    print("\n[INFO] Total de docentes a importar: {}".format(len(df)))

    docentes_exitosos = 0
    docentes_errores = 0
    errores_detalle = []

    for idx, row in df.iterrows():
        try:
            apellido, nombre = limpiar_nombre(row['nombre_completo'])
            cedula = limpiar_cedula(row['cedula'])
            correo = limpiar_correo(row['correo'])
            telefono = limpiar_telefono(row['telefono'])

            payload = {
                'nombre': nombre.strip() if nombre else "",
                'apellido': apellido.strip() if apellido else "",
                'cedula': cedula,
                'cargo': "",
                'tipo_personal': 'docente',
                'telefono': telefono,
                'correo': correo,
                'activo': True,
            }

            if not validar_docente(payload):
                print("[SKIP] Fila {}: Datos incompletos (sin cedula ni correo)".format(idx + 5))
                docentes_errores += 1
                continue

            response = requests.post(
                API_EMPLEADOS,
                json=payload,
                headers=HEADERS,
                timeout=10,
                verify=False
            )

            if response.status_code in [201, 200]:
                resp_data = response.json()
                doc_id = resp_data.get('id', 'N/A')
                print("[OK] Fila {}: {} {} (ID: {})".format(idx + 5, apellido, nombre, doc_id))
                docentes_exitosos += 1
            else:
                error_msg = response.text
                print("[FAIL] Fila {}: {} {} - Error {}".format(idx + 5, apellido, nombre, response.status_code))
                print("       {}".format(error_msg[:100]))
                docentes_errores += 1
                errores_detalle.append({
                    'fila': idx + 5,
                    'nombre': "{}, {}".format(apellido, nombre),
                    'error': error_msg
                })

        except requests.exceptions.ConnectionError as ce:
            print("[ERROR] No se puede conectar a: {}".format(API_BASE_URL))
            print("        Verifica la URL del servidor.")
            break
        except Exception as e:
            print("[ERROR] Fila {}: Error inesperado - {}".format(idx + 5, str(e)))
            docentes_errores += 1

    print("\n" + "="*60)
    print("[RESUMEN] IMPORTACION DE DOCENTES")
    print("="*60)
    print("[OK] Exitosos:  {}".format(docentes_exitosos))
    print("[FAIL] Errores:   {}".format(docentes_errores))
    print("[INFO] Total:     {}".format(docentes_exitosos + docentes_errores))

    if errores_detalle:
        print("\n[DETALLES] ERRORES ENCONTRADOS:")
        for error in errores_detalle[:5]:
            print("   Fila {}: {}".format(error['fila'], error['nombre']))
            print("   {}".format(error['error'][:80]))


if __name__ == "__main__":
    print("="*60)
    print("[*] IMPORTADOR DE DOCENTES - OCTOPUS")
    print("="*60)
    print("\n[INFO] URL API: {}".format(API_BASE_URL))
    print("[INFO] Archivo: {}".format(EXCEL_FILE))
    print()

    importar_docentes()
