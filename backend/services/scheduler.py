"""
Scheduler — APScheduler
Ejecuta run_notifications() todos los días a las 8:00 AM.
Se inicia en el evento startup de FastAPI.
"""
import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def start_scheduler():
    from database import SessionLocal
    from services.notification_runner import run_notifications

    async def job():
        logger.info("Ejecutando cron de notificaciones...")
        db = SessionLocal()
        try:
            await run_notifications(db)
        except Exception as e:
            logger.error(f"Error en cron de notificaciones: {e}")
        finally:
            db.close()

    scheduler.add_job(
        job,
        trigger=CronTrigger(hour=8, minute=0),  # todos los días a las 8:00 AM
        id="daily_notifications",
        name="Notificaciones automáticas de cobranza",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler iniciado — cron diario a las 08:00")
