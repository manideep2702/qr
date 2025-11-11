"use client";

import { SignInPage, Testimonial } from "@/components/ui/sign-in";
import { useAlert } from "@/components/ui/alert-provider";
import { useRouter } from "next/navigation";

const sampleTestimonials: Testimonial[] = [];

export default function Page() {
  const router = useRouter();
  const { show } = useAlert();
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const adminEmailListRaw = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "").toLowerCase();
  const fromEnv = adminEmailListRaw.split(/[\s,;]+/).filter(Boolean);
  const fallbackAdmins = ["ssabarisasthass@gmail.com"]; // default admin email
  const adminEmails = Array.from(new Set([...fromEnv, ...fallbackAdmins]));
  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim().toLowerCase();
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value;
    if (!email || !password) {
      show({ title: "Missing details", description: "Please enter email and password.", variant: "warning" });
      return;
    }
    // 1) If email matches configured admin emails, optionally try API login; otherwise fall back to normal sign-in
    if (adminEmails.includes(email.toLowerCase())) {
      try {
        const adminRes = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        // Treat as success ONLY if the endpoint exists and returns a JSON payload with ok: true
        const ct = adminRes.headers.get("content-type") || "";
        let adminJson: any = null;
        if (ct.includes("application/json")) {
          adminJson = await adminRes.json().catch(() => null);
        }
        if (adminJson?.ok === true) {
          router.replace("/admin/");
          return;
        }
        // If the route is missing (static export) or any non-OK, continue with normal sign-in instead of blocking
        // Only show notice if the endpoint actually responded with JSON (real API),
        // otherwise (static export serving HTML with 200) stay silent.
        if (ct.includes("application/json") && adminRes.status && adminRes.status !== 404) {
          const msg = adminJson || ({} as any);
          show({ title: "Admin API unavailable", description: msg?.error || "Continuing with normal sign-in…", variant: "info" });
        }
      } catch {
        // Ignore and continue with normal sign-in
      }
    }
    // 2) Otherwise continue with normal user sign-in.
    // Check if this email belongs to a Google-only account (if server key configured)
    try {
      const r = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
      if (r.ok) {
        const j = await r.json();
        if (j?.exists === true) {
          const providers: string[] = Array.isArray(j.providers) ? j.providers : [];
          const hasGoogle = providers.includes("google");
          const hasEmail = providers.includes("email");
          if (hasGoogle && !hasEmail) {
            // Inform but do not block; allow password attempt in case password was set later
            show({ title: "Google-linked email", description: "This email was previously used with Google. If password sign-in fails, use 'Continue with Google' or set a password via Sign Up/OTP or Forgot Password.", variant: "info", durationMs: 5000 });
          }
        }
      }
    } catch {}
    if (!hasSupabaseEnv) {
      show({ title: "Auth not configured", description: "Contact admin to configure Supabase.", variant: "warning" });
      return;
    }
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Friendly hint if account exists with Google
      const unconfirmed = /email not confirmed/i.test(error.message);
      const hint = /invalid login|invalid credentials|email not confirmed/i.test(error.message)
        ? "\nIf you previously used Google with this email, please use 'Continue with Google'."
        : "";
      show({ title: "Sign-in failed", description: error.message + hint, variant: "error", durationMs: 5000 });
      // If the issue is unconfirmed email, auto-resend the confirmation email
      if (unconfirmed) {
        try {
          const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
          const r = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${siteUrl}/auth/callback` } as any });
          if (!r.error) {
            show({ title: "Verification email resent", description: "Check your inbox to confirm, then sign in.", variant: "info", durationMs: 6000 });
          }
        } catch {}
      }
      return;
    }
    // Ensure profile exists and decide destination
    try {
      const user = data.user;
      if (user) {
        const params = new URLSearchParams(window.location.search);
        const nextParam = params.get("next");
        const fullName = (user.user_metadata?.full_name || user.user_metadata?.name || "").toString();
        const payloadOptions = [
          { user_id: user.id, email: user.email ?? email, name: fullName, full_name: fullName },
          { id: user.id, email: user.email ?? email, name: fullName, full_name: fullName },
        ];
        for (const p of payloadOptions) {
          const res = await supabase.from("Profile-Table").upsert(p, { onConflict: Object.keys(p)[0] as any }).select("*");
          if (!res.error) break;
        }

        // Fetch profile (ensure exists), then redirect to requested page or home
        let { data: row } = await supabase
          .from("Profile-Table")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!row) {
          const second = await supabase
            .from("Profile-Table")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
          row = second.data ?? null;
        }
        const displayName = (row?.name || row?.full_name || fullName || user.email || email || "").toString();
        show({ title: "Welcome", description: `${displayName}`, variant: "success" });
        const next = nextParam || "/";
        router.replace(next);
        return;
      }
    } catch {}

    // Fallback
    router.replace("/");
  };

  const handleGoogleSignIn = async () => {
    try {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseBrowserClient();
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") || "/"; // default to home page
      try { sessionStorage.setItem("ayya.auth.next", next); } catch {}
      const siteUrl = ((typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || "")) as string).replace(/\/$/, "");
      const redirectTo = `${siteUrl}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } },
      });
      if (error) show({ title: "Sign-in failed", description: error.message, variant: "error" });
    } catch (e: any) {
      const msg = e?.message || "Auth not configured";
      show({ title: "Google sign-in unavailable", description: String(msg), variant: "warning" });
    }
  };

  const handleResetPassword = async () => {
    router.push("/auth/forgot-password/");
  };

  const handleCreateAccount = () => {
    router.push("/sign-up/");
  };

  return (
    <div className="bg-background text-foreground">
      <SignInPage
        title={<span className="tracking-tight">Sree Sabari Sastha Seva Samithi (SSSSS)</span>}
        description={
          <span className="block text-sm">
            Sign in to manage donations, volunteer slots, and save favorites.
            <span className="mt-2 block text-xs text-amber-500/90">
              By continuing, you agree to our <a className="underline underline-offset-4 hover:text-amber-400" href="/terms">Terms & Conditions</a>.
            </span>
          </span>
        }
        heroImageSrc="/signin.jpeg"
        testimonials={sampleTestimonials}
        onSignIn={handleSignIn}
        onGoogleSignIn={handleGoogleSignIn}
        onResetPassword={handleResetPassword}
        onCreateAccount={handleCreateAccount}
      />
    </div>
  );
}
