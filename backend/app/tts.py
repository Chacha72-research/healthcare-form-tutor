"""Server-side text-to-speech through Google Cloud Text-to-Speech.

Only used when TTS_PROVIDER=google. Otherwise the frontend uses the phone's
built-in voices, which costs nothing and needs no key.
"""

from __future__ import annotations

import base64
from collections import OrderedDict

import httpx

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
MAX_CACHE = 500


class TTSError(RuntimeError):
    pass


class GoogleTTS:
    def __init__(self, api_key: str, speaking_rate: float = 0.85):
        self.api_key = api_key
        self.speaking_rate = speaking_rate
        # Glossary words get played over and over, so keep recent audio in memory.
        self._cache: OrderedDict[tuple[str, str, bool], bytes] = OrderedDict()

    async def synthesize(self, text: str, lang: str, slow: bool = False) -> bytes:
        key = (text, lang, slow)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        rate = 0.7 if slow else self.speaking_rate
        body = {
            "input": {"text": text},
            "voice": {"languageCode": lang},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate},
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(GOOGLE_TTS_URL, params={"key": self.api_key}, json=body)
        if resp.status_code != 200:
            raise TTSError(f"Google TTS returned {resp.status_code}")

        audio = base64.b64decode(resp.json()["audioContent"])
        self._cache[key] = audio
        if len(self._cache) > MAX_CACHE:
            self._cache.popitem(last=False)
        return audio
