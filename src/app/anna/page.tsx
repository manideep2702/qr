"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AnnaPassPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [row, setRow] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams(window.location.search);
        const id = String(sp.get("b") || sp.get("id") || "").trim();
        const token = String(sp.get("t") || sp.get("token") || "").trim();
        if (!token) {
          setError("Missing QR token");
          setLoading(false);
          return;
        }
        const supabase = getSupabaseBrowserClient();
        // Query by token using RPC (works for static export)
        const { data, error } = await supabase.rpc("lookup_annadanam_pass", { token });
        if (error) {
          setError(error.message || "Invalid or expired pass");
          setLoading(false);
          return;
        }
        const passRow: any = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
        if (!passRow) {
          setError("Invalid or expired pass");
          setLoading(false);
          return;
        }
        setRow(passRow);
      } catch (e: any) {
        setError(e?.message || "Failed to load pass");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Annadanam Pass</h1>
        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        {row && (
          <div className="mt-4 rounded-xl border bg-card/70 p-6 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Booking ID</div>
              <div className="font-mono text-xs">{row.id}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="text-sm">{row.name}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Email</div>
              <div className="text-sm">{row.email}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Date</div>
              <div className="text-sm">{row.date}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Session</div>
              <div className="text-sm">{row.session}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Qty</div>
              <div className="text-sm">{row.qty}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="text-sm">{row.status}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Attended</div>
              <div className="text-sm">{row.attended_at ? String(row.attended_at).slice(0,19).replace('T',' ') : "—"}</div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Show this pass to the admin volunteer at the Annadanam counter during your session time.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}


