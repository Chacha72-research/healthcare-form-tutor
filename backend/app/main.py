"""FastAPI server for the Healthcare Form Literacy Tutor."""

from __future__ import annotations

import logging

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .ai import AIError, AIProvider, make_provider
from .config import REPO_ROOT, Settings, settings as default_settings
from .content import Content, get_content
from .forms import FormError, TermMatcher, read_form
from .lessons import GeneratedStore, LessonService
from .quiz import build_quiz
from .results import QuizResult, save_result
from .speech import GeminiVoice

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tutor")

_UNSET = object()

EXTENSION_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain",
}


def _error(status: int, code: str) -> HTTPException:
    return HTTPException(status, detail={"code": code})


def _ai_status(exc: AIError) -> int:
    return 429 if exc.code == "ai_busy" else 502


def create_app(
    settings: Settings | None = None,
    content: Content | None = None,
    ai: AIProvider | None | object = _UNSET,
    voice: GeminiVoice | None | object = _UNSET,
) -> FastAPI:
    settings = settings or default_settings
    content = content or get_content()
    if ai is _UNSET:
        ai = make_provider(settings)
    if voice is _UNSET:
        voice = None
        if settings.voice_enabled:
            voice = GeminiVoice(
                settings.gemini_api_key,
                settings.gemini_tts_model,
                {"tutor": settings.tutor_voice, "staff": settings.staff_voice, "learner": settings.learner_voice},
                settings.audio_cache_dir,
            )

    matcher = TermMatcher(content.terms)
    lessons = LessonService(content, GeneratedStore(settings.generated_dir), ai)

    app = FastAPI(title="Healthcare Form Literacy Tutor")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    def language_or_400(code: str):
        language = content.language(code)
        if language is None:
            raise _error(400, "unknown_language")
        return language

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/config")
    def config():
        return {
            "languages": [
                {
                    "code": lang.code,
                    "english_name": lang.english_name,
                    "native_name": lang.native_name,
                    "tts_lang": lang.tts_lang,
                    "browser_tts_lang": lang.browser_tts_lang,
                    "dir": lang.dir,
                    "ui": {**content.english_ui, **lang.ui},
                }
                for lang in content.languages
            ],
            "english_ui": content.english_ui,
            "scenarios": [
                {
                    "id": s["id"],
                    "icon": s.get("icon", "chat"),
                    "title": s["title"],
                    "goal": s["goal"],
                    "staff_label": s["staff_label"],
                    "target_terms": s["target_terms"],
                }
                for s in content.scenarios
            ],
            "pretend_patient": content.pretend_patient,
            "features": {
                "ai": ai is not None,
                "voice": voice is not None,
                "live": settings.live_enabled,
            },
        }

    @app.get("/api/glossary")
    def glossary():
        return {"terms": [t.public() for t in content.terms]}

    @app.post("/api/forms/read")
    async def forms_read(file: UploadFile = File(...)):
        limit = settings.max_upload_mb * 1024 * 1024
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise _error(413, "file_too_big")

        mime = (file.content_type or "").split(";")[0].strip().lower()
        if mime not in EXTENSION_TYPES.values():
            name = (file.filename or "").lower()
            mime = next((t for ext, t in EXTENSION_TYPES.items() if name.endswith(ext)), mime)

        # The file is only held in memory for this request and never saved.
        try:
            reading = await read_form(data, mime, matcher=matcher, content=content, ai=ai)
        except FormError as exc:
            raise _error(exc.status, exc.code) from exc
        except AIError as exc:
            raise _error(_ai_status(exc), exc.code) from exc
        return reading.to_dict()

    @app.get("/api/explain")
    async def explain(
        terms: str = Query(min_length=1, max_length=4000),
        language: str = Query(min_length=2, max_length=16),
    ):
        lang = language_or_400(language)
        term_ids = [t.strip() for t in terms.split(",") if t.strip()][:60]
        return await lessons.explain(term_ids, lang)

    @app.get("/api/lesson")
    async def lesson(
        terms: str = Query(min_length=1, max_length=2000),
        language: str = Query(min_length=2, max_length=16),
    ):
        lang = language_or_400(language)
        term_ids = [t.strip() for t in terms.split(",") if t.strip()][:12]
        return await lessons.lesson(term_ids, lang)

    @app.get("/api/quiz")
    def quiz(
        terms: str = Query(default="", description="Comma-separated glossary ids"),
        n: int = Query(default=8, ge=1, le=20),
        seed: str | None = Query(default=None, description="Same seed gives the same quiz"),
    ):
        term_ids = [t.strip() for t in terms.split(",") if t.strip()]
        return build_quiz(content, term_ids, n=n, seed=seed)

    @app.post("/api/quiz/results")
    def quiz_results(result: QuizResult):
        return save_result(result, settings.results_path)

    @app.get("/api/scenarios/{scenario_id}")
    async def scenario(scenario_id: str, language: str = Query(min_length=2, max_length=16)):
        lang = language_or_400(language)
        data = await lessons.scenario(scenario_id, lang)
        if data is None:
            raise _error(404, "unknown_scenario")
        return data

    @app.get("/api/speech")
    async def speech(
        text: str = Query(min_length=1, max_length=500),
        voice_role: str = Query(default="tutor", alias="voice", pattern="^(tutor|staff|learner)$"),
        style: str = Query(default="tutor", pattern="^(tutor|model)$"),
    ):
        if voice is None:
            raise _error(501, "voice_off")
        try:
            audio = await voice.speak(text, voice_role, style)
        except AIError as exc:
            raise _error(_ai_status(exc), exc.code) from exc
        return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "public, max-age=604800"})

    @app.websocket("/ws/conversation")
    async def conversation(websocket: WebSocket, scenario: str = "front_desk", language: str = "ta"):
        await websocket.accept()
        scenario_data = content.scenarios_by_id.get(scenario)
        lang = content.language(language)
        if not settings.live_enabled:
            await websocket.send_json({"type": "error", "message": "not_configured"})
            await websocket.close()
            return
        if scenario_data is None or lang is None:
            await websocket.send_json({"type": "error", "message": "bad_request"})
            await websocket.close()
            return

        from .conversation import run_conversation

        try:
            await run_conversation(websocket, scenario_data, lang, content, settings)
        except Exception:
            log.exception("Conversation session failed")
            try:
                await websocket.send_json({"type": "error", "message": "session_failed"})
            except Exception:
                pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    @app.middleware("http")
    async def no_store_api(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/") and request.url.path != "/api/speech":
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    # In production, serve the built React app from the same server.
    dist = REPO_ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    return app


app = create_app()
