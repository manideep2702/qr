"use client";

import { useEffect, useMemo, useState } from "react";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import AdminGuard from "@/app/admin/_components/AdminGuard";
import { useRouter } from "next/navigation";

type BlockItem = { date: string; session: string };

export default function PoojaBlockPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BlockItem[]>([]);
  const [date, setDate] = useState("");
  const [session, setSession] = useState<string>("");
  const { show } = useAlert();
  const router = useRouter();

  const key = "pooja_blocked_dates";

  const load = async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.from("admin_config").select("value").eq("key", key).maybeSingle();
      if (!error && data?.value) {
        try {
          const raw = JSON.parse(String(data.value));
          const out: BlockItem[] = [];
          if (Array.isArray(raw)) {
            for (const el of raw) {
              if (typeof el === "string") {
                // Legacy: date-level block means both sessions blocked
                out.push({ date: el, session: "10:30 AM" });
                out.push({ date: el, session: "6:30 PM" });
              } else if (el && typeof el === "object" && el.date && el.session) {
                out.push({ date: String(el.date), session: String(el.session) });
              }
            }
          }
          // de-duplicate
          const dedup = Array.from(new Map(out.map(x => [`${x.date}|${x.session}`, x])).values());
          setItems(dedup.sort((a,b)=> a.date.localeCompare(b.date) || a.session.localeCompare(b.session)));
        } catch {
          setItems([]);
        }
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: BlockItem[]) => {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const payload = { key, value: JSON.stringify(next), updated_at: new Date().toISOString() };
      const { error } = await supabase.from("admin_config").upsert(payload, { onConflict: "key" });
      if (error) throw error;
      setItems(next);
      show({ title: "Saved", description: "Blocked sessions updated.", variant: "success" });
    } catch (e: any) {
      show({ title: "Save failed", description: e?.message || "Check RLS policy for admin_config.", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const add = () => {
    if (!date || !session) return;
    const key = `${date}|${session}`;
    const exists = items.some((x) => `${x.date}|${x.session}` === key);
    if (exists) return;
    const next = [...items, { date, session }];
    next.sort((a,b)=> a.date.localeCompare(b.date) || a.session.localeCompare(b.session));
    save(next);
  };
  const remove = (it: BlockItem) => save(items.filter((x) => !(x.date === it.date && x.session === it.session)));

  const grouped = useMemo(() => {
    const m = new Map<string, BlockItem[]>();
    for (const it of items) {
      const arr = m.get(it.date) || [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return Array.from(m.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <AdminGuard>
      <main className="min-h-screen bg-black p-6 md:p-10">
        <div className="mx-auto max-w-6xl">
          {/* Header Section */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                Block Pooja Sessions
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage date and session availability for pooja bookings
              </p>
            </div>
            <button 
              onClick={() => router.push("/admin")} 
              className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              ← Back
            </button>
          </div>

          {/* Add Block Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Add New Block</h2>

            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="d">
                  Date
                </label>
                <input 
                  id="d" 
                  type="date" 
                  value={date} 
                  onChange={(e)=>setDate(e.target.value)} 
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-colors outline-none" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="s">
                  Session
                </label>
                <select 
                  id="s" 
                  value={session} 
                  onChange={(e)=>setSession(e.target.value)} 
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-900 transition-colors outline-none"
                >
                  <option value="">Select session</option>
                  <option value="10:30 AM">Morning — 10:30 AM</option>
                  <option value="6:30 PM">Evening — 6:30 PM</option>
                </select>
              </div>
              
              <button 
                onClick={add} 
                disabled={!date || !session || loading} 
                className="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Adding...' : 'Add Block'}
              </button>
            </div>
          </div>

          {/* Blocked Sessions List */}
          <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
            <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                Blocked Sessions
              </h2>
              <p className="text-sm text-gray-400 mt-1">Review and manage blocked dates</p>
            </div>

            <div className="overflow-x-auto">
              {grouped.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">
                    ✅
                  </div>
                  <p className="text-lg font-medium text-white mb-1">No Blocked Sessions</p>
                  <p className="text-sm text-gray-400">All dates and sessions are open for booking</p>
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Blocked Sessions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 bg-gray-900">
                    {grouped.map(([d, arr]) => (
                      <tr key={d} className="hover:bg-gray-800 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="font-medium text-white">{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            <p className="text-xs text-gray-400">{d}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {arr.map((it) => (
                              <span 
                                key={`${it.date}|${it.session}`} 
                                className="inline-flex items-center gap-2 rounded-lg bg-red-900/30 text-red-300 px-3 py-1.5 text-sm font-medium"
                              >
                                <span>{it.session}</span>
                                <button 
                                  onClick={() => remove(it)} 
                                  className="text-red-400 hover:text-red-300 transition-colors" 
                                  aria-label="Unblock session"
                                  title="Click to unblock"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {arr.length === 2 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-900/30 text-red-300 text-xs font-medium">
                              All blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-900/30 text-green-300 text-xs font-medium">
                              {2 - arr.length} open
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </AdminGuard>
  );
}
