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
      <main className="min-h-screen bg-black p-6 md:p-10">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                Pooja Bookings
              </h1>
              <p className="text-gray-400">
                View and manage pooja reservations
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => router.push("/admin")} 
                className="px-5 py-2.5 text-sm font-medium text-gray-300 bg-gray-900 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
              >
                ← Back
              </button>
              <button 
                onClick={() => router.push("/admin/pooja/scan")} 
                className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
              >
                QR Scanner
              </button>
            </div>
          </div>

          {/* Filters Section */}
          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-6">Filters</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="poojaDate">
                  Date
                </label>
                <input 
                  id="poojaDate" 
                  type="date" 
                  className="w-full rounded-lg border border-gray-600 px-4 py-2.5 bg-gray-800 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-900 transition-colors outline-none" 
                  value={poojaDate} 
                  onChange={(e)=>setPoojaDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="poojaSession">
                  Session
                </label>
                <select 
                  id="poojaSession" 
                  className="w-full rounded-lg border border-gray-600 px-4 py-2.5 bg-gray-800 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-900 transition-colors outline-none" 
                  value={poojaSession} 
                  onChange={(e)=>setPoojaSession(e.target.value)}
                >
                  <option value="all">All Sessions</option>
                  <option value="10:30 AM">Morning — 10:30 AM</option>
                  <option value="6:30 PM">Evening — 6:30 PM</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 flex-wrap">
              <button 
                onClick={load} 
                disabled={loading} 
                className="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Loading..." : "Load Data"}
              </button>
              <button 
                onClick={downloadJSON} 
                disabled={!canDownload} 
                title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} 
                className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export JSON
              </button>
              <button 
                onClick={downloadCSV} 
                disabled={!canDownload} 
                title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} 
                className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export CSV
              </button>
              <button 
                onClick={downloadPDF} 
                disabled={!canDownload} 
                title={!canDownload ? "Available after 3 PM (10:30 AM) or 10 PM (6:30 PM) on selected day" : undefined} 
                className="px-4 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export PDF
              </button>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          {/* Results */}
          {Array.isArray(rows) && (
            <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
              <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Bookings List
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {(() => {
                      const total = rows.length;
                      const attended = rows.filter((r: any) => !!r.attended_at).length;
                      return `Attended: ${attended} / Total: ${total}`;
                    })()}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                {rows.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
                      📭
                    </div>
                    <p className="text-lg font-medium text-white mb-1">No Bookings Found</p>
                    <p className="text-sm text-gray-400">Try adjusting your filters</p>
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-800 border-b border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Session</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Spouse</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Children</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nakshatram</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Gothram</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Attended</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-900">
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-800 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-white font-medium">{r.date}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-300">{r.session}</td>
                          <td className="px-4 py-3 text-white font-medium">{r.name}</td>
                          <td className="px-4 py-3 text-gray-400">{r.email}</td>
                          <td className="px-4 py-3 text-gray-400">{r.phone}</td>
                          <td className="px-4 py-3 text-gray-400">{r.spouse_name || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{r.children_names || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{r.nakshatram || "—"}</td>
                          <td className="px-4 py-3 text-gray-400">{r.gothram || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            {r.attended_at ? (
                              <span className="inline-flex items-center justify-center w-8 h-8 bg-green-900/30 text-green-400 rounded-full font-bold">✓</span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">{r.created_at?.slice(0, 19).replace('T', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}


