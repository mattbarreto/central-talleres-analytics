from datetime import UTC, datetime, timedelta
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ReportJobRecord  # noqa: F401
from app.services.report_jobs import ReportJobStore


def _make_store():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return ReportJobStore(session_factory=factory, ttl_seconds=2, max_jobs=20), factory


class ReportJobStoreTests(unittest.TestCase):
    def test_success_flow(self):
        store, _ = _make_store()
        job = store.create()
        self.assertEqual(job.status, "pending")

        store.run(job.id, lambda: (b"%PDF-demo", "demo.pdf", "application/pdf"))
        final = store.get(job.id)

        self.assertIsNotNone(final)
        assert final is not None
        self.assertEqual(final.status, "completed")
        self.assertEqual(final.filename, "demo.pdf")
        self.assertEqual(final.media_type, "application/pdf")
        self.assertEqual(final.content, b"%PDF-demo")
        self.assertIsNotNone(final.started_at)
        self.assertIsNotNone(final.finished_at)

    def test_failure_flow(self):
        store, _ = _make_store()
        job = store.create()

        def broken_builder():
            raise RuntimeError("boom")

        store.run(job.id, broken_builder)
        final = store.get(job.id)

        self.assertIsNotNone(final)
        assert final is not None
        self.assertEqual(final.status, "failed")
        self.assertEqual(final.error, "No se pudo generar el reporte")
        self.assertIsNotNone(final.finished_at)

    def test_cleanup_old_finished_jobs(self):
        store, factory = _make_store()
        job = store.create()
        store.run(job.id, lambda: (b"a", "a.pdf", "application/pdf"))

        with factory() as db:
            row = db.query(ReportJobRecord).filter(ReportJobRecord.id == job.id).first()
            self.assertIsNotNone(row)
            assert row is not None
            row.finished_at = datetime.now(UTC) - timedelta(hours=48)
            row.updated_at = row.finished_at
            row.expires_at = datetime.now(UTC) + timedelta(hours=4)
            db.commit()

        deleted = store.cleanup(older_than_hours=24)
        self.assertGreaterEqual(deleted, 1)
        self.assertIsNone(store.get(job.id))

    def test_metrics_shape(self):
        store, _ = _make_store()
        job_ok = store.create()
        store.run(job_ok.id, lambda: (b"ok", "ok.pdf", "application/pdf"))

        job_fail = store.create()

        def broken():
            raise ValueError("broken")

        store.run(job_fail.id, broken)

        metrics = store.metrics()
        self.assertIn("total_jobs", metrics)
        self.assertIn("status_counts", metrics)
        self.assertGreaterEqual(metrics["status_counts"]["completed"], 1)
        self.assertGreaterEqual(metrics["status_counts"]["failed"], 1)


if __name__ == "__main__":
    unittest.main()
