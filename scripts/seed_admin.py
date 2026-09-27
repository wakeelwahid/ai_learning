"""
Run this script once after the database is up to create the first admin user.

Usage:
    cd services/auth_service
    python ../../scripts/seed_admin.py

Requires the auth_service deps and DATABASE_URL set in the environment.
"""
import asyncio
import os
import sys

# Add auth_service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "services", "auth_service"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://edtech:edtech_pass@localhost:5432/auth_db",
)

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@edtech.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123456")
ADMIN_PHONE = os.getenv("ADMIN_PHONE", "9999999999")


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    from app.models.user import User, UserRole
    from app.core.security import hash_password

    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalars().first()

        if existing:
            print(f"[seed] Admin already exists: {ADMIN_EMAIL}")
        else:
            admin = User(
                email=ADMIN_EMAIL,
                phone=ADMIN_PHONE,
                hashed_password=hash_password(ADMIN_PASSWORD),
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
            )
            db.add(admin)
            await db.commit()
            print(f"[seed] Admin created successfully!")
            print(f"  Email   : {ADMIN_EMAIL}")
            print(f"  Role    : ADMIN")
            print(f"  Password: (set via ADMIN_PASSWORD env var — not printed here)")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
