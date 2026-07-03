from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    # Neon (and pooled Postgres generally) can silently drop idle server-side
    # connections when its compute auto-suspends. Without pool_pre_ping,
    # SQLAlchemy hands out the stale connection and the query fails with a
    # raw psycopg2 error; pre_ping does a cheap liveness check first and
    # transparently reconnects. pool_recycle proactively retires connections
    # before they're likely to have gone stale.
    pool_pre_ping=True,
    pool_recycle=280,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
