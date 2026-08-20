import io
import zipfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from secretaria.models import Alumno, Representante

from .models import HistorialCodigoTarjeta, LoteTarjetas, TarjetaPrepago
from .services_tarjeta import ALFABETO_CODIGO, PREFIJO_CODIGO, generar_codigo_tarjeta

User = get_user_model()


class GenerarCodigoTarjetaTests(TestCase):
    """
    Cubre el formato y unicidad del `codigo` generado por
    `generar_codigo_tarjeta` (§5.1/§10 checklist de cantina.md).
    """

    def test_formato_prefijo_y_alfabeto(self):
        codigo = generar_codigo_tarjeta()
        self.assertTrue(codigo.startswith(PREFIJO_CODIGO))
        sufijo = codigo[len(PREFIJO_CODIGO):]
        self.assertEqual(len(sufijo), 10)
        for caracter in sufijo:
            self.assertIn(caracter, ALFABETO_CODIGO)
        # Ninguno de los caracteres ambiguos debe aparecer nunca.
        for ambiguo in '0O1IL':
            self.assertNotIn(ambiguo, sufijo)

    def test_reintenta_ante_colision(self):
        representante = Representante.objects.create(
            cedula='V-1000001', nombre='Ana', apellido='Gómez',
            telefono='0414-0000001', correo='ana@example.com', direccion='Calle 1',
        )
        alumno = Alumno.objects.create(nombre='Luis', apellido='Gómez', representante=representante)
        codigo_ocupado = generar_codigo_tarjeta()
        TarjetaPrepago.objects.create(alumno=alumno, serial='L001-0001', codigo=codigo_ocupado)

        # Fuerza la colisión: el primer candidato que "genera" el alfabeto ya
        # existe, así que la función debe reintentar y devolver uno distinto.
        import cantina.services_tarjeta as services_tarjeta
        original_nuevo_token = services_tarjeta._nuevo_token
        llamadas = {'n': 0}

        def _nuevo_token_forzado():
            llamadas['n'] += 1
            if llamadas['n'] == 1:
                return codigo_ocupado
            return original_nuevo_token()

        services_tarjeta._nuevo_token = _nuevo_token_forzado
        try:
            nuevo_codigo = generar_codigo_tarjeta()
        finally:
            services_tarjeta._nuevo_token = original_nuevo_token

        self.assertNotEqual(nuevo_codigo, codigo_ocupado)
        self.assertGreaterEqual(llamadas['n'], 2)


