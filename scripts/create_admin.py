import argparse

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.admin import Admin


def create_admin(email: str, password: str) -> None:
    session: Session = SessionLocal()
    try:
        normalized_email = email.strip().lower()
        existing = session.query(Admin).filter(Admin.email == normalized_email).first()
        if existing:
            print(f"Admin ya existe: {normalized_email}")
            return

        admin = Admin(email=normalized_email, password_hash=get_password_hash(password))
        session.add(admin)
        session.commit()
        print(f"Admin creado: {normalized_email}")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear admin inicial")
    parser.add_argument("--email", required=True, help="Email del admin")
    parser.add_argument("--password", required=True, help="Password del admin")
    args = parser.parse_args()
    create_admin(args.email, args.password)


if __name__ == "__main__":
    main()

