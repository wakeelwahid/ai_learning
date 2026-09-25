#!/usr/bin/env python3
"""Copy services/_shared_auth/auth_core.py verbatim into every backend
service's app/core/_shared_auth.py.

Why a copy instead of a real shared package: each service's Docker build
context is scoped to its own folder (docker-compose.yml has `build: .`
inside services/<name>_service/), so a Dockerfile's COPY can't reach
outside that folder to pull in a sibling package at build time. Copying a
verbatim, generated file into each service's tree is the practical
workaround — it keeps the 11 services' Docker configs untouched while
still having exactly ONE place (services/_shared_auth/auth_core.py) where
the real logic is written and reviewed.

Run this after any change to services/_shared_auth/auth_core.py, then
rebuild+redeploy whichever services actually changed:

    python3 tools/sync_shared_auth.py

Every generated file starts with a loud "DO NOT EDIT" banner. If you edit
a generated copy directly, this script will silently overwrite your edit
on its next run — edit auth_core.py instead.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "services" / "_shared_auth" / "auth_core.py"

# auth_service is deliberately excluded — it's the token issuer and decodes
# JWTs locally against its own DB; it has no verify_token()-against-auth_service
# pattern to share with the other 11.
TARGET_SERVICES = [
    "ai_service", "analytics_service", "battle_service", "career_service",
    "content_service", "gamification_service", "notification_service",
    "payment_service", "quiz_service", "referral_service", "user_service",
]

BANNER = '''"""GENERATED FILE — DO NOT EDIT DIRECTLY.

This is a verbatim copy of services/_shared_auth/auth_core.py, produced by
tools/sync_shared_auth.py. Edit that file and re-run the script instead —
any direct edit here will be silently overwritten on the next sync.
"""
'''


def main() -> int:
    if not SOURCE.exists():
        print(f"ERROR: source file not found: {SOURCE}", file=sys.stderr)
        return 1

    source_body = SOURCE.read_text()
    # Drop the source file's own module docstring (starts with """ and ends
    # at the next """) — the generated copy gets its own short banner
    # instead, so it's obvious at a glance which file is the one to edit.
    if source_body.startswith('"""'):
        end = source_body.index('"""', 3) + 3
        source_body = source_body[end:].lstrip("\n")

    written = []
    for service in TARGET_SERVICES:
        target_dir = REPO_ROOT / "services" / service / "app" / "core"
        if not target_dir.exists():
            print(f"WARNING: {target_dir} does not exist, skipping {service}", file=sys.stderr)
            continue
        target_path = target_dir / "_shared_auth.py"
        target_path.write_text(BANNER + "\n" + source_body)
        written.append(str(target_path.relative_to(REPO_ROOT)))

    print(f"Synced {SOURCE.relative_to(REPO_ROOT)} -> {len(written)} services:")
    for path in written:
        print(f"  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
