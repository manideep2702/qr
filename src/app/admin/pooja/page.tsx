"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import AdminGuard from "../_components/AdminGuard";
import { createTablePDF } from "../_components/pdf";

export default function AdminPoojaPage() {
  const [poojaDate, setPoojaDate] = useState<string>("");
  const [poojaSession, setPoojaSession] = useState<string>("all");
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useAlert();

  const canDownload = (() => {
    try {
      if (!poojaDate) return true;
      if (poojaSession === "all") return true;
      const today = new Date();
      const [y, m, d] = poojaDate.split("-").map((v) => parseInt(v, 10));
      if (!y || !m || !d) return true;
      const target = new Date(y, m - 1, d, 0, 0, 0, 0);
      const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (target < todayMid) return true; // past dates: always allow
      if (target > todayMid) return false; // future: disallow
      // same day: enforce time thresholds
      const threshold = new Date(target);
      if (poojaSession === "10:30 AM") {
        threshold.setHours(15, 0, 0, 0); // 3:00 PM
      } else if (poojaSession === "6:30 PM") {
        threshold.setHours(22, 0, 0, 0); // 10:00 PM
      } else {
        return true;
      }
      return today >= threshold;
    } catch {
      return true;
    }
  })();

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const sess = poojaSession && poojaSession !== "all" ? poojaSession : null;
      const { data, error } = await supabase.rpc("admin_list_pooja_bookings", {
        start_date: poojaDate || null,
        end_date: poojaDate || null,
        sess,
        limit_rows: 500,
        offset_rows: 0,
      });
      if (error) throw error;
      const r: any[] = Array.isArray(data) ? data : [];
      setRows(r);
      if (r.length === 0) show({ title: "No results", description: "No pooja bookings match the filters.", variant: "info" });
    } catch (e: any) {
      setError(e?.message || "Failed to load pooja bookings");
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!rows || rows.length === 0) {
      alert("Nothing to download. Load pooja bookings first.");
      return;
    }
    const headers = [
      "date","session","name","email","phone","spouse_name","children_names","nakshatram","gothram","user_id","created_at"
    ];
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
    a.download = `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (!rows || rows.length === 0) {
      alert("Nothing to download. Load pooja bookings first.");
      return;
    }
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (!rows || rows.length === 0) { alert("Nothing to download. Load pooja bookings first."); return; }
    await createTablePDF(
      "Pooja Bookings",
      poojaDate || undefined,
      [
        { key: "date", label: "Date", w: 90 },
        { key: "session", label: "Session", w: 100, align: "center" },
        { key: "name", label: "Name", w: 180 },
        { key: "email", label: "Email", w: 220 },
        { key: "phone", label: "Phone", w: 130 },
        { key: "spouse_name", label: "Spouse", w: 160 },
        { key: "children_names", label: "Children", w: 200 },
        { key: "nakshatram", label: "Nakshatram", w: 110 },
        { key: "gothram", label: "Gothram", w: 100 },
        { key: "attended_at", label: "Attended At", w: 130 },
      ],
      rows,
      `pooja-bookings${poojaDate ? `-${poojaDate}` : ""}`
    );
  };

  return (
    <AdminGuard>
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-center">Pooja</h1>
          <div className="mt-2 flex justify-between">
            <button onClick={() => router.push("/admin")} className="rounded border px-3 py-1.5">Back</button>
            <button onClick={() => router.push("/admin/pooja/scan")} className="rounded border px-3 py-1.5">QR Scanner</button>
          </div>

          <div className="rounded-xl border p-6 space-y-4 bg-card/70 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm" htmlFor="poojaDate">Date</label>
                <input id="poojaDate" type="date" className="w-full rounded border px-3 py-2 bg-background" value={poojaDate} onChange={(e)=>setPoojaDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm" htmlFor="poojaSession">Timing</label>
                <select id="poojaSession" className="w-full rounded border px-3 py-2 bg-background" value={poojaSession} onChange={(e)=>setPoojaSession(e.target.value)}>
                  <option value="all">All Timings</option>
                  <option value="10:30 AM">10:30 AM</option>
                  <option value="6:30 PM">6:30 PM</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2 flex-wrap">
              <button onClick={load} disabled={loading} className="rounded bg-black text-white px-4 py-2">{loading ? "Loading…" : "Load Bookings"}</button>
              <button onClick={downloadJSON} disabled={!canDownload} title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} className="rounded border px-4 py-2 disabled:opacity-60">Download JSON</button>
              <button onClick={downloadCSV} disabled={!canDownload} title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} className="rounded border px-4 py-2 disabled:opacity-60">Download CSV</button>
              <button onClick={downloadPDF} disabled={!canDownload} title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} className="rounded border px-4 py-2 disabled:opacity-60">Download PDF</button>
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            {Array.isArray(rows) && (
              <div className="overflow-x-auto border rounded-lg">
                <div className="p-3 text-sm text-muted-foreground">
                  {(() => {
                    const total = rows.length;
                    const attended = rows.filter((r: any) => !!r.attended_at).length;
                    return <span>Attended: <strong>{attended}</strong> / Total: <strong>{total}</strong></span>;
                  })()}
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Session</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Phone</th>
                      <th className="px-3 py-2 text-left font-medium">Spouse</th>
                      <th className="px-3 py-2 text-left font-medium">Children</th>
                      <th className="px-3 py-2 text-left font-medium">Nakshatram</th>
                      <th className="px-3 py-2 text-left font-medium">Gothram</th>
                      <th className="px-3 py-2 text-left font-medium">Attended</th>
                      <th className="px-3 py-2 text-left font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td className="px-3 py-3" colSpan={11}>No records.</td></tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{r.date}</td>
                          <td className="px-3 py-2">{r.session}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2">{r.email}</td>
                          <td className="px-3 py-2">{r.phone}</td>
                          <td className="px-3 py-2">{r.spouse_name}</td>
                          <td className="px-3 py-2">{r.children_names}</td>
                          <td className="px-3 py-2">{r.nakshatram}</td>
                          <td className="px-3 py-2">{r.gothram}</td>
                          <td className="px-3 py-2">{r.attended_at ? String(r.attended_at).slice(0,19).replace('T',' ') : "—"}</td>
                          <td className="px-3 py-2">{r.created_at?.slice(0, 19).replace('T', ' ')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </AdminGuard>
  );
}


