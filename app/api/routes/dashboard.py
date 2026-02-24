from datetime import datetime, timedelta, timezone
import zoneinfo
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.api.deps import get_db, get_current_admin
from app.models import Workshop, Enrollment, Communication, Participant
from app.schemas.dashboard import (
    DashboardMetricsResponse,
    DashboardMeta,
    DashboardKpis,
    KpiDelta,
    TrendRow,
    TopWorkshopRow,
    RecentActivityRow,
)

router = APIRouter()

# Timezone according to business rules
TZ = zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")

def build_trend_buckets(rows, start_date: datetime, end_date: datetime) -> list[TrendRow]:
    """
    Given a list of (date_trunc_month_str, count), returns a list of 6 TrendRows
    matching the last 6 calendar months based on current_end.
    """
    # 1. Determine the last 6 months from the end_date (in TZ)
    tz_end = end_date.astimezone(TZ)
    buckets = []
    
    # Generate the 6 month keys strings "YYYY-MM" backwards
    for i in range(5, -1, -1):
        # rough math for months
        month = tz_end.month - i
        year = tz_end.year
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year}-{month:02d}"
        
        # simple label like "Ene", "Feb" (we can map numeric roughly or use strftime but locale might vary)
        import calendar
        month_abbrs = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        label = month_abbrs[month]
        
        buckets.append({"key": key, "label": label, "value": 0})
        
    # 2. Fill buckets
    for row in rows:
        month_key, count = row
        for b in buckets:
            if b["key"] == month_key:
                b["value"] += count
                break
                
    return [TrendRow(label=b["label"], value=b["value"]) for b in buckets]


