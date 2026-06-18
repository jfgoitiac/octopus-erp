"""
Management command para crear usuarios del portal de representantes en masa.

Uso:
    python manage.py crear_usuarios_portal
    python manage.py crear_usuarios_portal --dry-run     # solo muestra qué haría
    python manage.py crear_usuarios_portal --sobreescribir  # reactiva usuarios desactivados

Comportamiento:
    - Por cada Representante sin RepresentanteUser, crea un usuario Django
      con username=cedula y contraseña inicial=cedula.
    - El representante deberá cambiar su contraseña en el primer acceso
      (requires_password_change=True via PortalCambiarContrasena).
    - Si el representante ya tiene usuario, lo omite (a menos que --sobreescribir).
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()


class Command(BaseCommand):
    help = 'Crea usuarios del portal para todos los Representantes que no tienen acceso aún.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Muestra qué haría sin crear nada.',
        )
        parser.add_argument(
            '--sobreescribir',
            action='store_true',
            help='Reactiva los RepresentanteUser desactivados (esta_activo=False).',
        )

    def handle(self, *args, **options):
        from secretaria.models import Representante
        from portal.models import RepresentanteUser

        dry_run = options['dry_run']
        sobreescribir = options['sobreescribir']

        if dry_run:
            self.stdout.write(self.style.WARNING('Modo dry-run: no se guardará nada.\n'))

        representantes = Representante.objects.all().order_by('cedula')
        total = representantes.count()
        self.stdout.write(f'Representantes encontrados: {total}\n')

        creados = 0
        reactivados = 0
        omitidos = 0
        errores = 0

        for rep in representantes:
            # ¿Ya tiene usuario?
            try:
                portal_user = rep.portal_user  # OneToOne definido en RepresentanteUser
                if sobreescribir and not portal_user.esta_activo:
                    if not dry_run:
                        portal_user.esta_activo = True
                        portal_user.save(update_fields=['esta_activo'])
                    reactivados += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  REACTIVADO  {rep.cedula} — {rep.nombre} {rep.apellido}')
                    )
                else:
                    omitidos += 1
                    self.stdout.write(f'  omitido     {rep.cedula} — {rep.nombre} {rep.apellido} (ya existe)')
                continue
            except RepresentanteUser.DoesNotExist:
                pass

            # Crear usuario Django + RepresentanteUser
            try:
                with transaction.atomic():
                    if not dry_run:
                        # El username es la cédula; si ya existe un User con ese username
                        # (de otra corrida parcial), lo reutilizamos.
                        user, user_creado = User.objects.get_or_create(
                            username=rep.cedula,
                            defaults={
                                'email': rep.correo or '',
                                'first_name': rep.nombre,
                                'last_name': rep.apellido,
                                'is_active': True,
                            }
                        )
                        if user_creado:
                            user.set_password(rep.cedula)
                            user.save(update_fields=['password'])

                        RepresentanteUser.objects.create(
                            representante=rep,
                            user=user,
                            esta_activo=True,
                        )

                        # El usuario del portal no debe conservar el rol 'cajero'
                        # por defecto (sin acceso al panel administrativo)
                        from portal.models import asignar_rol_portal
                        asignar_rol_portal(user)

                    creados += 1
                    self.stdout.write(
                        self.style.SUCCESS(f'  CREADO      {rep.cedula} — {rep.nombre} {rep.apellido}')
                    )

            except Exception as exc:
                errores += 1
                self.stdout.write(
                    self.style.ERROR(f'  ERROR       {rep.cedula} — {rep.nombre} {rep.apellido}: {exc}')
                )

        self.stdout.write('\n─────────────────────────────────────')
        self.stdout.write(f'Creados:     {creados}')
        self.stdout.write(f'Reactivados: {reactivados}')
        self.stdout.write(f'Omitidos:    {omitidos}')
        self.stdout.write(f'Errores:     {errores}')
        if dry_run:
            self.stdout.write(self.style.WARNING('\n(Dry-run: ningún cambio fue persistido.)'))
        else:
            self.stdout.write(
                self.style.SUCCESS('\nListo. Contraseña inicial de cada usuario = su cédula.')
            )
            self.stdout.write(
                'Se recomienda que cada representante cambie su clave en el primer acceso.\n'
            )
