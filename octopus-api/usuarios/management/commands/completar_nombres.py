"""
Backfill de first_name/last_name para usuarios existentes.

No inventa nombres: por defecto solo lista en pantalla los usuarios con
first_name o last_name vacíos (id, username, email, rol) para que se
completen a mano.

Con --aplicar <ruta_csv> carga un CSV (columnas: id,first_name,last_name)
y aplica esos valores a los usuarios indicados.

Uso:
    python manage.py completar_nombres
    python manage.py completar_nombres --aplicar ruta/al/archivo.csv
"""
import csv

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

Usuario = get_user_model()


class Command(BaseCommand):
    help = (
        "Lista usuarios sin first_name/last_name completos. "
        "Con --aplicar <csv> carga id,first_name,last_name desde un archivo."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--aplicar',
            dest='aplicar_csv',
            metavar='CSV_PATH',
            default=None,
            help='Ruta a un CSV con columnas id,first_name,last_name para aplicar los cambios.',
        )

    def handle(self, *args, **options):
        aplicar_csv = options.get('aplicar_csv')

        if aplicar_csv:
            self._aplicar(aplicar_csv)
        else:
            self._listar()

    def _incompletos(self):
        return Usuario.objects.filter(first_name='') | Usuario.objects.filter(last_name='')

    def _listar(self):
        usuarios = self._incompletos().order_by('username')

        if not usuarios:
            self.stdout.write(self.style.SUCCESS('Todos los usuarios tienen first_name y last_name completos.'))
            return

        self.stdout.write(self.style.WARNING(f'Usuarios con nombre/apellido incompleto: {usuarios.count()}'))
        self.stdout.write('')
        header = f"{'id':<6}{'username':<25}{'email':<35}{'rol':<15}"
        self.stdout.write(header)
        self.stdout.write('-' * len(header))
        for u in usuarios:
            rol = getattr(getattr(u, 'perfil', None), 'rol', '') or ''
            self.stdout.write(f"{u.id:<6}{u.username:<25}{(u.email or ''):<35}{rol:<15}")

    def _aplicar(self, csv_path):
        try:
            f = open(csv_path, newline='', encoding='utf-8')
        except OSError as exc:
            raise CommandError(f'No se pudo abrir el CSV: {exc}')

        actualizados = []
        no_encontrados = []

        with f:
            reader = csv.DictReader(f)
            for row in reader:
                user_id = row.get('id')
                first_name = (row.get('first_name') or '').strip()
                last_name = (row.get('last_name') or '').strip()

                if not user_id:
                    continue

                try:
                    user = Usuario.objects.get(pk=user_id)
                except Usuario.DoesNotExist:
                    no_encontrados.append(user_id)
                    continue

                user.first_name = first_name
                user.last_name = last_name
                user.save(update_fields=['first_name', 'last_name'])
                actualizados.append(user.username)

        self.stdout.write(self.style.SUCCESS(f'Usuarios actualizados: {len(actualizados)}'))
        for username in actualizados:
            self.stdout.write(f'  ~ {username}')

        if no_encontrados:
            self.stdout.write(self.style.WARNING(f'IDs no encontrados: {len(no_encontrados)}'))
            for user_id in no_encontrados:
                self.stdout.write(f'  ? {user_id}')
