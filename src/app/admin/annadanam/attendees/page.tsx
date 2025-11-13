"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAlert } from "@/components/ui/alert-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import AdminGuard from "../../_components/AdminGuard";

export default function AnnadanamAttendeesPage() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [attendedList, setAttendedList] = useState<any[]>([]);
  const [notAttendedList, setNotAttendedList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"attended" | "not-attended">("attended");
  const router = useRouter();
  const { show } = useAlert();

  async function loadData() {
    if (!selectedDate) {
      show({ title: "Date required", description: "Please select a date", variant: "warning" });
      return;
    }
    
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      
      // Fetch all bookings for the selected date
      const { data, error } = await supabase.rpc("admin_list_annadanam_bookings", {
        start_date: selectedDate,
        end_date: selectedDate,
        sess: null,
        limit_rows: 1000,
        offset_rows: 0,
      });

      if (error) throw error;
      
      let rows: any[] = Array.isArray(data) ? data : [];
      
      // Apply session filter
      if (sessionFilter === "afternoon") {
        const afternoonSessions = ["1:00 PM - 1:30 PM", "1:30 PM - 2:00 PM", "2:00 PM - 2:30 PM", "2:30 PM - 3:00 PM"];
        rows = rows.filter(r => afternoonSessions.includes(r.session));
      } else if (sessionFilter === "evening") {
        const eveningSessions = ["8:00 PM - 8:30 PM", "8:30 PM - 9:00 PM", "9:00 PM - 9:30 PM", "9:30 PM - 10:00 PM"];
        rows = rows.filter(r => eveningSessions.includes(r.session));
      }
      
      // Split into attended and not attended
      const attended = rows.filter(r => r.attended_at !== null);
      const notAttended = rows.filter(r => r.attended_at === null);
      
      setAttendedList(attended);
      setNotAttendedList(notAttended);
      
      show({ 
        title: "Data loaded", 
        description: `Attended: ${attended.length}, Not Attended: ${notAttended.length}`, 
        variant: "success" 
      });
    } catch (e: any) {
      show({ title: "Error", description: e?.message || "Failed to load data", variant: "error" });
      setAttendedList([]);
      setNotAttendedList([]);
    } finally {
      setLoading(false);
    }
  }

  const downloadCSV = (list: any[], filename: string) => {
    if (list.length === 0) {
      show({ title: "No data", description: "Nothing to download", variant: "warning" });
      return;
    }

    const headers = ["Name", "Email", "Phone", "Session", "Qty", "Status", "Attended At"];
    const rows = list.map(r => [
      r.name || "",
      r.email || "",
      r.phone || "",
      r.session || "",
      r.qty || "",
      r.status || "",
      r.attended_at ? String(r.attended_at).slice(0, 19).replace("T", " ") : "—"
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => {
        const str = String(cell);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = (list: any[], filename: string) => {
    if (list.length === 0) {
      show({ title: "No data", description: "Nothing to download", variant: "warning" });
      return;
    }

    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async (list: any[], title: string, filename: string) => {
    if (list.length === 0) {
      show({ title: "No data", description: "Nothing to download", variant: "warning" });
      return;
    }

    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      
      const pageWidth = 842; // A4 landscape
      const pageHeight = 595;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;
      
      // Color palette
      const brandPurple = rgb(0.18, 0.12, 0.38); // #2E1F61
      const accentOrange = rgb(0.95, 0.45, 0.20); // #F27333
      const headerBg = rgb(0.95, 0.96, 0.98); // Light gray-blue
      const evenRowBg = rgb(0.98, 0.99, 1.0); // Very light blue
      const oddRowBg = rgb(1, 1, 1); // White
      const borderColor = rgb(0.85, 0.87, 0.90); // Soft border
      const successGreen = rgb(0.13, 0.69, 0.30); // #22AF4D
      
      let page = pdf.addPage([pageWidth, pageHeight]);
      let yPosition = pageHeight - margin;

      // Decorative header bar
      page.drawRectangle({
        x: 0,
        y: pageHeight - 60,
        width: pageWidth,
        height: 60,
        color: brandPurple
      });

      // Title
      page.drawText("Sree Sabari Sastha Seva Samithi", {
        x: margin,
        y: pageHeight - 35,
        size: 14,
        font: fontBold,
        color: rgb(1, 1, 1)
      });
      
      page.drawText(title, {
        x: margin,
        y: pageHeight - 52,
        size: 20,
        font: fontBold,
        color: accentOrange
      });

      yPosition = pageHeight - 80;

      // Info cards
      const cardHeight = 35;
      const cardWidth = (contentWidth - 20) / 3;
      
      // Date card
      page.drawRectangle({
        x: margin,
        y: yPosition - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.95, 0.97, 0.99),
        borderColor: rgb(0.2, 0.5, 0.9),
        borderWidth: 2
      });
      page.drawText("Date", {
        x: margin + 10,
        y: yPosition - 18,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.5)
      });
      page.drawText(selectedDate, {
        x: margin + 10,
        y: yPosition - 30,
        size: 12,
        font: fontBold,
        color: brandPurple
      });

      // Total records card
      page.drawRectangle({
        x: margin + cardWidth + 10,
        y: yPosition - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.95, 0.99, 0.96),
        borderColor: successGreen,
        borderWidth: 2
      });
      page.drawText("Total Records", {
        x: margin + cardWidth + 20,
        y: yPosition - 18,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.5)
      });
      page.drawText(String(list.length), {
        x: margin + cardWidth + 20,
        y: yPosition - 30,
        size: 12,
        font: fontBold,
        color: successGreen
      });

      // Status card
      page.drawRectangle({
        x: margin + cardWidth * 2 + 20,
        y: yPosition - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: rgb(0.99, 0.97, 0.95),
        borderColor: accentOrange,
        borderWidth: 2
      });
      page.drawText("Status", {
        x: margin + cardWidth * 2 + 30,
        y: yPosition - 18,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.5)
      });
      page.drawText(activeTab === "attended" ? "Attended" : "Not Attended", {
        x: margin + cardWidth * 2 + 30,
        y: yPosition - 30,
        size: 12,
        font: fontBold,
        color: accentOrange
      });

      yPosition -= cardHeight + 25;

      // Table setup
      const headers = activeTab === "attended" 
        ? ["#", "Name", "Email", "Phone", "Session", "Qty", "Attended At"]
        : ["#", "Name", "Email", "Phone", "Session", "Qty", "Status"];
      
      const colWidths = activeTab === "attended"
        ? [30, 110, 140, 85, 115, 35, 120]
        : [30, 120, 145, 90, 120, 35, 70];
      
      const rowHeight = 28;
      const headerHeight = 35;

      // Draw table header with gradient effect
      let xPos = margin;
      page.drawRectangle({
        x: margin,
        y: yPosition - headerHeight,
        width: contentWidth,
        height: headerHeight,
        color: brandPurple
      });

      // Accent line under header
      page.drawRectangle({
        x: margin,
        y: yPosition - headerHeight - 2,
        width: contentWidth,
        height: 2,
        color: accentOrange
      });

      headers.forEach((header, i) => {
        page.drawText(header, {
          x: xPos + 8,
          y: yPosition - 22,
          size: 10,
          font: fontBold,
          color: rgb(1, 1, 1)
        });
        
        // Column dividers
        if (i < headers.length - 1) {
          page.drawLine({
            start: { x: xPos + colWidths[i], y: yPosition - headerHeight },
            end: { x: xPos + colWidths[i], y: yPosition },
            thickness: 1,
            color: rgb(1, 1, 1),
            opacity: 0.3
          });
        }
        
        xPos += colWidths[i];
      });
      yPosition -= headerHeight + 2;

      // Draw table rows
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        
        // Check if we need a new page
        if (yPosition - rowHeight < margin + 30) {
          // Footer for current page
          page.drawText(`Page ${pdf.getPages().length}`, {
            x: pageWidth - margin - 50,
            y: 20,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5)
          });
          
          page = pdf.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - margin;
          
          // Redraw header on new page
          xPos = margin;
          page.drawRectangle({
            x: margin,
            y: yPosition - headerHeight,
            width: contentWidth,
            height: headerHeight,
            color: brandPurple
          });
          
          page.drawRectangle({
            x: margin,
            y: yPosition - headerHeight - 2,
            width: contentWidth,
            height: 2,
            color: accentOrange
          });

          headers.forEach((header, idx) => {
            page.drawText(header, {
              x: xPos + 8,
              y: yPosition - 22,
              size: 10,
              font: fontBold,
              color: rgb(1, 1, 1)
            });
            
            if (idx < headers.length - 1) {
              page.drawLine({
                start: { x: xPos + colWidths[idx], y: yPosition - headerHeight },
                end: { x: xPos + colWidths[idx], y: yPosition },
                thickness: 1,
                color: rgb(1, 1, 1),
                opacity: 0.3
              });
            }
            
            xPos += colWidths[idx];
          });
          yPosition -= headerHeight + 2;
        }

        // Alternate row colors
        const rowColor = i % 2 === 0 ? evenRowBg : oddRowBg;
        page.drawRectangle({
          x: margin,
          y: yPosition - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: rowColor
        });

        // Row border
        page.drawLine({
          start: { x: margin, y: yPosition - rowHeight },
          end: { x: margin + contentWidth, y: yPosition - rowHeight },
          thickness: 0.5,
          color: borderColor
        });

        // Draw cell content
        const rowData = activeTab === "attended"
          ? [
              String(i + 1),
              row.name || "",
              row.email || "",
              row.phone || "",
              row.session || "",
              String(row.qty || ""),
              row.attended_at ? String(row.attended_at).slice(0, 16).replace("T", " ") : "—"
            ]
          : [
              String(i + 1),
              row.name || "",
              row.email || "",
              row.phone || "",
              row.session || "",
              String(row.qty || ""),
              row.status || ""
            ];

        xPos = margin;
        rowData.forEach((text, colIdx) => {
          const maxWidth = colWidths[colIdx] - 16;
          let displayText = String(text);
          
          // Truncate if too long
          while (font.widthOfTextAtSize(displayText, 9) > maxWidth && displayText.length > 0) {
            displayText = displayText.slice(0, -1);
          }
          if (displayText.length < String(text).length) {
            displayText = displayText.slice(0, -3) + "...";
          }

          // Color for serial number
          const textColor = colIdx === 0 ? rgb(0.5, 0.5, 0.6) : rgb(0.15, 0.15, 0.20);

          page.drawText(displayText, {
            x: xPos + 8,
            y: yPosition - 18,
            size: 9,
            font: colIdx === 0 ? fontBold : font,
            color: textColor
          });
          xPos += colWidths[colIdx];
        });

        yPosition -= rowHeight;
      }

      // Footer
      const pageCount = pdf.getPages().length;
      pdf.getPages().forEach((p, idx) => {
        // Footer background
        p.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: 40,
          color: rgb(0.97, 0.97, 0.98)
        });
        
        // Page number
        p.drawText(`Page ${idx + 1} of ${pageCount}`, {
          x: pageWidth - margin - 70,
          y: 18,
          size: 9,
          font: fontBold,
          color: brandPurple
        });
        
        // Generation time
        p.drawText(`Generated: ${new Date().toLocaleString()}`, {
          x: margin,
          y: 18,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5)
        });
        
        // Brand text
        p.drawText("Swamiye Saranam Ayyappa", {
          x: pageWidth / 2 - 65,
          y: 18,
          size: 9,
          font: fontBold,
          color: accentOrange
        });
      });

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      show({ title: "PDF Error", description: e?.message || "Failed to generate PDF", variant: "error" });
    }
  };

  const currentList = activeTab === "attended" ? attendedList : notAttendedList;

  return (
    <AdminGuard>
      <main className="min-h-screen p-6 md:p-10 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Annadanam Attendees</h1>
            <button 
              onClick={() => router.push("/admin/annadanam")} 
              className="rounded border px-4 py-2"
            >
              Back
            </button>
          </div>

          {/* Filters */}
          <div className="rounded-xl border bg-white dark:bg-gray-800 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">Select Date</label>
                <input
                  type="date"
                  className="w-full rounded border px-3 py-2 bg-background"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Session Filter</label>
                <select
                  className="w-full rounded border px-3 py-2 bg-background"
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                >
                  <option value="all">All Sessions</option>
                  <option value="afternoon">Afternoon (1:00 PM - 3:00 PM)</option>
                  <option value="evening">Evening (8:00 PM - 10:00 PM)</option>
                </select>
              </div>
              <button
                onClick={loadData}
                disabled={loading || !selectedDate}
                className="rounded bg-black text-white px-6 py-2 hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load Data"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          {(attendedList.length > 0 || notAttendedList.length > 0) && (
            <>
              <div className="flex gap-2 mb-4 border-b">
                <button
                  onClick={() => setActiveTab("attended")}
                  className={`px-6 py-3 font-medium transition-colors ${
                    activeTab === "attended"
                      ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Attended ({attendedList.length})
                </button>
                <button
                  onClick={() => setActiveTab("not-attended")}
                  className={`px-6 py-3 font-medium transition-colors ${
                    activeTab === "not-attended"
                      ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Not Attended ({notAttendedList.length})
                </button>
              </div>

              {/* Download Buttons */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => downloadCSV(
                    currentList,
                    `annadanam-${activeTab}-${selectedDate}.csv`
                  )}
                  className="rounded border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  📄 Download CSV
                </button>
                <button
                  onClick={() => downloadJSON(
                    currentList,
                    `annadanam-${activeTab}-${selectedDate}.json`
                  )}
                  className="rounded border px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  📦 Download JSON
                </button>
                <button
                  onClick={() => downloadPDF(
                    currentList,
                    `Annadanam ${activeTab === "attended" ? "Attended" : "Not Attended"} List`,
                    `annadanam-${activeTab}-${selectedDate}.pdf`
                  )}
                  className="rounded bg-black text-white px-4 py-2 hover:bg-gray-800"
                >
                  📋 Download PDF
                </button>
              </div>

              {/* Table */}
              <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Name</th>
                        <th className="px-4 py-3 text-left font-medium">Email</th>
                        <th className="px-4 py-3 text-left font-medium">Phone</th>
                        <th className="px-4 py-3 text-left font-medium">Session</th>
                        <th className="px-4 py-3 text-left font-medium">Qty</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        {activeTab === "attended" && (
                          <th className="px-4 py-3 text-left font-medium">Attended At</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {currentList.length === 0 ? (
                        <tr>
                          <td 
                            colSpan={activeTab === "attended" ? 7 : 6} 
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            No records found
                          </td>
                        </tr>
                      ) : (
                        currentList.map((row, idx) => (
                          <tr key={idx} className="border-t hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">{row.name}</td>
                            <td className="px-4 py-3">{row.email}</td>
                            <td className="px-4 py-3">{row.phone || "—"}</td>
                            <td className="px-4 py-3">{row.session}</td>
                            <td className="px-4 py-3">{row.qty}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                {row.status}
                              </span>
                            </td>
                            {activeTab === "attended" && (
                              <td className="px-4 py-3">
                                {row.attended_at 
                                  ? String(row.attended_at).slice(0, 19).replace("T", " ")
                                  : "—"
                                }
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </AdminGuard>
  );
}

