from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import accounts, ai, dashboard, exports, imports, ledger, offerings, settlement, vouchers
from app.config import get_settings
from app.seed import bootstrap_reference_data, init_db
from app.database import SessionLocal

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        bootstrap_reference_data(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(offerings.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(settlement.router, prefix="/api")
app.include_router(vouchers.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"ok": True}
