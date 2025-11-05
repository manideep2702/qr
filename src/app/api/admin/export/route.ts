import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function fetchAllUsers(url: string, serviceKey: string) {
  const users: any[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const r = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!r.ok) throw new Error(`users page ${page} failed: ${await r.text()}`);
    const j = await r.json();
    const arr: any[] = Array.isArray(j?.users) ? j.users : [];
    users.push(...arr);
    if (arr.length < perPage) break;
    page += 1;
    if (page > 50) break; // safety cap
  }
  return users;
}

async function fetchRest(url: string, serviceKey: string, table: string, params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  usp.set("select", "*");
  usp.set("order", "created_at.desc");
  for (const [k, v] of Object.entries(params)) {
    if (v) usp.append(k, v);
  }
  const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(table)}?${usp.toString()}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "application/json",
      Prefer: "count=none",
    },
  });
  if (!r.ok) throw new Error(`${table} failed: ${await r.text()}`);
  return await r.json();
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminListRaw = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const admins = adminListRaw.split(/[\s,;]+/).filter(Boolean);
    if (!url || !anon || !service) {
      return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
    }

    // Verify caller is signed-in admin using Supabase access token
    const authz = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authz || !/^Bearer\s+/.test(authz)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authz.replace(/^Bearer\s+/i, "").trim();
    const who = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!who.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await who.json().catch(() => null as any);
    const email = (me?.email || "").toLowerCase();
    if (!email || (admins.length > 0 && !admins.includes(email))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const start = typeof body?.start === "string" && body.start ? body.start : ""; // YYYY-MM-DD
    const end = typeof body?.end === "string" && body.end ? body.end : "";

    const dateFrom = start || undefined;
    const dateTo = end || undefined;
    const tsFrom = start ? `${start}T00:00:00Z` : undefined;
    const tsTo = end ? `${end}T23:59:59Z` : undefined;

    const [pooja, annadanam, donations, contacts, volunteers, profiles, users] = await Promise.all([
      // Pooja-Bookings filtered by date range
      fetchRest(url, service, "Pooja-Bookings", {
        ...(dateFrom ? { date: `gte.${dateFrom}` } : {}),
        ...(dateTo ? { date: `lte.${dateTo}` } : {}),
      }),
      // Annadanam Bookings table is named "Bookings" in this project
      fetchRest(url, service, "Bookings", {
        ...(dateFrom ? { date: `gte.${dateFrom}` } : {}),
        ...(dateTo ? { date: `lte.${dateTo}` } : {}),
      }),
      fetchRest(url, service, "donations", {
        ...(tsFrom ? { created_at: `gte.${tsFrom}` } : {}),
        ...(tsTo ? { created_at: `lte.${tsTo}` } : {}),
      }),
      fetchRest(url, service, "contact-us", {
        ...(tsFrom ? { created_at: `gte.${tsFrom}` } : {}),
        ...(tsTo ? { created_at: `lte.${tsTo}` } : {}),
      }),
      fetchRest(url, service, "Volunteer_Bookings", {
        ...(dateFrom ? { date: `gte.${dateFrom}` } : {}),
        ...(dateTo ? { date: `lte.${dateTo}` } : {}),
      }),
      fetchRest(url, service, "Profile-Table", {}),
      fetchAllUsers(url, service),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      date_range: { start: start || null, end: end || null },
      users,
      profiles,
      pooja_bookings: pooja,
      annadanam_bookings: annadanam,
      donations,
      contact_messages: contacts,
      volunteer_bookings: volunteers,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
