"""
schemas.py
==========
Schémas Pydantic (validation entrée / sérialisation sortie).

Pydantic v2 :
  - model_config = ConfigDict(from_attributes=True) remplace l'ancien `class Config`
  - Chaque schéma d'entrée (Create/Update) hérite d'une Base
  - Chaque schéma de sortie (Response) ne ré-expose JAMAIS le hashed_password
"""

from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


# ============================================================
#  USER
# ============================================================
UserRole = Literal["locataire", "proprietaire", "agence", "admin"]


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=150)
    phone: Optional[str] = Field(None, max_length=30)


class UserCreate(UserBase):
    """Payload d'inscription. Le rôle 'admin' est interdit à l'inscription."""
    password: str = Field(..., min_length=8, max_length=128)
    role: Literal["locataire", "proprietaire", "agence"] = "locataire"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isalpha() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre")
        if not any(c.isdigit() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=150)
    phone: Optional[str] = Field(None, max_length=30)


class UserResponse(UserBase):
    """Sortie publique — JAMAIS de hashed_password."""
    id: int
    role: UserRole
    is_verified: bool
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
#  TOKEN / AUTH
# ============================================================
class Token(BaseModel):
    """Réponse standard après login (access + refresh)."""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int


class RefreshTokenRequest(BaseModel):
    """Payload du POST /api/auth/refresh."""
    refresh_token: str = Field(..., min_length=10)


class TokenPayload(BaseModel):
    """Contenu décodé du JWT."""
    sub: str
    role: UserRole
    exp: int
    iat: int
    type: Literal["access", "refresh"] = "access"


# ============================================================
#  PROPERTY  ⚠️ MODIFIÉ — sous-types chambre ajoutés
# ============================================================
PropertyType = Literal[
    "chambre", "chambre_sanitaire", "chambre_ordinaire",
    "studio", "appartement", "maison", "villa", "terrain", "bureau",
]


class PropertyBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10)
    price: float = Field(..., ge=0, description="Prix en FCFA (XOF)")
    location: str = Field(..., min_length=2, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    type: PropertyType
    image_url: Optional[str] = Field(None, max_length=500)


class PropertyCreate(PropertyBase):
    """Payload de création — owner_id vient du JWT, pas du body."""
    pass


class PropertyUpdate(BaseModel):
    """Mise à jour partielle. `is_verified` retiré : réservé aux admins."""
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10)
    price: Optional[float] = Field(None, ge=0)
    location: Optional[str] = Field(None, min_length=2, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    type: Optional[PropertyType] = None
    image_url: Optional[str] = Field(None, max_length=500)
    is_available: Optional[bool] = None


class PropertyResponse(PropertyBase):
    id: int
    owner_id: int
    is_verified: bool
    is_available: bool
    created_at: datetime
    updated_at: datetime
    owner: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================================
#  MESSAGE
# ============================================================
class MessageBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class MessageCreate(MessageBase):
    receiver_id: int = Field(..., gt=0)
    property_id: Optional[int] = Field(None, gt=0)


class MessageResponse(MessageBase):
    id: int
    sender_id: int
    receiver_id: int
    property_id: Optional[int] = None
    is_read: bool
    created_at: datetime
    sender: Optional[UserResponse] = None
    receiver: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================================
#  FAVORITE
# ============================================================
class FavoriteCreate(BaseModel):
    property_id: int = Field(..., gt=0)


class FavoriteResponse(BaseModel):
    id: int
    user_id: int
    property_id: int
    created_at: datetime
    property: Optional[PropertyResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ============================================================
#  AI SEARCH
# ============================================================
class AISearchInterpretation(BaseModel):
    type: Optional[PropertyType] = None
    city: Optional[str] = None
    max_price: Optional[float] = None
    min_price: Optional[float] = None
    keywords: List[str] = Field(default_factory=list)


class AISearchResponse(BaseModel):
    query: str
    interpreted: AISearchInterpretation
    count: int
    results: List[PropertyResponse]
    message: str
    engine: str = "keyword-matcher-v0"