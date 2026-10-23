"""FastAPI server for the Healthcare Form Literacy Tutor."""

from __future__ import annotations

import logging

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from .config import REPO_ROOT, Settings, settings as default_settings
from .content import Content, get_content
from .explain import ExplainError, Explainer
from .quiz import build_quiz
from .results import QuizResult, save_result
from .tts import GoogleTTS, TTSError

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tutor")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def create_app(
    settings: Settings | None = None,
    content: Content | None = None,
    explainer: Explainer | None = None,
    tts: GoogleTTS | None = None,
) -> FastAPI:
    settings = settings or default_settings
    content = content or get_content()

    if explainer is None and settings.scan_enabled:
        from anthropic import AsyncAnthropic

        explainer = Explainer(AsyncAnthropic(api_key=settings.anthropic_api_key), settings.claude_model, content)
    if tts is None and settings.server_tts_enabled:
        tts = GoogleTTS(settings.google_tts_api_key)

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
            raise HTTPException(400, f"Unknown language '{code}'.")
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
                {"id": s["id"], "title": s["title"], "icon": s.get("icon", "chat")} for s in content.scenarios
            ],
            "features": {
                "scan": explainer is not None,
                "conversation": settings.conversation_enabled,
                "server_tts": tts is not None,
            },
        }

    @app.get("/api/glossary")
    def glossary():
        return {"terms": [t.public() for t in content.terms]}

    @app.get("/api/quiz")
    def quiz(
        terms: str = Query(default="", description="Comma-separated glossary ids to include first"),
        n: int = Query(default=8, ge=1, le=20),
        seed: str | None = Query(default=None, description="Same seed gives the same quiz"),
    ):
        term_ids = [t.strip() for t in terms.split(",") if t.strip()]
        return build_quiz(content, term_ids, n=n, seed=seed)

    @app.post("/api/quiz/results")
    def quiz_results(result: QuizResult):
        return save_result(result, settings.results_path)

    @app.post("/api/explain")
    async def explain(file: UploadFile = File(...), language: str = Form(...)):
        if explainer is None:
            raise HTTPException(503, "Photo reading is not set up. Add ANTHROPIC_API_KEY to .env.")
        lang = language_or_400(language)
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(415, "Please upload a JPEG, PNG, WebP, or GIF photo.")

        data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"Photo is larger than {settings.max_upload_mb} MB.")
        if not data:
            raise HTTPException(400, "The photo is empty.")

        # The photo is only held in memory for this request and never saved.
        try:
            result = await explainer.explain(data, file.content_type, lang)
        except ExplainError as exc:
            raise HTTPException(502, str(exc)) from exc
        return result.to_dict()

    @app.get("/api/tts")
    async def text_to_speech(
        text: str = Query(min_length=1, max_length=400),
        lang: str = Query(min_length=2, max_length=16),
        slow: bool = False,
    ):
        if tts is None:
            raise HTTPException(501, "Server text-to-speech is off. The app uses the device's voices.")
        try:
            audio = await tts.synthesize(text, lang, slow=slow)
        except TTSError as exc:
            raise HTTPException(502, str(exc)) from exc
        return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})

    @app.websocket("/ws/conversation")
    async def conversation(websocket: WebSocket, scenario: str = "front_desk", language: str = "es"):
        await websocket.accept()
        scenario_data = content.scenarios_by_id.get(scenario)
        lang = content.language(language)
        if not settings.conversation_enabled:
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

    # In production, serve the built React app from the same server.
    dist = REPO_ROOT / "frontend" / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    @app.middleware("http")
    async def no_store_api(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/") and request.url.path != "/api/tts":
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    return app


app = create_app()
