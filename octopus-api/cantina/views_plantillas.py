from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PlantillaVenta
from .permissions import EsCajeroOAdmin
from .serializers_plantillas import PlantillaVentaSerializer


def _queryset():
    return PlantillaVenta.objects.prefetch_related('items__producto')


class PlantillasVentaListCreateView(APIView):
    """GET ?area=&activo=: plantillas del POS. POST: crea una. Cajero y admin
    tienen el mismo nivel de acceso en el módulo (como productos)."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        qs = _queryset()
        area = request.query_params.get('area')
        if area:
            qs = qs.filter(area=area)
        activo = request.query_params.get('activo')
        if activo is not None:
            qs = qs.filter(activo=activo.lower() in ('1', 'true', 'si', 'sí'))
        return Response(PlantillaVentaSerializer(qs, many=True).data)

    def post(self, request):
        serializer = PlantillaVentaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PlantillaVentaDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def put(self, request, pk):
        plantilla = get_object_or_404(_queryset(), pk=pk)
        serializer = PlantillaVentaSerializer(plantilla, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PlantillaVentaSerializer(_queryset().get(pk=pk)).data)

    patch = put

    def delete(self, request, pk):
        get_object_or_404(PlantillaVenta, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
