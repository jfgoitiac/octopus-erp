from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal

class ExcelExporter:
    """
    Utilidad global para exportar QuerySets a formato Excel (.xlsx) nativo.
    """
    @staticmethod
    def export(queryset, column_config, filename_prefix="reporte"):
        """
        queryset: El QuerySet de Django con los datos.
        column_config: Lista de tuplas (Nombre Cabecera, Atributo o Callable).
                       Ej: [('Nombre', 'alumno__nombre'), ('Total', lambda x: x.monto * 1.16)]
        """
        wb = Workbook()
        ws = wb.active
        ws.title = "Datos"

        # Estilo para cabeceras
        header_font = Font(bold=True)
        alignment = Alignment(horizontal="center")

        # 1. Escribir Cabeceras
        headers = [item[0] for item in column_config]
        ws.append(headers)
        for cell in ws[1]:
            cell.font = header_font
            cell.alignment = alignment

        # 2. Escribir Datos
        for obj in queryset:
            row = []
            for _, field_path in column_config:
                if callable(field_path):
                    value = field_path(obj)
                else:
                    # Soporte para campos anidados (fk__campo)
                    parts = field_path.split('__')
                    value = obj
                    for part in parts:
                        if value:
                            value = getattr(value, part, None)
                        else:
                            value = None
                            break
                
                # Formateo de tipos especiales para Excel
                if isinstance(value, Decimal):
                    value = float(value)
                elif value is None:
                    value = ""
                row.append(value)
            ws.append(row)

        # 3. Preparar Respuesta HTTP
        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        timestamp = timezone.now().strftime('%Y-%m-%d_%H%M')
        response['Content-Disposition'] = f'attachment; filename="{filename_prefix}_{timestamp}.xlsx"'
        
        wb.save(response)
        return response