"""Email notifications for Trackify."""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)


APP_NAME = "LuMen - Smart Shopping Reader"
FROM_NAME = "LuMen Team"


def _send_message(message: EmailMessage, recipient: str) -> bool:
    sender = os.getenv("EMAIL_USER")
    password = os.getenv("EMAIL_PASS")
    if not sender or not password:
        log.warning("Email skipped because EMAIL_USER or EMAIL_PASS is missing")
        return False

    message["From"] = f"{FROM_NAME} <{sender}>"
    message["To"] = recipient

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
            smtp.login(sender, password)
            smtp.send_message(message)
        return True
    except Exception:
        log.exception("Failed to send email to %s", recipient)
        return False


def send_price_alert(
    email: str,
    product_name: str,
    price: float,
    link: str,
    target_price: float,
    old_price: float | None = None,
) -> bool:
    message = EmailMessage()
    message["Subject"] = "Price Alert: Your Tracked Product is Now Available at Your Target Price"
    message.set_content(
        "\n".join(
            [
                APP_NAME,
                "",
                "Dear User,",
                "",
                "We're pleased to inform you that a product you are tracking on LuMen has reached your desired price.",
                "",
                "Product Details:",
                f"- Product Name: {product_name}",
                f"- Old Price: {old_price if old_price is not None else 'Not available'}",
                f"- Current Price: {price}",
                f"- Your Target Price: {target_price}",
                "",
                "This means the product is now available at or below the price you specified.",
                "",
                "You can view or purchase the product using the link below:",
                str(link),
                "",
                "Price dropped! Buy now",
                "",
                "We recommend acting promptly, as prices may fluctuate.",
                "",
                "Best regards,",
                "LuMen Team",
            ]
        )
    )
    return _send_message(message, email)


def send_password_reset_otp(email: str, otp_code: str) -> bool:
    message = EmailMessage()
    message["Subject"] = "LuMen Password Reset Verification Code"
    message.set_content(
        "\n".join(
            [
                APP_NAME,
                "",
                "Dear User,",
                "",
                "We received a request to reset your password.",
                "",
                f"OTP Code: {otp_code}",
                "",
                "Valid for 5 minutes. Do not share.",
                "",
                "Best regards,",
                "LuMen Security Team",
            ]
        )
    )
    return _send_message(message, email)
