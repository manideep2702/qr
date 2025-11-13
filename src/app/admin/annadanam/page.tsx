"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import AdminGuard from "../_components/AdminGuard";
import { createTablePDF } from "../_components/pdf";

export default function AdminAnnadanamPage() {
  const [annaDate, setAnnaDate] = useState<string>("");
  const [annaSession, setAnnaSession] = useState<string>("all");
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useAlert();

  const hasCompleted = (dateStr?: string, session?: string) => {
    if (!dateStr || !session) return false;
    const endPart = (session.split("-")[1] || "").trim();
    const m = endPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return new Date(dateStr) < new Date(new Date().toISOString().slice(0,10));
    let [_, hh, mm, ap] = m;
    let h = parseInt(hh, 10) % 12;
    if (ap.toUpperCase() === "PM") h += 12;
    const end = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(end.getTime())) return false;
    end.setHours(h, parseInt(mm, 10), 0, 0);
    return new Date() >= end;
  };

  const toCSV = (data: any[], headers: string[], filename: string) => {
    const esc = (v: unknown) => {
      const s = (v ?? "").toString();
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(",")];
    for (const r of data) lines.push(headers.map((h) => esc((r as any)[h])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toJSONFile = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const groupAfternoonTwoHours = annaSession === "1pm-3pm";
      const groupEveningTwoHours = annaSession === "8pm-10pm";
      const isGrouped = groupAfternoonTwoHours || groupEveningTwoHours;
      const sess = !isGrouped && annaSession && annaSession !== "all" ? annaSession : null;
      const { data, error } = await supabase.rpc("admin_list_annadanam_bookings", {
        start_date: annaDate || null,
        end_date: annaDate || null,
        sess,
        limit_rows: 500,
        offset_rows: 0,
      });
      if (error) throw error;
      let r: any[] = Array.isArray(data) ? data : [];
      if (groupAfternoonTwoHours) {
        const afternoonSet = new Set<string>([
          "1:00 PM - 1:30 PM","1:30 PM - 2:00 PM","2:00 PM - 2:30 PM","2:30 PM - 3:00 PM",
        ]);
        r = r.filter((row) => afternoonSet.has(String(row?.session || "")));
      }
      if (groupEveningTwoHours) {
        const eveningSet = new Set<string>([
          "8:00 PM - 8:30 PM","8:30 PM - 9:00 PM","9:00 PM - 9:30 PM","9:30 PM - 10:00 PM",
        ]);
        r = r.filter((row) => eveningSet.has(String(row?.session || "")));
      }
      setRows(r);
      if (r.length === 0) show({ title: "No results", description: "No Annadanam bookings match the filters.", variant: "info" });
    } catch (e: any) {
      setError(e?.message || "Failed to load Annadanam bookings");
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!rows || rows.length === 0) { 
      show({ title: "No data", description: "Nothing to download. Load bookings first.", variant: "warning" });
      return; 
    }

    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      
      // Sanitize text to remove non-WinAnsi characters
      const sanitize = (text: string): string => {
        if (!text) return "";
        // Replace common problematic characters with ASCII equivalents
        return String(text)
          .replace(/['']/g, "'")  // Smart quotes to regular quotes
          .replace(/[""]/g, '"')  // Smart double quotes
          .replace(/[—–]/g, "-")  // Em/en dashes to hyphen
          .replace(/…/g, "...")   // Ellipsis
          .replace(/[^\x20-\x7E]/g, ""); // Remove any non-ASCII printable characters
      };
      
      // Tablet-optimized Portrait format (8.5" x 11" / Letter size)
      const pageWidth = 612;  // Letter width in points
      const pageHeight = 792; // Letter height in points
      const margin = 35;
      const contentWidth = pageWidth - margin * 2;
      
      // Enhanced color palette for modern look
      const primaryPurple = rgb(0.35, 0.15, 0.52);      // Deep purple
      const accentGold = rgb(0.85, 0.65, 0.13);         // Gold accent
      const softBlue = rgb(0.24, 0.52, 0.78);           // Soft blue
      const successGreen = rgb(0.18, 0.72, 0.40);       // Vibrant green
      const warningOrange = rgb(0.95, 0.55, 0.20);      // Warm orange
      const lightGray = rgb(0.96, 0.96, 0.97);          // Light background
      const mediumGray = rgb(0.75, 0.76, 0.78);         // Border color
      const darkText = rgb(0.13, 0.13, 0.15);           // Dark text
      const white = rgb(1, 1, 1);
      
      let page = pdf.addPage([pageWidth, pageHeight]);
      let yPosition = pageHeight - margin;

      // Gradient-style header with decorative elements
      const headerHeight = 110;
      
      // Main header background
      page.drawRectangle({
        x: 0,
        y: pageHeight - headerHeight,
        width: pageWidth,
        height: headerHeight,
        color: primaryPurple
      });

      // Decorative accent stripe
      page.drawRectangle({
        x: 0,
        y: pageHeight - headerHeight,
        width: pageWidth,
        height: 4,
        color: accentGold
      });

      // Decorative side accent
      page.drawRectangle({
        x: 0,
        y: pageHeight - headerHeight,
        width: 8,
        height: headerHeight,
        color: accentGold
      });

      // Logo circle in top-right
      const logoCircleX = pageWidth - 55;
      const logoCircleY = pageHeight - 55;
      const logoCircleSize = 42;
      
      // Draw gold border first
      page.drawCircle({
        x: logoCircleX,
        y: logoCircleY,
        size: logoCircleSize,
        color: accentGold
      });
      
      // Draw white background
      page.drawCircle({
        x: logoCircleX,
        y: logoCircleY,
        size: logoCircleSize - 3,
        color: white
      });
      
      // Try to load and embed the logo using multiple methods
      let logoLoaded = false;
      try {
        const response = await fetch('/logo.jpeg', {
          method: 'GET',
          cache: 'no-cache'
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          
          // Try to embed as JPG
          try {
            const logoImage = await pdf.embedJpg(arrayBuffer);
            const logoSize = logoCircleSize * 1.65;
            
            page.drawImage(logoImage, {
              x: logoCircleX - logoSize / 2,
              y: logoCircleY - logoSize / 2,
              width: logoSize,
              height: logoSize
            });
            
            logoLoaded = true;
            console.log('Logo loaded successfully!');
          } catch (jpgError) {
            console.error('JPG embed failed:', jpgError);
            // Try PNG as fallback
            try {
              const logoImage = await pdf.embedPng(arrayBuffer);
              const logoSize = logoCircleSize * 1.65;
              
              page.drawImage(logoImage, {
                x: logoCircleX - logoSize / 2,
                y: logoCircleY - logoSize / 2,
                width: logoSize,
                height: logoSize
              });
              
              logoLoaded = true;
              console.log('Logo loaded as PNG!');
            } catch (pngError) {
              console.error('PNG embed also failed:', pngError);
            }
          }
        } else {
          console.error('Logo fetch failed with status:', response.status);
        }
      } catch (error) {
        console.error('Logo loading error:', error);
      }
      
      // If logo didn't load, show organization emblem
      if (!logoLoaded) {
        console.log('Using fallback emblem design');
        
        // Inner purple circle
        page.drawCircle({
          x: logoCircleX,
          y: logoCircleY,
          size: logoCircleSize - 8,
          color: primaryPurple
        });
        
        // Draw "SSSS" text
        page.drawText("SSSS", {
          x: logoCircleX - 16,
          y: logoCircleY - 6,
          size: 10,
          font: fontBold,
          color: white
        });
        
        // Small decorative dots
        const dotSize = 2;
        page.drawCircle({ x: logoCircleX, y: logoCircleY + 16, size: dotSize, color: accentGold });
        page.drawCircle({ x: logoCircleX - 14, y: logoCircleY + 11, size: dotSize, color: accentGold });
        page.drawCircle({ x: logoCircleX + 14, y: logoCircleY + 11, size: dotSize, color: accentGold });
      }

      // Organization name
      page.drawText("Sree Sabari Sastha Seva Samithi", {
        x: margin + 5,
        y: pageHeight - 40,
        size: 16,
        font: fontBold,
        color: white
      });
      
      // Report title
      page.drawText("ANNADANAM BOOKINGS REPORT", {
        x: margin + 5,
        y: pageHeight - 65,
        size: 22,
        font: fontBold,
        color: accentGold
      });

      // Subtitle with date/session info
      const subtitleText = annaDate 
        ? `Date: ${annaDate}${annaSession !== 'all' ? ` | Session: ${annaSession}` : ' | All Sessions'}`
        : 'All Dates & Sessions';
      
      page.drawText(sanitize(subtitleText), {
        x: margin + 5,
        y: pageHeight - 88,
        size: 11,
        font,
        color: rgb(0.85, 0.85, 0.9)
      });

      yPosition = pageHeight - headerHeight - 30;

      // Table with modern styling
      const headers = ["#", "Date", "Session", "Name", "Contact", "Qty", "Status"];
      const colWidths = [28, 70, 95, 135, 110, 35, 70];
      const rowHeight = 32;
      const tableHeaderHeight = 40;

      // Table header
      let xPos = margin;
      
      // Header background with gradient effect
      page.drawRectangle({
        x: margin - 2,
        y: yPosition - tableHeaderHeight,
        width: contentWidth + 4,
        height: tableHeaderHeight,
        color: primaryPurple
      });

      // Gold accent line at top
      page.drawRectangle({
        x: margin - 2,
        y: yPosition,
        width: contentWidth + 4,
        height: 3,
        color: accentGold
      });

      // Draw column headers
      headers.forEach((header, i) => {
        const textWidth = fontBold.widthOfTextAtSize(header, 11);
        const centerX = xPos + (colWidths[i] - textWidth) / 2;
        
        page.drawText(header, {
          x: centerX,
          y: yPosition - 25,
          size: 11,
          font: fontBold,
          color: white
        });
        
        // Vertical dividers between columns
        if (i < headers.length - 1) {
          page.drawLine({
            start: { x: xPos + colWidths[i], y: yPosition - tableHeaderHeight },
            end: { x: xPos + colWidths[i], y: yPosition },
            thickness: 1,
            color: white,
            opacity: 0.25
          });
        }
        
        xPos += colWidths[i];
      });
      
      yPosition -= tableHeaderHeight;

      // Draw table rows with enhanced styling
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Check if new page needed
        if (yPosition - rowHeight < margin + 60) {
          // Add page footer
          page.drawRectangle({
            x: 0,
            y: 0,
            width: pageWidth,
            height: 50,
            color: lightGray
          });
          
          page.drawText(`Page ${pdf.getPages().length}`, {
            x: pageWidth / 2 - 25,
            y: 22,
            size: 9,
            font: fontBold,
            color: primaryPurple
          });
          
          page.drawText("Continued on next page...", {
            x: pageWidth - margin - 120,
            y: 22,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5)
          });
          
          // Create new page
          page = pdf.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - margin - 20;
          
          // Redraw header on new page
          xPos = margin;
          page.drawRectangle({
            x: margin - 2,
            y: yPosition - tableHeaderHeight,
            width: contentWidth + 4,
            height: tableHeaderHeight,
            color: primaryPurple
          });
          
          page.drawRectangle({
            x: margin - 2,
            y: yPosition,
            width: contentWidth + 4,
            height: 3,
            color: accentGold
          });

          headers.forEach((header, idx) => {
            const textWidth = fontBold.widthOfTextAtSize(header, 11);
            const centerX = xPos + (colWidths[idx] - textWidth) / 2;
            
            page.drawText(header, {
              x: centerX,
              y: yPosition - 25,
              size: 11,
              font: fontBold,
              color: white
            });
            
            if (idx < headers.length - 1) {
              page.drawLine({
                start: { x: xPos + colWidths[idx], y: yPosition - tableHeaderHeight },
                end: { x: xPos + colWidths[idx], y: yPosition },
                thickness: 1,
                color: white,
                opacity: 0.25
              });
            }
            
            xPos += colWidths[idx];
          });
          
          yPosition -= tableHeaderHeight;
        }

        // Alternating row colors with subtle styling
        const rowColor = i % 2 === 0 ? white : lightGray;
        page.drawRectangle({
          x: margin - 2,
          y: yPosition - rowHeight,
          width: contentWidth + 4,
          height: rowHeight,
          color: rowColor
        });

        // Row border
        page.drawLine({
          start: { x: margin - 2, y: yPosition - rowHeight },
          end: { x: margin + contentWidth + 2, y: yPosition - rowHeight },
          thickness: 0.5,
          color: mediumGray,
          opacity: 0.4
        });

        // Prepare row data
        const sessionShort = (row.session || "").replace(" PM", "PM").replace(" AM", "AM");
        const contactInfo = row.phone || row.email || "";
        
        const rowData = [
          String(i + 1),
          sanitize(row.date || ""),
          sanitize(sessionShort),
          sanitize(row.name || ""),
          sanitize(contactInfo),
          String(row.qty || ""),
          sanitize(row.status || "")
        ];

        // Draw cells with proper alignment
        xPos = margin;
        rowData.forEach((text, colIdx) => {
          const maxWidth = colWidths[colIdx] - 12;
          let displayText = String(text);
          
          // Truncate if needed
          const testFont = (colIdx === 0 || colIdx === 7) ? fontBold : font;
          const testSize = (colIdx === 0 || colIdx === 7) ? 10 : 9.5;
          
          while (testFont.widthOfTextAtSize(displayText, testSize) > maxWidth && displayText.length > 0) {
            displayText = displayText.slice(0, -1);
          }
          if (displayText.length < String(text).length && displayText.length > 3) {
            displayText = displayText.slice(0, -3) + "...";
          }

          // Color coding
          let textColor = darkText;
          let textFont = font;
          let textSize = 9.5;
          
          if (colIdx === 0) { // Row number
            textColor = rgb(0.55, 0.55, 0.60);
            textFont = fontBold;
            textSize = 10;
          } else if (colIdx === 6) { // Status
            textColor = row.status === 'confirmed' ? successGreen : rgb(0.55, 0.55, 0.60);
            textFont = fontBold;
          }

          // Center align for specific columns
          const shouldCenter = [0, 5, 6].includes(colIdx);
          let xOffset = xPos + 6;
          
          if (shouldCenter) {
            const textWidth = textFont.widthOfTextAtSize(displayText, textSize);
            xOffset = xPos + (colWidths[colIdx] - textWidth) / 2;
          }

          page.drawText(displayText, {
            x: xOffset,
            y: yPosition - rowHeight + 10,
            size: textSize,
            font: textFont,
            color: textColor
          });
          
          xPos += colWidths[colIdx];
        });

        yPosition -= rowHeight;
      }

      // Enhanced footer for all pages
      const pageCount = pdf.getPages().length;
      pdf.getPages().forEach((p, idx) => {
        // Footer background
        p.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: 50,
          color: lightGray
        });
        
        // Decorative top border
        p.drawRectangle({
          x: 0,
          y: 48,
          width: pageWidth,
          height: 2,
          color: accentGold
        });
        
        // Page number (center)
        const pageText = `Page ${idx + 1} of ${pageCount}`;
        const pageTextWidth = fontBold.widthOfTextAtSize(pageText, 10);
        p.drawText(pageText, {
          x: (pageWidth - pageTextWidth) / 2,
          y: 24,
          size: 10,
          font: fontBold,
          color: primaryPurple
        });
        
        // Generated timestamp (left)
        const timestamp = new Date().toLocaleString('en-US', { 
          dateStyle: 'medium', 
          timeStyle: 'short' 
        });
        p.drawText(sanitize(`Generated: ${timestamp}`), {
          x: margin,
          y: 24,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5)
        });
        
        // Blessing text (right)
        p.drawText("Swamiye Saranam Ayyappa", {
          x: pageWidth - margin - 140,
          y: 24,
          size: 9,
          font: fontBold,
          color: accentGold
        });
      });

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annadanam-bookings${annaDate ? `-${annaDate}` : ""}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      show({ 
        title: "PDF Generated", 
        description: `Successfully exported ${rows.length} booking(s)`, 
        variant: "success" 
      });
    } catch (e: any) {
      show({ title: "PDF Error", description: e?.message || "Failed to generate PDF", variant: "error" });
    }
  };

  const attendedCount = rows?.filter(r => r.attended_at).length || 0;
  const totalCount = rows?.length || 0;

  return (
    <AdminGuard>
      <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
                Annadanam Bookings
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and track Annadanam reservations
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => router.push("/admin")} 
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
              >
                Back
              </button>
              <button 
                onClick={() => router.push("/admin/annadanam/scan")} 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                QR Scanner
              </button>
              <button 
                onClick={() => router.push("/admin/annadanam/attendees")} 
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Attendees
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          {rows && rows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Bookings</p>
                    <p className="text-3xl font-semibold text-gray-900 dark:text-white mt-2">{totalCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-2xl">
                    📋
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Attended</p>
                    <p className="text-3xl font-semibold text-green-600 dark:text-green-400 mt-2">{attendedCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-2xl">
                    ✓
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending</p>
                    <p className="text-3xl font-semibold text-orange-600 dark:text-orange-400 mt-2">{totalCount - attendedCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center text-2xl">
                    ⏱
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="annaDate">
                  Date
                </label>
                <input 
                  id="annaDate" 
                  type="date" 
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  value={annaDate} 
                  onChange={(e)=>setAnnaDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="annaSession">
                  Session
                </label>
                <select 
                  id="annaSession" 
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                  value={annaSession} 
                  onChange={(e)=>setAnnaSession(e.target.value)}
                >
                  <option value="all">All Sessions</option>
                  <option value="1pm-3pm">Afternoon (1:00 PM - 3:00 PM)</option>
                  <option value="8pm-10pm">Evening (8:00 PM - 10:00 PM)</option>
                  <option>1:00 PM - 1:30 PM</option>
                  <option>1:30 PM - 2:00 PM</option>
                  <option>2:00 PM - 2:30 PM</option>
                  <option>2:30 PM - 3:00 PM</option>
                  <option>8:00 PM - 8:30 PM</option>
                  <option>8:30 PM - 9:00 PM</option>
                  <option>9:00 PM - 9:30 PM</option>
                  <option>9:30 PM - 10:00 PM</option>
                </select>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={load} 
                disabled={loading} 
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Loading..." : "Load Data"}
              </button>
              <button 
                onClick={() => rows && toJSONFile(rows, `annadanam-bookings${annaDate?`-${annaDate}`:``}.json`)} 
                className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors disabled:opacity-50"
                disabled={!rows || rows.length === 0}
              >
                Export JSON
              </button>
              <button 
                onClick={() => rows && toCSV(rows, ["date","session","name","email","phone","qty","status","user_id","created_at"], `annadanam-bookings${annaDate?`-${annaDate}`:""}.csv`)} 
                className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors disabled:opacity-50"
                disabled={!rows || rows.length === 0}
              >
                Export CSV
              </button>
              <button 
                onClick={downloadPDF} 
                className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors disabled:opacity-50"
                disabled={!rows || rows.length === 0}
              >
                Export PDF
              </button>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Table */}
          {Array.isArray(rows) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Session</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attended</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                              <span className="text-3xl">📭</span>
                            </div>
                            <p className="text-gray-900 dark:text-white font-medium mb-1">No bookings found</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => {
                        const completed = hasCompleted(r.date, r.session);
                        const isAttended = r.attended_at !== null;
                        return (
                        <tr 
                          key={i} 
                          className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                        >
                          <td className={`px-4 py-3 text-sm whitespace-nowrap ${completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white font-medium'}`}>
                            {r.date}
                          </td>
                          <td className={`px-4 py-3 text-sm ${completed ? 'line-through text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
                            {r.session}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{r.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.phone}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs font-semibold rounded-full">
                              {r.qty}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              r.status === 'confirmed' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isAttended ? (
                              <span className="inline-flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-lg font-bold">✓</span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-700">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {r.created_at?.slice(0,19).replace('T',' ')}
                          </td>
                        </tr>
                      );})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}
