
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Search, CalendarDays, Filter, Eye } from "lucide-react";
import { db } from "../firebase";

export default function BillHistory() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const billsQuery = query(
      collection(db, "bills"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      billsQuery,
      (snapshot) => {
        setBills(
          snapshot.docs.map((billDoc) => ({
            id: billDoc.id,
            ...billDoc.data(),
          }))
        );
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error("Error loading bills:", err.code, err.message);
        setError(`${err.code}: ${err.message}`);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const formatMoney = (amount) =>
    `₹${Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const filteredBills = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return bills.filter((bill) => {
      const matchesSearch =
        !searchText ||
        String(bill.id || "").toLowerCase().includes(searchText) ||
        String(bill.guestName || "").toLowerCase().includes(searchText) ||
        String(bill.roomNumber || "").toLowerCase().includes(searchText) ||
        String(bill.guestPhone || "").toLowerCase().includes(searchText);

      const status = String(bill.paymentStatus || "").toLowerCase();
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Paid" && status === "paid") ||
        (statusFilter === "Partial" &&
          (status === "partial" || status === "partially paid")) ||
        (statusFilter === "Pending" &&
          (status === "pending" || status === "unpaid"));

      // Filter by the bill's creation date.
      const createdAt = bill.createdAt?.toDate
        ? bill.createdAt.toDate()
        : bill.createdAt
          ? new Date(bill.createdAt)
          : null;

      const billDate =
        createdAt && !Number.isNaN(createdAt.getTime())
          ? `${createdAt.getFullYear()}-${String(
              createdAt.getMonth() + 1
            ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`
          : "";

      const matchesFromDate = !fromDate || (billDate && billDate >= fromDate);
      const matchesToDate = !toDate || (billDate && billDate <= toDate);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesFromDate &&
        matchesToDate
      );
    });
  }, [bills, search, statusFilter, fromDate, toDate]);

  if (loading) {
    return (
      <div className="page-container">
        <h1>Bill History</h1>
        <p>Loading bills...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <h1>Bill History</h1>
        <p className="login-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-container bill-history-page">
      <h1>Bill History</h1>
      <p>Search, filter, and view your saved hotel bills.</p>

      <div className="bill-history-filters">
        <div className="bill-history-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search guest, bill ID, room or phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search bills"
          />
        </div>

        <div className="bill-history-filter">
          <Filter size={18} />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by payment status"
          >
            <option value="All">All payment statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        <label className="bill-history-date">
          <CalendarDays size={18} />
          <span>From</span>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="From date"
          />
        </label>

        <label className="bill-history-date">
          <CalendarDays size={18} />
          <span>To</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="To date"
          />
        </label>

        <button
          type="button"
          className="bill-history-reset"
          onClick={() => {
            setSearch("");
            setStatusFilter("All");
            setFromDate("");
            setToDate("");
          }}
        >
          Clear filters
        </button>
      </div>

      <p className="bill-history-count">
        Showing {filteredBills.length} of {bills.length} bills
      </p>

      {filteredBills.length === 0 ? (
        <div className="bill-history-empty">
          <p>
            {bills.length === 0
              ? "No bills found. Create your first bill to see it here."
              : "No bills match your search or filters."}
          </p>
        </div>
      ) : (
        <div className="bill-history-table-wrapper">
          <table className="bill-history-table">
            <thead>
              <tr>
                {[
                  "Bill ID",
                  "Guest",
                  "Room",
                  "Check-in",
                  "Check-out",
                  "Total",
                  "Paid",
                  "Balance",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredBills.map((bill) => {
                const status = String(
                  bill.paymentStatus || "Pending"
                ).toLowerCase();

                const statusClass =
                  status === "paid"
                    ? "paid"
                    : status === "partial" || status === "partially paid"
                      ? "partial"
                      : "pending";

                return (
                  <tr key={bill.id}>
                    <td className="bill-history-id" title={bill.id}>
                      {bill.id}
                    </td>
                    <td>{bill.guestName || "—"}</td>
                    <td>{bill.roomNumber || "—"}</td>
                    <td>{bill.checkIn || "—"}</td>
                    <td>{bill.checkOut || "—"}</td>
                    <td>{formatMoney(bill.grandTotal)}</td>
                    <td>{formatMoney(bill.paidAmount)}</td>
                    <td>{formatMoney(bill.balanceAmount)}</td>
                    <td>
                      <span className={`bill-status ${statusClass}`}>
                        {bill.paymentStatus || "Pending"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => navigate(`/invoice/${bill.id}`)}
                        className="view-invoice-button"
                      >
                        <Eye size={16} />
                        <span>View Invoice</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
