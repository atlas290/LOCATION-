"""
routers/auth.py
================
Routes d'authentification :

  - POST /api/auth/register : création de compte (locataire/proprietaire/agence)
  - POST /api/auth/login    : OAuth2 form → access + refresh tokens
  - POST /api/auth/refresh  : échange un refresh_token contre un nouvel access_token
  - GET  /api/auth/me       : profil de l'utilisateur connecté

Sécurité (OWASP A07) :
  - bcrypt via passlib (coût 12)
  - Message d'erreur login générique
  - Timing-safe check (dummy hash si email inconnu)
  - Refresh token ROTATION : à chaque refresh on renvoie un nouveau refresh_token
    (permet une future révocation : blackliste des refresh déjà utilisés en iteration 3)
  - Limite bcrypt 72 octets vérifiée
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import (
    UserCreate,
    UserResponse,
    Token,
    RefreshTokenRequest,
)
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Hash factice utilisé en cas d'email inconnu (timing-safe)
_DUMMY_HASH = hash_password("dummy_password_for_timing_attack_prevention")


# ============================================================
#  POST /api/auth/register
# ============================================================
@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un compte",
)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """
    Inscription. Le rôle `admin` est impossible via l'API (cf. create_admin.py).
    """
    # --- Limite bcrypt : 72 octets (bytes) ---
    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mot de passe ne doit pas dépasser 72 octets (limite bcrypt).",
        )

    # --- Email déjà utilisé ? ---
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte existe déjà avec cet email.",
        )

    # --- Création ---
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
        is_verified=False,
        is_active=True,
    )
    db.add(user)
    db.commit()          # ✅ commit (vérifié caractère par caractère)
    db.refresh(user)
    return user


# ============================================================
#  POST /api/auth/login
# ============================================================
@router.post(
    "/login",
    response_model=Token,
    summary="Se connecter (OAuth2 form : username=email)",
)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Connexion. Retourne un access + refresh token.
    """
    user = db.query(User).filter(User.email == form.username).first()

    # Timing-safe : on hash TOUJOURS (dummy si inconnu)
    password_hash = user.hashed_password if user else _DUMMY_HASH
    password_ok = verify_password(form.password, password_hash)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé. Contactez le support.",
        )

    access_token = create_access_token(subject=user.email, role=user.role)
    refresh_token = create_refresh_token(subject=user.email, role=user.role)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ============================================================
#  POST /api/auth/refresh
# ============================================================
@router.post(
    "/refresh",
    response_model=Token,
    summary="Rafraîchir l'access token via un refresh_token",
)
def refresh_token_route(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """
    Échange un `refresh_token` valide contre un nouveau couple de tokens.

    🔒 On vérifie strictement :
    - signature + expiration (decode_token)
    - type == "refresh" (empêche d'utiliser un access à la place)
    - utilisateur toujours existant et actif

    🔁 ROTATION : on renvoie aussi un NOUVEAU refresh_token.
    En itération 3 on ajoutera une table `revoked_tokens` pour invalider
    l'ancien (sinon il reste utilisable jusqu'à expiration).
    """
    try:
        token_payload = decode_token(payload.refresh_token)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalide ou expiré.",
        )

    if token_payload.type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Type de token invalide (refresh attendu).",
        )

    user = db.query(User).filter(User.email == token_payload.sub).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable ou inactif.",
        )

    new_access = create_access_token(subject=user.email, role=user.role)
    new_refresh = create_refresh_token(subject=user.email, role=user.role)

    return Token(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ============================================================
#  GET /api/auth/me
# ============================================================
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Profil de l'utilisateur connecté",
)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user