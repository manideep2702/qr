"use client";

import React, { useEffect, useRef, useState } from "react";
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
  } catch {}
  return null;
}

export default function AdminAnnaScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [pending, setPending] = useState<{ id: string; token: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { show } = useAlert();
  const router = useRouter();
  const scanIntervalRef = useRef<any>(null);
  const lastScannedRef = useRef<string>("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Use play() with catch to handle interruptions
          videoRef.current.play().catch(err => {
            // Ignore AbortError when component unmounts or video is interrupted
            if (err.name !== 'AbortError') {
              console.error('Video play error:', err);
            }
          });
        }
        startScanning();
      } catch (err: any) {
        if (mounted) {
          show({ 
            title: "Camera Error", 
            description: "Could not access camera. Please allow camera permissions.", 
            variant: "error" 
          });
        }
      }
    }

    function startScanning() {
      scanIntervalRef.current = setInterval(async () => {
        if (!mounted || !scanning || !videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context?.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const imageData = context?.getImageData(0, 0, canvas.width, canvas.height);
          if (imageData) {
            try {
              // Use jsQR library
              const code = (window as any).jsQR?.(imageData.data, imageData.width, imageData.height);
              if (code?.data && code.data !== lastScannedRef.current) {
                lastScannedRef.current = code.data;
                setScanning(false);
                await handleScannedCode(code.data);
              }
            } catch (err) {
              // Silently ignore scan errors
            }
          }
        }
      }, 300);
    }

    // Load jsQR library
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    script.onload = () => {
      if (mounted) startCamera();
    };
    script.onerror = () => {
      if (mounted) {
        show({ 
          title: "Library Error", 
          description: "Failed to load QR scanner library", 
          variant: "error" 
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      mounted = false;
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scanning]);

  async function handleScannedCode(code: string) {
    if (loading) return;
    setLoading(true);
    
    try {
      const parsed = parseAnnaPayload(code);
      if (!parsed) {
        show({ title: "Invalid QR", description: "Not a valid Annadanam pass QR", variant: "error" });
        setLoading(false);
        setScanning(true);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session) {
        show({ title: "Not Logged In", description: "Please login as admin", variant: "error" });
        router.push("/admin");
        return;
      }

      const { data, error } = await supabase.rpc("lookup_annadanam_pass", { token: parsed.token });
      if (error) {
        show({ title: "Lookup Failed", description: error.message, variant: "error" });
        setLoading(false);
        setScanning(true);
        return;
      }

      const passRow: any = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
      if (!passRow) {
        show({ title: "Not Found", description: "Pass not found in database", variant: "error" });
        setLoading(false);
        setScanning(true);
        return;
      }

      setPreview(passRow);
      setPending(parsed);
      setLoading(false);
    } catch (e: any) {
      show({ title: "Error", description: e?.message || "Failed to process QR", variant: "error" });
      setLoading(false);
      setScanning(true);
    }
  }

  async function confirmAttendance() {
    if (!pending || loading) return;
    setLoading(true);
    
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("mark_annadanam_attended", { token: pending.token });
      
      if (error) {
        show({ title: "Failed", description: error.message, variant: "error" });
        setLoading(false);
        return;
      }

      const updated: any = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
      if (!updated) {
        show({ title: "Failed", description: "Could not mark attendance", variant: "error" });
        setLoading(false);
        return;
      }

      show({ 
        title: "Attendance Confirmed ✓", 
        description: `${updated.name} - ${updated.session}`, 
        variant: "success" 
      });
      
      // Reset and start scanning again
      setPending(null);
      setPreview(null);
      lastScannedRef.current = "";
      setLoading(false);
      setScanning(true);
    } catch (e: any) {
      show({ title: "Error", description: e?.message, variant: "error" });
      setLoading(false);
    }
  }

  function cancelAndRescan() {
    setPending(null);
    setPreview(null);
    lastScannedRef.current = "";
    setScanning(true);
  }

  return (
    <AdminGuard>
      <main className="min-h-screen p-4 md:p-8 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Annadanam Scanner</h1>
            <button 
              onClick={() => router.push("/admin/annadanam")} 
              className="rounded border px-4 py-2"
            >
              Back
            </button>
          </div>

          {/* Camera View */}
          {scanning && (
            <div className="rounded-xl overflow-hidden border-4 border-black bg-black mb-4">
              <video 
                ref={videoRef} 
                className="w-full aspect-video object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="bg-black text-white text-center py-3">
                <p className="text-sm">📷 Position QR code in camera view</p>
              </div>
            </div>
          )}

          {/* Preview Card */}
          {preview && !scanning && (
            <div className="rounded-xl border-2 border-green-500 bg-white dark:bg-gray-800 p-6 space-y-4">
              <h2 className="text-xl font-bold text-green-600">Booking Details</h2>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Name:</span>
                  <span className="font-semibold">{preview.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Email:</span>
                  <span className="font-semibold">{preview.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Phone:</span>
                  <span className="font-semibold">{preview.phone || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Date:</span>
                  <span className="font-semibold">{preview.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Session:</span>
                  <span className="font-semibold">{preview.session}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Quantity:</span>
                  <span className="font-semibold">{preview.qty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Status:</span>
                  <span className="font-semibold capitalize">{preview.status}</span>
                </div>
                {preview.attended_at && (
                  <div className="flex justify-between text-green-600">
                    <span>Already Attended:</span>
                    <span className="font-semibold">
                      {String(preview.attended_at).slice(0,19).replace('T',' ')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={confirmAttendance}
                  disabled={loading || !!preview.attended_at}
                  className="flex-1 rounded bg-green-600 text-white px-6 py-3 font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Confirming..." : preview.attended_at ? "Already Confirmed" : "✓ Confirm Attendance"}
                </button>
                <button
                  onClick={cancelAndRescan}
                  disabled={loading}
                  className="rounded border-2 px-6 py-3 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}