@router.get("/metrics", response_model=DashboardMetricsResponse)
def get_dashboard_metrics(
    range_days: Annotated[int, Query(ge=7, le=365)] = 30,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin), # Require auth but don't strictly need the return value here
):
    """
    Returns aggregated dashboard metrics avoiding frontend overload.
    Queries are split to prevent cartesian products.
    """
    # 1. Resolve Time Windows
    current_end = datetime.now(timezone.utc)
    current_start = current_end - timedelta(days=range_days)
    previous_end = current_start
    previous_start = previous_end - timedelta(days=range_days)
    
    # 2. Base Filters for reusable queries
    def base_workshop(start, end):
        return db.query(Workshop).filter(Workshop.created_at >= start, Workshop.created_at < end)
        
    def base_enrollment(start, end):
        return db.query(Enrollment).join(Workshop).filter(
            Enrollment.created_at >= start, 
            Enrollment.created_at < end
        )
        
    def base_comm(start, end):
        return db.query(Communication).join(Workshop).filter(
            Communication.created_at >= start, 
            Communication.created_at < end
        )

    # --- BLOCK 1: KPIs (Separate fast aggregates) ---
    ws_cur = base_workshop(current_start, current_end).count()
    ws_prev = base_workshop(previous_start, previous_end).count()
    
    enr_cur = base_enrollment(current_start, current_end).count()
    enr_prev = base_enrollment(previous_start, previous_end).count()
    
    part_cur = db.query(func.count(func.distinct(Enrollment.participant_id))).filter(
        Enrollment.created_at >= current_start, Enrollment.created_at < current_end
    ).scalar() or 0
    part_prev = db.query(func.count(func.distinct(Enrollment.participant_id))).filter(
        Enrollment.created_at >= previous_start, Enrollment.created_at < previous_end
    ).scalar() or 0
    
    comm_cur = base_comm(current_start, current_end).count()
    comm_prev = base_comm(previous_start, previous_end).count()
    
    act_cur = base_enrollment(current_start, current_end).filter(Enrollment.status == "active").count()
    act_prev = base_enrollment(previous_start, previous_end).filter(Enrollment.status == "active").count()
    
    fin_cur = base_enrollment(current_start, current_end).filter(Enrollment.status == "finished").count()
    fin_prev = base_enrollment(previous_start, previous_end).filter(Enrollment.status == "finished").count()
    
    # --- BLOCK 2: Status Distribution ---
    status_counts = db.query(Enrollment.status, func.count(Enrollment.id)) \
        .filter(Enrollment.created_at >= current_start, Enrollment.created_at < current_end) \
        .group_by(Enrollment.status).all()
        
    # Map raw status to frontend labels
    status_map = {"active": "Activos", "finished": "Finalizados", "dropped": "Bajas"}
    status_order = ["active", "finished", "dropped"]
    status_dict = {row[0]: row[1] for row in status_counts}
    
    status_dist = [
        TrendRow(label=status_map.get(st, st), value=status_dict.get(st, 0))
        for st in status_order
    ]

    # --- BLOCK 3: Trends (Last 6 months) ---
    # To get 6 months, we need to go back ~180 days from current_end.
    trend_start = current_end - timedelta(days=180)
    
    # SQLite/Postgres cross-compatible month extraction is tricky. 
    # For robust cross-db, we'll fetch the last 180 days created_at and do it in python if the dataset is tiny,
    # or use func.to_char for pg. Let's do python side bucketing for maximum cross-db compatibility (SQLite tests + PG prod)
    # since we only select (created_at) which is super fast.
    enr_dates = db.query(Enrollment.created_at).filter(Enrollment.created_at >= trend_start).all()
    comm_dates = db.query(Communication.created_at).filter(Communication.created_at >= trend_start).all()
    
    def manual_bucket(dates):
        res = {}
        for (d,) in dates:
            if not d: continue
            # Make timezone aware for bucket mapping
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            d_local = d.astimezone(TZ)
            key = f"{d_local.year}-{d_local.month:02d}"
            res[key] = res.get(key, 0) + 1
        return list(res.items())

    enrollments_trend = build_trend_buckets(manual_bucket(enr_dates), current_start, current_end)
    communications_trend = build_trend_buckets(manual_bucket(comm_dates), current_start, current_end)

    # --- BLOCK 4: Top Workshops ---
    top_ws_query = db.query(Workshop.id, Workshop.name, func.count(Enrollment.id)) \
        .join(Enrollment, Workshop.id == Enrollment.workshop_id) \
        .filter(Enrollment.created_at >= current_start, Enrollment.created_at < current_end) \
        .group_by(Workshop.id, Workshop.name) \
        .order_by(desc(func.count(Enrollment.id))) \
        .limit(8).all()
        
    top_workshops = [
        TopWorkshopRow(id=str(row[0]), label=row[1], value=row[2])
        for row in top_ws_query
    ]
    
    # --- BLOCK 5: Recent Activity ---
    recent_ws = db.query(Workshop).order_by(Workshop.created_at.desc()).limit(10).all()
    recent_comms = db.query(Communication).order_by(Communication.created_at.desc()).limit(10).all()
    
    recent_activities = []
    for w in recent_ws:
        recent_activities.append(RecentActivityRow(
            label=f"Taller: {w.name}",
            date=w.created_at,
            meta=f"{w.cohort_year} - {w.status}",
            type="workshop"
        ))
    for c in recent_comms:
        recent_activities.append(RecentActivityRow(
            label=f"Comunicación: {c.subject}",
            date=c.created_at,
            meta="Envio registrado",
            type="communication"
        ))
        
    # Sort mixed activities and take top 10
    recent_activities.sort(key=lambda x: x.date, reverse=True)
    recent_activities = recent_activities[:10]

    # --- ASSEMBLE RESPONSE ---
    return DashboardMetricsResponse(
        meta=DashboardMeta(
            range_days=range_days,
            current_start=current_start,
            current_end=current_end,
            previous_start=previous_start,
            previous_end=previous_end,
            timezone=str(TZ)
        ),
        kpis=DashboardKpis(
            workshops=KpiDelta(current=ws_cur, previous=ws_prev),
            participants_unique=KpiDelta(current=part_cur, previous=part_prev),
            enrollments=KpiDelta(current=enr_cur, previous=enr_prev),
            active_enrollments=KpiDelta(current=act_cur, previous=act_prev),
            finished_enrollments=KpiDelta(current=fin_cur, previous=fin_prev),
            communications=KpiDelta(current=comm_cur, previous=comm_prev),
        ),
        trends_enrollments=enrollments_trend,
        trends_communications=communications_trend,
        status_distribution=status_dist,
        top_workshops=top_workshops,
        recent_activity=recent_activities
    )
