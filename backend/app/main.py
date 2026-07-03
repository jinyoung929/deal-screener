import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.database import Base, engine
from app.routers import alerts, auth, companies, sync, watchlist

settings = get_settings()

# Local dev convenience: create tables directly against SQLite if no
# migration has run yet. Neon/Postgres in real deployments should go
# through Alembic (see backend/alembic/).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="DealScreener API")

app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies.router)
app.include_router(watchlist.router)
app.include_router(alerts.router)
app.include_router(sync.router)
app.include_router(auth.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


dist_dir = os.path.join(os.path.dirname(__file__), "..", settings.frontend_dist_dir)
if os.path.isdir(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
