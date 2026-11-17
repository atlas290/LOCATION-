"""
models.py
==========
Modèles SQLAlchemy = schéma de la base de données.

Tables :
  - users       : utilisateurs (locataires, propriétaires, agences, admins)
  - properties  : annonces immobilières
  - messages    : messagerie interne (user -> user, liée à une annonce)
  - favorites   : annonces sauvegardées par un utilisateur
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


# ============================================================
#  USER
# ============================================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(150), nullable=True)
    phone = Column(String(30), nullable=True)
    role = Column(String(20), nullable=False, default="locataire")
    is_verified = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    properties = relationship(
        "Property",
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    messages_sent = relationship(
        "Message",
        foreign_keys="Message.sender_id",
        back_populates="sender",
        cascade="all, delete-orphan",
    )
    messages_received = relationship(
        "Message",
        foreign_keys="Message.receiver_id",
        back_populates="receiver",
        cascade="all, delete-orphan",
    )
    favorites = relationship(
        "Favorite",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('locataire','proprietaire','agence','admin')",
            name="ck_users_role_valid",
        ),
        Index("ix_users_role", "role"),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"


# ============================================================
#  PROPERTY  ⚠️ MODIFIÉ — CheckConstraint étendu
# ============================================================
class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    price = Column(Float, nullable=False)
    location = Column(String(200), nullable=False, index=True)
    city = Column(String(100), nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    type = Column(String(30), nullable=False)
    image_url = Column(String(500), nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False, index=True)
    is_available = Column(Boolean, default=True, nullable=False)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner = relationship("User", back_populates="properties", lazy="joined")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    messages = relationship(
        "Message",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    favorited_by = relationship(
        "Favorite",
        back_populates="property",
        cascade="all, delete-orphan",
    )

    # ⚠️ Constraint étendue pour les sous-types chambre
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_properties_price_positive"),
        CheckConstraint(
            "type IN ('chambre','chambre_sanitaire','chambre_ordinaire',"
            "'studio','appartement','maison','villa','terrain','bureau')",
            name="ck_properties_type_valid",
        ),
        Index("ix_properties_city_type", "city", "type"),
        Index("ix_properties_price", "price"),
    )

    def __repr__(self) -> str:
        return f"<Property id={self.id} title={self.title!r} price={self.price}>"


# ============================================================
#  MESSAGE
# ============================================================
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    receiver_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id = Column(
        Integer,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    sender = relationship(
        "User",
        foreign_keys=[sender_id],
        back_populates="messages_sent",
        lazy="joined",
    )
    receiver = relationship(
        "User",
        foreign_keys=[receiver_id],
        back_populates="messages_received",
        lazy="joined",
    )
    property = relationship("Property", back_populates="messages", lazy="joined")

    __table_args__ = (
        CheckConstraint("sender_id <> receiver_id", name="ck_messages_not_self"),
    )

    def __repr__(self) -> str:
        return f"<Message id={self.id} from={self.sender_id} to={self.receiver_id}>"


# ============================================================
#  FAVORITE
# ============================================================
class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id = Column(
        Integer,
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="favorites")
    property = relationship("Property", back_populates="favorited_by", lazy="joined")

    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_favorites_user_property"),
    )

    def __repr__(self) -> str:
        return f"<Favorite user={self.user_id} property={self.property_id}>"