"""
auth.py
=======
Tout ce qui touche à la sécurité :

  - Hash / vérification de mot de passe (bcrypt via passlib)
  - Création / décodage de JWT (python-jose)
  - Dépendances FastAPI :
      * get_current_user    : récupère l'utilisateur connecté depuis le Bearer token
      * require_role(...)   : contrôle d'accès basé sur le rôle (RBAC)

Sécurité (OWASP) :
  - bcrypt avec rounds par défaut (12) — résistant au brute-force
  - JWT signé HS256 — la clé SECRET_KEY est lue depuis .env
  - Message d'erreur générique sur login échoué (pas d'énumération d'emails)
  - Le payload JWT ne contient JAMAIS de données sensibles (juste sub + role)
"""

import os
from datetime import datetime, timedelta, timezone
from typing import List, Callable

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import TokenPayload

# --- Chargement .env ---
load_dotenv()

SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-only-change-me")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# --- bcrypt ---
# rounds=12 par défaut (bon compromis sécurité/perf)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- OAuth2 scheme (Bearer token) ---
# tokenUrl = endpoint de login — utilisé par Swagger UI pour s'authentifier
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ============================================================
#  PASSWORDS
# ============================================================
def hash_password(password: str) -> str:
    """Hash un mot de passe en clair avec bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


# ============================================================
#  JWT
# ============================================================
def _create_token(subject: str, role: str, token_type: str, expires_delta: timedelta) -> str:
    """Fonction interne : génère un JWT signé."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,       # email
        "role": role,
        "type": token_type,   # "access" ou "refresh"
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(subject: str, role: str) -> str:
    """Crée un access token (courte durée)."""
    return _create_token(
        subject=subject,
        role=role,
        token_type="access",
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: str, role: str) -> str:
    """Crée un refresh token (longue durée)."""
    return _create_token(
        subject=subject,
        role=role,
        token_type="refresh",
        expires_delta=timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> TokenPayload:
    """
    Décode et valide un JWT.
    Lève HTTPException 401 si invalide / expiré / mal formé.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Pydantic v2 : validation stricte du payload
        return TokenPayload(**payload)
    except (JWTError, ValueError):
        raise credentials_exception


# ============================================================
#  DEPENDENCIES FASTAPI
# ============================================================
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Dépendance : récupère l'utilisateur courant depuis le Bearer token.
    - Lève 401 si pas de token / token invalide
    - Lève 401 si l'utilisateur n'existe plus
    - Lève 403 si le compte est désactivé
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)

    # On n'accepte QUE les access tokens sur les routes protégées
    if payload.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Type de token invalide",
        )

    user = db.query(User).filter(User.email == payload.sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé",
        )
    return user


def require_role(*allowed_roles: str) -> Callable:
    """
    Factory de dépendance : contrôle d'accès basé sur le rôle.

    Usage :
        @router.post("/properties")
        def create_property(
            ...,
            current_user: User = Depends(require_role("proprietaire", "agence", "admin")),
        ):
            ...
    """
    allowed = set(allowed_roles)

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle '{current_user.role}' non autorisé. Requis : {sorted(allowed)}",
            )
        return current_user

    return role_checker