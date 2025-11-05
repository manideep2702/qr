"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [annaDate, setAnnaDate] = useState<string>("");
  const [annaSession, setAnnaSession] = useState<string>("all");
  // Pooja retrieval state
  const [poojaDate, setPoojaDate] = useState<string>("");
  const [poojaSession, setPoojaSession] = useState<string>("all");
  const [poojaRows, setPoojaRows] = useState<any[] | null>(null);
  const [poojaLoading, setPoojaLoading] = useState(false);
  const [poojaError, setPoojaError] = useState<string | null>(null);
  // Annadanam retrieval
  const [annaRows, setAnnaRows] = useState<any[] | null>(null);
  const [annaLoading, setAnnaLoading] = useState(false);
  const [annaError, setAnnaError] = useState<string | null>(null);
  // Donations retrieval
  const [donStart, setDonStart] = useState<string>("");
  const [donEnd, setDonEnd] = useState<string>("");
  const [donRows, setDonRows] = useState<any[] | null>(null);
  const [donLoading, setDonLoading] = useState(false);
  const [donError, setDonError] = useState<string | null>(null);
  // Contact retrieval
  const [conStart, setConStart] = useState<string>("");
  const [conEnd, setConEnd] = useState<string>("");
  const [conRows, setConRows] = useState<any[] | null>(null);
  const [conLoading, setConLoading] = useState(false);
  const [conError, setConError] = useState<string | null>(null);
  // Volunteer retrieval
  const [volDate, setVolDate] = useState<string>("");
  const [volEndDate, setVolEndDate] = useState<string>("");
  const [volSession, setVolSession] = useState<string>("all");
  const [volRows, setVolRows] = useState<any[] | null>(null);
  const [volLoading, setVolLoading] = useState(false);
  const [volError, setVolError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useAlert();
  const adminEmailEnvRaw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
  const adminEmails = adminEmailEnvRaw.split(/[\s,;]+/).filter(Boolean);

  useEffect(() => {
    const check = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        const ok = !!user && (adminEmails.length === 0 || adminEmails.includes((user.email || "").toLowerCase()));
        setAuthed(ok);
      } catch {
        setAuthed(false);
      }
    };
    check();
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        setError(signErr.message || "Login failed");
        setAuthed(false);
        return;
      }
      const user = data.user;
      const ok = !!user && (adminEmails.length === 0 || adminEmails.includes((user.email || "").toLowerCase()));
      if (!ok) {
        setError("This account is not authorized for admin.");
        await supabase.auth.signOut();
        setAuthed(false);
        return;
      }
      setAuthed(true);
      show({ title: "Welcome, Admin", description: "Logged in successfully.", variant: "success" });
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {}
    setAuthed(false);
    show({ title: "Logged out", description: "Admin session ended.", variant: "info" });
    if (typeof window !== "undefined") window.location.assign("/");
  };

  // Helper: download generic CSV
  function toCSV(rows: any[], headers: string[], filename: string) {
    if (!Array.isArray(rows)) return;
    const esc = (v: unknown) => {
      const s = (v ?? "").toString();
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) lines.push(headers.map((h) => esc((r as any)[h])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Helper: download JSON
  function toJSONFile(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const downloadAllData = async (format: "json" | "csv") => {
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ start, end }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({} as any));
        throw new Error(msg?.error || `Request failed (${res.status})`);
      }
      const allData = await res.json();

      if (format === "json") {
        const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `admin-export-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else if (format === "csv") {
        const sections = [
          { name: "Users", data: allData.users },
          { name: "Profiles", data: allData.profiles },
          { name: "Pooja Bookings", data: allData.pooja_bookings },
          { name: "Annadanam Bookings", data: allData.annadanam_bookings },
          { name: "Donations", data: allData.donations },
          { name: "Contact Messages", data: allData.contact_messages },
          { name: "Volunteer Bookings", data: allData.volunteer_bookings },
        ];
        let csvContent = `Admin Data Export - ${new Date().toISOString()}\n`;
        csvContent += `Date Range: ${start || "all"} to ${end || "all"}\n\n`;
        for (const section of sections) {
          csvContent += `\n${section.name}\n`;
          if (Array.isArray(section.data) && section.data.length > 0) {
            const headers = Object.keys(section.data[0]);
            csvContent += headers.join(",") + "\n";
            for (const row of section.data) {
              const values = headers.map((h) => {
                const v = (row as any)[h] ?? "";
                const s = typeof v === "object" ? JSON.stringify(v) : String(v);
                return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
              });
              csvContent += values.join(",") + "\n";
            }
          } else {
            csvContent += "No data\n";
          }
        }
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `admin-export-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      show({ title: "Export Complete", description: `Downloaded ${format.toUpperCase()} file successfully.`, variant: "success" });
    } catch (e: any) {
      show({ title: "Export Failed", description: e?.message || "Failed to export data", variant: "destructive" });
    }
  };

  const loadPooja = async () => {
    setPoojaError(null);
    setPoojaLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) {
        setPoojaError("Not authenticated");
        setPoojaRows(null);
        return;
      }
      const res = await fetch("/api/admin/pooja/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: poojaDate, session: poojaSession }),
      });
      if (!res.ok) {
        // Fallback to RPC if server route not available or forbidden
        const sess = poojaSession && poojaSession !== "all" ? poojaSession : null;
        const { data, error } = await supabase.rpc("admin_list_pooja_bookings", {
          start_date: poojaDate || null,
          end_date: poojaDate || null,
          sess,
          limit_rows: 500,
          offset_rows: 0,
        });
        if (error) {
          const j = await res.json().catch(() => ({} as any));
          setPoojaError(j?.error || error.message || `Request failed (${res.status})`);
          setPoojaRows(null);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        setPoojaRows(rows);
        if (rows.length === 0) {
          show({ title: "No results", description: "No pooja bookings match the filters.", variant: "info" });
        }
      } else {
        const j = await res.json();
        const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
        setPoojaRows(rows);
        if (rows.length === 0) {
          show({ title: "No results", description: "No pooja bookings match the filters.", variant: "info" });
        }
      }
    } catch (e: any) {
      setPoojaError(e?.message || "Failed to load pooja bookings");
      setPoojaRows(null);
    } finally {
      setPoojaLoading(false);
    }
  };

  const loadAnnadanam = async () => {
    setAnnaError(null);
    setAnnaLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) {
        setAnnaError("Not authenticated");
        setAnnaRows(null);
        return;
      }
      const res = await fetch("/api/admin/annadanam/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: annaDate, session: annaSession }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        setAnnaError(j?.error || `Request failed (${res.status})`);
        setAnnaRows(null);
        return;
      }
      const j = await res.json();
      const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      setAnnaRows(rows);
      if (rows.length === 0) {
        show({ title: "No results", description: "No Annadanam bookings match the filters.", variant: "info" });
      }
    } catch (e: any) {
      setAnnaError(e?.message || "Failed to load Annadanam bookings");
      setAnnaRows(null);
    } finally {
      setAnnaLoading(false);
    }
  };

  const downloadAnnadanamPDF = async () => {
    if (!annaRows || annaRows.length === 0) {
      alert("Nothing to download. Load Annadanam bookings first.");
      return;
    }
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    let curPage = pdf.addPage();
    const { width, height } = curPage.getSize();
    const margin = 36;
    const usableWidth = width - margin * 2;
    const titleSize = 16;
    const headerSize = 10;
    const cellSize = 9;
    const rowHeight = 18;
    const headerHeight = 22;
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const columns = [
      { key: "date", label: "Date", w: 60 },
      { key: "session", label: "Session", w: 60 },
      { key: "name", label: "Name", w: 140 },
      { key: "phone", label: "Phone", w: 90 },
      { key: "qty", label: "Qty", w: 34 },
      { key: "status", label: "Status", w: 60 },
    ];
    function fit(text: unknown, w: number, f = font, size = cellSize) {
      const s = (text ?? "").toString();
      const ell = "…";
      if (f.widthOfTextAtSize(s, size) <= w - 4) return s;
      let lo = 0, hi = s.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const part = s.slice(0, mid) + ell;
        if (f.widthOfTextAtSize(part, size) <= w - 4) lo = mid; else hi = mid - 1;
      }
      return s.slice(0, lo) + ell;
    }
    function drawHeader(p: typeof curPage, y: number) {
      const title = "Annadanam Bookings" + (annaDate ? ` — ${annaDate}` : "");
      p.drawText(title, { x: margin, y: y - titleSize, size: titleSize, font: fontBold, color: rgb(0, 0, 0) });
      let ty = y - titleSize - 10;
      p.drawRectangle({ x: margin, y: ty - headerHeight + 4, width: usableWidth, height: headerHeight, color: rgb(0.95, 0.95, 0.95) });
      let x = margin + 6;
      for (const c of columns) {
        p.drawText(c.label, { x, y: ty, size: headerSize, font: fontBold, color: rgb(0, 0, 0) });
        x += c.w;
      }
      p.drawLine({ start: { x: margin, y: ty - headerHeight + 2 }, end: { x: width - margin, y: ty - headerHeight + 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      return ty - headerHeight - 2;
    }
    let y = drawHeader(curPage, height - margin);
    for (const r of annaRows) {
      if (y < margin + rowHeight) {
        const np = pdf.addPage([width, height]);
        y = drawHeader(np, height - margin);
        curPage = np;
      }
      let x = margin + 6;
      const cells = [r.date, r.session, r.name, r.phone, r.qty, r.status];
      for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        const text = fit(cells[i], c.w, font, cellSize);
        curPage.drawText(text, { x, y: y, size: cellSize, font, color: rgb(0, 0, 0) });
        x += c.w;
      }
      curPage.drawLine({ start: { x: margin, y: y - 6 }, end: { x: width - margin, y: y - 6 }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
      y -= rowHeight;
    }
    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annadanam-bookings${annaDate ? `-${annaDate}` : ""}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const loadDonations = async () => {
    setDonError(null);
    setDonLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("admin_list_donations", {
        start_ts: donStart ? new Date(donStart).toISOString() : null,
        end_ts: donEnd ? new Date(donEnd).toISOString() : null,
        limit_rows: 500,
        offset_rows: 0,
      });
      if (error) throw error;
      setDonRows(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) {
        show({ title: "No results", description: "No donations match the filters.", variant: "info" });
      }
    } catch (e: any) {
      setDonError(e?.message || "Failed to load donations");
      setDonRows(null);
    } finally {
      setDonLoading(false);
    }
  };

  const loadContacts = async () => {
    setConError(null);
    setConLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("admin_list_contact_us", {
        start_ts: conStart ? new Date(conStart).toISOString() : null,
        end_ts: conEnd ? new Date(conEnd).toISOString() : null,
        limit_rows: 500,
        offset_rows: 0,
      });
      if (error) throw error;
      setConRows(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) {
        show({ title: "No results", description: "No contact messages match the filters.", variant: "info" });
      }
    } catch (e: any) {
      setConError(e?.message || "Failed to load contact messages");
      setConRows(null);
    } finally {
      setConLoading(false);
    }
  };

  const loadVolunteers = async () => {
    setVolError(null);
    setVolLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      if (!token) {
        setVolError("Not authenticated");
        setVolRows(null);
        return;
      }
      const res = await fetch("/api/admin/volunteer/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ start_date: volDate, end_date: volEndDate, session: volSession }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        setVolError(j?.error || `Request failed (${res.status})`);
        setVolRows(null);
        return;
      }
      const j = await res.json();
      const rows: any[] = Array.isArray(j?.rows) ? j.rows : [];
      setVolRows(rows);
      if (rows.length === 0) {
        show({ title: "No results", description: "No volunteer bookings match the filters.", variant: "info" });
      }
    } catch (e: any) {
      setVolError(e?.message || "Failed to load volunteer bookings");
      setVolRows(null);
    } finally {
      setVolLoading(false);
    }
  };

  

  const downloadPoojaCSV = () => {
    if (!poojaRows || poojaRows.length === 0) {
      alert("Nothing to download. Load pooja bookings first.");
      return;
    }
    const headers = [
      "date",
      "session",
      "name",
      "email",
      "phone",
      "spouse_name",
      "children_names",
      "nakshatram",
      "gothram",
      "user_id",
      "created_at",
    ];
    const esc = (v: unknown) => {
      const s = (v ?? "").toString();
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [headers.join(",")];
    for (const r of poojaRows) {
      lines.push(headers.map((h) => esc((r as any)[h])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPoojaPDF = async () => {
    if (!poojaRows || poojaRows.length === 0) {
      alert("Nothing to download. Load pooja bookings first.");
      return;
    }
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    let curPage = pdf.addPage();
    const { width, height } = curPage.getSize();
    const margin = 36;
    const usableWidth = width - margin * 2;

    const titleSize = 16;
    const headerSize = 10;
    const cellSize = 9;
    const rowHeight = 18;
    const headerHeight = 22;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Columns: keep it compact to fit page
    const columns = [
      { key: "date", label: "Date", w: 60 },
      { key: "session", label: "Session", w: 60 },
      { key: "name", label: "Name", w: 140 },
      { key: "phone", label: "Phone", w: 90 },
      { key: "nakshatram", label: "Nakshatram", w: 80 },
      { key: "gothram", label: "Gothram", w: 70 },
    ];

    // Helper to truncate text to fit width
    function fit(text: unknown, w: number, f = font, size = cellSize) {
      const s = (text ?? "").toString();
      const ell = "…";
      if (f.widthOfTextAtSize(s, size) <= w - 4) return s; // padding
      let lo = 0, hi = s.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        const part = s.slice(0, mid) + ell;
        if (f.widthOfTextAtSize(part, size) <= w - 4) lo = mid; else hi = mid - 1;
      }
      return s.slice(0, lo) + ell;
    }

    function drawHeader(p: typeof curPage, y: number) {
      // Title
      const title = "Pooja Bookings" + (poojaDate ? ` — ${poojaDate}` : "");
      p.drawText(title, { x: margin, y: y - titleSize, size: titleSize, font: fontBold, color: rgb(0, 0, 0) });
      let ty = y - titleSize - 10;
      // Header row background
      p.drawRectangle({ x: margin, y: ty - headerHeight + 4, width: usableWidth, height: headerHeight, color: rgb(0.95, 0.95, 0.95) });
      // Column titles
      let x = margin + 6;
      for (const c of columns) {
        p.drawText(c.label, { x, y: ty, size: headerSize, font: fontBold, color: rgb(0, 0, 0) });
        x += c.w;
      }
      // Horizontal line below header
      p.drawLine({ start: { x: margin, y: ty - headerHeight + 2 }, end: { x: width - margin, y: ty - headerHeight + 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      return ty - headerHeight - 2;
    }

    let y = drawHeader(curPage, height - margin);
    for (const r of poojaRows) {
      if (y < margin + rowHeight) {
        const np = pdf.addPage([width, height]);
        y = drawHeader(np, height - margin);
        curPage = np;
      }
      let x = margin + 6;
      const cells = [r.date, r.session, r.name, r.phone, r.nakshatram, r.gothram];
      let maxH = rowHeight;
      // draw each cell
      for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        const text = fit(cells[i], c.w, font, cellSize);
        curPage.drawText(text, { x, y: y, size: cellSize, font, color: rgb(0, 0, 0) });
        x += c.w;
      }
      // row divider
      curPage.drawLine({ start: { x: margin, y: y - 6 }, end: { x: width - margin, y: y - 6 }, thickness: 0.2, color: rgb(0.8, 0.8, 0.8) });
      y -= maxH;
    }

    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPoojaJSON = () => {
    if (!poojaRows || poojaRows.length === 0) {
      alert("Nothing to download. Load pooja bookings first.");
      return;
    }
    const blob = new Blob([JSON.stringify(poojaRows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (authed === null) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-muted-foreground">Checking admin session…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen grid place-items-center p-4">
        <form
          onSubmit={onLogin}
          className="w-full max-w-sm space-y-4 border rounded-xl p-6 shadow bg-card/70"
        >
          <h1 className="text-xl font-semibold">Admin Login</h1>
          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}
          <div className="space-y-2">
            <label className="text-sm" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded border px-3 py-2 bg-background"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              className="w-full rounded border px-3 py-2 bg-background"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-black text-white py-2 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-center">Admin Panel</h1>
          <div className="mt-2 flex justify-end">
            <button onClick={onLogout} className="rounded border px-3 py-1.5">Logout</button>
          </div>
        </div>

        {/* Section Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <button onClick={()=>router.push("/admin/export")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow-sm`}>
            <div className="text-lg font-semibold">Export Data</div>
            <p className="text-sm text-muted-foreground mt-1">Download all sections</p>
          </button>
          <button onClick={()=>router.push("/admin/annadanam")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow-sm`}>
            <div className="text-lg font-semibold">Annadanam</div>
            <p className="text-sm text-muted-foreground mt-1">Filter and export bookings</p>
          </button>
          <button onClick={()=>router.push("/admin/pooja")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow-sm`}>
            <div className="text-lg font-semibold">Pooja</div>
            <p className="text-sm text-muted-foreground mt-1">Filter and export bookings</p>
          </button>
          <button onClick={()=>router.push("/admin/donations")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow-sm`}>
            <div className="text-lg font-semibold">Donations</div>
            <p className="text-sm text-muted-foreground mt-1">Load and download</p>
          </button>
          <button onClick={()=>router.push("/admin/contact")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow-sm`}>
            <div className="text-lg font-semibold">Contact Messages</div>
            <p className="text-sm text-muted-foreground mt-1">Load and export</p>
          </button>
          <button onClick={()=>router.push("/admin/volunteers")} className={`rounded-xl border p-5 text-left bg-card/70 hover:bg-card transition shadow sm`}>
            <div className="text-lg font-semibold">Volunteers</div>
            <p className="text-sm text-muted-foreground mt-1">Load and export</p>
          </button>
        </div>
        {/* The detailed extraction UIs are moved to dedicated pages. */}
      </div>
    </main>
  );
}
