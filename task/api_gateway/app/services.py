"""
Single source of truth for all upstream service proxies.
Import from here — never instantiate ServiceProxy elsewhere.
"""
from app.config import settings
from app.proxy import ServiceProxy

auth_svc         = ServiceProxy("Auth Service",         settings.AUTH_SERVICE_URL,         timeout=15.0)
user_svc         = ServiceProxy("User Service",         settings.USER_SERVICE_URL,          timeout=20.0)
content_svc      = ServiceProxy("Content Service",      settings.CONTENT_SERVICE_URL,       timeout=30.0)
quiz_svc         = ServiceProxy("Quiz Service",         settings.QUIZ_SERVICE_URL,          timeout=30.0)
ai_svc           = ServiceProxy("AI Service",           settings.AI_SERVICE_URL,            timeout=300.0)
payment_svc      = ServiceProxy("Payment Service",      settings.PAYMENT_SERVICE_URL,       timeout=30.0)
notification_svc = ServiceProxy("Notification Service", settings.NOTIFICATION_SERVICE_URL,  timeout=20.0)
analytics_svc    = ServiceProxy("Analytics Service",    settings.ANALYTICS_SERVICE_URL,     timeout=30.0)
gamification_svc = ServiceProxy("Gamification Service", settings.GAMIFICATION_SERVICE_URL,  timeout=20.0)
referral_svc     = ServiceProxy("Referral Service",     settings.REFERRAL_SERVICE_URL,      timeout=20.0)
battle_svc       = ServiceProxy("Battle Service",       settings.BATTLE_SERVICE_URL,        timeout=30.0)
career_svc       = ServiceProxy("Career Service",       settings.CAREER_SERVICE_URL,        timeout=30.0)

ALL_SERVICES = [
    auth_svc, user_svc, content_svc, quiz_svc, ai_svc,
    payment_svc, notification_svc, analytics_svc,
    gamification_svc, referral_svc, battle_svc, career_svc,
]
