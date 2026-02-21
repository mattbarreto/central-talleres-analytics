"""
Genera datos demo analíticos para recuperar visualizaciones de Insights.

Uso:
  python scripts/seed_analytics_demo.py --reset
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.db.session import SessionLocal
from app.models.communication import Communication
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_staff_assignment import WorkshopStaffAssignment


FIRST_NAMES = [
    "Ana",
    "Lucia",
    "Sofia",
    "Carla",
    "Julieta",
    "Natalia",
    "Mateo",
    "Agustin",
    "Lucas",
    "Bruno",
    "Joaquin",
    "Martin",
]

LAST_NAMES = [
    "Rodoni",
    "Gonzalez",
    "Lopez",
    "Garcia",
    "Fernandez",
    "Pereyra",
    "Suarez",
    "Mendez",
    "Sosa",
    "Benitez",
    "Ramos",
    "Ruiz",
]

WORKSHOP_THEMES = [
    "Programacion Python",
    "Fotografia Social",
    "Narrativa Digital",
    "Robotica Inicial",
    "Diseno Grafico",
    "Podcast y Radio",
    "Periodismo de Datos",
    "Edicion de Video",
    "Marketing Cultural",
    "Produccion Musical",
]


@dataclass
class SeedConfig:
    workshops: int = 12
    participants: int = 90
    team_members: int = 14
    days: int = 420
    seed: int = 20260220
    reset: bool = False


def random_dt(start: datetime, end: datetime) -> datetime:
    delta_seconds = int((end - start).total_seconds())
    if delta_seconds <= 1:
        return start
    return start + timedelta(seconds=random.randint(0, delta_seconds))


def build_birth_date() -> date:
    year = random.randint(1960, 2012)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return date(year, month, day)


def run(config: SeedConfig) -> None:
    random.seed(config.seed)
    now = datetime.now(UTC)
    start_window = now - timedelta(days=max(config.days, 60))

    with SessionLocal() as db:
        if config.reset:
            db.query(CommunicationRecipient).delete()
            db.query(Communication).delete()
            db.query(Enrollment).delete()
            db.query(WorkshopStaffAssignment).delete()
            db.query(TeamMember).delete()
            db.query(Participant).delete()
            db.query(Workshop).delete()
            db.commit()

        existing_demo_count = db.query(Participant).filter(Participant.email.like("demo.participante%@example.com")).count()

        workshops: list[Workshop] = []
        current_year = date.today().year
        for i in range(config.workshops):
            theme = WORKSHOP_THEMES[i % len(WORKSHOP_THEMES)]
            created = random_dt(start_window, now - timedelta(days=10))
            cohort = current_year if i % 3 != 0 else current_year - 1
            start_date = (created + timedelta(days=random.randint(7, 40))).date()
            duration = random.randint(35, 120)
            end_date = start_date + timedelta(days=duration)
            if end_date < date.today() - timedelta(days=10):
                status = "finished"
            elif start_date <= date.today() <= end_date:
                status = "active"
            else:
                status = "planned"

            w = Workshop(
                name=f"{theme} - Cohorte {cohort}",
                cohort_year=cohort,
                status=status,
                start_date=start_date,
                end_date=end_date,
                created_at=created,
                updated_at=created,
            )
            db.add(w)
            workshops.append(w)

        participants: list[Participant] = []
        genders = ["female", "male", "non_binary", "other", "undisclosed"]
        for i in range(config.participants):
            fn = random.choice(FIRST_NAMES)
            ln = random.choice(LAST_NAMES)
            idx = existing_demo_count + i + 1
            created = random_dt(start_window, now)
            p = Participant(
                name=f"{fn} {ln} {idx}",
                dni=str(30_000_000 + idx),
                email=f"demo.participante{idx}@example.com",
                phone=f"+54 11 {random.randint(2000, 9999)}-{random.randint(1000, 9999)}",
                birth_date=build_birth_date(),
                gender=random.choices(genders, weights=[34, 34, 12, 8, 12], k=1)[0],
                created_at=created,
                updated_at=created,
            )
            db.add(p)
            participants.append(p)

        team: list[TeamMember] = []
        for i in range(config.team_members):
            created = random_dt(start_window, now)
            role = "coordinator" if i % 5 == 0 else "teacher"
            t = TeamMember(
                name=f"Perfil Equipo {i + 1}",
                email=f"demo.team{i + 1}@example.com",
                phone=f"+54 11 {random.randint(3000, 9999)}-{random.randint(1000, 9999)}",
                role=role,
                created_at=created,
                updated_at=created,
            )
            db.add(t)
            team.append(t)

        db.flush()

        assignments: list[WorkshopStaffAssignment] = []
        coordinators = [m for m in team if m.role == "coordinator"] or team[:2]
        teachers = [m for m in team if m.role == "teacher"] or team[2:]
        for w in workshops:
            coord = random.choice(coordinators)
            created = random_dt(start_window, now)
            assignments.append(
                WorkshopStaffAssignment(
                    workshop_id=w.id,
                    team_member_id=coord.id,
                    assignment_role="coordinator",
                    created_at=created,
                    updated_at=created,
                )
            )
            for teacher in random.sample(teachers, k=min(len(teachers), random.randint(1, 2))):
                created_t = random_dt(start_window, now)
                assignments.append(
                    WorkshopStaffAssignment(
                        workshop_id=w.id,
                        team_member_id=teacher.id,
                        assignment_role="teacher",
                        created_at=created_t,
                        updated_at=created_t,
                    )
                )
        db.add_all(assignments)

        enrollments: list[Enrollment] = []
        workshop_participants: dict[str, list[Participant]] = {str(w.id): [] for w in workshops}
        for p in participants:
            picks = random.sample(workshops, k=random.randint(1, min(4, len(workshops))))
            for w in picks:
                created = random_dt(start_window, now)
                if w.status == "finished":
                    status = random.choices(["finished", "dropped", "active"], weights=[58, 20, 22], k=1)[0]
                elif w.status == "active":
                    status = random.choices(["active", "enrolled", "dropped", "finished"], weights=[54, 28, 10, 8], k=1)[0]
                else:
                    status = random.choices(["enrolled", "active"], weights=[82, 18], k=1)[0]
                e = Enrollment(
                    workshop_id=w.id,
                    participant_id=p.id,
                    status=status,
                    created_at=created,
                    updated_at=created,
                )
                enrollments.append(e)
                workshop_participants[str(w.id)].append(p)
        db.add_all(enrollments)
        db.flush()

        communications: list[Communication] = []
        recipients: list[CommunicationRecipient] = []
        subjects = [
            "Bienvenida al taller",
            "Recordatorio de clase",
            "Material de apoyo",
            "Aviso de cronograma",
            "Cierre y próximos pasos",
        ]
        for w in workshops:
            enrolled_people = workshop_participants.get(str(w.id), [])
            if not enrolled_people:
                continue
            if w.status == "planned":
                comm_count = random.randint(0, 1)
            elif w.status == "active":
                comm_count = random.randint(2, 5)
            else:
                comm_count = random.randint(1, 3)

            for _ in range(comm_count):
                sent = random_dt(start_window, now)
                c = Communication(
                    workshop_id=w.id,
                    subject=random.choice(subjects),
                    body="Mensaje institucional automático para seguimiento de cohorte.",
                    sent_at=sent,
                    sent_by_admin_id=None,
                    created_at=sent,
                    updated_at=sent,
                )
                communications.append(c)
                db.add(c)
                db.flush()

                sample_size = random.randint(8, min(30, len(enrolled_people)))
                for p in random.sample(enrolled_people, k=sample_size):
                    status = random.choices(["sent", "failed"], weights=[93, 7], k=1)[0]
                    recipients.append(
                        CommunicationRecipient(
                            communication_id=c.id,
                            participant_id=p.id,
                            email_snapshot=p.email,
                            status=status,
                            error_message="SMTP timeout" if status == "failed" else None,
                            created_at=sent,
                            updated_at=sent,
                        )
                    )
        db.add_all(recipients)
        db.commit()

        print("Seed analítico completado")
        print(f"- Talleres: {len(workshops)}")
        print(f"- Participantes: {len(participants)}")
        print(f"- Inscripciones: {len(enrollments)}")
        print(f"- Equipo: {len(team)}")
        print(f"- Asignaciones: {len(assignments)}")
        print(f"- Comunicaciones: {len(communications)}")
        print(f"- Destinatarios: {len(recipients)}")


def parse_args() -> SeedConfig:
    parser = argparse.ArgumentParser(description="Genera datos demo para recuperar Insights/reportes.")
    parser.add_argument("--workshops", type=int, default=12)
    parser.add_argument("--participants", type=int, default=90)
    parser.add_argument("--team-members", type=int, default=14)
    parser.add_argument("--days", type=int, default=420)
    parser.add_argument("--seed", type=int, default=20260220)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    return SeedConfig(
        workshops=max(args.workshops, 1),
        participants=max(args.participants, 10),
        team_members=max(args.team_members, 4),
        days=max(args.days, 60),
        seed=args.seed,
        reset=args.reset,
    )


if __name__ == "__main__":
    run(parse_args())
