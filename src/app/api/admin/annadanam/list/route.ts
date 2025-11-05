import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
    const date = typeof body?.date === "string" ? body.date : "";
    const session = typeof body?.session === "string" ? body.session : "";

    // Query canonical public."Bookings" (Annadanam bookings)
    const admin = getSupabaseAdminClient();
    let q = admin
      .from("Bookings")
      .select("created_at,date,session,user_id,name,email,phone,qty,status")
      .order("created_at", { ascending: false });
    if (date) q = q.eq("date", date);
    if (session && session !== "all") q = q.eq("session", session);
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
