## Email setup

This project can send confirmation emails in two ways:

1) Webuzo (Passenger + Python WSGI) — same-origin `/api/send-email` endpoint  
2) Supabase Edge Function — HTTP email provider (e.g., Resend)

Both paths are wired. Pick ONE.

Provide your Webuzo SMTP mailbox credentials as environment variables for the function and deploy it.

---

### Option A: Webuzo Passenger (Pure WSGI, no extra packages)

Deploy the Python WSGI API found in `api/` so the site can call `https://YOUR_DOMAIN/api/send-email`. It uses only Python standard library and needs no `pip` installs.

1. Upload the entire `api/` folder to `/home/<account>/public_html/api/`.
2. Webuzo → Applications → Add Application → Passenger:
   - Deployment Domain: your domain (e.g., `sabarisastha.org`)
   - Base Application URL: `/api`
   - Application Path: `/home/<account>/public_html/api`
   - Application Type: Python 3
   - Recommended: Application Startup File: `passenger_wsgi.py`, Variable: `application`
     - Alternate: Startup File `app.py`, Variable `app` (also works; `application` alias is provided)
3. Environment variables (add all):
   - `SMTP_HOST` (e.g., `mail.yourdomain.com`)
   - `SMTP_PORT` (`465` for SSL/TLS, `587` for STARTTLS)
   - `SMTP_USER` (full mailbox, e.g., `no-reply@yourdomain.com`)
   - `SMTP_PASS` (mailbox password)
   - `FROM_EMAIL` (optional, defaults to `SMTP_USER`)
   - `FROM_NAME` (optional display name)
   - `SMTP_BCC` (optional)
   - `ALLOWED_ORIGINS` (optional, comma-separated for CORS if frontend is on a different domain; e.g. `https://yourdomain.com, https://www.yourdomain.com`)
4. Restart the Passenger app from Webuzo.
5. Test:
   ```bash
   curl -i https://YOUR_DOMAIN/api/send-email \
     -H "Content-Type: application/json" \
     --data '{"to":"you@example.com","subject":"Test","text":"Hello"}'
   ```
   If your frontend runs on a different origin and you configured CORS, you can test preflight too:
   ```bash
   curl -i -X OPTIONS https://YOUR_DOMAIN/api/send-email \
     -H 'Origin: https://YOUR_FRONTEND_DOMAIN' \
     -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: content-type'
   ```
6. Frontend uses this automatically. It defaults to `window.location.origin + "/api/send-email"`.  
   Optionally set `NEXT_PUBLIC_EMAIL_ENDPOINT=https://YOUR_DOMAIN/api/send-email`.

Where the app calls it:
- Annadanam booking: `src/components/annadanam/AnnadanamBooking.tsx`
- Pooja booking: `src/app/calendar/pooja/page.tsx`
- Volunteer booking: `src/app/volunteer/page.tsx`
- Donation submission: `src/app/donate/pay/page.tsx`
All use `src/lib/email.ts`.

---

### Required environment variables

- `SMTP_HOST` (e.g. `mail.yourdomain.com`)
- `SMTP_PORT`
  - `465` for SSL/TLS (recommended)
  - `587` for STARTTLS
- `SMTP_USER` (full mailbox, e.g. `no-reply@yourdomain.com`)
- `SMTP_PASS` (mailbox password)
- `SMTP_SECURE` (`true` for 465, `false` for 587)
- `FROM_EMAIL` (optional, defaults to `SMTP_USER`)
- `FROM_NAME` (optional display name, e.g. `Sabari Sastha Seva Samithi`)

### Option B: Supabase Edge Function (HTTP email provider)

Using the Supabase Dashboard:
1. Go to Project → Edge Functions → `send-email` → Settings/Secrets
2. Add the variables listed above
3. Deploy/redeploy the function

Using Supabase CLI:
```bash
supabase functions deploy send-email \
  --env SMTP_HOST=mail.sabarisastha.org \
  --env SMTP_PORT=465 \
  --env SMTP_USER=no-reply@sabarisastha.org \
  --env SMTP_PASS=YOUR_MAILBOX_PASSWORD \
  --env SMTP_SECURE=true \
  --env FROM_EMAIL=no-reply@sabarisastha.org \
  --env FROM_NAME="Sabari Sastha Seva Samithi"
```

### Where emails are triggered

- Annadanam booking: `src/components/annadanam/AnnadanamBooking.tsx` (best‑effort email after booking)
- Pooja booking: `src/app/calendar/pooja/page.tsx`
- Volunteer booking: `src/app/volunteer/page.tsx`
- Donation submission: `src/app/donate/pay/page.tsx`

All use `src/lib/email.ts` which prefers `NEXT_PUBLIC_EMAIL_ENDPOINT` (or same-origin `/api/send-email`), and falls back to the Supabase function `send-email`.

### Supabase OAuth redirect URLs (Google login)

Ensure these are added in Supabase → Authentication → URL Configuration → Redirect URLs:

- Your callback: `https://YOUR_DOMAIN/auth/callback`
- And (optional) with trailing slash if you use it: `https://YOUR_DOMAIN/auth/callback/`

Also set `NEXT_PUBLIC_SITE_URL` to your exact site origin (no trailing slash), e.g. `https://YOUR_DOMAIN`.

### Optional: Server (Node) API routes

If you enable server API routes (currently in `src/app/__api_disabled/*`), set these variables in your hosting platform as well:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_BCC` (optional)

Those routes use `nodemailer` and send emails directly from the server runtime.

### Supabase-only option with Resend (HTTP API)

Supabase Edge Functions cannot open SMTP sockets. Use Resend (or SendGrid/Mailgun/SES HTTP APIs) from the function.

1) Update `supabase/functions/send-email/index.ts` (already wired) to call Resend.
2) In Supabase → Project Settings → API → Functions: set secrets:
   - RESEND_API_KEY=YOUR_RESEND_API_KEY
   - FROM_EMAIL=no-reply@sabarisastha.org
   - FROM_NAME="Sabari Sastha Seva Samithi"
   - EMAIL_BCC=optional-admin@yourdomain
3) In Resend dashboard, add and verify your domain `sabarisastha.org` and sender `no-reply@sabarisastha.org` (adds DKIM records).
4) Deploy:
```bash
supabase functions deploy send-email
```
5) Test:
```bash
curl -i https://<PROJECT_REF>.functions.supabase.co/send-email \
  -H "Authorization: Bearer <ANON_KEY_OR_JWT>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"to":"you@example.com","subject":"Test","text":"Hi"}'
```

