from __future__ import annotations

import unittest
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.core.security import get_password_hash
from app.db.base import Base
from app.main import app
from app.models import (
    Admin,
    Communication,
    CommunicationRecipient,
    Enrollment,
    Participant,
    TeamMember,
    Workshop,
    WorkshopStaffAssignment,
)


class APITestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.session_local = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db: Session = self.session_local()

        def _override_get_db():
            try:
                yield self.db
            finally:
                pass

        app.dependency_overrides[get_db] = _override_get_db
        self.client_ctx = TestClient(app)
        self.client = self.client_ctx.__enter__()

    def tearDown(self) -> None:
        try:
            self.client_ctx.__exit__(None, None, None)
        finally:
            app.dependency_overrides.pop(get_db, None)
            self.db.close()
            self.engine.dispose()

    def create_admin(self, email: str = "admin@example.com", password: str = "strong-password-123") -> dict[str, str]:
        self.db.add(Admin(email=email, password_hash=get_password_hash(password)))
        self.db.commit()
        return {"email": email, "password": password}

    def login(self, email: str, password: str) -> dict:
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def auth_headers(self, email: str = "admin@example.com", password: str = "strong-password-123") -> dict[str, str]:
        token_data = self.login(email, password)
        return {"Authorization": f"Bearer {token_data['access_token']}"}

    def seed_insights_data(self) -> Participant:
        workshop = Workshop(
            name="Taller Analítica",
            cohort_year=2026,
            status="active",
            start_date=date(2026, 1, 10),
            end_date=date(2026, 4, 20),
        )
        participant = Participant(
            name="Ana Pérez",
            dni="12345678",
            email="ana@example.com",
            phone="+5491122334455",
            gender="female",
        )
        team_member = TeamMember(name="Docente 1", role="teacher", email="docente@example.com")
        self.db.add_all([workshop, participant, team_member])
        self.db.flush()

        self.db.add(
            Enrollment(
                workshop_id=workshop.id,
                participant_id=participant.id,
                status="active",
            )
        )
        self.db.add(
            WorkshopStaffAssignment(
                workshop_id=workshop.id,
                team_member_id=team_member.id,
                assignment_role="teacher",
            )
        )
        communication = Communication(
            workshop_id=workshop.id,
            subject="Bienvenida",
            body="Mensaje inicial",
        )
        self.db.add(communication)
        self.db.flush()
        self.db.add(
            CommunicationRecipient(
                communication_id=communication.id,
                participant_id=participant.id,
                email_snapshot=participant.email,
                status="sent",
            )
        )
        self.db.commit()
        return participant
