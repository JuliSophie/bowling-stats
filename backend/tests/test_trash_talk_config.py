import os
import tempfile
import unittest
from pathlib import Path

from app.config import Settings


class TrashTalkSettingsTests(unittest.TestCase):
    def test_module_root_env_file_and_process_precedence_without_secret_output(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / "dummy.env"
            env_file.write_text("OPENAI_API_KEY=file-key\n", encoding="utf-8")
            old = os.environ.pop("OPENAI_API_KEY", None)
            try:
                settings = Settings(_env_file=env_file)
                self.assertEqual("file-key", settings.openai_api_key.get_secret_value())
                self.assertNotIn("file-key", repr(settings))
                self.assertNotIn("file-key", str(settings.model_dump()))
                os.environ["OPENAI_API_KEY"] = "process-key"
                self.assertEqual("process-key", Settings(_env_file=env_file).openai_api_key.get_secret_value())
            finally:
                os.environ.pop("OPENAI_API_KEY", None)
                if old is not None:
                    os.environ["OPENAI_API_KEY"] = old

    def test_missing_key_is_allowed_for_nonexecuting_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(_env_file=Path(directory) / "missing.env")
            self.assertIsNone(settings.openai_api_key)


if __name__ == "__main__":
    unittest.main()
