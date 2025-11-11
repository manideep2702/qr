"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/auth/require-auth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GradientButton } from "@/components/ui/gradient-button";
import { CalendarDays, Clock, HeartHandshake } from "lucide-react";
import { sendEmail } from "@/lib/email";
import { hasIdentityDocument } from "@/lib/profile/identity";
import { useAlert } from "@/components/ui/alert-provider";

type VolunteerEntry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  date: string; // YYYY-MM-DD
  session: "Morning" | "Evening";
  role: string;
  note?: string;
  timestamp: string;
};

export default function VolunteerPage() {
  const { show } = useAlert();
  const season = { start: "November 5th", end: "January 7th" };
  const sessions = [
    { name: "Morning" as const, time: "12:00 AM – 3:00 PM" },
    { name: "Evening" as const, time: "7:30 PM – 9:00 PM" },
  ];

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [session, setSession] = useState<"Morning" | "Evening">("Morning");
  const [role, setRole] = useState("Annadanam Service");
  const [note, setNote] = useState("");
  const [list] = useState<VolunteerEntry[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !email || !phone || !date || !session) {
      alert("Please fill Name, Email, Phone, Date, and Session.");
      return;
    }
    let user_id: string | undefined;
    try {
      const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      if (hasEnv) {
        const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
        const supabase = getSupabaseBrowserClient();
        const { data: userRes } = await supabase.auth.getUser();
        user_id = userRes?.user?.id;
        // Require Aadhaar/PAN before booking volunteer slot (skip for admins)
        try {
          const envRaw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
          const adminEmails = envRaw.split(/[\s,;]+/).filter(Boolean);
          const isAdmin = adminEmails.length > 0 && adminEmails.includes(String(userRes?.user?.email || "").toLowerCase());
          if (!isAdmin) {
            const ok = await hasIdentityDocument(supabase as any);
            if (!ok) {
              const next = window.location.pathname + window.location.search;
              show({ title: "Identity document required", description: "Please upload Aadhaar or PAN in your profile. Redirecting in 5 seconds…", variant: "warning", durationMs: 5000 });
              setTimeout(() => {
                try { window.location.assign("/profile/edit/?next=" + encodeURIComponent(next)); } catch {}
              }, 5000);
              return;
            }
          }
        } catch {}
      }
    } catch {}
    try {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowserClient();
      const payload = {
        name,
        email,
        phone,
        date,
        session,
        role,
        note: note || null,
        user_id,
      } as const;
      const { data: ins, error } = await supabase.from("Volunteer Bookings").insert(payload).select("id").single();
      if (error) {
        alert(error.message);
        return;
      }
      setSavedId(String(ins?.id ?? ""));
      alert('Thank you! Your volunteer interest is noted.');
      try {
        await sendEmail({
          to: email.trim(),
          subject: "Volunteer request received",
          text: `Dear ${name}, thank you for volunteering on ${date} (${session}) for ${role}. We will reach out if anything else is needed.`,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;line-height:1.6">
            <h2 style="margin:0 0 8px">Volunteer Request Received</h2>
            <p>Dear ${name || "Devotee"},</p>
            <p>Thank you for submitting your interest to volunteer. Here are your details:</p>
            <ul>
              <li><strong>Date:</strong> ${date}</li>
              <li><strong>Session:</strong> ${session}</li>
              <li><strong>Preferred Role:</strong> ${role}</li>
            </ul>
            <p>We appreciate your seva. Our team will get in touch if any further details are required.</p>
            <p>Swamiye Saranam Ayyappa</p>
          </div>`,
        });
      } catch {}
      setDate("");
      setSession("Morning");
      setNote("");
    } catch (e: any) {
      alert(e?.message || 'Network error');
    }
  };

  const recent = useMemo(() => list.slice(-5).reverse(), [list]);
  function seasonForNow(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const nov5 = new Date(y, 10, 5);
    const jan7Next = new Date(y + 1, 0, 7);
    if (m === 11 || m === 12 || (m === 1 && d <= 7)) {
      return { start: new Date(y, 10, 5), end: new Date(y + (m === 1 ? 0 : 1), 0, 7) };
    }
    if (now < nov5) return { start: nov5, end: jan7Next };
    return { start: nov5, end: jan7Next };
  }
  const { start: seasonStart, end: seasonEnd } = useMemo(() => seasonForNow(new Date()), []);
  const seasonStartIso = useMemo(() => {
    const y = seasonStart.getFullYear();
    const m = String(seasonStart.getMonth() + 1).padStart(2, "0");
    const d = String(seasonStart.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [seasonStart]);
  const seasonEndIso = useMemo(() => {
    const y = seasonEnd.getFullYear();
    const m = String(seasonEnd.getMonth() + 1).padStart(2, "0");
    const d = String(seasonEnd.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [seasonEnd]);
  const isOutOfSeason = useMemo(() => !!date && (date < seasonStartIso || date > seasonEndIso), [date, seasonStartIso, seasonEndIso]);

  return (
    <RequireAuth>
      <main className="min-h-screen bg-background text-foreground">
        {/* Hero */}
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('/b2.jpeg')" }} />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-amber-700/50 via-amber-800/40 to-background/90" />
          <div className="mx-auto max-w-5xl px-6 pt-28 pb-14 text-center">
            <div className="inline-flex items-center justify-center gap-2 rounded-full bg-black/40 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur">
              <HeartHandshake size={18} /> Volunteer for Samithi Seva
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight text-white">Contribute Your Time & Service</h1>
            <p className="mt-3 text-white/90 md:text-lg">
              Join our annadanam and temple service teams. Choose a day and session that works for you.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 space-y-8">
          {/* Timings */}
          <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
            <h2 className="text-xl md:text-2xl font-semibold">Fixed Timings</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Annadanam season runs from <span className="font-medium text-foreground">{season.start}</span> to {" "}
              <span className="font-medium text-foreground">{season.end}</span>.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[360px] w-full text-sm">
                <thead>
                  <tr className="text-left text-foreground">
                    <th className="py-2 pr-4">Session</th>
                    <th className="py-2 pr-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.name} className="border-t border-border text-muted-foreground">
                      <td className="py-2 pr-4 font-medium text-foreground">{s.name}</td>
                      <td className="py-2 pr-4">{s.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Form */}
          <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
            <h2 className="text-xl md:text-2xl font-semibold">Volunteer Sign‑Up</h2>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v-name">Full Name</Label>
                <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-email">Email</Label>
                <Input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-phone">Phone</Label>
                <Input id="v-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9xxxxxxxxx" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-date">Preferred Date</Label>
                <Input
                  id="v-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={seasonStartIso}
                  max={seasonEndIso}
                  aria-invalid={isOutOfSeason}
                  className={isOutOfSeason ? "ring-red-500 focus:ring-red-500" : undefined}
                />
                {isOutOfSeason && (
                  <span className="text-xs text-red-500">❌ Choose a date between {seasonStartIso} and {seasonEndIso}.</span>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="v-session">Session</Label>
                <select
                  id="v-session"
                  value={session}
                  onChange={(e) =>
                    setSession(e.target.value === "Morning" ? "Morning" : "Evening")
                  }
                  className="w-full rounded-xl bg-white/5 px-4 py-3 text-sm ring-1 ring-border focus:ring-2 focus:outline-none"
                >
                  {sessions.map((s) => (
                    <option key={s.name} value={s.name}>{s.name} — {s.time}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="v-role">Preferred Role</Label>
                <select
                  id="v-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl bg_white/5 px-4 py-3 text-sm ring-1 ring-border focus:ring-2 focus:outline-none"
                >
                  <option>Annadanam Service</option>
                  <option>Kitchen/Preparation</option>
                  <option>Prasadam Distribution</option>
                  <option>Cleaning & Maintenance</option>
                  <option>Crowd Management</option>
                  <option>Administration/Desk</option>
                </select>
              </div>
              <div className="md:col-span-2 grid gap-1.5">
                <Label htmlFor="v-note">Notes (optional)</Label>
                <Textarea id="v-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any additional info…" />
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <GradientButton onClick={submit} className="min-w-[220px]">
                Submit Volunteer Request
              </GradientButton>
            </div>
          </div>

          {/* Recent sign‑ups list removed (no demo storage). */}
        </section>
      </main>
    </RequireAuth>
  );
}
