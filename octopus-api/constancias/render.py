"""
Motor de render de plantillas de constancias.

Este módulo es PURO: no consulta la base de datos ni modelos Django. Recibe
un diccionario de datos ya resuelto por otra capa y devuelve el HTML con los
tokens sustituidos, junto con una lista de advertencias (nunca lanza
excepciones por datos faltantes o mal formados).

Sintaxis de plantilla soportada (cerrada, no se amplía aquí):

1. Sustitución simple: ``{{grupo.campo}}``, con
   ``grupo`` ∈ {alumno, familia, trabajador, institucion, documento}.
   Si el token no existe en ``datos`` se sustituye por cadena vacía y se
   agrega una advertencia.

2. Género con dos variantes: ``{{sexo:variante_a|variante_b}}``
   (masculino primero, femenino segundo). El motor NO valida un diccionario
   cerrado de pares de texto — acepta cualquier texto tecleado en ese
   formato.

Resolución de sexo
-------------------
``renderizar_plantilla`` recibe un parámetro ``sexo`` que puede ser
``'M'``, ``'F'`` o ``None``/ausente. Si no se pasa el parámetro, se busca
como *fallback* la clave ``'_sexo'`` dentro del diccionario ``datos``
(mismo dominio de valores). Reglas:

- ``'M'``  -> se usa ``variante_a`` (primera).
- ``'F'``  -> se usa ``variante_b`` (segunda).
- Cualquier otro valor (``None``, ausente, o algo inesperado) -> se usa
  ``variante_a`` por defecto y se agrega una advertencia indicando que no
  se pudo determinar el sexo.

Formato de cédula
------------------
Cuando el campo de un placeholder es ``cedula`` (exacto) o termina en
``_cedula`` (p.ej. ``madre_cedula``, ``padre_cedula``, ``firmante_cedula``),
el valor correspondiente en ``datos`` debe ser un dict con la forma::

    {'numero': '12345678', 'nacionalidad': 'V'}

y se formatea siempre a través del helper ``_formatear_cedula`` como
``"V-12345678"``. Si falta la clave ``'nacionalidad'`` se usa ``'V'`` por
defecto. Si el valor no es un dict, o falta ``'numero'``, se usa cadena
vacía para el número (resultando por ejemplo en ``"V-"``).

Seguridad
---------
No se usa Jinja2, Django Template Engine ni ningún motor de plantillas
genérico con condicionales o loops: es un sustituidor de tokens propio
basado en una única pasada de regex. El valor de un dato nunca se
reinterpreta como plantilla: ``re.sub`` no vuelve a escanear el texto de
reemplazo, así que un dato malicioso como ``"{{alumno.cedula}}"`` dentro de
otro campo se inserta como texto literal y no se evalúa como un nuevo
token. Este módulo tampoco sanitiza HTML del ``cuerpo_html`` en sí (eso lo
hace otra capa al guardar/renderizar en el frontend).
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Regex de la notación nueva
# ---------------------------------------------------------------------------

# Captura el contenido interno de cualquier {{ ... }}, sin importar su forma.
# El contenido se interpreta después, dentro del callback de reemplazo.
_TOKEN_RE = re.compile(r"\{\{(.*?)\}\}", re.DOTALL)

# {{grupo.campo}}
_SIMPLE_TOKEN_INNER_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$")

# sexo:variante_a|variante_b
_SEXO_PREFIX = "sexo:"

# ---------------------------------------------------------------------------
# Regex y mapeo de la notación vieja: ❴❴campo❵❵
# (U+2774 LEFT DOUBLE CURLY BRACKET / U+2775 RIGHT DOUBLE CURLY BRACKET,
# no son llaves normales "{" "}")
# ---------------------------------------------------------------------------

_TOKEN_VIEJO_RE = re.compile("❴❴([^❴❵]+)❵❵")

# Campos ambiguos: dependen del parámetro `destinatario` de importar_notacion_vieja.
_CAMPOS_AMBIGUOS = {"apellidos", "nombres", "CI", "cargo"}

# Mapeo fijo (no ambiguo) de campo viejo -> token nuevo.
_MAPEO_FIJO = {
    "CIE": "{{alumno.cedula_escolar}}",
    "edad": "{{alumno.edad}}",
    "grado": "{{alumno.grado}}",
    "gradoa": "{{alumno.grado}}",
    "nivel": "{{alumno.nivel}}",
    "nivela": "{{alumno.nivel}}",
    "añoescolara": "{{alumno.anio_escolar}}",
    "gradop": "{{alumno.grado_promocion}}",
    "nivelp": "{{alumno.nivel_promocion}}",
    "horario": "{{alumno.horario}}",
    "fecha": "{{documento.fecha_numero}}",
    "fechanac": "{{alumno.fecha_nacimiento}}",
    "fechaingreso": "{{trabajador.fecha_ingreso}}",
    "sueldo": "{{trabajador.sueldo}}",
    "bono": "{{trabajador.bono}}",
    "apellidosmadre": "{{familia.madre_apellidos}}",
    "nombresmadre": "{{familia.madre_nombres}}",
    "cimadre": "{{familia.madre_cedula}}",
    "apellidospadre": "{{familia.padre_apellidos}}",
    "nombrespadre": "{{familia.padre_nombres}}",
    "cipadre": "{{familia.padre_cedula}}",
}


def _formatear_cedula(valor) -> str:
    """Formatea un dato de cédula ya resuelto a la forma ``"NAC-NUMERO"``.

    Único lugar del motor donde vive esta normalización (helper reutilizado
    por todos los placeholders de cédula, no repetida por cada uno).

    Acepta un dict con claves ``'numero'`` y ``'nacionalidad'`` (p.ej.
    ``{'numero': '12345678', 'nacionalidad': 'V'}``). Si falta
    ``'nacionalidad'`` usa ``'V'`` por defecto. Si ``valor`` no es un dict,
    o falta ``'numero'``, usa cadena vacía para el número.
    """
    if isinstance(valor, dict):
        numero = valor.get("numero") or ""
        nacionalidad = valor.get("nacionalidad") or "V"
    else:
        numero = valor if valor else ""
        nacionalidad = "V"
    return f"{nacionalidad}-{numero}"


def _es_campo_cedula(campo: str) -> bool:
    return campo == "cedula" or campo.endswith("_cedula")


def _obtener_valor(datos: dict, grupo: str, campo: str):
    """Busca ``datos[grupo][campo]``.

    Devuelve una tupla ``(valor, encontrado)``. Nunca lanza excepción: si
    ``datos`` no es un dict, si el grupo no existe o no es un dict, o si el
    campo no existe, devuelve ``(None, False)``.
    """
    if not isinstance(datos, dict):
        return None, False
    grupo_dict = datos.get(grupo)
    if not isinstance(grupo_dict, dict):
        return None, False
    if campo not in grupo_dict:
        return None, False
    return grupo_dict[campo], True


def renderizar_plantilla(cuerpo_html: str, datos: dict, sexo: str | None = None) -> tuple[str, list[str]]:
    """Sustituye los tokens de ``cuerpo_html`` usando ``datos``.

    Parámetros
    ----------
    cuerpo_html: HTML de la plantilla con tokens ``{{grupo.campo}}`` y/o
        ``{{sexo:variante_a|variante_b}}``.
    datos: diccionario de datos ya resuelto (ver docstring del módulo).
    sexo: ``'M'``, ``'F'`` o ``None``. Si es ``None`` se intenta leer
        ``datos.get('_sexo')`` como fallback.

    Devuelve
    --------
    ``(html_renderizado, advertencias)`` — nunca lanza excepción por un
    token desconocido, un sexo indeterminado, o datos faltantes.
    """
    advertencias: list[str] = []

    sexo_resuelto = sexo
    if sexo_resuelto is None and isinstance(datos, dict):
        sexo_resuelto = datos.get("_sexo")

    def _reemplazar(match: re.Match) -> str:
        contenido = match.group(1).strip()

        # --- Variante de género: sexo:variante_a|variante_b ---
        if contenido.startswith(_SEXO_PREFIX):
            resto = contenido[len(_SEXO_PREFIX):]
            partes = resto.split("|", 1)
            if len(partes) != 2:
                advertencias.append(
                    f"Token de género mal formado, se ignora: '{{{{{contenido}}}}}'"
                )
                return ""
            variante_a, variante_b = partes[0], partes[1]
            if sexo_resuelto == "M":
                return variante_a
            if sexo_resuelto == "F":
                return variante_b
            advertencias.append(
                "no se pudo determinar el sexo, se usó la variante masculina por defecto"
            )
            return variante_a

        # --- Sustitución simple: grupo.campo ---
        m = _SIMPLE_TOKEN_INNER_RE.match(contenido)
        if m:
            grupo, campo = m.group(1), m.group(2)
            valor, encontrado = _obtener_valor(datos, grupo, campo)
            if not encontrado:
                advertencias.append(f"Token desconocido, se reemplaza por vacío: '{{{{{grupo}.{campo}}}}}'")
                return ""
            if _es_campo_cedula(campo):
                return _formatear_cedula(valor)
            if valor is None:
                return ""
            return str(valor)

        # --- Formato no reconocido: no se lanza excepción, se advierte ---
        advertencias.append(f"Token con formato no reconocido, se ignora: '{{{{{contenido}}}}}'")
        return ""

    html_renderizado = _TOKEN_RE.sub(_reemplazar, cuerpo_html)
    return html_renderizado, advertencias


def importar_notacion_vieja(texto: str, destinatario: str) -> str:
    """Convierte la notación vieja ``❴❴campo❵❵`` a la notación nueva ``{{grupo.campo}}``.

    ``destinatario`` es ``'alumno'`` o ``'trabajador'`` y decide, para los
    campos ambiguos de la notación vieja (que podían referirse a cualquiera
    de los dos), a qué grupo nuevo se mapean:

    - ``apellidos`` / ``nombres`` -> ``{{trabajador.apellidos}}`` /
      ``{{trabajador.nombres}}`` si ``destinatario == 'trabajador'``, si no
      ``{{alumno.apellidos}}`` / ``{{alumno.nombres}}`` (default).
    - ``CI`` -> ``{{trabajador.cedula}}`` si ``destinatario == 'trabajador'``;
      en cualquier otro caso (incluido un ``destinatario`` no reconocido) se
      usa ``{{alumno.cedula}}`` como default más común.
    - ``cargo`` -> ``{{trabajador.cargo}}`` si ``destinatario == 'trabajador'``,
      si no ``{{alumno.cargo}}`` (default, caso poco común).

    El resto de los campos (no ambiguos) se mapean siempre igual, según la
    tabla fija del módulo, sin importar ``destinatario``. Un campo viejo no
    reconocido se deja tal cual en el texto (no se lanza excepción).
    """
    es_trabajador = destinatario == "trabajador"

    def _mapear(campo_viejo: str):
        if campo_viejo in _CAMPOS_AMBIGUOS:
            grupo = "trabajador" if es_trabajador else "alumno"
            if campo_viejo == "CI":
                return f"{{{{{grupo}.cedula}}}}"
            return f"{{{{{grupo}.{campo_viejo}}}}}"
        return _MAPEO_FIJO.get(campo_viejo)

    def _reemplazar(match: re.Match) -> str:
        campo_viejo = match.group(1)
        nuevo = _mapear(campo_viejo)
        if nuevo is None:
            # Campo desconocido en la tabla: se deja tal cual, sin excepción.
            return match.group(0)
        return nuevo

    return _TOKEN_VIEJO_RE.sub(_reemplazar, texto)
