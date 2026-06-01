import os
import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app = FastAPI(
    title="Octopus School API",
    version="1.0.0",
    description="Backend SaaS de gestión escolar para colegios privados.",
)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
from routers.notifications import router as notifications_router  # noqa: E402

app.include_router(notifications_router, prefix="/api/settings")

# ── Startup ───────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    from database import init_db
    from services.scheduler import start_scheduler

    init_db()
    start_scheduler()

# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "ok"}
