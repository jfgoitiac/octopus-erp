"""
Tests de la Fase 0 de la Auditoría de Cantina: bitácora append-only con
cadena de hash, revisión automática de cierres, merma como tipo propio y
permiso EsDirector sobre todas las rutas del módulo.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .auditoria.bitacora import registrar_evento, snapshot, verificar_cadena
from .auditoria.models import RegistroInalterableError, validar_adjunto_revision
from .models import (
    AperturaCajaCantina,
    CategoriaProducto,
    CierreCajaCantina,
    EventoAuditoriaCantina,
    ProductoCantina,
    RevisionCierre,
)
from .services_inventario import aplicar_movimiento_inventario

User = get_user_model()


def crear_usuario(username, rol, superuser=False):
    if superuser:
        user = User.objects.create_superuser(username=username, password='password123')
    else:
        user = User.objects.create_user(username=username, password='password123')
    user.perfil.rol = rol
    user.perfil.esta_activo = True
    user.perfil.save()
    return user


class BitacoraTests(TestCase):
    def setUp(self):
        self.director = crear_usuario('director_aud', 'director')
        categoria = CategoriaProducto.objects.create(nombre='Bebidas')
        self.producto = ProductoCantina.objects.create(
            nombre='Jugo', categoria=categoria, precio=Decimal('1.50'), costo=Decimal('0.80'),
        )

    def test_registra_evento_con_snapshot_y_hash(self):
        antes = snapshot(self.producto, ['precio', 'costo'])
        evento = registrar_evento(
            'cambio_precio', objeto=self.producto, usuario=self.director,
            antes=antes, despues={'precio': '2.00', 'costo': '0.80'}, motivo='Ajuste de lista',
        )
        self.assertEqual(evento.objeto_tipo, 'productocantina')
        self.assertEqual(evento.objeto_id, str(self.producto.pk))
        self.assertEqual(evento.antes, {'precio': '1.50', 'costo': '0.80'})
        self.assertEqual(evento.usuario_rol, 'director')
        self.assertEqual(len(evento.hash), 64)
        self.assertEqual(evento.hash_anterior, '')

    def test_encadena_hash_con_el_evento_anterior(self):
        e1 = registrar_evento('cambio_precio', objeto=self.producto, usuario=self.director)
        e2 = registrar_evento('merma', objeto=self.producto, usuario=self.director)
        self.assertEqual(e2.hash_anterior, e1.hash)
        self.assertTrue(verificar_cadena()['ok'])

    def test_no_se_puede_modificar_ni_borrar(self):
        evento = registrar_evento('cambio_precio', objeto=self.producto, usuario=self.director)
        evento.motivo = 'alterado'
        with self.assertRaises(RegistroInalterableError):
            evento.save()
        with self.assertRaises(RegistroInalterableError):
            evento.delete()
        with self.assertRaises(RegistroInalterableError):
            EventoAuditoriaCantina.objects.filter(pk=evento.pk).update(motivo='x')
        with self.assertRaises(RegistroInalterableError):
            EventoAuditoriaCantina.objects.all().delete()

    def test_no_se_puede_crear_sin_la_puerta_oficial(self):
        with self.assertRaises(RegistroInalterableError):
            EventoAuditoriaCantina.objects.create(tipo='merma', objeto_tipo='x', objeto_id='1')

    def test_verificar_cadena_detecta_alteracion_por_sql(self):
        registrar_evento('cambio_precio', objeto=self.producto, usuario=self.director)
        e2 = registrar_evento('merma', objeto=self.producto, usuario=self.director, motivo='vencido')
        registrar_evento('merma', objeto=self.producto, usuario=self.director)
        # Alteración por fuera de la aplicación (SQL directo). En PostgreSQL
        # el trigger de 0007 la bloquea; en SQLite la detecta la cadena.
        if connection.vendor == 'postgresql':
            self.skipTest('El trigger de PostgreSQL impide el UPDATE directo.')
        with connection.cursor() as cursor:
            cursor.execute(
                f'UPDATE {EventoAuditoriaCantina._meta.db_table} SET motivo = %s WHERE id = %s',
                ['nada', e2.pk],
            )
        resultado = verificar_cadena()
        self.assertFalse(resultado['ok'])
        self.assertEqual(resultado['primer_error_id'], e2.pk)

    def test_tipo_desconocido_falla(self):
        with self.assertRaises(ValueError):
            registrar_evento('inventado', objeto=self.producto, usuario=self.director)


class RevisionYMermaTests(TestCase):
    def setUp(self):
        self.cajero = crear_usuario('cajero_aud', 'cajero')
        categoria = CategoriaProducto.objects.create(nombre='Snacks')
        self.producto = ProductoCantina.objects.create(
            nombre='Galleta', categoria=categoria, precio=Decimal('1.00'), stock_actual=10,
        )

    def test_cierre_nuevo_nace_con_revision_pendiente(self):
        apertura = AperturaCajaCantina.objects.create(cajero=self.cajero, monto_inicial=Decimal('10.00'))
        cierre = CierreCajaCantina.objects.create(cajero=self.cajero, apertura=apertura, fecha=date.today())
        self.assertEqual(cierre.revision.estado, 'pendiente')

    def test_transiciones_de_revision(self):
        revision = RevisionCierre(estado='pendiente')
        self.assertTrue(revision.puede_pasar_a('aprobado'))
        revision.estado = 'aprobado'
        self.assertFalse(revision.puede_pasar_a('observado'))

    def test_merma_resta_stock_con_cantidad_positiva(self):
        mov = aplicar_movimiento_inventario(self.producto, 'merma', 3, motivo='Vencido', usuario=self.cajero)
        self.assertEqual(mov.tipo, 'merma')
        self.assertEqual(mov.cantidad, 3)
        self.assertEqual(mov.stock_despues, 7)

    def test_merma_rechaza_cantidad_no_positiva(self):
        with self.assertRaises(ValidationError):
            aplicar_movimiento_inventario(self.producto, 'merma', -2, usuario=self.cajero)

    def test_validador_de_adjuntos(self):
        validar_adjunto_revision(SimpleUploadedFile('acta.pdf', b'%PDF-1.4'))
        with self.assertRaises(ValidationError):
            validar_adjunto_revision(SimpleUploadedFile('script.exe', b'MZ'))
        grande = SimpleUploadedFile('foto.jpg', b'0' * (5 * 1024 * 1024 + 1))
        with self.assertRaises(ValidationError):
            validar_adjunto_revision(grande)


class PermisoDirectorTests(TestCase):
    """Todas las rutas del módulo son exclusivas del Director (D5: + superusuario)."""
    RUTAS_GET = [
        ('cantina:auditoria-panel', {}),
        ('cantina:auditoria-cierres', {}),
        ('cantina:auditoria-cierre-detalle', {'pk': 1}),
        ('cantina:auditoria-cierre-historial', {'pk': 1}),
        ('cantina:auditoria-reporte-ventas', {}),
        ('cantina:auditoria-reporte-excepciones', {}),
        ('cantina:auditoria-reporte-inventario', {}),
        ('cantina:auditoria-reporte-rentabilidad', {}),
        ('cantina:auditoria-bitacora', {}),
        ('cantina:auditoria-bitacora-verificar', {}),
        ('cantina:auditoria-alertas', {}),
        ('cantina:auditoria-alertas-resumen', {}),
        ('cantina:auditoria-parametros', {}),
    ]

    def setUp(self):
        self.client = APIClient()
        self.director = crear_usuario('dir_perm', 'director')
        self.admin = crear_usuario('admin_perm', 'administrador')
        self.cajero = crear_usuario('caj_perm', 'cajero')
        self.superusuario = crear_usuario('su_perm', 'sistemas', superuser=True)

    def _status(self, user, nombre, kwargs):
        self.client.force_authenticate(user)
        return self.client.get(reverse(nombre, kwargs=kwargs)).status_code

    def test_anonimo_no_entra(self):
        self.client.force_authenticate(None)
        for nombre, kwargs in self.RUTAS_GET:
            code = self.client.get(reverse(nombre, kwargs=kwargs)).status_code
            self.assertIn(code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN), nombre)

    def test_administrador_y_cajero_reciben_403(self):
        for user in (self.admin, self.cajero):
            for nombre, kwargs in self.RUTAS_GET:
                self.assertEqual(self._status(user, nombre, kwargs), status.HTTP_403_FORBIDDEN, nombre)

    def test_director_y_superusuario_pasan_el_permiso(self):
        for user in (self.director, self.superusuario):
            for nombre, kwargs in self.RUTAS_GET:
                self.assertNotIn(
                    self._status(user, nombre, kwargs),
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN), nombre,
                )

    def test_director_inactivo_no_entra(self):
        self.director.perfil.esta_activo = False
        self.director.perfil.save()
        self.assertEqual(self._status(self.director, 'cantina:auditoria-panel', {}), status.HTTP_403_FORBIDDEN)

    def test_reabrir_caja_admite_director_y_administrador_pero_no_cajero(self):
        url = reverse('cantina:auditoria-cierre-reabrir', kwargs={'pk': 1})
        self.client.force_authenticate(self.cajero)
        self.assertEqual(self.client.post(url, {}).status_code, status.HTTP_403_FORBIDDEN)
        for user in (self.director, self.admin):
            self.client.force_authenticate(user)
            self.assertNotEqual(self.client.post(url, {}).status_code, status.HTTP_403_FORBIDDEN)
