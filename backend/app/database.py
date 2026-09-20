import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from app.config import get_settings
from app.models import Base

settings = get_settings()

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = os.path.dirname(_backend_dir)
_data_dir = os.path.join(_project_root, "data")
os.makedirs(_data_dir, exist_ok=True)
_db_path = os.path.join(_data_dir, "exam_surveillance.db")
db_url = f"sqlite:///{_db_path.replace(os.sep, '/')}"

engine = create_engine(
    db_url,
    connect_args={"check_same_thread": False},
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    echo=settings.SQLALCHEMY_ECHO
)

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)
    # Check and perform lightweight column additions for existing SQLite database
    try:
        with engine.begin() as conn:
            result = conn.execute(text("PRAGMA table_info(video_audit_incidents)")).fetchall()
            existing_cols = {row[1] for row in result}
            if existing_cols:
                if "vlm_verified" not in existing_cols:
                    conn.execute(text("ALTER TABLE video_audit_incidents ADD COLUMN vlm_verified BOOLEAN DEFAULT 0"))
                if "vlm_analysis" not in existing_cols:
                    conn.execute(text("ALTER TABLE video_audit_incidents ADD COLUMN vlm_analysis TEXT"))
    except Exception as e:
        # Ignore if table doesn't exist yet or columns already exist
        pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session() -> Session:
    return SessionLocal()
