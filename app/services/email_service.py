from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("app.services.email")


def send_email(subject: str, body: str, recipient: str) -> tuple[bool, str | None]:
    mode = (settings.email_delivery_mode or "demo").lower()
    if mode != "smtp":
        return True, None

    if not settings.smtp_host or not settings.smtp_sender_email:
        return False, "SMTP no configurado: falta host o remitente"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_sender_email
    message["To"] = recipient
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
        return True, None
    except Exception:
        logger.exception("smtp_send_failed")
        return False, "No se pudo enviar el correo"
