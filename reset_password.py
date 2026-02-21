from app.db.session import SessionLocal
from app.models.admin import Admin
from app.core.security import get_password_hash

def reset():
    db = SessionLocal()
    email = 'admin@example.com'
    user = db.query(Admin).filter(Admin.email == email).first()
    if user:
        user.password_hash = get_password_hash('admin123')
        db.commit()
        print(f"SUCCESS: Password for {email} reset to 'admin123'")
    else:
        # Create if not exists
        user = Admin(email=email, password_hash=get_password_hash('admin123'))
        db.add(user)
        db.commit()
        print(f"SUCCESS: User {email} created with password 'admin123'")
    db.close()

if __name__ == "__main__":
    reset()
