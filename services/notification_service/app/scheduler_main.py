"""Standalone entrypoint for the Daily Jobs Scheduler process.

notification_service's HTTP API runs 4 uvicorn workers (see Dockerfile) for
request throughput. APScheduler's AsyncIOScheduler is a single-process,
in-memory scheduler with no leader election — if it were started inside
main.py's lifespan (as it originally was), each of the 4 workers would boot
its own independent copy, and every cron/interval job (including the
1-minute Battle Reminder poll) would fire 4x, quadruple-sending every
notification.

This process owns the ONE scheduler instance for the whole deployment. It is
run as its own container (see docker-compose.yml's `notification_scheduler`
service, a single, unscaled replica) with no HTTP server of its own — this is
the "Daily Jobs Scheduler" box in the architecture diagram, kept separate
from the API-serving layer.
"""
import asyncio
import logging
import signal

from app.database.session import AsyncSessionLocal, engine
from app.schedulers.streak_reminders import init_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def main() -> None:
    scheduler = init_scheduler(db_factory=AsyncSessionLocal)
    scheduler.start()
    logger.info("Daily Jobs Scheduler started with %d jobs.", len(scheduler.get_jobs()))

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()

    logger.info("Shutting down Daily Jobs Scheduler...")
    scheduler.shutdown(wait=False)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
