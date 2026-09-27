"""Canonical phone number normalization.

The mobile app always sends E.164 with a +91 prefix (see
LoginScreen.tsx's normalizePhone) regardless of what the user types, but
some accounts (notably the seeded teacher rows, inserted directly via SQL)
were stored as bare 10-digit numbers with no prefix. Since every phone
lookup in this service is an exact string match against the `phone` column,
the two formats for the same real number never matched, so a real OTP
login against a bare-format seed row silently created a duplicate
"pending" account instead of matching the existing one.

Normalizing once here, at the Pydantic schema layer (see field_validator
usage in schemas/phone_otp.py and schemas/user.py), means every downstream
consumer — CRUD lookups, DB writes, admin teacher creation — already
receives the canonical form.
"""

def normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return f"+91{digits}"
    return digits
