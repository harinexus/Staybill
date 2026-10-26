
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Chart from "chart.js/auto";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart() {
  const now = new Date();
  return getLocalDateString(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(timestamp) {
  if (!timestamp) return "—";

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN");
}

export default function Reports() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getLocalDateString);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bills"),
      (snapshot) => {
        setBills(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load sales reports:", err);
        setError(
          "Unable to load reports. Check your access and try again."
        );
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const reportBills = useMemo(() => {
    if (startDate && endDate && startDate > endDate) return [];

    return bills.filter((bill) => {
      const createdAt = bill.createdAt;
      if (!createdAt) return false;

      const dateObject =
        typeof createdAt.toDate === "function"
          ? createdAt.toDate()
          : new Date(createdAt);

      if (Number.isNaN(dateObject.getTime())) return false;

      const date = getLocalDateString(dateObject);

      return (
        (!startDate || date >= startDate) &&
        (!endDate || date <= endDate)
      );
    });
  }, [bills, startDate, endDate]);

  const totals = useMemo(
    () =>
      reportBills.reduce(
        (result, bill) => {
          result.sales += Number(bill.grandTotal) || 0;
          result.collected += Number(bill.paidAmount) || 0;
          result.pending += Math.max(
            0,
            Number(bill.balanceAmount) || 0
          );
          return result;
        },
        { sales: 0, collected: 0, pending: 0 }
      ),
    [reportBills]
  );

  function exportCSV() {
    const headers = [
      "Bill ID",
      "Guest",
      "Room",
      "Created Date",
      "Total Sales",
      "Amount Collected",
      "Pending Amount",
      "Payment Status",
    ];

    const rows = reportBills.map((bill) => [
      bill.id,
      bill.guestName || "",
      bill.roomNumber || "",
      formatDate(bill.createdAt),
      Number(bill.grandTotal) || 0,
      Number(bill.paidAmount) || 0,
      Number(bill.balanceAmount) || 0,
      bill.paymentStatus || "",
    ]);

    const escapeCSV = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `staybill-sales-report-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    let chart;

    try {
      const pdf = new jsPDF({ orientation: "landscape" });
      const pageWidth = pdf.internal.pageSize.getWidth();

      pdf.setFontSize(20);
      pdf.text("StayBill - Sales Report", 14, 18);

      pdf.setFontSize(10);
      pdf.text(
        `Report period: ${startDate || "All dates"} to ${endDate || "All dates"}`,
        14,
        27
      );
      pdf.text(
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        14,
        33
      );

      pdf.setFontSize(12);
      pdf.text(`Total Sales: ${formatCurrency(totals.sales)}`, 14, 45);
      pdf.text(
        `Collected: ${formatCurrency(totals.collected)}`,
        105,
        45
      );
      pdf.text(
        `Outstanding: ${formatCurrency(totals.pending)}`,
        205,
        45
      );
      pdf.text(`Number of bills: ${reportBills.length}`, 14, 53);

      // Render a chart using the selected report's actual figures.
      const canvas = document.createElement("canvas");
      canvas.width = 1100;
      canvas.height = 440;

      chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: ["Total Sales", "Collected", "Outstanding"],
          datasets: [
            {
              label: "Amount (INR)",
              data: [
                totals.sales,
                totals.collected,
                totals.pending,
              ],
              backgroundColor: ["#2563eb", "#16a34a", "#f59e0b"],
              borderRadius: 5,
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Sales Overview",
              font: { size: 22 },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) =>
                  `₹${Number(value).toLocaleString("en-IN")}`,
              },
            },
          },
        },
      });

      const graphImage = canvas.toDataURL("image/png");

      pdf.addImage(graphImage, "PNG", 14, 59, 180, 72);
      chart.destroy();
      chart = null;

      // Add the complete bill details table.
      autoTable(pdf, {
        startY: 140,
        head: [[
          "Bill ID",
          "Guest",
          "Room",
          "Date",
          "Total",
          "Collected",
          "Pending",
          "Status",
        ]],
        body: reportBills.map((bill) => [
          bill.invoiceNumber || bill.id.slice(0, 8),
          bill.guestName || "—",
          bill.roomNumber || "—",
          formatDate(bill.createdAt),
          formatCurrency(bill.grandTotal),
          formatCurrency(bill.paidAmount),
          formatCurrency(bill.balanceAmount),
          bill.paymentStatus || "Pending",
        ]),
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: "linebreak",
        },
        headStyles: {
          fillColor: [37, 99, 235],
        },
        theme: "grid",
        margin: { left: 14, right: 14 },
        didDrawPage: () => {
          const pageNumber = pdf.internal.getNumberOfPages();
          pdf.setFontSize(8);
          pdf.text(
            `StayBill Sales Report | Page ${pageNumber}`,
            pageWidth - 14,
            pdf.internal.pageSize.getHeight() - 7,
            { align: "right" }
          );
        },
      });

      pdf.save(
        `staybill-sales-report-${startDate}-to-${endDate}.pdf`
      );
    } catch (err) {
      console.error("PDF export failed:", err);
      window.alert(
        "Could not export the PDF. Check the browser console for details."
      );
    } finally {
      if (chart) chart.destroy();
    }
  }

  if (loading) {
    return (
      <div className="report-page">
        <h1>Sales Reports</h1>
        <p>Loading report data...</p>
      </div>
    );
  }

  return (
    <section className="report-page">
      <div className="report-header">
        <div>
          <h1>Sales Reports</h1>
          <p>
            Review hotel sales, collections, and outstanding balances.
          </p>
        </div>

        <div className="report-export-actions">
          <button
            className="report-export-button"
            onClick={exportCSV}
            disabled={reportBills.length === 0}
          >
            Export CSV
          </button>

          <button
            className="report-pdf-button"
            onClick={exportPDF}
            disabled={reportBills.length === 0}
          >
            Export PDF
          </button>
        </div>
      </div>

      {error && <p className="report-error">{error}</p>}

      <div className="report-filters">
        <div>
          <label htmlFor="report-start-date">From date</label>
          <input
            id="report-start-date"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="report-end-date">To date</label>
          <input
            id="report-end-date"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="report-reset-button"
          onClick={() => {
            setStartDate(getMonthStart());
            setEndDate(getLocalDateString());
          }}
        >
          This month
        </button>
      </div>

      <div className="report-summary">
        <article className="report-card">
          <span>Total sales</span>
          <h2>{formatCurrency(totals.sales)}</h2>
          <p>{reportBills.length} bill(s) created</p>
        </article>

        <article className="report-card">
          <span>Payments collected</span>
          <h2>{formatCurrency(totals.collected)}</h2>
          <p>Paid against selected bills</p>
        </article>

        <article className="report-card">
          <span>Outstanding balance</span>
          <h2>{formatCurrency(totals.pending)}</h2>
          <p>Still due on selected bills</p>
        </article>
      </div>

      <div className="report-table-section">
        <div className="report-table-heading">
          <h2>Bill details</h2>
          <span>{reportBills.length} record(s)</span>
        </div>

        {startDate && endDate && startDate > endDate ? (
          <p className="report-empty">
            The start date cannot be after the end date.
          </p>
        ) : reportBills.length === 0 ? (
          <p className="report-empty">
            No bills found for this date range.
          </p>
        ) : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Bill ID</th>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Collected</th>
                  <th>Pending</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {reportBills
                  .slice()
                  .sort((a, b) => {
                    const dateA = a.createdAt?.toMillis
                      ? a.createdAt.toMillis()
                      : new Date(a.createdAt || 0).getTime();

                    const dateB = b.createdAt?.toMillis
                      ? b.createdAt.toMillis()
                      : new Date(b.createdAt || 0).getTime();

                    return dateB - dateA;
                  })
                  .map((bill) => (
                    <tr key={bill.id}>
                      <td title={bill.id}>
                        {bill.invoiceNumber || bill.id.slice(0, 8)}
                      </td>
                      <td>{bill.guestName || "—"}</td>
                      <td>{bill.roomNumber || "—"}</td>
                      <td>{formatDate(bill.createdAt)}</td>
                      <td>{formatCurrency(bill.grandTotal)}</td>
                      <td>{formatCurrency(bill.paidAmount)}</td>
                      <td>{formatCurrency(bill.balanceAmount)}</td>
                      <td>
                        <span
                          className={`report-status ${
                            String(bill.paymentStatus || "pending").toLowerCase()
                          }`}
                        >
                          {bill.paymentStatus || "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
