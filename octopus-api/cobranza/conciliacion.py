class ConciliadorBancario:
    @staticmethod
    def conciliar_zelle(referencia_bancaria, monto_recibido):
        """
        Busca un pago pendiente que coincida con la referencia y el monto.
        """
        from .models import Pago
        try:
            pago = Pago.objects.get(referencia=referencia_bancaria, monto_usd=monto_recibido)
            return {"status": "conciliado", "pago_id": pago.id}
        except Pago.DoesNotExist:
            return {"status": "no_encontrado", "referencia": referencia_bancaria}