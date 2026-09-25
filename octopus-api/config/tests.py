from django.test import TestCase, override_settings


class HealthcheckTest(TestCase):
    @override_settings(ALLOWED_HOSTS=['testserver'])
    def test_healthcheck_is_public_and_checks_the_database(self):
        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
