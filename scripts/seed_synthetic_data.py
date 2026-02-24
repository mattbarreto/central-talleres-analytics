"""
Seed script: populates the database with synthetic Argentine demo data
for technology-oriented workshops.

All data is anchored to the CURRENT year and recent months only.
Workshops follow annual cycles — each year starts fresh.

Usage:
    python scripts/seed_synthetic_data.py          # seed (idempotent)
    python scripts/seed_synthetic_data.py --clean   # wipe ALL seeded data first
"""
import random
import sys
import os
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
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
from app.core.security import get_password_hash

random.seed(42)

# ─────────────────────────── Config ────────────────────────────────────────
NOW = datetime.now(timezone.utc)
TODAY = date.today()
CURRENT_YEAR = TODAY.year  # 2026

# ─────────────────────────── Argentine Name Data ───────────────────────────
FIRST_NAMES_F = [
    "Camila", "Valentina", "Lucía", "Sofía", "Martina",
    "Julieta", "Agustina", "Delfina", "Catalina", "Florencia",
    "Milagros", "Rocío", "Micaela", "Pilar", "Sol",
    "Carolina", "Daniela", "Belén", "Abril", "Aldana",
]
FIRST_NAMES_M = [
    "Santiago", "Matías", "Facundo", "Tomás", "Joaquín",
    "Lautaro", "Nahuel", "Agustín", "Franco", "Nicolás",
    "Thiago", "Bruno", "Gonzalo", "Federico", "Leandro",
    "Maximiliano", "Ramiro", "Ezequiel", "Iván", "Emiliano",
]
LAST_NAMES = [
    "González", "Rodríguez", "Fernández", "López", "Martínez",
    "García", "Pérez", "Sánchez", "Romero", "Díaz",
    "Torres", "Álvarez", "Ruiz", "Ramírez", "Acosta",
    "Flores", "Benítez", "Medina", "Suárez", "Castro",
    "Morales", "Ortiz", "Gutiérrez", "Herrera", "Giménez",
]
AREA_CODES = ["11", "351", "341", "261", "221", "381", "291"]


def rand_phone():
    return f"+549{random.choice(AREA_CODES)}{random.randint(1000000, 9999999)}"

def rand_dni():
    return str(random.randint(20000000, 45000000))

def rand_birth(min_age=17, max_age=55):
    age = random.randint(min_age, max_age)
    return TODAY.replace(year=TODAY.year - age) - timedelta(days=random.randint(0, 364))

def make_email(name: str, domain: str = "ejemplo.edu.ar"):
    s = name.lower()
    for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ñ","n")]:
        s = s.replace(a, b)
    return ".".join(s.split()) + f"@{domain}"


# ─────────────── Workshops — Only current year, recent months ──────────────
# The idea: some workshops started in Jan, some in Feb, some planned for later.
# As the real calendar advances, the user creates new ones manually.
WORKSHOPS = [
    # ── Started in January (6+ weeks in → now "active") ──
    {
        "name": "Introducción a Python",
        "status": "active",
        "start": date(CURRENT_YEAR, 1, 13),
        "end": date(CURRENT_YEAR, 3, 28),
    },
    {
        "name": "Desarrollo Web con React",
        "status": "active",
        "start": date(CURRENT_YEAR, 1, 20),
        "end": date(CURRENT_YEAR, 4, 10),
    },
    # ── Started in February (recent) ──
    {
        "name": "Data Science con Pandas",
        "status": "active",
        "start": date(CURRENT_YEAR, 2, 3),
        "end": date(CURRENT_YEAR, 5, 16),
    },
    {
        "name": "Diseño UX/UI",
        "status": "active",
        "start": date(CURRENT_YEAR, 2, 10),
        "end": date(CURRENT_YEAR, 5, 30),
    },
    {
        "name": "Ciberseguridad Básica",
        "status": "active",
        "start": date(CURRENT_YEAR, 2, 17),
        "end": date(CURRENT_YEAR, 6, 6),
    },
    # ── Planned for March/April (upcoming) ──
    {
        "name": "Machine Learning Aplicado",
        "status": "planned",
        "start": date(CURRENT_YEAR, 3, 10),
        "end": date(CURRENT_YEAR, 6, 20),
    },
    {
        "name": "Bases de Datos SQL y NoSQL",
        "status": "planned",
        "start": date(CURRENT_YEAR, 3, 24),
        "end": date(CURRENT_YEAR, 7, 4),
    },
    {
        "name": "DevOps y Cloud Computing",
        "status": "planned",
        "start": date(CURRENT_YEAR, 4, 7),
        "end": date(CURRENT_YEAR, 7, 18),
    },
]

