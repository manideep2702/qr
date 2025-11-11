"use client";

import React from "react";
import AdminGuard from "../../_components/AdminGuard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAlert } from "@/components/ui/alert-provider";
import { useRouter } from "next/navigation";

function parseAnnaPayload(text: string): { id: string; token: string } | null {
  try {
    const s = text.trim();
    if (/^ANNA:/i.test(s)) {
      const parts = s.split(":");
      if (parts.length >= 3) return { id: parts[1], token: parts[2] };
    }
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const id = u.searchParams.get("b") || u.searchParams.get("id") || "";
      const token = u.searchParams.get("t") || u.searchParams.get("token") || "";
      if (id && token) return { id, token };
    }
    if (s.startsWith("{") && s.endsWith("}")) {
      const obj = JSON.parse(s);
      if ((obj.t === "anna" || obj.type === "anna") && obj.id && obj.token) {
        return { id: String(obj.id), token: String(obj.token) };
      }
    }
  } catch {}
  return null;
}

export default function AdminAnnaScanPage() {
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [lastText, setLastText] = React.useState<string>("");
  const [pending, setPending] = React.useState<{ id: string; token: string } | null>(null);
  const [preview, setPreview] = React.useState<any | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const detectorRef = React.useRef<any>(null);
  const { show } = useAlert();
  const router = useRouter();

  React.useEffect(() => {
    let stopped = false;
    async function start() {
      try {
        const hasMedia =
          typeof navigator !== "undefined" &&
          !!(navigator as any).mediaDevices &&
          typeof (navigator as any).mediaDevices.getUserMedia === "function";
        const BD: any = (globalThis as any).BarcodeDetector;
        if (BD) {
          try {
            const types = await BD.getSupportedFormats?.();
            if (Array.isArray(types) && (types.includes("qr_code") || types.includes("qr"))) {
              detectorRef.current = new BD({ formats: ["qr_code"] });
            }
          } catch {}
        }
        if (!hasMedia) {
          show({
            title: "Camera not available",
            description: "Live camera requires HTTPS or a supported browser. You can still use the Manual Code or upload a photo of the QR below.",
            variant: "warning",
          });
          return;
        }
        const st = await (navigator as any).mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) return;
        setStream(st);
        setScanning(true);
        if (videoRef.current) {
          videoRef.current.srcObject = st;
          await videoRef.current.play().catch(() => {});
        }
        const loop = async () => {
          if (!scanning || !videoRef.current) { rafRef.current = requestAnimationFrame(loop); return; }
          const video = videoRef.current;
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 480;
          if (canvasRef.current) {
            const c = canvasRef.current;
            if (c.width !== w) c.width = w;
            if (c.height !== h) c.height = h;
            const ctx = c.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              if (detectorRef.current) {
                try {
                  let codes: any[] = [];
                  try {
                    const canBitmap = typeof createImageBitmap === "function";
                    if (canBitmap) {
                      const bitmap = await createImageBitmap(c as any);
                      codes = await detectorRef.current.detect(bitmap);
                    }
                  } catch {}
                  if (!codes || codes.length === 0) {
                    try { codes = await detectorRef.current.detect(c as any); } catch {}
                  }
                  if ((!codes || codes.length === 0) && videoRef.current) {
                    try { codes = await detectorRef.current.detect(videoRef.current as any); } catch {}
                  }
                  if (Array.isArray(codes) && codes.length > 0) {
                    const raw = codes[0]?.rawValue || "";
                    if (raw && raw !== lastText && !pending) {
                      setLastText(raw);
                      await onScanned(raw);
                    }
                  }
                } catch {}
              }
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e: any) {
        show({ title: "Camera Error", description: e?.message || "Could not access camera. Try using the Upload QR option below.", variant: "error" });
      }
    }
    start();
    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function detectFromFile(file: File) {
    try {
      if (!detectorRef.current) {
        show({ title: "Not Supported", description: "QR detection not supported in this browser. Use Manual Code.", variant: "error" });
        return;
      }
      let codes: any[] | null = null;
      try {
        const bitmap = await createImageBitmap(file as any);
        codes = await detectorRef.current.detect(bitmap);
      } catch {
        codes = null;
      }
      if (!codes || codes.length === 0) {
        const imgUrl = URL.createObjectURL(file);
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = async () => {
            try {
              const c = document.createElement("canvas");
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              const ctx = c.getContext("2d");
              if (ctx) ctx.drawImage(img, 0, 0);
              const out = await detectorRef.current.detect(c);
              codes = Array.isArray(out) ? out : [];
            } finally {
              URL.revokeObjectURL(imgUrl);
              resolve();
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(imgUrl);
            resolve();
          };
          img.src = imgUrl;
        });
      }
      if (codes && codes.length > 0) {
        const raw = codes[0]?.rawValue || "";
        if (raw && !pending) {
          setLastText(raw);
          await onScanned(raw);
          return;
        }
      }
      show({ title: "No QR Found", description: "Could not detect a QR in the selected image.", variant: "warning" });
    } catch (e: any) {
      show({ title: "Upload Error", description: e?.message || "Could not process image", variant: "error" });
    }
  }

  async function onScanned(scannedText: string) {
    try {
      const parsed = parseAnnaPayload(scannedText);
      if (!parsed) {
        show({ title: "Invalid Code", description: "QR not recognized for Annadanam", variant: "error" });
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session) {
        show({ title: "Not Logged In", description: "Please login as admin and retry.", variant: "error" });
        router.push("/admin");
        return;
      }
      // Lookup via Supabase RPC (works for static export)
      setScanning(false);
      const { data, error } = await supabase.rpc("lookup_annadanam_pass", { token: parsed.token });
      if (error) {
        show({ title: "Lookup Failed", description: error.message || "Could not read pass", variant: "error" });
        setScanning(true);
        return;
      }
      const passRow: any = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
      if (!passRow) {
        show({ title: "Lookup Failed", description: "Pass not found", variant: "error" });
        setScanning(true);
        return;
      }
      setPreview(passRow);
      setPending(parsed);
    } catch (e: any) {
      show({ title: "Scan Error", description: e?.message || "Unexpected error", variant: "error" });
    }
  }

  async function confirmAttendance() {
    if (!pending) return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session) {
        show({ title: "Not Logged In", description: "Please login as admin and retry.", variant: "error" });
        router.push("/admin");
        return;
      }
      const { data, error } = await supabase.rpc("mark_annadanam_attended", { token: pending.token });
      if (error) {
        show({ title: "Confirm Failed", description: error.message || "Could not mark attendance", variant: "error" });
        return;
      }
      const updated: any = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
      if (!updated) {
        show({ title: "Confirm Failed", description: "No row returned", variant: "error" });
        return;
      }
      show({ title: "Attendance Marked", description: `${updated?.name || "Devotee"} • ${updated?.date} • ${updated?.session}`, variant: "success" });
      setPending(null);
      setPreview(null);
      setScanning(true);
    } catch (e: any) {
      show({ title: "Confirm Error", description: e?.message || "Unexpected error", variant: "error" });
    }
  }

  function cancelPreview() {
    setPending(null);
    setPreview(null);
    setScanning(true);
  }

  return (
    <AdminGuard>
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Annadanam QR Scanner</h1>
            <button onClick={() => router.push("/admin/annadanam")} className="rounded border px-3 py-1.5">Back</button>
          </div>
          <p className="text-sm text-muted-foreground">Scan the QR to load booking details, then confirm attendance.</p>
          <div className="rounded-xl border overflow-hidden">
            <video ref={videoRef} className="block w-full aspect-[4/3] bg-black" playsInline muted />
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <div className="space-y-2">
            <label className="text-sm">Upload QR (fallback)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) detectFromFile(f);
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Manual Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="w-full rounded border px-3 py-2 bg-background"
                placeholder="ANNA:<id>:<token> or URL with ?b=...&t=..."
                value={lastText}
                onChange={(e) => setLastText(e.target.value)}
              />
              <button
                className="rounded border px-3 py-2"
                onClick={() => onScanned(lastText)}
              >
                Submit
              </button>
            </div>
          </div>
          {preview && (
            <div className="rounded-xl border bg-card/70 p-4 space-y-2">
              <div className="text-sm">Name: <strong>{preview.name}</strong></div>
              <div className="text-sm">Email: {preview.email}</div>
              <div className="text-sm">Date: {preview.date}</div>
              <div className="text-sm">Session: {preview.session}</div>
              <div className="text-sm">Qty: {preview.qty}</div>
              <div className="text-sm">Status: {preview.status}</div>
              <div className="flex gap-3 pt-2">
                <button className="rounded bg-black text-white px-3 py-2" onClick={confirmAttendance}>Confirm Attendance</button>
                <button className="rounded border px-3 py-2" onClick={cancelPreview}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}


