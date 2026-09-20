"""Test đầu tiên, dùng test runner có sẵn của Django."""

from django.test import Client, TestCase


class HelloApiTest(TestCase):
    def test_hello_api_connects_to_database(self) -> None:
        response = Client().get("/api/hello/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "PostgreSQL đã kết nối.")
