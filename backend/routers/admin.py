"""
routers/admin.py
=================
Routes réservées aux administrateurs (badge "Vérifié" anti-arnaque).

Routes :
  - GET   /api/admin/properties/pending       : annonces à vérifier
  - PATCH /api/admin/properties/{id}/verify   : vérifier une annonce

⚠️ Toutes protégées par `require_role("admin")`.

Note : la route `PATCH /api/properties/{id}/verify` de l'itération 2
existe toujours dans `routers/properties.py` pour compatibilité ascendante.
Les deux routes sont idempotentes et font la même chose. On pourra
supprimer l'ancienne une fois le frontend migré sur `/api/admin/...`.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import Property, User
from schemas import PropertyResponse
from auth import require_role

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================
#  GET /api/admin/properties/pending
# ============================================================
@router.get(
    "/properties/pending",
    response_model=List[PropertyResponse],
    summary="Annonces en attente de vérification (admin uniquement)",
)
def list_pending_properties(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Liste les annonces `is_verified=False` ET `is_available=True`,
    triées de la plus récente à la plus ancienne.

    🔒 Admin uniquement (403 pour les autres rôles).
    """
    return (
        db.query(Property)
        .filter(Property.is_verified.is_(False))
        .filter(Property.is_available.is_(True))
        .order_by(desc(Property.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )


# ============================================================
#  PATCH /api/admin/properties/{id}/verify
# ============================================================
@router.patch(
    "/properties/{property_id}/verify",
    response_model=PropertyResponse,
    summary="Vérifier une annonce — badge anti-arnaque (admin uniquement)",
)
def admin_verify_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Marque l'annonce comme `is_verified=True` (badge "Vérifié").

    🔒 Admin uniquement.
    Idempotent : un second appel ne fait rien et renvoie l'état actuel.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annonce introuvable.",
        )

    if not prop.is_verified:
        prop.is_verified = True
        db.commit()
        db.refresh(prop)

    return prop