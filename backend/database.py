"""
database.py
============
Configuration de la connexion SQLAlchemy.

- DEV  : SQLite (fichier local, zéro config)
- PROD : PostgreSQL (via DATABASE_URL dans .env)

Gère :
  - engine (connexion)
  - SessionLocal (session par requête)
  - Base (classe mère des modèles)
  - get_db() : dépendance FastAPI injectable
"""

import os
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# --- Charger les variables d'environnement ---
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# --- URL de connexion ---
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./location.db")

# --- Configuration spécifique SQLite ---
# check_same_thread=False : nécessaire car FastAPI gère les requêtes en async
# (plusieurs threads peuvent toucher la même connexion SQLite)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# --- Engine SQLAlchemy ---
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=os.getenv("DEBUG", "False").lower() == "true",  # log SQL si DEBUG=True
    pool_pre_ping=True,  # Vérifie que la connexion est vivante avant usage (utile en prod)
)

# --- Session factory ---
SessionLocal = sessionmaker(
    autocommit=False,  # on commit explicitement
    autoflush=False,
    bind=engine,
)

# --- Base déclarative ---
# Tous les modèles héritent de cette Base
Base = declarative_base()


def get_db():
    """
    Dépendance FastAPI : fournit une session DB par requête
    et la ferme automatiquement à la fin (même en cas d'erreur).

    Usage dans un routeur :
        @router.get("/items")
        def list_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()