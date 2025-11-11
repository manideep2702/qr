"use client";

import React from "react";
import AdminGuard from "../../_components/AdminGuard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAlert } from "@/components/ui/alert-provider";
import { useRouter } from "next/navigation";

function parsePoojaPayload(text: string): { id: string; token: string } | null {
  try {
    const s = text.trim();
    // Format 1: POOJA:<id>:<token>
    if (/^POOJA:/i.test(s)) {
      const parts = s.split(":");
      if (parts.length >= 3) {
        return { id: parts[1], token: parts[2] };
      }
    }
    // Format 2: URL with ?b=<id>&t=<token> or ?id=&token=
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      const id = u.searchParams.get("b") || u.searchParams.get("id") || "";
      const token = u.searchParams.get("t") || u.searchParams.get("token") || "";
      if (id && token) return { id, token };
    }
    // Format 3: JSON {"t":"pooja","id":"...","token":"..."}
    if (s.startsWith("{") && s.endsWith("}")) {
      const obj = JSON.parse(s);
      if ((obj.t === "pooja" || obj.type === "pooja") && obj.id && obj.token) {
        return { id: String(obj.id), token: String(obj.token) };
      }
    }
  } catch {}
  return null;
}

export default function AdminPoojaScanPage() {
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [lastText, setLastText] = React.useState<string>("");
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

        // Prepare BarcodeDetector if supported (used for live and image upload)
        const BarcodeDetectorAny: any = (globalThis as any).BarcodeDetector;
        if (BarcodeDetectorAny) {
          try {
            const types = await BarcodeDetectorAny.getSupportedFormats?.();
            if (Array.isArray(types) && (types.includes("qr_code") || types.includes("qr"))) {
              detectorRef.current = new BarcodeDetectorAny({ formats: ["qr_code"] });
            }
          } catch {}
        }

        if (!hasMedia) {
          // Graceful notice for non-secure origins / unsupported browsers
          show({
            title: "Camera not available",
            description:
              "Live camera requires HTTPS or a supported browser. You can still use the Manual Code or upload a photo of the QR below.",
            variant: "warning",
          });
          return;
        }

        const st = await (navigator as any).mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
                  const bitmap = await createImageBitmap(c);
                  const codes = await detectorRef.current.detect(bitmap);
                  if (Array.isArray(codes) && codes.length > 0) {
                    const raw = codes[0]?.rawValue || "";
                    if (raw && raw !== lastText) {
                      setLastText(raw);
                      await markAttendance(raw);
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
        show({
          title: "Camera Error",
          description: e?.message || "Could not access camera. Try using the Upload QR option below.",
          variant: "error",
        });
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

  async function markAttendance(scannedText: string) {
    try {
      const parsed = parsePoojaPayload(scannedText);
      if (!parsed) {
        show({ title: "Invalid Code", description: "QR not recognized for Pooja", variant: "error" });
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      const access = s?.session?.access_token;
      if (!access) {
        show({ title: "Not Logged In", description: "Please login as admin and retry.", variant: "error" });
        router.push("/admin");
        return;
      }
      const res = await fetch("/api/admin/pooja/attendance/mark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({ id: parsed.id, token: parsed.token }),
      });
      const j = await res.json();
      if (!res.ok) {
        show({ title: "Scan Failed", description: j?.error || "Could not mark attendance", variant: "error" });
        return;
      }
      show({ title: "Attendance Marked", description: `${j?.row?.name || "Devotee"} • ${j?.row?.date} • ${j?.row?.session}`, variant: "success" });
    } catch (e: any) {
      show({ title: "Scan Error", description: e?.message || "Unexpected error", variant: "error" });
    }
  }

  async function detectFromFile(file: File) {
    try {
      if (!detectorRef.current) {
        show({ title: "Not Supported", description: "QR detection not supported in this browser. Use Manual Code.", variant: "error" });
        return;
      }
      // Try ImageBitmap first
      let codes: any[] | null = null;
      try {
        const bitmap = await createImageBitmap(file as any);
        codes = await detectorRef.current.detect(bitmap);
      } catch {
        codes = null;
      }
      // Fallback via canvas draw
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
        if (raw) {
          setLastText(raw);
          await markAttendance(raw);
          return;
        }
      }
      show({ title: "No QR Found", description: "Could not detect a QR in the selected image.", variant: "warning" });
    } catch (e: any) {
      show({ title: "Upload Error", description: e?.message || "Could not process image", variant: "error" });
    }
  }

  return (
    <AdminGuard>
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Pooja QR Scanner</h1>
            <button onClick={() => router.push("/admin/pooja")} className="rounded border px-3 py-1.5">Back</button>
          </div>
          <p className="text-sm text-muted-foreground">Point the camera at the devotee’s QR. Attendance will be marked automatically if valid.</p>
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
                placeholder="POOJA:<id>:<token> or URL with ?b=...&t=..."
                value={lastText}
                onChange={(e) => setLastText(e.target.value)}
              />
              <button
                className="rounded border px-3 py-2"
                onClick={() => markAttendance(lastText)}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </main>
    </AdminGuard>
  );
}


