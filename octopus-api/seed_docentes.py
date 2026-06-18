#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Copia este script al servidor y ejecuta:
  cd /var/www/octopus-api
  source venv/bin/activate
  python seed_docentes.py
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rrhh.models import Empleado

DOCENTES = [
    # (apellido,        nombre,       cedula,        correo,                           telefono)
    ("ARROYO",          "YSMERAY",    "V21447281",   "ysmeraiarroyo@gmail.com",        "0424-6540691"),
    ("BARRIOS",         "SANDRA",     "V9930472",    "cuartogradoyaracal@gmail.com",   "0424-6799022"),
    ("BLANCO",          "LUISA",      "V12338903",   "carolblancp@gmail.com",          "0412-4603841"),
    ("BONIEL",          "JOSELIT",    "V16449955",   "joselitsbonieln@gmail.com",      "0412-7405990"),
    ("CUAURO",          "MAYERLIN",   "V29712533",   "mayerlinaccp1108@gmail.com",     "0414-1648127"),
    ("FALCON",          "YOLANDA",    "V9520952",    "yolandafalcon03@gmail.com",      "0412-7683037"),
    ("FONTALBA",        "ROSA",       "V10250807",   "rosafontalba16@gmail.com",       "0412-4910487"),
    ("GOITIA",          "CARLA",      "V30354559",   "carlagoitia11@gmail.com",        "0414-6056104"),
    ("GOITIA",          "JOSE",       "V25128547",   "jfgoitiac@gmail.com",            "0412-6617733"),
    ("GONZALEZ",        "AURA",       "V11802342",   "rosa79gonzales@gmail.com",       "0412-7688760"),
    ("GUANIPA",         "NELIDA",     "V13724381",   "nelidaguanipa14@gmail.com",      "0424-4963788"),
    ("HERNANDEZ",       "LIDIA",      "V9529930",    "Lidialinahernandez@gmail.com",   "0412-6348595"),
    ("HERNANDEZ",       "YAIDEE",     "V24703261",   "yaideethm@gmail.com",            "0424-6537257"),
    ("HERRERA",         "VILMANIA",   "V19789942",   "herreravilmania1989@gmail.com",  "0412-6903058"),
    ("LEAL",            "BEATRIZ",    "V26266497",   "beatrizcaroleal97@gmail.com",    "0424-6670249"),
    ("MARTINEZ",        "EDETNA",     "V11801553",   "posadamorenas@gmail.com",        "0414-5825689"),
    ("MENDEZ",          "EDNYS",      "V23677143",   "ednysm_19@hotmail.com",          "0414-6941370"),
    ("MIRANDA",         "ERICK",      "V18153017",   "erickmirandapadilla@gmail.com",  "0412-5394884"),
    ("MIRENA",          "ENMYS",      "V17350379",   "enmysmirena1986@gmail.com",      "0424-6226992"),
    ("MOLINA",          "MARIA",      "V20131684",   "mari.moli1992@gmail.com",        "0412-7013989"),
    ("MONTERO",         "LIGIA",      "V15458377",   "ligiayairismontero@gmail.com",   "0412-0139486"),
    ("PEREIRA",         "SORANGER",   "V19789966",   "soranabel25@gmail.com",          "0412-7617433"),
    ("PRIETO",          "ANARELIS",   "V19789958",   "anap160690@gmail.com",           "0412-0340524"),
    ("REVILLA",         "NELLY",      "V7572937",    "nellyemar2909@gmail.com",        "0414-1486717"),
    ("SUAREZ",          "GENESIS",    "V19789865",   "bernaldesuarez27@gmail.com",     "0412-7013006"),
    ("ZAVALA",          "ROSALIN",    "V29513912",   "rosalynzavala43@gmail.com",      "0412-5862840"),
    ("GUERRERO",        "YURELIS",    "24352581",    "Danilogonzalezmencias@gmail.com","0412-5460249"),
]

creados = 0
actualizados = 0
errores = 0

for apellido, nombre, cedula, correo, telefono in DOCENTES:
    try:
        _, creado = Empleado.objects.update_or_create(
            cedula=cedula,
            defaults={
                "nombre": nombre,
                "apellido": apellido,
                "cargo": "",
                "tipo_personal": "docente",
                "titulo": "",
                "categoria_docente": "",
                "nivel": "",
                "horas_semanales": None,
                "numero_hijos": 0,
                "telefono": telefono,
                "correo": correo,
                "numero_cuenta": "",
                "tipo_cuenta": "",
                "sueldo_base": None,
                "activo": True,
            }
        )
        if creado:
            creados += 1
            print(f"[+] {nombre} {apellido} ({cedula})")
        else:
            actualizados += 1
            print(f"[~] {nombre} {apellido} ({cedula}) - actualizado")
    except Exception as e:
        errores += 1
        print(f"[!] {nombre} {apellido} ({cedula}): {e}")

print(f"\n--- Creados: {creados} | Actualizados: {actualizados} | Errores: {errores} ---")
