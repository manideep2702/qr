"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        const listRaw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
        const allowed = listRaw.split(/[,\s;]+/).filter(Boolean);
        const ok = !!user && (allowed.length === 0 || allowed.includes((user.email || "").toLowerCase()));
        if (!ok) {
          router.replace("/admin");
          return;
        }
        setChecking(false);
      } catch {
        router.replace("/admin");
      }
    })();
  }, [router]);

  if (checking) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-muted-foreground">Verifying admin access…</p>
      </main>
    );
  }
  return <>{children}</>;
}

