"""
routers/properties.py
======================
CRUD des annonces + route admin de vérification (badge anti-arnaque).

Règles de sécurité (OWASP A01) :
  - Création : require_role("proprietaire", "agence", "admin")
  - `owner_id` extrait du JWT, JAMAIS du body
  - PUT/DELETE : propriétaire OU admin uniquement
  - PATCH /{id}/verify : admin uniquement
  - `is_verified` non modifiable via le PUT classique

⚠️ Recherche par type : `ilike` pour tolérer les sous-types chambre
   (chambre → chambre_sanitaire, chambre_ordinaire).
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import Property, User
from schemas import PropertyCreate, PropertyUpdate, PropertyResponse
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/properties", tags=["properties"])


# ============================================================
#  Helpers internes
# ============================================================
def _get_property_or_404(db: Session, property_id: int) -> Property:
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Annonce introuvable.",
        )
    return prop


def _check_ownership(prop: Property, user: User) -> None:
    """Admin passe toujours ; sinon l'utilisateur doit être le owner."""
    if user.role == "admin":
        return
    if prop.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à modifier cette annonce.",
        )


# ============================================================
#  GET /api/properties  ⚠️ MODIFIÉ — ilike sur type
# ============================================================
@router.get(
    "",
    response_model=List[PropertyResponse],
    summary="Lister les annonces (pagination + filtres)",
)
def list_properties(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    city: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    is_verified: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Property).filter(Property.is_available.is_(True))

    if city:
        q = q.filter(Property.city.ilike(f"%{city}%"))
    if type:
        # ilike → ?type=chambre matche aussi chambre_sanitaire / chambre_ordinaire
        q = q.filter(Property.type.ilike(f"%{type}%"))
    if min_price is not None:
        q = q.filter(Property.price >= min_price)
    if max_price is not None:
        q = q.filter(Property.price <= max_price)
    if is_verified is not None:
        q = q.filter(Property.is_verified.is_(is_verified))

    return q.order_by(desc(Property.created_at)).offset(skip).limit(limit).all()


# ============================================================
#  POST /api/properties — création
# ============================================================
@router.post(
    "",
    response_model=PropertyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une annonce (proprietaire / agence / admin)",
)
def create_property(
    payload: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("proprietaire", "agence", "admin")),
):
    prop = Property(
        **payload.model_dump(),
        owner_id=current_user.id,
        is_verified=False,
        is_available=True,
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


# ============================================================
#  GET /api/properties/{id}
# ============================================================
@router.get(
    "/{property_id}",
    response_model=PropertyResponse,
    summary="Voir le détail d'une annonce",
)
def get_property(property_id: int, db: Session = Depends(get_db)):
    return _get_property_or_404(db, property_id)


# ============================================================
#  PUT /api/properties/{id}
# ============================================================
@router.put(
    "/{property_id}",
    response_model=PropertyResponse,
    summary="Modifier une annonce (propriétaire ou admin)",
)
def update_property(
    property_id: int,
    payload: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = _get_property_or_404(db, property_id)
    _check_ownership(prop, current_user)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prop, field, value)

    db.commit()
    db.refresh(prop)
    return prop


# ============================================================
#  DELETE /api/properties/{id}
# ============================================================
@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une annonce (propriétaire ou admin)",
)
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop = _get_property_or_404(db, property_id)
    _check_ownership(prop, current_user)

    db.delete(prop)
    db.commit()
    return None


# ============================================================
#  PATCH /api/properties/{id}/verify — legacy (admin)
# ============================================================
@router.patch(
    "/{property_id}/verify",
    response_model=PropertyResponse,
    summary="Vérifier une annonce (admin) — legacy, préférer /api/admin/...",
)
def verify_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    prop = _get_property_or_404(db, property_id)
    if not prop.is_verified:
        prop.is_verified = True
        db.commit()
        db.refresh(prop)
    return prop