class CantinaFase2ViewsTests(TestCase):
    """
    Cubre las vistas de Fase 2 de cantina: generación de lote, búsqueda de
    tarjeta sin asignar, búsqueda de representante por cédula, asignación
    (caso feliz + conflicto) y reposición. Ver §8 FASE 2 / §10 checklist de
    cantina.md.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin_user = User.objects.create_user(username='admin_cantina2', password='password123')
        self.admin_user.perfil.rol = 'administrador'
        self.admin_user.perfil.esta_activo = True
        self.admin_user.perfil.save()

        self.cajero_user = User.objects.create_user(username='cajero_cantina2', password='password123')
        self.cajero_user.perfil.rol = 'cajero'
        self.cajero_user.perfil.esta_activo = True
        self.cajero_user.perfil.save()

        self.representante = Representante.objects.create(
            cedula='V-9999999', nombre='Carla', apellido='Rondón',
            telefono='0424-9999999', correo='carla@example.com', direccion='Av. Principal',
        )
        self.alumno = Alumno.objects.create(
            nombre='Sofía', apellido='Rondón', representante=self.representante, grado_seccion='3ro B',
        )
        self.otro_alumno = Alumno.objects.create(
            nombre='Marco', apellido='Rondón', representante=self.representante, grado_seccion='5to A',
        )

    # --- Generación de lote ---

    def test_admin_genera_lote_y_recibe_zip_con_pngs(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': 3}, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'application/zip')
        self.assertIn('attachment; filename="lote_', resp['Content-Disposition'])

        self.assertEqual(LoteTarjetas.objects.count(), 1)
        lote = LoteTarjetas.objects.first()
        self.assertEqual(lote.cantidad, 3)
        self.assertEqual(lote.generado_por, self.admin_user)

        tarjetas = TarjetaPrepago.objects.filter(lote=lote).order_by('serial')
        self.assertEqual(tarjetas.count(), 3)
        for tarjeta in tarjetas:
            self.assertEqual(tarjeta.estado, 'sin_asignar')
            self.assertIsNone(tarjeta.alumno)
            self.assertTrue(tarjeta.codigo.startswith('CANT-'))

        # El zip debe traer exactamente un PNG por serial, y ningún dato
        # personal — el nombre del archivo es el serial, no el código ni
        # nada del alumno (que ni siquiera existe todavía en este flujo).
        zip_buffer = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_buffer) as zf:
            nombres = sorted(zf.namelist())
            self.assertEqual(nombres, sorted(f'{t.serial}.png' for t in tarjetas))

        # Unicidad de códigos dentro del lote.
        codigos = list(tarjetas.values_list('codigo', flat=True))
        self.assertEqual(len(codigos), len(set(codigos)))

    def test_cajero_puede_generar_lote(self):
        # Decisión de negocio confirmada por el cliente: el cajero tiene el
        # mismo nivel de acceso que administrador/director en todo el
        # módulo cantina — ya no se le restringe generar lotes de tarjetas.
        self.client.force_authenticate(user=self.cajero_user)
        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': 3}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_cantidad_invalida_rechazada(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': 0}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': -5}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': 'abc'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cantidad_excede_maximo_rechazada(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post('/api/cantina/tarjetas/generar-lote/', {'cantidad': 501}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(LoteTarjetas.objects.count(), 0)

    # --- Búsqueda de tarjeta sin asignar ---

    def test_buscar_tarjeta_sin_asignar_por_codigo(self):
        tarjeta = TarjetaPrepago.objects.create(serial='L001-0001', codigo='CANT-AAAAAAAAAA')
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/tarjetas/sin-asignar/buscar/', {'codigo': tarjeta.codigo})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['serial'], 'L001-0001')

    def test_buscar_tarjeta_sin_asignar_ya_asignada_da_mensaje_distinto(self):
        tarjeta = TarjetaPrepago.objects.create(
            serial='L001-0002', codigo='CANT-BBBBBBBBBB',
            alumno=self.alumno, estado='activa',
        )
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/tarjetas/sin-asignar/buscar/', {'serial': tarjeta.serial})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('ya fue asignada', resp.data['detail'])

    def test_buscar_tarjeta_sin_asignar_inexistente(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/tarjetas/sin-asignar/buscar/', {'codigo': 'CANT-NOEXISTE01'})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('No se encontró', resp.data['detail'])

    # --- Búsqueda de representante por cédula ---

    def test_buscar_representante_por_cedula_devuelve_sus_alumnos(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/representantes/buscar/', {'cedula': self.representante.cedula})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['representante']['cedula'], self.representante.cedula)
        self.assertEqual(len(resp.data['alumnos']), 2)

    def test_buscar_representante_inexistente(self):
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get('/api/cantina/representantes/buscar/', {'cedula': 'V-0000000'})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- Asignación ---

    def test_asignar_tarjeta_caso_feliz(self):
        tarjeta = TarjetaPrepago.objects.create(serial='L001-0003', codigo='CANT-CCCCCCCCCC')
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(
            f'/api/cantina/tarjetas/{tarjeta.id}/asignar/', {'alumno_id': self.alumno.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        tarjeta.refresh_from_db()
        self.assertEqual(tarjeta.estado, 'activa')
        self.assertEqual(tarjeta.alumno_id, self.alumno.id)
        self.assertIsNotNone(tarjeta.asignada_en)
        self.assertEqual(tarjeta.saldo, Decimal('0.00'))

    def test_asignar_tarjeta_conflicto_alumno_ya_tiene_tarjeta(self):
        TarjetaPrepago.objects.create(
            serial='L001-0004', codigo='CANT-DDDDDDDDDD',
            alumno=self.alumno, estado='activa',
        )
        tarjeta_nueva = TarjetaPrepago.objects.create(serial='L001-0005', codigo='CANT-EEEEEEEEEE')

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(
            f'/api/cantina/tarjetas/{tarjeta_nueva.id}/asignar/', {'alumno_id': self.alumno.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(resp.data['conflicto'])
        self.assertIn('tarjeta_existente_id', resp.data)

        # No debe haber quedado a medias: la tarjeta nueva sigue sin asignar.
        tarjeta_nueva.refresh_from_db()
        self.assertEqual(tarjeta_nueva.estado, 'sin_asignar')
        self.assertIsNone(tarjeta_nueva.alumno)

    def test_asignar_tarjeta_ya_asignada_rechazada(self):
        tarjeta = TarjetaPrepago.objects.create(
            serial='L001-0006', codigo='CANT-FFFFFFFFFF',
            alumno=self.alumno, estado='activa',
        )
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(
            f'/api/cantina/tarjetas/{tarjeta.id}/asignar/', {'alumno_id': self.otro_alumno.id}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Reposición ---

    def test_reponer_tarjeta_crea_historial_y_codigo_viejo_deja_de_resolver(self):
        tarjeta = TarjetaPrepago.objects.create(
            serial='L001-0007', codigo='CANT-GGGGGGGGGG',
            alumno=self.alumno, estado='activa', saldo=Decimal('12.50'),
        )
        codigo_viejo = tarjeta.codigo

        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(
            f'/api/cantina/tarjetas/{tarjeta.id}/reponer/', {'motivo': 'extravio'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)

        tarjeta.refresh_from_db()
        self.assertNotEqual(tarjeta.codigo, codigo_viejo)
        self.assertEqual(tarjeta.alumno_id, self.alumno.id)
        self.assertEqual(tarjeta.saldo, Decimal('12.50'))

        historial = HistorialCodigoTarjeta.objects.filter(tarjeta=tarjeta).first()
        self.assertIsNotNone(historial)
        self.assertEqual(historial.codigo_anterior, codigo_viejo)
        self.assertEqual(historial.motivo, 'extravio')
        self.assertEqual(historial.usuario, self.admin_user)

        # El código viejo ya no resuelve a ninguna tarjeta.
        self.assertFalse(TarjetaPrepago.objects.filter(codigo=codigo_viejo).exists())

    def test_reponer_tarjeta_motivo_invalido_rechazado(self):
        tarjeta = TarjetaPrepago.objects.create(serial='L001-0008', codigo='CANT-HHHHHHHHHH')
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.post(
            f'/api/cantina/tarjetas/{tarjeta.id}/reponer/', {'motivo': 'otro'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(HistorialCodigoTarjeta.objects.filter(tarjeta=tarjeta).count(), 0)
