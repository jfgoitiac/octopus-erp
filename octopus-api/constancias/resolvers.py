"""
Resolver de datos: arma el dict `datos` anidado que espera
`constancias/render.py::renderizar_plantilla` a partir de los modelos reales
(Alumno, Representante, Empleado/nómina, ConfiguracionSistema,
ConfiguracionFirmante).

Este módulo SÍ toca la base de datos (a diferencia de render.py, que es
puro). No importa nada de `render.py` — sólo arma el dict de entrada.

También vive aquí `generar_numero_constancia`, el correlativo de
`ConstanciaEmitida.numero`, siguiendo el mismo patrón que
`cobranza/solvencia.py::_generar_numero` (select_for_update dentro de
transaction.atomic).
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from .models import ConfiguracionFirmante

# ---------------------------------------------------------------------------
# Utilidades de fecha/número en letras (sin dependencias externas)
# ---------------------------------------------------------------------------

_UNIDADES = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
    'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
_DECENAS = {
    30: 'treinta', 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta',
    70: 'setenta', 80: 'ochenta', 90: 'noventa',
}
_CENTENAS = {
    200: 'doscientos', 300: 'trescientos', 400: 'cuatrocientos', 500: 'quinientos',
    600: 'seiscientos', 700: 'setecientos', 800: 'ochocientos', 900: 'novecientos',
}
_MESES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]


def _numero_a_letras(n: int) -> str:
    """Convierte un entero 0-9999 a su forma escrita en español, minúsculas.
    Utilidad propia, sin librerías externas (día y año de la constancia)."""
    if n < 0 or n > 9999:
        return str(n)
    if n < 30:
        return _UNIDADES[n]
    if n < 100:
        decena = (n // 10) * 10
        resto = n % 10
        base = _DECENAS[decena]
        return base if resto == 0 else f"{base} y {_UNIDADES[resto]}"
    if n < 1000:
        if n == 100:
            return 'cien'
        centena = (n // 100) * 100
        resto = n % 100
        base = 'ciento' if centena == 100 else _CENTENAS[centena]
        return base if resto == 0 else f"{base} {_numero_a_letras(resto)}"
    miles = n // 1000
    resto = n % 1000
    prefijo = 'mil' if miles == 1 else f"{_numero_a_letras(miles)} mil"
    return prefijo if resto == 0 else f"{prefijo} {_numero_a_letras(resto)}"


def fecha_a_letras(fecha) -> str:
    """"ocho de septiembre de dos mil veintiséis" — en minúsculas, sin librería externa."""
    dia = _numero_a_letras(fecha.day)
    mes = _MESES_ES[fecha.month - 1]
    anio = _numero_a_letras(fecha.year)
    return f"{dia} de {mes} de {anio}"


# ---------------------------------------------------------------------------
# Formateo / cálculo
# ---------------------------------------------------------------------------

def _formatear_moneda(valor) -> str:
    """No se encontró una utilidad de formateo de Bs. reutilizable a nivel de
    módulo (nomina/utils.py formatea inline con f"Bs. {x:,.2f}" dentro del
    generador de PDF); se replica ese mismo formato aquí."""
    if valor is None:
        return ''
    return f"Bs. {valor:,.2f}"


def _calcular_edad(fecha_nacimiento, hoy) -> int | None:
    if not fecha_nacimiento:
        return None
    return hoy.year - fecha_nacimiento.year - (
        (hoy.month, hoy.day) < (fecha_nacimiento.month, fecha_nacimiento.day)
    )


def _antiguedad_texto(fecha_ingreso, hoy) -> str | None:
    if not fecha_ingreso:
        return None
    anios = hoy.year - fecha_ingreso.year
    meses = hoy.month - fecha_ingreso.month
    if hoy.day < fecha_ingreso.day:
        meses -= 1
    if meses < 0:
        anios -= 1
        meses += 12
    return f"{anios} años, {meses} meses"


def _nivel_desde_grado_seccion(grado_seccion: str) -> str:
    """Heurística por palabra clave (el modelo Alumno no tiene campo `nivel`
    separado, ver contrato): si el texto sugiere bachillerato/secundaria ->
    Educación Media; si sugiere preescolar/inicial -> Educación Inicial; si
    contiene "grado" -> Educación Primaria. Aproximación aceptada."""
    if not grado_seccion:
        return ''
    texto = grado_seccion.lower()
    if any(p in texto for p in ('bachillerato', 'secundaria', 'media', 'año')):
        return 'Educación Media'
    if any(p in texto for p in ('preescolar', 'inicial', 'maternal')):
        return 'Educación Inicial'
    if 'grado' in texto:
        return 'Educación Primaria'
    return ''


def _seccion_desde_grado_seccion(grado_seccion: str) -> str:
    """Extrae la última palabra de `grado_seccion` como sección solo si es
    plausible (una letra o token corto, ej. la "A" final de "3er Grado A").
    Si no se puede parsear con confianza, se deja vacío (mejor de menos que
    mal, según contrato)."""
    if not grado_seccion:
        return ''
    partes = grado_seccion.strip().split()
    if len(partes) < 2:
        return ''
    ultima = partes[-1]
    if ultima.isalpha() and len(ultima) <= 2:
        return ultima.upper()
    return ''


def periodo_escolar_de_alumno(alumno) -> str:
    from secretaria.models import ConfiguracionSistema, Inscripcion

    inscripcion = (
        Inscripcion.objects.filter(alumno=alumno).order_by('-fecha_inscripcion').first()
    )
    if inscripcion:
        return inscripcion.periodo_escolar
    config = ConfiguracionSistema.objects.first()
    return config.periodo_escolar_activo if config else ''


def periodo_escolar_activo() -> str:
    from secretaria.models import ConfiguracionSistema

    config = ConfiguracionSistema.objects.first()
    return config.periodo_escolar_activo if config else ''


# ---------------------------------------------------------------------------
# Resolver principal
# ---------------------------------------------------------------------------

def resolver_datos(plantilla, alumno=None, trabajador=None, datos_capturados=None, incluir_sensibles=False) -> tuple[dict, str | None]:
    """Devuelve (datos, sexo). `incluir_sensibles` controla si se pueblan
    trabajador.sueldo/trabajador.bono (dato sensible de nómina)."""
    datos_capturados = datos_capturados or {}
    hoy = timezone.now().date()
    datos: dict = {}
    sexo: str | None = None

    if alumno is not None:
        datos_alumno = {
            'nombres': alumno.nombre,
            'apellidos': alumno.apellido,
        }
        if alumno.cedula_escolar:
            datos_alumno['cedula_escolar'] = alumno.cedula_escolar
        if alumno.cedula:
            datos_alumno['cedula'] = {
                'numero': alumno.cedula,
                'nacionalidad': alumno.cedula_nacionalidad or 'V',
            }
        if alumno.fecha_nacimiento:
            datos_alumno['fecha_nacimiento'] = alumno.fecha_nacimiento.strftime('%d/%m/%Y')
            edad = _calcular_edad(alumno.fecha_nacimiento, hoy)
            if edad is not None:
                datos_alumno['edad'] = f"{edad} años"
        if alumno.grado_seccion:
            datos_alumno['grado'] = alumno.grado_seccion
            nivel = _nivel_desde_grado_seccion(alumno.grado_seccion)
            if nivel:
                datos_alumno['nivel'] = nivel
            seccion = _seccion_desde_grado_seccion(alumno.grado_seccion)
            if seccion:
                datos_alumno['seccion'] = seccion
        anio_escolar = periodo_escolar_de_alumno(alumno)
        if anio_escolar:
            datos_alumno['anio_escolar'] = anio_escolar
        datos_alumno['estatus'] = 'Activo' if alumno.activo else 'Retirado'

        # Campos que vienen del body (no de la BD): se copian tal cual si
        # están presentes y no vacíos.
        for campo in ('horario', 'grado_promocion', 'nivel_promocion', 'anio_escolar_promocion'):
            valor = datos_capturados.get(campo)
            if valor:
                datos_alumno[campo] = valor

        datos['alumno'] = datos_alumno

        if alumno.genero == 'masculino':
            sexo = 'M'
        elif alumno.genero == 'femenino':
            sexo = 'F'

        datos_familia = {}
        if alumno.parentesco:
            datos_familia['parentesco'] = alumno.get_parentesco_display()
        representante = alumno.representante
        if representante is not None:
            datos_familia['representante_nombres'] = representante.nombre
            datos_familia['representante_apellidos'] = representante.apellido
            if representante.cedula:
                # Representante no tiene campo de nacionalidad propio hoy —
                # se usa 'V' por defecto (ver contrato).
                datos_familia['representante_cedula'] = {
                    'numero': representante.cedula,
                    'nacionalidad': 'V',
                }
        if datos_familia:
            datos['familia'] = datos_familia

    if trabajador is not None:
        datos_trabajador = {
            'nombres': trabajador.nombre,
            'apellidos': trabajador.apellido,
        }
        if trabajador.cedula:
            # Empleado no tiene campo de nacionalidad propio hoy — 'V' por defecto.
            datos_trabajador['cedula'] = {'numero': trabajador.cedula, 'nacionalidad': 'V'}
        datos_trabajador['cargo'] = trabajador.get_tipo_personal_display()
        if trabajador.fecha_ingreso:
            datos_trabajador['fecha_ingreso'] = trabajador.fecha_ingreso.strftime('%d/%m/%Y')
            antiguedad = _antiguedad_texto(trabajador.fecha_ingreso, hoy)
            if antiguedad is not None:
                datos_trabajador['antiguedad'] = antiguedad
        if trabajador.tipo_contrato:
            datos_trabajador['tipo_contrato'] = trabajador.get_tipo_contrato_display()

        if incluir_sensibles:
            datos_trabajador['sueldo'] = _formatear_moneda(trabajador.sueldo_base_ves)
            from nomina.models import RegistroNomina

            ultimo_registro = (
                RegistroNomina.objects.filter(empleado=trabajador)
                .order_by('-anio_correspondiente', '-mes_correspondiente')
                .first()
            )
            if ultimo_registro is not None:
                datos_trabajador['bono'] = _formatear_moneda(ultimo_registro.bono_usd)

        datos['trabajador'] = datos_trabajador
        # Nómina no modela sexo/género — sexo queda None para trabajadores,
        # el motor usa la variante masculina por defecto. Comportamiento
        # esperado y aprobado por el contrato, no es un bug.

    # institucion — siempre presente
    from secretaria.models import ConfiguracionSistema

    config = ConfiguracionSistema.objects.first()
    datos_institucion: dict = {}
    if config is not None:
        if config.nombre_colegio:
            datos_institucion['nombre_colegio'] = config.nombre_colegio
        if config.afiliacion_nombre:
            datos_institucion['afiliacion'] = config.afiliacion_nombre
        if config.direccion_colegio:
            datos_institucion['direccion'] = config.direccion_colegio
        if config.municipio:
            datos_institucion['ciudad'] = config.municipio
        if config.estado_colegio:
            datos_institucion['estado'] = config.estado_colegio
        if config.rif:
            datos_institucion['rif'] = config.rif
    datos_institucion['sede'] = ''  # token reservado — sin multisede activa

    firmante = ConfiguracionFirmante.objects.first()
    if firmante is not None:
        datos_institucion['firmante_nombre'] = firmante.nombre
        datos_institucion['firmante_cedula'] = {
            'numero': firmante.cedula,
            'nacionalidad': firmante.nacionalidad or 'V',
        }
        datos_institucion['firmante_cargo'] = firmante.cargo

    datos['institucion'] = datos_institucion

    # documento — placeholder hasta que EmitirView sobrescriba con el número real.
    datos['documento'] = {
        'numero': '(se asigna al emitir)',
        'fecha_numero': hoy.strftime('%d/%m/%Y'),
        'fecha_letras': fecha_a_letras(hoy),
    }

    return datos, sexo


# ---------------------------------------------------------------------------
# Correlativo de ConstanciaEmitida.numero
# ---------------------------------------------------------------------------

PREFIJOS_TIPO = {
    'estudio': 'EST',
    'conducta': 'CON',
    'retiro': 'RET',
    'trabajo': 'TRB',
}


def generar_numero_constancia(tipo: str, periodo: str) -> str:
    """Replica el patrón de cobranza/solvencia.py::_generar_numero, con
    prefijo por tipo de constancia + período escolar completo + secuencial
    de 4 dígitos. Debe llamarse dentro de una transaction.atomic() del
    llamador (igual que el ejemplo de cobranza)."""
    from .models import ConstanciaEmitida

    prefijo_tipo = PREFIJOS_TIPO.get(tipo, tipo[:3].upper())
    periodo = periodo or ''
    prefijo = f"{prefijo_tipo}-{periodo}-"
    with transaction.atomic():
        count = (
            ConstanciaEmitida.objects
            .select_for_update()
            .filter(numero__startswith=prefijo)
            .count()
        )
        return f"{prefijo}{count + 1:04d}"
