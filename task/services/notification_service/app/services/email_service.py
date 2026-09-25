import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


class EmailService:
    async def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str | None = None,
    ) -> bool:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = to_email

        if text_body:
            msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
            )
            return True
        except Exception:
            return False

    async def send_verification(self, to_email: str, token: str) -> bool:
        url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        html = f"""
        <h2>Verify Your Email</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="{url}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
            Verify Email
        </a>
        <p>Link expires in 24 hours.</p>
        """
        return await self.send(to_email, "Verify your email — EdTech", html)

    async def send_welcome(self, to_email: str, name: str) -> bool:
        html = f"""
        <h2>Welcome to EdTech, {name}! 🎓</h2>
        <p>Your account has been created successfully.</p>
        <p>Start learning today with our CBSE/HBSE curriculum.</p>
        <a href="{settings.FRONTEND_URL}" style="background:#4F46E5;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
            Start Learning
        </a>
        """
        return await self.send(to_email, "Welcome to EdTech!", html)
