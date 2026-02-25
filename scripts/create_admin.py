import argparse

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.admin import Admin


def create_admin(email: str, password: str, first_name: str, last_name: str, role: str) -> None:
    session: Session = SessionLocal()
    try:
        normalized_email = email.strip().lower()
        existing = session.query(Admin).filter(Admin.email == normalized_email).first()
        if existing:
            print(f"Admin ya existe: {normalized_email}")
            return

        admin = Admin(
            email=normalized_email,
            password_hash=get_password_hash(password),
            first_name=first_name,
            last_name=last_name,
            role=role
        )
        session.add(admin)
        session.commit()
        print(f"Admin creado: {normalized_email} ({role})")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear admin inicial")
    parser.add_argument("--email", required=True, help="Email del admin")
    parser.add_argument("--password", required=True, help="Password del admin")
    parser.add_argument("--first-name", required=True, help="Nombre")
    parser.add_argument("--last-name", required=True, help="Apellido")
    parser.add_argument("--role", default="superadmin", help="Rol en el sistema (admin/superadmin)")
    args = parser.parse_args()
    create_admin(args.email, args.password, args.first_name, args.last_name, args.role)


if __name__ == "__main__":
    main()

