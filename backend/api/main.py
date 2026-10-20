from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401 — registers ORM models on Base before create_all
from .db import Base, engine
from .routers import auth, devices, plants, predict, tenants, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="PlantHealth API",
    description=(
        "Plant stress monitoring platform API. All shipped data/models are trained on "
        "SYNTHETIC data — see backend/data/README.md and backend/ml/README.md. Every "
        "prediction response carries is_synthetic."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server (step 5+)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "note": "all data/models served by this API are synthetic unless noted otherwise"}


app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(devices.router)
app.include_router(plants.router)
app.include_router(predict.router)
app.include_router(ws.router)
