"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
};

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  try {
    // Prefer custom HTTP endpoint (e.g., your Webuzo Python API).
    // Fallback default: same-origin /api/send-email (works when hosting both on one domain).
    const endpoint =
      process.env.NEXT_PUBLIC_EMAIL_ENDPOINT ||
      (typeof window !== "undefined" ? `${window.location.origin}/api/send-email` : undefined);
    if (endpoint) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (r.ok) return true;
      // eslint-disable-next-line no-console
      console.warn("Custom email endpoint error", await r.text());
    }
    // Supabase Edge Function (Resend HTTP API under the hood)
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.functions.invoke("send-email", { body: opts });
    if (error) throw error;
    return true;
  } catch (e) {
    // Do not crash app on email failure; log to console
    // eslint-disable-next-line no-console
    console.warn("sendEmail failed", e);
    return false;
  }
}


