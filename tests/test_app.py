import unittest
from unittest.mock import patch, MagicMock
import sys
import json
import os
import subprocess
import time # For potential delays in tests if needed

# Mock the ResourceExhausted exception from google.api_core.exceptions
class MockResourceExhausted(Exception):
    pass

# Patch the actual ResourceExhausted with our mock for testing purposes
# This ensures that even if google.api_core.exceptions is not installed,
# or if we want to control its behavior, our tests can run.
# We'll apply this patch globally for the test module.
@patch('google.api_core.exceptions.ResourceExhausted', new=MockResourceExhausted)
class TestApp(unittest.TestCase):

    APP_PATH = "/home/lxl/code/ling-atlas/app.py"
    DUMMY_API_KEY = "sk-dummy-api-key"

    def setUp(self):
        # Ensure GEMINI_API_KEY is set for tests that expect it
        os.environ["GEMINI_API_KEY"] = self.DUMMY_API_KEY

    def tearDown(self):
        # Clean up environment variable after each test
        if "GEMINI_API_KEY" in os.environ:
            del os.environ["GEMINI_API_KEY"]

    def _run_app(self, input_text, model_name="gemini-1.5-pro", api_key=None):
        """Helper to run app.py as a subprocess."""
        env = os.environ.copy()
        if api_key is not None:
            env["GEMINI_API_KEY"] = api_key
        else:
            # Ensure it's unset if not provided, for testing missing key
            if "GEMINI_API_KEY" in env:
                del env["GEMINI_API_KEY"]

        cmd = [sys.executable, self.APP_PATH, model_name]
        result = subprocess.run(
            cmd,
            input=input_text,
            capture_output=True,
            text=True,
            env=env
        )
        return result

    @patch('langchain_google_genai.ChatGoogleGenerativeAI')
    def test_successful_graph_generation(self, mock_chat_google_genai):
        mock_instance = mock_chat_google_genai.return_value
        mock_structured_llm = MagicMock()
        mock_instance.with_structured_output.return_value = mock_structured_llm

        # Define a mock KnowledgeGraph output
        mock_node_data = {"id": "TestNode", "type": "Concept", "properties": {}}
        mock_rel_data = {"source": {"id": "TestNode"}, "target": {"id": "AnotherNode"}, "type": "RELATES_TO", "properties": {}}

        # Create a mock object that behaves like the Pydantic KnowledgeGraph instance
        mock_kg_instance = MagicMock()
        mock_kg_instance.model_dump_json.return_value = json.dumps({
            "nodes": [mock_node_data],
            "relationships": [mock_rel_data]
        })

        mock_structured_llm.invoke.return_value = mock_kg_instance

        input_text = "This is a test sentence."
        result = self._run_app(input_text, api_key=self.DUMMY_API_KEY)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), json.loads(mock_kg_instance.model_dump_json()))
        self.assertIn("DEBUG: Using API Key ending in '...y-key'", result.stderr)
        mock_chat_google_genai.assert_called_once_with(model="gemini-1.5-pro", temperature=0, google_api_key=self.DUMMY_API_KEY)
        mock_instance.with_structured_output.assert_called_once()
        mock_structured_llm.invoke.assert_called_once()


    def test_missing_api_key(self):
        # Unset the API key for this test
        if "GEMINI_API_KEY" in os.environ:
            del os.environ["GEMINI_API_KEY"]

        input_text = "Some text."
        result = self._run_app(input_text, api_key=None) # Explicitly pass None to ensure it's unset

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("未找到 GEMINI_API_KEY", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_empty_input_text(self):
        result = self._run_app("")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("没有从标准输入接收到文本", result.stderr)
        self.assertEqual(result.stdout, "")

    @patch('langchain_google_genai.ChatGoogleGenerativeAI')
    @patch('time.sleep', return_value=None) # Mock sleep to speed up tests
    def test_rate_limit_retry_success(self, mock_sleep, mock_chat_google_genai):
        mock_instance = mock_chat_google_genai.return_value
        mock_structured_llm = MagicMock()
        mock_instance.with_structured_output.return_value = mock_structured_llm

        # Mock the invoke method to raise MockResourceExhausted twice, then succeed
        mock_node_data = {"id": "SuccessNode", "type": "Concept", "properties": {}}
        mock_kg_instance = MagicMock()
        mock_kg_instance.model_dump_json.return_value = json.dumps({"nodes": [mock_node_data], "relationships": []})

        mock_structured_llm.invoke.side_effect = [
            MockResourceExhausted("Quota exceeded"),
            MockResourceExhausted("Quota exceeded again"),
            mock_kg_instance # Third call succeeds
        ]

        input_text = "Test for retry."
        result = self._run_app(input_text, api_key=self.DUMMY_API_KEY)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), json.loads(mock_kg_instance.model_dump_json()))
        self.assertIn("DEBUG: Rate limit hit (attempt 1/5). Retrying in", result.stderr)
        self.assertIn("DEBUG: Rate limit hit (attempt 2/5). Retrying in", result.stderr)
        self.assertEqual(mock_structured_llm.invoke.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2) # Should sleep twice for 2 failures

    @patch('langchain_google_genai.ChatGoogleGenerativeAI')
    @patch('time.sleep', return_value=None) # Mock sleep to speed up tests
    def test_rate_limit_max_retries_exceeded(self, mock_sleep, mock_chat_google_genai):
        mock_instance = mock_chat_google_genai.return_value
        mock_structured_llm = MagicMock()
        mock_instance.with_structured_output.return_value = mock_structured_llm

        # Mock the invoke method to always raise MockResourceExhausted
        mock_structured_llm.invoke.side_effect = [MockResourceExhausted("Quota exceeded")] * 6 # 5 retries + 1 initial call

        input_text = "Test for max retries."
        result = self._run_app(input_text, api_key=self.DUMMY_API_KEY)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("API rate limit error after 5 retries", result.stderr)
        self.assertEqual(mock_structured_llm.invoke.call_count, 5) # Initial call + 4 retries
        self.assertEqual(mock_sleep.call_count, 4) # Should sleep 4 times for 4 failures before final exit

    @patch('langchain_google_genai.ChatGoogleGenerativeAI')
    def test_unexpected_error(self, mock_chat_google_genai):
        mock_instance = mock_chat_google_genai.return_value
        mock_structured_llm = MagicMock()
        mock_instance.with_structured_output.return_value = mock_structured_llm

        mock_structured_llm.invoke.side_effect = ValueError("Some unexpected error")

        input_text = "Test for unexpected error."
        result = self._run_app(input_text, api_key=self.DUMMY_API_KEY)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("An unexpected error occurred: Some unexpected error", result.stderr)
        self.assertEqual(result.stdout, "")
        mock_structured_llm.invoke.assert_called_once()

if __name__ == '__main__':
    unittest.main()