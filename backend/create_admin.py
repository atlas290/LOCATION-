"""
create_admin.py
================
Script CLI pour créer le premier administrateur.

Pourquoi un script et pas une route API ?
  - Empêche un utilisateur de s'auto-promouvoir admin via /register
  - Évite de mettre une "clé de setup admin" dans .env (surface d'attaque)
  - L'admin est créé par un humain qui a accès au serveur

Usage :
    cd backend
    python create_admin.py

Le mot de passe est saisi via getpass() → pas dans l'historique shell.
"""

import getpass
import sys

from dotenv import load_dotenv

from database import Base, engine, SessionLocal
from models import User
from auth import hash_password


def _validate_password(password: str) -> str:
    """Règles minimales cohérentes avec UserCreate. Retourne msg d'erreur ou ''."""
    if len(password) < 8:
        return "Le mot de passe doit faire au moins 8 caractères."
    if len(password.encode("utf-8")) > 72:
        return "Le mot de passe ne doit pas dépasser 72 octets (limite bcrypt)."
    if not any(c.isalpha() for c in password):
        return "Le mot de passe doit contenir au moins une lettre."
    if not any(c.isdigit() for c in password):
        return "Le mot de passe doit contenir au moins un chiffre."
    return ""


def main() -> None:
    load_dotenv()

    # S'assure que les tables existent (utile si on lance ce script en premier)
    Base.metadata.create_all(bind=engine)

    print("=" * 50)
    print("  LOCATION — Création d'un compte ADMIN")
    print("=" * 50)

    # --- Email ---
    email = input("Email admin : ").strip().lower()
    if not email or "@" not in email:
        print("❌ Email invalide.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()

        # --- Cas 1 : utilisateur existant ---
        if existing:
            if existing.role == "admin":
                print(f"ℹ️  {email} est déjà administrateur. Rien à faire.")
                sys.exit(0)
            answer = input(
                f"⚠️  {email} existe avec le rôle '{existing.role}'. "
                f"Le promouvoir admin ? [y/N] "
            ).strip().lower()
            if answer != "y":
                print("Annulé.")
                sys.exit(0)
            existing.role = "admin"
            existing.is_verified = True
            db.commit()
            print(f"✅ {email} promu au rôle 'admin'.")
            sys.exit(0)

        # --- Cas 2 : création ---
        password = getpass.getpass("Mot de passe : ")
        password2 = getpass.getpass("Confirme le mot de passe : ")

        if password != password2:
            print("❌ Les mots de passe ne correspondent pas.")
            sys.exit(1)

        err = _validate_password(password)
        if err:
            print(f"❌ {err}")
            sys.exit(1)

        admin = User(
            email=email,
            hashed_password=hash_password(password),
            full_name="Administrateur",
            role="admin",
            is_verified=True,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        print(f"✅ Admin créé : id={admin.id}, email={admin.email}")
        print("   → Tu peux maintenant te connecter via POST /api/auth/login.")

    finally:
        db.close()


if __name__ == "__main__":
    main()