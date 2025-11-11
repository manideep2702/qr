import os
import ssl
import smtplib
import json
from typing import Optional, Iterable, Tuple
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

# ENV (set these on your server; never hardcode secrets)
# SMTP_HOST=mail.sabarisastha.org
# SMTP_PORT=465
# SMTP_USER=no-reply@sabarisastha.org
# SMTP_PASS=YOUR_PASSWORD
# FROM_EMAIL=no-reply@sabarisastha.org
# FROM_NAME=Sabari Sastha Seva Samithi
# SMTP_BCC=optional-admin@yourdomain (optional)

def send_booking_confirmation(
    *,
    name: str,
    email: str,
    bookingType: str,  # "Annadanam" | "Pooja" | "Donation" | "Volunteer"
    date: str,
    slot: str,
    bookingId: str,
) -> dict:
    smtp_host = os.environ.get("SMTP_HOST", "mail.sabarisastha.org")
    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    secure_env = (os.environ.get("SMTP_SECURE") or "").strip().lower()
    smtp_secure = secure_env in ("1", "true", "yes", "on") or smtp_port == 465
    from_email = os.environ.get("FROM_EMAIL", smtp_user or "no-reply@example.com")
    from_name = os.environ.get("FROM_NAME", "Sabari Sastha Seva Samithi")
    bcc = os.environ.get("SMTP_BCC", "")

    if not (smtp_user and smtp_pass):
        raise RuntimeError("Missing SMTP_USER/SMTP_PASS env")

    subject = f"Booking Confirmation - {bookingType} #{bookingId}"

    header_color = "#f97316"  # orange
    html = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;line-height:1.6">
      <div style="background:{header_color};color:white;padding:14px 16px;border-radius:10px 10px 0 0">
        <strong style="font-size:16px">{from_name}</strong>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:16px">
        <h2 style="margin:0 0 10px;font-size:18px">Booking Confirmation - {bookingType} #{bookingId}</h2>
        <p>Dear {name or "Devotee"},</p>
        <p>Thank you for your {bookingType} booking at {from_name}.</p>
        <table style="border-collapse:collapse;width:100%;margin:10px 0 14px">
          <tbody>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa;width:160px"><strong>Booking Type</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{bookingType}</td></tr>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Booking ID</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{bookingId}</td></tr>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Name</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{name}</td></tr>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Email</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{email}</td></tr>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Date</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{date}</td></tr>
            <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;background:#fafafa"><strong>Slot</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb">{slot}</td></tr>
          </tbody>
        </table>
        <p>May Lord Ayyappa bless you abundantly!</p>
        <p>Regards,<br/>{from_name}</p>
      </div>
    </div>
    """.strip()

    text = (
        f"Booking Confirmation - {bookingType} #{bookingId}\n\n"
        f"Dear {name},\n\n"
        f"Thank you for your {bookingType} booking at {from_name}.\n\n"
        f"Details:\n"
        f"- Date: {date}\n"
        f"- Slot: {slot}\n"
        f"- Booking ID: {bookingId}\n\n"
        f"May Lord Ayyappa bless you abundantly!\n\n"
        f"Regards,\n{from_name}\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = email
    if bcc:
        msg["Bcc"] = bcc
    # Valid Message-ID for Gmail acceptance
    domain = (from_email.split("@")[1] or "sabarisastha.org").strip()
    msg["Message-ID"] = make_msgid(domain=domain)
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    ctx = ssl.create_default_context()
    if smtp_secure:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx) as s:
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls(context=ctx)
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)

    return {"ok": True, "messageId": msg["Message-ID"]}


def _send_raw_email(
    *,
    to_addresses,
    subject: str,
    text: Optional[str] = None,
    html: Optional[str] = None,
) -> dict:
    smtp_host = os.environ.get("SMTP_HOST", "mail.sabarisastha.org")
    smtp_port = int(os.environ.get("SMTP_PORT", "465"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    secure_env = (os.environ.get("SMTP_SECURE") or "").strip().lower()
    smtp_secure = secure_env in ("1", "true", "yes", "on") or smtp_port == 465
    from_email = os.environ.get("FROM_EMAIL", smtp_user or "no-reply@example.com")
    from_name = os.environ.get("FROM_NAME", "Sabari Sastha Seva Samithi")
    bcc = os.environ.get("SMTP_BCC", "")

    if not (smtp_user and smtp_pass):
        raise RuntimeError("Missing SMTP_USER/SMTP_PASS env")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))

    # Normalize recipients (string | list[str])
    if isinstance(to_addresses, (list, tuple, set)):
        msg["To"] = ", ".join(str(x).strip() for x in to_addresses if str(x).strip())
    else:
        msg["To"] = str(to_addresses).strip()
    if bcc:
        msg["Bcc"] = bcc

    domain = (from_email.split("@")[1] or "sabarisastha.org").strip()
    msg["Message-ID"] = make_msgid(domain=domain)
    if html:
        # Prefer HTML with text fallback
        if text:
            msg.set_content(text)
        else:
            msg.set_content("This is an HTML email.")
        msg.add_alternative(html, subtype="html")
    else:
        msg.set_content(text or "")

    ctx = ssl.create_default_context()
    if smtp_secure:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx) as s:
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
    else:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls(context=ctx)
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
    return {"ok": True, "messageId": msg["Message-ID"]}


def _cors_headers(environ) -> Iterable[Tuple[str, str]]:
    """Compute CORS headers for the request origin if allowed.

    Configure with ALLOWED_ORIGINS env var as a comma-separated list.
    Example: "https://example.com, https://www.example.com"
    If not set, no CORS headers are added (same-origin only).
    """
    allowed = [o.strip() for o in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if o.strip()]
    if not allowed:
        return []
    origin = (environ.get("HTTP_ORIGIN") or "").strip()
    if not origin:
        return []
    # Exact match policy; you can use wildcard in env if desired.
    if origin in allowed or "*" in allowed:
        return [
            ("Access-Control-Allow-Origin", origin if origin != "*" else "*"),
            ("Vary", "Origin"),
            ("Access-Control-Allow-Credentials", "false"),
        ]
    return []


def _json_response(environ, start_response, status_code: int, payload: dict):
    status_map = {
        200: "200 OK",
        400: "400 Bad Request",
        405: "405 Method Not Allowed",
        500: "500 Internal Server Error",
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body)))]
    # Apply CORS headers if configured
    headers.extend(_cors_headers(environ))
    start_response(
        status_map.get(status_code, f"{status_code} OK"),
        headers,
    )
    return [body]


def app(environ, start_response):
    try:
        method = (environ.get("REQUEST_METHOD") or "GET").upper()
        raw_path = environ.get("PATH_INFO") or "/"
        # Normalize path; handle deployments where the reverse proxy does not strip the '/api' prefix
        path = raw_path
        if path.startswith("/api/"):
            path = path[len("/api") :]
        if not path:
            path = "/"
        # Remove duplicate slashes and trailing slash (except root)
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        if path == "/health":
            return _json_response(environ, start_response, 200, {"ok": True})
        if path == "/":
            return _json_response(environ, start_response, 200, {"ok": True, "endpoints": ["/health", "/send-email"]})
        if path != "/send-email":
            return _json_response(environ, start_response, 400, {"error": "Unknown path"})
        # CORS preflight support when frontend is on a different origin
        if method == "OPTIONS":
            headers = [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Access-Control-Allow-Methods", "POST, OPTIONS"),
                ("Access-Control-Allow-Headers", "content-type, authorization"),
            ]
            headers.extend(_cors_headers(environ))
            start_response("204 No Content", headers)
            return [b""]
        # Helpful probe: surface 405 for GET to prove the route is active
        if method == "GET":
            return _json_response(environ, start_response, 405, {"error": "Method Not Allowed", "hint": "Use POST"})
        if method != "POST":
            return _json_response(environ, start_response, 405, {"error": "Method Not Allowed"})

        try:
            length = int(environ.get("CONTENT_LENGTH") or "0")
        except ValueError:
            length = 0
        body_bytes = environ["wsgi.input"].read(length) if length > 0 else b""
        try:
            j = json.loads(body_bytes.decode("utf-8") or "{}")
        except Exception:
            return _json_response(environ, start_response, 400, {"error": "Invalid JSON"})

        # Mode A: Generic payload { to, subject, text?, html? }
        if "to" in j and "subject" in j:
            to_val = j["to"]
            subject = str(j["subject"]).strip()
            if not subject or (not to_val):
                return _json_response(environ, start_response, 400, {"error": "Missing 'to' or 'subject'"})
            out = _send_raw_email(
                to_addresses=to_val,
                subject=subject,
                text=(str(j.get("text")) if j.get("text") is not None else None),
                html=(str(j.get("html")) if j.get("html") is not None else None),
            )
            return _json_response(environ, start_response, 200, out)

        # Mode B: Booking confirmation payload
        required = ["name", "email", "bookingType", "date", "slot", "bookingId"]
        if all(k in j and str(j[k]).strip() for k in required):
            out = send_booking_confirmation(
                name=str(j["name"]).strip(),
                email=str(j["email"]).strip(),
                bookingType=str(j["bookingType"]).strip(),
                date=str(j["date"]).strip(),
                slot=str(j["slot"]).strip(),
                bookingId=str(j["bookingId"]).strip(),
            )
            return _json_response(environ, start_response, 200, out)

        return _json_response(environ, start_response, 400, {"error": "Invalid payload"})
    except Exception as e:
        print("Email send failed:", repr(e))
        return _json_response(environ, start_response, 500, {"ok": False, "error": str(e)})


# Some platforms expect the callable to be named "application".
# Expose both names to avoid configuration mismatch.
application = app


if __name__ == "__main__":
    # Local dev server: python3 app.py
    try:
        from wsgiref.simple_server import make_server
        with make_server("0.0.0.0", 8000, app) as httpd:
            print("Serving on http://0.0.0.0:8000 ...")
            httpd.serve_forever()
    except KeyboardInterrupt:
        pass
