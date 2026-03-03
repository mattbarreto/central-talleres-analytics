from __future__ import annotations

import unicodedata
from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.resource_term import ResourceTerm
from app.models.resource_term_alias import ResourceTermAlias
from app.models.session_resource_requirement import SessionResourceRequirement


def normalize_term_key(raw: str) -> str:
    normalized = unicodedata.normalize("NFKD", (raw or "").strip().lower())
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    cleaned = []
    prev_space = False
    for ch in ascii_only:
        if ch.isalnum():
            cleaned.append(ch)
            prev_space = False
        else:
            if not prev_space:
                cleaned.append(" ")
            prev_space = True
    return " ".join("".join(cleaned).split())


def _get_admin(db: Session, email: str) -> Admin:
    admin = db.query(Admin).filter(Admin.email == email.lower()).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin no autenticado")
    return admin


def _visible_terms_query(db: Session, admin_id):
    return db.query(ResourceTerm).filter(
        or_(
            ResourceTerm.scope == "global",
            and_(ResourceTerm.scope == "personal", ResourceTerm.owner_admin_id == admin_id),
        )
    )


def list_terms(db: Session, actor_email: str, q: str | None = None, include_merged: bool = False) -> list[ResourceTerm]:
    actor = _get_admin(db, actor_email)
    query = _visible_terms_query(db, actor.id)
    if not include_merged:
        query = query.filter(ResourceTerm.governance_status != "merged")
    if q:
        key = normalize_term_key(q)
        query = query.filter(ResourceTerm.normalized_key.contains(key))
    return query.order_by(ResourceTerm.scope.asc(), ResourceTerm.label.asc()).all()


def _resolve_by_alias(db: Session, normalized_key: str, actor_id):
    alias = (
        db.query(ResourceTermAlias)
        .join(ResourceTerm, ResourceTerm.id == ResourceTermAlias.resource_term_id)
        .filter(
            ResourceTermAlias.normalized_alias == normalized_key,
            or_(
                ResourceTermAlias.scope == "global",
                and_(ResourceTermAlias.scope == "personal", ResourceTermAlias.owner_admin_id == actor_id),
            ),
        )
        .order_by(ResourceTermAlias.scope.asc())
        .first()
    )
    if not alias:
        return None
    return db.query(ResourceTerm).filter(ResourceTerm.id == alias.resource_term_id).first()


def ensure_personal_term(db: Session, label: str, actor_email: str) -> tuple[ResourceTerm, bool]:
    actor = _get_admin(db, actor_email)
    normalized_key = normalize_term_key(label)
    if not normalized_key:
        raise HTTPException(status_code=400, detail="Etiqueta invalida")

    existing = (
        _visible_terms_query(db, actor.id)
        .filter(ResourceTerm.normalized_key == normalized_key, ResourceTerm.governance_status != "merged")
        .order_by(ResourceTerm.scope.asc())
        .first()
    )
    if existing:
        return existing, False

    aliased = _resolve_by_alias(db, normalized_key, actor.id)
    if aliased:
        return aliased, False

    term = ResourceTerm(
        label=label.strip(),
        normalized_key=normalized_key,
        scope="personal",
        governance_status="draft",
        owner_admin_id=actor.id,
    )
    db.add(term)
    db.commit()
    db.refresh(term)
    return term, True


def get_visible_term_or_404(db: Session, term_id, actor_email: str) -> ResourceTerm:
    actor = _get_admin(db, actor_email)
    term = _visible_terms_query(db, actor.id).filter(ResourceTerm.id == term_id).first()
    if not term:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")
    return term


def create_alias(db: Session, term_id, alias_label: str, actor_email: str) -> ResourceTermAlias:
    term = get_visible_term_or_404(db, term_id, actor_email)
    alias_key = normalize_term_key(alias_label)
    if not alias_key:
        raise HTTPException(status_code=400, detail="Alias invalido")
    if alias_key == term.normalized_key:
        raise HTTPException(status_code=409, detail="El alias coincide con la etiqueta canonica")

    existing = (
        db.query(ResourceTermAlias)
        .filter(
            ResourceTermAlias.normalized_alias == alias_key,
            ResourceTermAlias.scope == term.scope,
            ResourceTermAlias.owner_admin_id == term.owner_admin_id,
        )
        .first()
    )
    if existing:
        if existing.resource_term_id == term.id:
            return existing
        raise HTTPException(status_code=409, detail="Alias ya en uso por otra etiqueta")

    conflict_term = (
        db.query(ResourceTerm)
        .filter(
            ResourceTerm.normalized_key == alias_key,
            ResourceTerm.scope == term.scope,
            ResourceTerm.owner_admin_id == term.owner_admin_id,
            ResourceTerm.id != term.id,
            ResourceTerm.governance_status != "merged",
        )
        .first()
    )
    if conflict_term:
        raise HTTPException(status_code=409, detail="Alias coincide con una etiqueta existente")

    alias = ResourceTermAlias(
        resource_term_id=term.id,
        alias_label=alias_label.strip(),
        normalized_alias=alias_key,
        scope=term.scope,
        owner_admin_id=term.owner_admin_id,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


def _merge_terms(db: Session, source: ResourceTerm, target: ResourceTerm) -> None:
    if source.id == target.id:
        return

    source_requirements = db.query(SessionResourceRequirement).filter(SessionResourceRequirement.resource_term_id == source.id).all()
    for req in source_requirements:
        duplicate = (
            db.query(SessionResourceRequirement)
            .filter(
                SessionResourceRequirement.workshop_session_id == req.workshop_session_id,
                SessionResourceRequirement.resource_term_id == target.id,
            )
            .first()
        )
        if duplicate:
            db.delete(req)
            continue
        req.resource_term_id = target.id

    source_aliases = db.query(ResourceTermAlias).filter(ResourceTermAlias.resource_term_id == source.id).all()
    for alias in source_aliases:
        conflict = (
            db.query(ResourceTermAlias)
            .filter(
                ResourceTermAlias.resource_term_id == target.id,
                ResourceTermAlias.normalized_alias == alias.normalized_alias,
            )
            .first()
        )
        if conflict:
            db.delete(alias)
            continue
        alias.resource_term_id = target.id
        alias.scope = target.scope
        alias.owner_admin_id = target.owner_admin_id

    source.governance_status = "merged"
    source.merged_into_term_id = target.id


def promote_term_to_global(db: Session, term_id, actor_email: str) -> ResourceTerm:
    term = get_visible_term_or_404(db, term_id, actor_email)
    if term.governance_status == "merged":
        raise HTTPException(status_code=409, detail="La etiqueta esta fusionada y no puede promocionarse")

    if term.scope == "global" and term.governance_status == "approved":
        return term

    conflict = (
        db.query(ResourceTerm)
        .filter(
            ResourceTerm.scope == "global",
            ResourceTerm.normalized_key == term.normalized_key,
            ResourceTerm.id != term.id,
            ResourceTerm.governance_status != "merged",
        )
        .first()
    )

    if conflict:
        _merge_terms(db, term, conflict)
        db.commit()
        db.refresh(conflict)
        return conflict

    term.scope = "global"
    term.owner_admin_id = None
    term.governance_status = "approved"

    aliases = db.query(ResourceTermAlias).filter(ResourceTermAlias.resource_term_id == term.id).all()
    for alias in aliases:
        alias.scope = "global"
        alias.owner_admin_id = None

    db.commit()
    db.refresh(term)
    return term