# ─────────────────────────── Team Members ──────────────────────────────────
TEAM = [
    {"name": "Patricia Vidal", "role": "coordinator", "email": "patricia.vidal@talleres.edu.ar", "phone": "+5491145678901"},
    {"name": "Hernán Bustos", "role": "coordinator", "email": "hernan.bustos@talleres.edu.ar", "phone": "+5491167890123"},
    {"name": "Laura Moyano", "role": "teacher", "email": "laura.moyano@talleres.edu.ar", "phone": "+5491123456789"},
    {"name": "Diego Ríos", "role": "teacher", "email": "diego.rios@talleres.edu.ar", "phone": "+5491134567890"},
    {"name": "Analía Pereyra", "role": "teacher", "email": "analia.pereyra@talleres.edu.ar", "phone": "+5491156789012"},
    {"name": "Marcos Aguirre", "role": "teacher", "email": "marcos.aguirre@talleres.edu.ar", "phone": "+5491178901234"},
]

# ─────────────────────────── Communication Templates ───────────────────────
COMM_TEMPLATES = [
    ("Bienvenida al taller", "¡Hola! Te damos la bienvenida al taller {ws}. Las clases comienzan el {fecha}. ¡Nos vemos pronto!"),
    ("Recordatorio de clase", "Te recordamos que mañana tenemos clase de {ws}. No olvides traer tu notebook."),
    ("Material disponible", "Subimos nuevo material de estudio para {ws}. Consultalo en la plataforma."),
    ("Encuesta de satisfacción", "Completá la encuesta de satisfacción de {ws} para ayudarnos a mejorar."),
    ("Avance del programa", "Ya completamos la primera unidad de {ws}. ¡Seguimos avanzando!"),
    ("Proyecto integrador", "Les informamos sobre el proyecto integrador de {ws}. Fecha de entrega: {fecha}."),
]


def clean_all(db):
    """Wipe all seeded data (preserves admin)."""
    print("⚠ Limpiando datos existentes...")
    db.query(CommunicationRecipient).delete()
    db.query(Communication).delete()
    db.query(Enrollment).delete()
    db.query(WorkshopStaffAssignment).delete()
    db.query(Workshop).delete()
    db.query(Participant).delete()
    db.query(TeamMember).delete()
    db.commit()
    print("  Datos limpiados.")


