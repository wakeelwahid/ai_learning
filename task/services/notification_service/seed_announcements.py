"""
Seed dummy announcements into the database.
Run from the notification_service directory:
    python seed_announcements.py
Requires DATABASE_URL in .env or environment.
"""
import asyncio
from datetime import datetime, timezone, timedelta

from app.database.base import Base
from app.database.session import engine, AsyncSessionLocal
from app.models.announcement import Announcement, AnnouncementType  # noqa: F401


SEEDS = [
    {
        "title": "AI Doubt Solver is now live! 🚀",
        "body": (
            "Ask any question from your syllabus and get instant step-by-step explanations "
            "powered by our new AI engine. Available for Classes 9–12 across all boards."
        ),
        "type": AnnouncementType.FEATURE,
        "link_url": "http://localhost:3002/ai-assistant",
        "release_date": datetime.now(timezone.utc) - timedelta(days=1),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        "is_active": True,
        "is_pinned": True,
    },
    {
        "title": "CBSE Board Exam 2025 – Date Sheet Released",
        "body": (
            "The CBSE has officially released the Class 10 & 12 exam schedule for 2025. "
            "Board exams start from 15 February 2025. Download the full timetable and start your prep now."
        ),
        "type": AnnouncementType.EXAM,
        "link_url": None,
        "release_date": datetime.now(timezone.utc) - timedelta(days=3),
        "expires_at": datetime(2025, 3, 31, tzinfo=timezone.utc),
        "is_active": True,
        "is_pinned": True,
    },
    {
        "title": "Platform Update v2.4 – Faster Video Loading",
        "body": (
            "We've upgraded our video CDN for 40% faster load times, especially on mobile networks. "
            "Offline download is now available for premium subscribers."
        ),
        "type": AnnouncementType.UPDATE,
        "link_url": None,
        "release_date": datetime.now(timezone.utc) - timedelta(hours=6),
        "expires_at": None,
        "is_active": True,
        "is_pinned": False,
    },
    {
        "title": "Scheduled Maintenance – Sunday 2 AM to 4 AM",
        "body": (
            "EduLearn will be under maintenance this Sunday from 2:00 AM to 4:00 AM IST "
            "for database upgrades. The app will be unavailable during this window. "
            "We apologize for the inconvenience."
        ),
        "type": AnnouncementType.MAINTENANCE,
        "link_url": None,
        "release_date": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=5),
        "is_active": True,
        "is_pinned": False,
    },
    {
        "title": "Haryana Board & UP Board Content Now Available",
        "body": (
            "We've added 500+ new videos and 1,200 practice questions for Haryana Board "
            "and UP Board students (Classes 9–12). Full syllabus coverage for Science and Maths."
        ),
        "type": AnnouncementType.FEATURE,
        "link_url": "http://localhost:3002/learn",
        "release_date": datetime.now(timezone.utc) - timedelta(days=2),
        "expires_at": None,
        "is_active": True,
        "is_pinned": False,
    },
    {
        "title": "Refer & Earn: Get 3 months FREE for every friend you invite",
        "body": (
            "Our new referral program is live! Share your unique code and earn 3 months of "
            "premium access for every friend who subscribes. No limit on rewards."
        ),
        "type": AnnouncementType.GENERAL,
        "link_url": "http://localhost:3002/referral",
        "release_date": datetime.now(timezone.utc) - timedelta(days=4),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=60),
        "is_active": True,
        "is_pinned": False,
    },
]


async def seed():
    # Create tables if they don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, checkfirst=True))

    async with AsyncSessionLocal() as session:
        for data in SEEDS:
            obj = Announcement(**data, created_by="seed_script")
            session.add(obj)
        await session.commit()
        print(f"✓ Inserted {len(SEEDS)} announcements.")


if __name__ == "__main__":
    asyncio.run(seed())
