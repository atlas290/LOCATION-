"""
routers/favorites.py
=====================
Gestion des favoris (annonces sauvegardées par un utilisateur).

Toutes les routes sont protégées par `get_current_user` : un utilisateur
ne peut voir et gérer QUE ses propres favoris (contrôle côté WHERE user_id).
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import Favorite, Property, User
from schemas import FavoriteCreate, FavoriteResponse
from auth import get_current_user

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


# ============================================================
#  POST /api/favorites — ajouter un favori
# ============================================================
@router.post(
    "",
    response_model=FavoriteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter une annonce aux favoris",
)
def add_favorite(
    payload: FavoriteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. L'annonce doit exister
    prop = db.query(Property).filter(Property.id == payload.property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annonce introuvable.",
        )

    # 2. Pas de doublon (idempotence évitée : on préfère 409 explicite)
    existing = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.property_id == payload.property_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette annonce est déjà dans vos favoris.",
        )

    fav = Favorite(user_id=current_user.id, property_id=payload.property_id)
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav


# ============================================================
#  GET /api/favorites — lister mes favoris
# ============================================================
@router.get(
    "",
    response_model=List[FavoriteResponse],
    summary="Lister mes favoris",
)
def list_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Renvoie les favoris de l'utilisateur connecté, triés par date
    d'ajout (plus récents d'abord).
    """
    return (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id)
        .order_by(desc(Favorite.created_at))
        .all()
    )


# ============================================================
#  DELETE /api/favorites/{property_id} — retirer un favori
# ============================================================
@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Retirer une annonce des favoris",
)
def remove_favorite(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Supprime le favori identifié par (user_id, property_id).

    ⚠️ On cible par `property_id` (pas par `favorite_id`) : c'est plus
    simple côté frontend qui connaît déjà l'annonce en cours de visualisation.
    """
    fav = (
        db.query(Favorite)
        .filter(
            Favorite.user_id == current_user.id,
            Favorite.property_id == property_id,
        )
        .first()
    )
    if not fav:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ce favori n'existe pas.",
        )

    db.delete(fav)
    db.commit()
    return None