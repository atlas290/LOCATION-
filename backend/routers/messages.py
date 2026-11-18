"""
routers/messages.py
====================
Messagerie interne + compteur de non-lus.

Routes :
  - POST  /api/messages                     : envoyer un message
  - GET   /api/messages/unread-count        : compteur (badge frontend)
  - GET   /api/messages                     : liste des messages reçus
  - PATCH /api/messages/{message_id}/read   : marquer comme lu (receiver uniquement)

⚠️ Ordre : les routes statiques (`/unread-count`) sont déclarées AVANT les
routes à paramètre pour éviter les collisions si on ajoute `GET /{id}` plus tard.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from models import Message, Property, User
from schemas import MessageCreate, MessageResponse
from auth import get_current_user

router = APIRouter(prefix="/api/messages", tags=["messages"])


# ============================================================
#  POST /api/messages — envoyer un message
# ============================================================
@router.post(
    "",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Envoyer un message",
)
def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receiver = db.query(User).filter(User.id == payload.receiver_id).first()
    if not receiver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destinataire introuvable.",
        )
    if receiver.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas vous envoyer un message à vous-même.",
        )

    if payload.property_id is not None:
        prop = db.query(Property).filter(Property.id == payload.property_id).first()
        if not prop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Annonce introuvable.",
            )

    msg = Message(
        sender_id=current_user.id,
        receiver_id=payload.receiver_id,
        property_id=payload.property_id,
        content=payload.content,
        is_read=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ============================================================
#  GET /api/messages/unread-count — compteur badge
# ============================================================
# ⚠️ DOIT être déclarée AVANT toute route `/{something}` de même méthode
@router.get(
    "/unread-count",
    summary="Nombre de messages non lus (badge frontend)",
)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Renvoie `{"unread_count": N}` pour alimenter un badge côté frontend.
    """
    count = (
        db.query(Message)
        .filter(Message.receiver_id == current_user.id)
        .filter(Message.is_read.is_(False))
        .count()
    )
    return {"unread_count": count}


# ============================================================
#  GET /api/messages — mes messages reçus
# ============================================================
@router.get(
    "",
    response_model=List[MessageResponse],
    summary="Voir mes messages reçus",
)
def list_messages(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False, description="Ne renvoyer que les non-lus"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Message).filter(Message.receiver_id == current_user.id)
    if unread_only:
        q = q.filter(Message.is_read.is_(False))
    return q.order_by(desc(Message.created_at)).offset(skip).limit(limit).all()


# ============================================================
#  PATCH /api/messages/{message_id}/read — marquer comme lu
# ============================================================
@router.patch(
    "/{message_id}/read",
    response_model=MessageResponse,
    summary="Marquer un message comme lu (receiver uniquement)",
)
def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Marque un message comme lu.

    🔒 Seul le **destinataire** peut marquer un message comme lu.
    Un expéditeur ne peut pas modifier l'état de lecture chez son interlocuteur.

    Idempotent : si déjà lu, renvoie l'état actuel sans erreur.
    """
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message introuvable.",
        )

    if msg.receiver_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez marquer comme lu que vos messages reçus.",
        )

    if not msg.is_read:
        msg.is_read = True
        db.commit()
        db.refresh(msg)

    return msg