def main():
    do_clean = "--clean" in sys.argv

    db = SessionLocal()
    print(f"Conectado a: {db.bind.url}")
    print(f"Año actual: {CURRENT_YEAR} | Hoy: {TODAY}")

    if do_clean:
        clean_all(db)

    # ── Admin ──
    admin = db.query(Admin).filter(Admin.email == "admin@example.com").first()
    if not admin:
        admin = Admin(email="admin@example.com", password_hash=get_password_hash("admin123"))
        db.add(admin)
        db.flush()
        print("✓ Admin creado")
    else:
        print("· Admin ya existe")

    # ── Workshops ──
    ws_objs = []
    for w in WORKSHOPS:
        existing = db.query(Workshop).filter(
            Workshop.name == w["name"], Workshop.cohort_year == CURRENT_YEAR
        ).first()
        if existing:
            ws_objs.append(existing)
            print(f"· Taller '{w['name']}' ya existe")
            continue
        ws = Workshop(
            name=w["name"],
            cohort_year=CURRENT_YEAR,
            status=w["status"],
            start_date=w["start"],
            end_date=w["end"],
        )
        ws.created_at = datetime.combine(
            w["start"] - timedelta(days=random.randint(3, 14)),
            datetime.min.time(),
        ).replace(tzinfo=timezone.utc)
        db.add(ws)
        db.flush()
        ws_objs.append(ws)
        print(f"✓ Taller '{w['name']}' creado ({w['status']})")

    # ── Team ──
    tm_objs = []
    for t in TEAM:
        existing = db.query(TeamMember).filter(TeamMember.email == t["email"]).first()
        if existing:
            tm_objs.append(existing)
            continue
        tm = TeamMember(name=t["name"], email=t["email"], phone=t["phone"], role=t["role"])
        db.add(tm)
        db.flush()
        tm_objs.append(tm)
    print(f"✓ {len(tm_objs)} miembros de equipo")

    # ── Staff Assignments ──
    teachers = [t for t in tm_objs if t.role == "teacher"]
    coordinators = [t for t in tm_objs if t.role == "coordinator"]
    assign_count = 0
    for i, ws in enumerate(ws_objs):
        coord = coordinators[i % len(coordinators)]
        assigned = [teachers[i % len(teachers)]]
        if len(teachers) > 1:
            extra = teachers[(i + 1) % len(teachers)]
            if extra.id != assigned[0].id:
                assigned.append(extra)
        for member in [coord] + assigned:
            role = "coordinator" if member.role == "coordinator" else "teacher"
            exists = db.query(WorkshopStaffAssignment).filter(
                WorkshopStaffAssignment.workshop_id == ws.id,
                WorkshopStaffAssignment.team_member_id == member.id,
            ).first()
            if not exists:
                db.add(WorkshopStaffAssignment(
                    workshop_id=ws.id, team_member_id=member.id, assignment_role=role,
                ))
                assign_count += 1
    db.flush()
    print(f"✓ {assign_count} asignaciones")

    # ── Participants ──
    all_names = [(f, random.choice(LAST_NAMES)) for f in FIRST_NAMES_F] + \
                [(m, random.choice(LAST_NAMES)) for m in FIRST_NAMES_M]
    random.shuffle(all_names)
    name_pool = all_names[:35]

    p_objs = []
    for first, last in name_pool:
        full = f"{first} {last}"
        email = make_email(full)
        existing = db.query(Participant).filter(Participant.email == email).first()
        if existing:
            p_objs.append(existing)
            continue
        gender = "female" if first in FIRST_NAMES_F else "male"
        p = Participant(
            name=full, dni=rand_dni(), email=email,
            phone=rand_phone(), birth_date=rand_birth(), gender=gender,
        )
        # Registration date: sometime in Jan 2026
        p.created_at = datetime(
            CURRENT_YEAR, 1, random.randint(2, 28),
            random.randint(8, 20), random.randint(0, 59),
            tzinfo=timezone.utc,
        )
        db.add(p)
        db.flush()
        p_objs.append(p)
    print(f"✓ {len(p_objs)} participantes")

    # ── Enrollments ──
    enrollment_count = 0
    for ws in ws_objs:
        n = random.randint(8, min(15, len(p_objs)))
        selected = random.sample(p_objs, n)
        for p in selected:
            exists = db.query(Enrollment).filter(
                Enrollment.workshop_id == ws.id, Enrollment.participant_id == p.id,
            ).first()
            if exists:
                continue
            if ws.status == "planned":
                status = "enrolled"
            elif ws.status == "active":
                status = random.choices(
                    ["active", "enrolled", "dropped"],
                    weights=[70, 20, 10],
                )[0]
            else:
                status = random.choices(
                    ["finished", "dropped"],
                    weights=[85, 15],
                )[0]
            e = Enrollment(workshop_id=ws.id, participant_id=p.id, status=status)
            ws_start = ws.start_date or date(CURRENT_YEAR, 2, 1)
            e.created_at = datetime.combine(
                ws_start - timedelta(days=random.randint(1, 10)),
                datetime.min.time(),
            ).replace(tzinfo=timezone.utc)
            db.add(e)
            enrollment_count += 1
    db.flush()
    print(f"✓ {enrollment_count} inscripciones")

    # ── Communications (only for active workshops) ──
    comm_count = 0
    for ws in ws_objs:
        if ws.status == "planned":
            continue
        n_comms = random.randint(1, 3)
        templates = random.sample(COMM_TEMPLATES, min(n_comms, len(COMM_TEMPLATES)))
        ws_pids = [
            e.participant_id
            for e in db.query(Enrollment).filter(Enrollment.workshop_id == ws.id).all()
        ]
        if not ws_pids:
            continue

        ws_start = ws.start_date or date(CURRENT_YEAR, 1, 15)
        for subj, body_tmpl in templates:
            # Communication date: between workshop start and today
            days_since = max(1, (TODAY - ws_start).days)
            comm_day = ws_start + timedelta(days=random.randint(0, min(days_since, 40)))
            fecha_str = (ws_start + timedelta(days=random.randint(5, 60))).strftime("%d/%m/%Y")
            body = body_tmpl.format(ws=ws.name, fecha=fecha_str)

            comm = Communication(
                workshop_id=ws.id, subject=subj, body=body,
                sent_at=datetime.combine(comm_day, datetime.min.time()).replace(tzinfo=timezone.utc),
                sent_by_admin_id=admin.id,
            )
            comm.created_at = comm.sent_at
            db.add(comm)
            db.flush()

            for pid in ws_pids:
                p_obj = db.query(Participant).filter(Participant.id == pid).first()
                if not p_obj:
                    continue
                st = random.choices(["sent", "failed"], weights=[95, 5])[0]
                db.add(CommunicationRecipient(
                    communication_id=comm.id, participant_id=pid,
                    email_snapshot=p_obj.email, status=st,
                    error_message="SMTP timeout" if st == "failed" else None,
                ))
            comm_count += 1
    db.flush()
    print(f"✓ {comm_count} comunicaciones")

    db.commit()
    print(f"\n✅ Seed completado — datos anclados a {CURRENT_YEAR}.")
    print(f"   Talleres: {len(ws_objs)}")
    print(f"   Equipo: {len(tm_objs)}")
    print(f"   Participantes: {len(p_objs)}")
    print(f"   Inscripciones: {enrollment_count}")
    print(f"   Comunicaciones: {comm_count}")
    db.close()


if __name__ == "__main__":
    main()
