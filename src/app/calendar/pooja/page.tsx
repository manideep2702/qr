"use client";

import RequireAuth from "@/components/auth/require-auth";
import { useRouter } from "next/navigation";
import { GradientButton } from "@/components/ui/gradient-button";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendEmail } from "@/lib/email";
import { hasIdentityDocument } from "@/lib/profile/identity";

const START = new Date(2025, 10, 5); // Nov 5, 2025 local
const END = new Date(2026, 0, 7); // Jan 7, 2026 local

export default function PoojaBookingPage() {
  const router = useRouter();
  const { show } = useAlert();
  const [selectedDate, setSelectedDate] = useState<Date>(START);
  const [session, setSession] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [childrenNames, setChildrenNames] = useState("");
  const [nakshatram, setNakshatram] = useState("");
  const [gothram, setGothram] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [utr, setUtr] = useState("");
  // blocked map: date ISO -> Set of sessions ("10:30 AM" | "6:30 PM")
  const [blocked, setBlocked] = useState<Map<string, Set<string>>>(new Map());
  const prevSessionRef = useRef<string>("");

  useEffect(() => {
    // Initialize to today within window; after 9:00 PM, move to next day
    const now = new Date();
    const hour = now.getHours();
    let init = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (hour >= 21) {
      init = new Date(init.getTime() + 24 * 60 * 60 * 1000); // next day
    }
    if (init < START) init = START;
    if (init > END) init = END;
    setSelectedDate(init);
  }, []);

  // Load blocked sessions from admin_config (key: pooja_blocked_dates)
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.from("admin_config").select("value").eq("key", "pooja_blocked_dates").maybeSingle();
        const v = data?.value;
        const map = new Map<string, Set<string>>();
        const push = (dateIso: string, sess: string) => {
          const k = String(dateIso);
          const s = map.get(k) || new Set<string>();
          s.add(String(sess));
          map.set(k, s);
        };
        let raw: any = [];
        if (!v) raw = [];
        else if (Array.isArray(v)) raw = v; // might be array of strings or objects
        else {
          try { raw = JSON.parse(String(v)); } catch { raw = []; }
        }
        if (Array.isArray(raw)) {
          for (const el of raw) {
            if (typeof el === "string") {
              // legacy: full-day block
              push(el, "10:30 AM");
              push(el, "6:30 PM");
            } else if (el && typeof el === "object" && el.date && el.session) {
              push(String(el.date), String(el.session));
            }
          }
        }
        setBlocked(map);
      } catch {}
    })();
  }, []);

  const dateIso = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const isDateFullyBlocked = (d: Date) => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const s = blocked.get(key);
    return s?.has("10:30 AM") && s?.has("6:30 PM");
  };

  const blockedSessionsForSelected = useMemo(() => blocked.get(dateIso) || new Set<string>(), [blocked, dateIso]);

  // Apply time-based blocking for the selected date (hide past sessions today)
  const blockedForRender = useMemo(() => {
    const s = new Set<string>(blockedSessionsForSelected);
    const today = new Date();
    const sameDay = selectedDate.getFullYear() === today.getFullYear() && selectedDate.getMonth() === today.getMonth() && selectedDate.getDate() === today.getDate();
    if (sameDay) {
      const h = today.getHours();
      // After 11:00 AM, hide the 10:30 AM session
      if (h >= 11) s.add("10:30 AM");
      // After 9:00 PM, hide both (effectively forces choosing a later date)
      if (h >= 21) { s.add("10:30 AM"); s.add("6:30 PM"); }
    }
    return s;
  }, [blockedSessionsForSelected, selectedDate]);

  // Default amount by session: Morning 23000, Evening 18000.
  useEffect(() => {
    const prev = prevSessionRef.current;
    const next = session;
    const morning = "10:30 AM";
    const evening = "6:30 PM";
    const morningAmt = "23000";
    const eveningAmt = "18000";
    // If amount is empty or equals the previous default, update to the new default
    const isPrevDefault = (val: string) => (prev === morning && val === morningAmt) || (prev === evening && val === eveningAmt);
    if (!amount || isPrevDefault(amount)) {
      if (next === morning) setAmount(morningAmt);
      else if (next === evening) setAmount(eveningAmt);
    }
    prevSessionRef.current = next;
  }, [session]);

  async function downloadPoojaPassPDF(booking: {
    id: string;
    qr_token?: string;
    date: string;
    session: string;
    name: string;
    email: string;
    phone?: string | null;
    spouse_name?: string | null;
    children_names?: string | null;
    nakshatram?: string | null;
    gothram?: string | null;
  }) {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage();
      const { width, height } = page.getSize();
      const margin = 40;
      const usable = width - margin * 2;
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const title = "Pooja Pass";
      page.drawText(title, { x: margin, y: height - margin - 18, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      let y = height - margin - 36;

      const label = (k: string, v?: string | null) => {
        const txt = `${k}: ${v ?? "-"}`;
        page.drawText(txt, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
        y -= 16;
      };
      label("Name", booking.name);
      label("Email", booking.email);
      if (booking.phone) label("Phone", booking.phone);
      label("Date", booking.date);
      label("Session", booking.session);
      if (booking.spouse_name) label("Spouse", booking.spouse_name);
      if (booking.children_names) label("Children", booking.children_names);
      if (booking.nakshatram) label("Nakshatram", booking.nakshatram);
      if (booking.gothram) label("Gothram", booking.gothram);

      // QR payload and image
      const payload = `POOJA:${booking.id}:${booking.qr_token || ""}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(payload)}`;
      const imgRes = await fetch(qrUrl);
      const imgBuf = new Uint8Array(await imgRes.arrayBuffer());
      const qrImg = await pdf.embedPng(imgBuf);
      const qrSize = Math.min(usable, 220);
      page.drawImage(qrImg, { x: margin, y: Math.max(margin, y - qrSize - 10), width: qrSize, height: qrSize });

      const bytes = await pdf.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pooja-pass-${booking.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Non-blocking
    }
  }

  const book = async () => {
    try {
      const amountNumber = Number(amount);
      if (
        !name.trim() ||
        !email.trim() ||
        !session ||
        !phone.trim() ||
        !spouseName.trim() ||
        !nakshatram.trim() ||
        !gothram.trim() ||
        !utr.trim() ||
        !Number.isFinite(amountNumber) ||
        amountNumber <= 0
      ) {
        show({ title: "Missing info", description: "Please fill all details, enter a valid amount and UTR, and select a session.", variant: "warning" });
        return;
      }
      setSubmitting(true);
      const supabase = getSupabaseBrowserClient();
      // Require Aadhaar/PAN before booking (skip for admins)
      try {
        const envRaw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
        const adminEmails = envRaw.split(/[\s,;]+/).filter(Boolean);
        const isAdmin = adminEmails.length > 0 && adminEmails.includes(String(user.email || "").toLowerCase());
        if (!isAdmin) {
          const ok = await hasIdentityDocument(supabase as any);
          if (!ok) {
            const next = window.location.pathname + window.location.search;
            show({ title: "Identity document required", description: "Please upload Aadhaar or PAN in your profile. Redirecting in 5 seconds…", variant: "warning", durationMs: 5000 });
            setTimeout(() => {
              try { window.location.assign("/profile/edit/?next=" + encodeURIComponent(next)); } catch {}
            }, 5000);
            setSubmitting(false);
            return;
          }
        }
      } catch {}
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user?.id) {
        show({ title: "Sign-in required", description: "Please sign in to book a pooja.", variant: "warning" });
        return;
      }
      const payload = {
        date: dateIso,
        session,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        spouse_name: spouseName.trim(),
        children_names: (childrenNames.trim() || null) as string | null,
        nakshatram: nakshatram.trim(),
        gothram: gothram.trim(),
        amount: amountNumber,
        utr: utr.trim(),
        user_id: user.id,
      } as const;
      const { data: inserted, error } = await supabase.from("Pooja-Bookings").insert(payload).select("*").single();
      if (error || !inserted) {
        show({ title: "Booking failed", description: error?.message || "Could not save booking", variant: "error" });
        return;
      }
      show({ title: "Pooja booked", description: `${dateIso} • ${session}`, variant: "success" });
      // Immediate QR pass download (best-effort)
      try {
        await downloadPoojaPassPDF({
          id: String(inserted.id),
          qr_token: String((inserted as any).qr_token || ""),
          date: dateIso,
          session,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          spouse_name: spouseName.trim(),
          children_names: (childrenNames.trim() || null) as string | null,
          nakshatram: nakshatram.trim(),
          gothram: gothram.trim(),
        });
      } catch {}
      // Best-effort confirmation email
      try {
        await sendEmail({
          to: email.trim(),
          subject: "Pooja booking confirmed",
          text: `Your booking for ${dateIso} (${session}) has been received.`,
          html: `<p>Your booking for <strong>${dateIso}</strong> (<strong>${session}</strong>) has been received.</p>`,
        });
      } catch {}
      setSession("");
      setAmount("");
      setUtr("");
    } catch (e: any) {
      show({ title: "Booking failed", description: e?.message || "Unexpected error", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequireAuth>
      <main className="min-h-[60vh] w-full flex items-start justify-center px-6 pt-24 pb-16">
        <div className="w-full max-w-4xl space-y-8">
          <header className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold">Pooja Booking</h1>
            <p className="mt-2 text-muted-foreground">Booking window: 5 Nov 2025 – 7 Jan 2026. Sessions: 10:30 AM and 6:30 PM.</p>
          </header>

          <section className="rounded-2xl border border-border bg-card/70 p-6 shadow-sm">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h2 className="text-lg font-semibold mb-3">Select Date</h2>
                <Card>
                  <CardContent className="p-4">
                    <div className="max-h-[360px] overflow-y-auto sm:max-h-none">
                      <Calendar
                        selected={selectedDate}
                        onSelect={(d) => { if (!d) return; if (d < START || d > END) return; if (isDateFullyBlocked(d)) return; setSelectedDate(d); }}
                        disabled={(d) => d < START || d > END || isDateFullyBlocked(d)}
                        completed={(d) => {
                          const today = new Date();
                          const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                          const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                          const isNov5 = d.getFullYear() === 2025 && d.getMonth() === 10 && d.getDate() === 5;
                          return isNov5 || d0 < t0; // also mark Nov 5, 2025 as completed
                        }}
                        className="rounded-lg border-0"
                        fromDate={START}
                        toDate={END}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-3">Your Details</h2>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required autoComplete="name" autoCapitalize="words" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" inputMode="email" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" required autoComplete="tel" inputMode="tel" pattern="^\+?[0-9]{10,15}$" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="spouse">Spouse Name</Label>
                    <Input id="spouse" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} placeholder="Spouse name" autoCapitalize="words" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="children">Children Names (optional)</Label>
                    <Textarea id="children" value={childrenNames} onChange={(e) => setChildrenNames(e.target.value)} placeholder="Comma separated or one per line" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="nakshatram">Nakshatram</Label>
                      <Input id="nakshatram" value={nakshatram} onChange={(e) => setNakshatram(e.target.value)} placeholder="e.g., Rohini" autoCapitalize="words" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="gothram">Gothram</Label>
                      <Input id="gothram" value={gothram} onChange={(e) => setGothram(e.target.value)} placeholder="Your Gothram" autoCapitalize="words" required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Session</Label>
                    <select className="w-full rounded-md border border-border bg-background h-9 px-3 py-1 text-base" value={session} onChange={(e) => setSession(e.target.value)} required aria-label="Select session">
                      <option value="">Select a session</option>
                      {!blockedForRender.has("10:30 AM") && (
                        <option value="10:30 AM">Morning — 10:30 AM</option>
                      )}
                      {!blockedForRender.has("6:30 PM") && (
                        <option value="6:30 PM">Evening — 6:30 PM</option>
                      )}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="amount">Amount (₹)</Label>
                      <Input id="amount" type="number" inputMode="decimal" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount paid" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="utr">Transaction ID</Label>
                      <Input id="utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="Enter Transaction ID" required />
                    </div>
                  </div>
                  <div className="pt-4">
                    <GradientButton
                      variant="pooja"
                      onClick={book}
                      disabled={submitting}
                      aria-busy={submitting}
                      className="w-full sm:w-auto"
                    >
                      {submitting ? "Booking…" : "Book Now"}
                    </GradientButton>
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-3">Payment</h2>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div>
                        <img src="/payment.png" alt="Payment QR" className="w-full rounded-lg border" />
                        <p className="text-xs text-muted-foreground mt-2">Scan to pay. Enter amount and UTR in the form.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Note below booking form */}
          <p className="text-center text-sm text-muted-foreground">
            Note: Pooja and Panthulu garu fee is borne by the person taking the pooja.
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Misuse of this booking facility is strictly prohibited. If anyone misuses it, they will be completely terminated from all seva activities.
          </p>
        </div>
      </main>
    </RequireAuth>
  );
}
