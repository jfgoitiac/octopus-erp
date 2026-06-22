"""
Django management command para importar docentes desde Excel.

INSTALACION:
1. Crear carpeta: octopus-api/rrhh/management/commands/
2. Copiar este archivo como: importar_docentes.py
3. Crear archivo vacio: __init__.py en cada carpeta

USO:
python manage.py importar_docentes /ruta/archivo.xlsx
"""

import pandas as pd
from django.core.management.base import BaseCommand
from rrhh.models import Empleado


class Command(BaseCommand):
    help = 'Importa docentes desde un archivo Excel a la base de datos'

    def add_arguments(self, parser):
        parser.add_argument(
            'archivo',
            type=str,
            help='Ruta al archivo Excel con los docentes'
        )

    def handle(self, *args, **options):
        excel_file = options['archivo']

        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(self.style.SUCCESS('[*] IMPORTADOR DE DOCENTES'))
        self.stdout.write(self.style.SUCCESS('='*60))

        self.stdout.write('[*] Leyendo: {}'.format(excel_file))

        try:
            df = pd.read_excel(excel_file, sheet_name=0, header=4)
            self.stdout.write(self.style.SUCCESS('[OK] Archivo leido: {} filas'.format(len(df))))
        except Exception as e:
            self.stdout.write(self.style.ERROR('[ERROR] {}'.format(e)))
            return

        if len(df.columns) >= 4:
            df.columns = ['nombre_completo', 'cedula', 'correo', 'telefono'] + list(df.columns[4:])

        df = df.dropna(subset=['nombre_completo'])

        self.stdout.write('[INFO] Total a importar: {}'.format(len(df)))

        exitosos = 0
        errores = 0

        for idx, row in df.iterrows():
            try:
                nombre_completo = str(row['nombre_completo']).strip()
                partes = nombre_completo.split()

                if len(partes) == 0:
                    continue
                elif len(partes) == 1:
                    apellido, nombre = partes[0], ""
                else:
                    apellido = " ".join(partes[:-1])
                    nombre = partes[-1]

                cedula = str(row.get('cedula', '')).strip().upper() if pd.notna(row.get('cedula')) else ""
                cedula = cedula.replace(" ", "").replace(".", "")

                correo = str(row.get('correo', '')).strip() if pd.notna(row.get('correo')) else ""
                if "@" not in correo and "." in correo:
                    if not correo.endswith(".com"):
                        correo += ".com"

                telefono = str(row.get('telefono', '')).strip() if pd.notna(row.get('telefono')) else ""

                if not cedula and not correo:
                    self.stdout.write('[SKIP] Fila {}: sin cedula ni correo'.format(idx + 5))
                    errores += 1
                    continue

                empleado, created = Empleado.objects.get_or_create(
                    cedula=cedula,
                    defaults={
                        'nombre': nombre,
                        'apellido': apellido,
                        'cargo': "",
                        'tipo_personal': 'docente',
                        'telefono': telefono,
                        'correo': correo,
                        'activo': True,
                    }
                )

                if created:
                    self.stdout.write(self.style.SUCCESS(
                        '[OK] Fila {}: {} {} (ID: {})'.format(idx + 5, apellido, nombre, empleado.id)
                    ))
                    exitosos += 1
                else:
                    self.stdout.write('[UPDATE] Fila {}: {} {} (ya existe)'.format(idx + 5, apellido, nombre))
                    exitosos += 1

            except Exception as e:
                self.stdout.write(self.style.ERROR('[ERROR] Fila {}: {}'.format(idx + 5, str(e))))
                errores += 1

        self.stdout.write(self.style.SUCCESS('\n' + '='*60))
        self.stdout.write(self.style.SUCCESS('[RESUMEN]'))
        self.stdout.write(self.style.SUCCESS('='*60))
        self.stdout.write(self.style.SUCCESS('[OK] Exitosos: {}'.format(exitosos)))
        self.stdout.write(self.style.ERROR('[FAIL] Errores: {}'.format(errores)))
        self.stdout.write('[INFO] Total: {}'.format(exitosos + errores))
