import io
import json
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

import server


def wav(seconds=1):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(server.SAMPLE_RATE)
        audio.writeframes(b"\x00\x00" * (server.SAMPLE_RATE * seconds))
    return output.getvalue()


class DictationTests(unittest.TestCase):
    def test_decode_and_duration_bounds(self):
        self.assertEqual(len(server.decode_bounded_audio(wav())), server.SAMPLE_RATE)
        with self.assertRaises(server.AudioError) as error:
            server.decode_bounded_audio(wav(server.MAX_SECONDS + 1))
        self.assertEqual((error.exception.code, error.exception.status), ("too_long", 413))
        with self.assertRaises(server.AudioError) as error:
            server.decode_bounded_audio(b"not an audio file")
        self.assertEqual(error.exception.code, "invalid_audio")

    def test_only_one_inference_and_no_internal_error_details(self):
        started = threading.Event()
        release = threading.Event()

        def transcribe(_audio, **_options):
            started.set()
            if not release.wait(5):
                raise RuntimeError("fixture timed out")
            raise RuntimeError("private model path must not be returned")

        with self.worker(SimpleNamespace(transcribe=transcribe)) as base:
            first = []
            thread = threading.Thread(target=lambda: first.append(self.post(base, wav())))
            thread.start()
            try:
                self.assertTrue(started.wait(5))
                self.assertEqual(self.post(base, wav()), (429, {"error": {"code": "busy"}}))
            finally:
                release.set()
                thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(first, [(503, {"error": {"code": "unavailable"}})])
            self.assertEqual(self.post(base, wav()), (503, {"error": {"code": "unavailable"}}))

    def test_protocol_and_empty_speech(self):
        options = []

        def transcribe(_audio, **kwargs):
            options.append(kwargs)
            return iter([SimpleNamespace(text="  Review this.  ")]), None

        with self.worker(SimpleNamespace(transcribe=transcribe)) as base:
            with urllib.request.urlopen(base + "/health") as response:
                self.assertEqual(json.load(response), {"ready": True})
            self.assertEqual(self.post(base, wav()), (200, {"text": "Review this."}))
            self.assertEqual(options[0]["language"], "pt")
            self.assertEqual(self.post(base, b"invalid"), (422, {"error": {"code": "invalid_audio"}}))
            self.assertEqual(self.post(base, b"x", {"Content-Length": str(server.MAX_BYTES + 1)}), (413, {"error": {"code": "too_large"}}))
        with self.worker(SimpleNamespace(transcribe=lambda *_args, **_kwargs: (iter([]), None))) as base:
            self.assertEqual(self.post(base, wav()), (422, {"error": {"code": "no_speech"}}))

    @staticmethod
    def post(base, audio, headers=None):
        request = urllib.request.Request(base + "/transcribe", data=audio, headers={"Content-Type": "audio/wav", "X-Dictation-Language": "pt", **(headers or {})})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response)

    class worker:
        def __init__(self, model):
            self.server = ThreadingHTTPServer(("127.0.0.1", 0), server.handler_for(model))
            self.thread = threading.Thread(target=self.server.serve_forever)

        def __enter__(self):
            self.thread.start()
            return "http://127.0.0.1:" + str(self.server.server_port)

        def __exit__(self, *_args):
            self.server.shutdown()
            self.server.server_close()
            self.thread.join(5)


if __name__ == "__main__":
    unittest.main()
