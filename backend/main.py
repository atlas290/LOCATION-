"""
main.py
=======
Point d'entrée FastAPI — itération 4 (corrections types chambre incluses).

  - Aucune logique IA dans main.py (déléguée à `services/ai_service.py`)
  - Aucune donnée factice
  - Branchement de tous les routeurs (auth, properties, favorites, messages, admin)
  - `/api/ai-search` : Gemini → DeepSeek → keyword fallback + SQL
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import Base, engine, get_db
from models import Property
from schemas import AISearchResponse, AISearchInterpretation

# --- Routers ---
from routers import auth as auth_router
from routers import properties as properties_router
from routers import favorites as favorites_router
from routers import messages as messages_router
from routers import admin as admin_router

# --- Services IA ---
from services.ai_service import (
    parse_query_with_ai,
    get_last_engine,
    get_active_engine,
)

# --- .env ---
load_dotenv()

APP_NAME = os.getenv("APP_NAME", "LOCATION API")
APP_ENV = os.getenv("APP_ENV", "development")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:9898")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"


# ============================================================
#  LOGGING
# ============================================================
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ============================================================
#  LIFESPAN
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Démarrage de %s (env=%s)", APP_NAME, APP_ENV)
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tables SQLAlchemy prêtes")
    logger.info("🤖 Moteur IA actif : %s", get_active_engine())
    yield
    logger.info("🛑 Arrêt — fermeture des connexions")


# ============================================================
#  APP
# ============================================================
app = FastAPI(
    title=APP_NAME,
    description="API backend de LOCATION — plateforme immobilière au Bénin",
    version="0.4.1",
    lifespan=lifespan,
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None,
)


# ============================================================
#  CORS
# ============================================================
if DEBUG:
    allow_origins = [
        "http://localhost:9898",
        "http://127.0.0.1:9898",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        FRONTEND_URL,
    ]
else:
    allow_origins = [FRONTEND_URL]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# ============================================================
#  ROUTERS
# ============================================================
app.include_router(auth_router.router)
app.include_router(properties_router.router)
app.include_router(favorites_router.router)
app.include_router(messages_router.router)
app.include_router(admin_router.router)


# ============================================================
#  HELPER DB POUR LA RECHERCHE  ⚠️ MODIFIÉ — ilike sur type
# ============================================================
def _search_properties_db(
    db: Session,
    interpreted: AISearchInterpretation,
    limit: int = 30,
) -> List[Property]:
    """
    Requête SQL dynamique sur les annonces disponibles.
    `ilike` sur le type permet à "chambre" de matcher
    "chambre_sanitaire" / "chambre_ordinaire".
    """
    q = db.query(Property).filter(Property.is_available.is_(True))

    if interpreted.type:
        q = q.filter(Property.type.ilike(f"%{interpreted.type}%"))
    if interpreted.city:
        q = q.filter(Property.city.ilike(f"%{interpreted.city}%"))
    if interpreted.max_price is not None:
        q = q.filter(Property.price <= interpreted.max_price)
    if interpreted.min_price is not None:
        q = q.filter(Property.price >= interpreted.min_price)

    return q.order_by(desc(Property.created_at)).limit(limit).all()


# ============================================================
#  ROUTES META
# ============================================================
@app.get("/", tags=["meta"])
def root():
    return {
        "app": APP_NAME,
        "env": APP_ENV,
        "docs": "/docs" if DEBUG else "disabled",
        "message": "LOCATION API est en ligne",
    }


@app.get("/api/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "env": APP_ENV,
        "ai_engine": get_active_engine(),
    }


# ============================================================
#  AI SEARCH
# ============================================================
@app.get(
    "/api/ai-search",
    response_model=AISearchResponse,
    tags=["ai"],
    summary="Recherche en langage naturel (Gemini / DeepSeek / keywords)",
)
def ai_search(
    query: str = Query(
        ...,
        min_length=2,
        max_length=300,
        description="Requête en langage naturel",
        examples=["Chambre à Calavi max 30000"],
    ),
    db: Session = Depends(get_db),
):
    interpreted = parse_query_with_ai(query)
    engine = get_last_engine()
    results = _search_properties_db(db, interpreted)

    if not results:
        message = (
            "Je n'ai trouvé aucune annonce correspondant à votre recherche. "
            "Essayez d'élargir vos critères (prix plus élevé ou autre quartier)."
        )
    elif len(results) == 1:
        message = "J'ai trouvé 1 annonce qui correspond à votre recherche."
    else:
        message = f"J'ai trouvé {len(results)} annonces qui correspondent à votre recherche."

    return AISearchResponse(
        query=query,
        interpreted=interpreted,
        count=len(results),
        results=results,
        message=message,
        engine=engine,
    )