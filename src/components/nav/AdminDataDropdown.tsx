"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SabarimalaDropdown from "@/components/ui/sabarimala-dropdown";

export default function AdminDataDropdown() {
  const router = useRouter();
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem("ayya.admin.ok") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@/lib/supabase/client");
        const supabase = mod.getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        const user = data?.user as any;
        const email = (user?.email || "").toLowerCase();
        const raw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
        const fromEnv = raw.split(/[\s,;]+/).filter(Boolean);
        const fallback = ["ssabarisasthass@gmail.com"]; // default admin email
        const allowed = Array.from(new Set([...fromEnv, ...fallback]));
        // Show admin if the logged-in email is in the allowed list
        const ok = !!email && allowed.includes(email);
        if (!cancelled) setShow(ok);
        try { localStorage.setItem("ayya.admin.ok", ok ? "1" : "0"); } catch {}
      } catch {
        if (!cancelled) setShow(false);
        try { localStorage.setItem("ayya.admin.ok", "0"); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;
  return (
    <div className="flex items-center px-2">
      <SabarimalaDropdown
        className="relative cursor-pointer text-sm font-semibold px-6 py-2 rounded-full transition-colors bg-white/10 text-white hover:bg-white/20"
        options={[
          { label: "Annadanam List", onClick: () => router.push("/admin/annadanam") },
          { label: "Annadanam Scanner", onClick: () => router.push("/admin/annadanam/scan") },
          { label: "Pooja List", onClick: () => router.push("/admin/pooja") },
          { label: "QR Scanner", onClick: () => router.push("/admin/pooja/scan") },
          { label: "Volunteer List", onClick: () => router.push("/admin/volunteers") },
          { label: "Block Pooja Dates", onClick: () => router.push("/admin/pooja/block") },
        ]}
      >
        Admin
      </SabarimalaDropdown>
    </div>
  );
}
