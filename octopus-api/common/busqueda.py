"""Utilidades para búsquedas tolerantes a tildes y mayúsculas."""

import unicodedata

from django.db.models import CharField, F, Func, Q


def normalizar_busqueda(valor):
    """Devuelve términos comparables, sin alterar el texto almacenado."""
    texto = unicodedata.normalize('NFD', str(valor or ''))
    texto = ''.join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return ' '.join(texto.casefold().split())


class TextoNormalizado(Func):
    """LOWER sin diacríticos, portable entre SQLite (tests) y PostgreSQL."""

    output_field = CharField()

    def as_sql(self, compiler, connection, **extra_context):
        sql, params = compiler.compile(self.source_expressions[0])
        # Conservar la ñ como n hace que "nino" encuentre "niño", tal como
        # espera una búsqueda tolerante. Se incluyen mayúsculas por si el motor
        # no aplica LOWER de forma Unicode.
        for origen, destino in (
            ('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ü', 'u'), ('ñ', 'n'),
            ('Á', 'a'), ('É', 'e'), ('Í', 'i'), ('Ó', 'o'), ('Ú', 'u'), ('Ü', 'u'), ('Ñ', 'n'),
        ):
            sql = f'RePLACE({sql}, %s, %s)'
            params = [*params, origen, destino]
        return f'LOWER({sql})', params


def filtrar_busqueda(qs, texto, campos):
    """Filtra por todas las palabras en cualquiera de los campos indicados.

    Por ejemplo, ``"perez jose"`` encuentra ``"José Pérez"``. Los nombres
    de anotación son internos y se eliminan al serializar el queryset.
    """
    terminos = normalizar_busqueda(texto).split()
    if not terminos:
        return qs

    anotaciones = {
        f'_busqueda_{indice}': TextoNormalizado(F(campo))
        for indice, campo in enumerate(campos)
    }
    qs = qs.annotate(**anotaciones)
    for termino in terminos:
        coincidencia = Q()
        for indice in range(len(campos)):
            coincidencia |= Q(**{f'_busqueda_{indice}__contains': termino})
        qs = qs.filter(coincidencia)
    return qs
