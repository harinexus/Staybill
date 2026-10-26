
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Other",
];

function money(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getPaymentStatus(paid, total) {
  const balance = Math.max(0, total - paid);

  if (balance === 0) return "Paid";
  if (paid > 0) return "Partially Paid";
  return "Pending";
}

export default function Invoice() {
  const { billId } = useParams();
  const navigate = useNavigate();

  const [bill, setBill] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");

    const billRef = doc(db, "bills", billId);
    const paymentsRef = collection(db, "bills", billId, "payments");

    const stopBill = onSnapshot(
      billRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setBill({ id: snapshot.id, ...snapshot.data() });
          setError("");
        } else {
          setBill(null);
          setError("Invoice not found.");
        }

        setLoading(false);
      },
      (err) => {
        console.error("Error loading invoice:", err);
        setError("Unable to load invoice. Check your Firestore permissions.");
        setLoading(false);
      }
    );

    const stopPayments = onSnapshot(
      paymentsRef,
      (snapshot) => {
        const records = snapshot.docs.map((paymentDoc) => ({
          id: paymentDoc.id,
          ...paymentDoc.data(),
        }));

        records.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });

        setPayments(records);
      },
      (err) => {
        console.error("Error loading payment history:", err);
        setPaymentError(
          "Could not load payment history. Check Firestore permissions."
        );
      }
    );

    return () => {
      stopBill();
      stopPayments();
    };
  }, [billId]);

  const handleRecordPayment = async (event) => {
    event.preventDefault();

    setPaymentError("");
    setPaymentSuccess("");

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a payment amount greater than zero.");
      return;
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      setPaymentError("Select a valid payment method.");
      return;
    }

    if (savingPayment) return;

    setSavingPayment(true);

    try {
      const billRef = doc(db, "bills", billId);
      const paymentRef = doc(
        collection(db, "bills", billId, "payments")
      );

      await runTransaction(db, async (transaction) => {
        const billSnapshot = await transaction.get(billRef);

        if (!billSnapshot.exists()) {
          throw new Error("This invoice no longer exists.");
        }

        const currentBill = billSnapshot.data();
        const total = Number(currentBill.grandTotal);
        const currentPaid = Number(currentBill.paidAmount || 0);
        const currentBalance = Math.max(0, total - currentPaid);

        if (amount > currentBalance + 0.000001) {
          throw new Error(
            `Payment exceeds the remaining balance of ${money(currentBalance)}.`
          );
        }

        const newPaid = Math.min(total, currentPaid + amount);
        const newBalance = Math.max(0, total - newPaid);
        const newStatus = getPaymentStatus(newPaid, total);

        transaction.set(paymentRef, {
          amount,
          method: paymentMethod,
          createdAt: serverTimestamp(),
        });

        transaction.update(billRef, {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          paymentStatus: newStatus,
          updatedAt: serverTimestamp(),
        });
      });

      setPaymentAmount("");
      setPaymentSuccess("Payment recorded successfully.");
    } catch (err) {
      console.error("Error recording payment:", err);

      setPaymentError(
        err.message ||
          "Could not record payment. Check your Firestore security rules."
      );
    } finally {
      setSavingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <p>Loading invoice...</p>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="page-container">
        <h1>Invoice</h1>
        <p>{error || "Invoice not found."}</p>
        <button onClick={() => navigate("/bill-history")}>
          Back to Bill History
        </button>
      </div>
    );
  }

  const total = Number(bill.grandTotal || 0);
  const paid = Number(bill.paidAmount || 0);
  const balance = Math.max(0, total - paid);
  const status = getPaymentStatus(paid, total);

  return (
    <div className="page-container invoice-page">
      <div className="invoice-actions">
        <button onClick={() => navigate("/bill-history")}>
          Back to Bill History
        </button>

        <button onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="invoice-paper">
        <header className="invoice-header">
          <div>
            <h1>STAYBILL</h1>
            <p>Hotel Billing Invoice</p>
          </div>

          <div className="invoice-number">
            <strong>INVOICE</strong>
            <p>{bill.id}</p>
          </div>
        </header>

        <hr />

        <div className="invoice-details">
          <div>
            <h3>Guest Details</h3>
            <p><strong>Name:</strong> {bill.guestName}</p>
            <p><strong>Phone:</strong> {bill.guestPhone || "—"}</p>
          </div>

          <div>
            <h3>Stay Details</h3>
            <p>
              <strong>Room:</strong> {bill.roomNumber} ({bill.roomType})
            </p>
            <p><strong>Check-in:</strong> {bill.checkIn}</p>
            <p><strong>Check-out:</strong> {bill.checkOut}</p>
            <p><strong>Nights:</strong> {bill.nights}</p>
          </div>
        </div>

        <h3>Charge Summary</h3>

        <table className="invoice-table">
          <tbody>
            <tr>
              <td>
                Room charges ({bill.nights} nights × {money(bill.roomRate)})
              </td>
              <td>{money(bill.roomAmount)}</td>
            </tr>
            <tr>
              <td>Extra charges</td>
              <td>{money(bill.extraCharges)}</td>
            </tr>
            <tr>
              <td>Subtotal</td>
              <td>{money(bill.subtotal)}</td>
            </tr>
            <tr>
              <td>Discount</td>
              <td>− {money(bill.discount)}</td>
            </tr>
            <tr>
              <td>Tax ({bill.taxPercent}%)</td>
              <td>{money(bill.taxAmount)}</td>
            </tr>
            <tr className="invoice-total">
              <td>Grand Total</td>
              <td>{money(total)}</td>
            </tr>
            <tr>
              <td>Amount Paid</td>
              <td>{money(paid)}</td>
            </tr>
            <tr className="invoice-balance">
              <td>Balance Due</td>
              <td>{money(balance)}</td>
            </tr>
          </tbody>
        </table>

        <div className="invoice-payment-status">
          Payment Status: <strong>{status}</strong>
        </div>

        <section className="payment-management no-print">
          <h2>Record Additional Payment</h2>
          <p>
            Record a payment against this invoice's outstanding balance.
          </p>

          {balance > 0 ? (
            <form onSubmit={handleRecordPayment}>
              <div className="billing-field">
                <label htmlFor="payment-amount">
                  Payment Amount (₹)
                </label>
                <input
                  id="payment-amount"
                  type="number"
                  min="0.01"
                  max={balance}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => {
                    setPaymentAmount(event.target.value);
                    setPaymentError("");
                    setPaymentSuccess("");
                  }}
                  required
                />
              </div>

              <div className="billing-field">
                <label htmlFor="payment-method">Payment Method</label>
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>

              {paymentError && (
                <p className="billing-alert" role="alert">
                  {paymentError}
                </p>
              )}

              {paymentSuccess && (
                <p className="billing-success" role="status">
                  {paymentSuccess}
                </p>
              )}

              <button type="submit" disabled={savingPayment}>
                {savingPayment ? "Recording Payment..." : "Record Payment"}
              </button>
            </form>
          ) : (
            <p>This invoice is fully paid.</p>
          )}

          {!paymentError && !paymentSuccess && error === "" && null}
          {paymentError && null}

          <h3>Payment History</h3>

          {payments.length === 0 ? (
            <p>
              No additional payment records yet. The initial amount paid
              is shown in the invoice summary above.
            </p>
          ) : (
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.createdAt?.toDate
                        ? payment.createdAt.toDate().toLocaleString("en-IN")
                        : "Saving..."}
                    </td>
                    <td>{payment.method}</td>
                    <td>{money(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="payment-history-note">
            Payment records are stored with this invoice and cannot be
            edited or deleted through this page.
          </p>
        </section>

        <footer className="invoice-footer">
          <p>Thank you for staying with us!</p>
          <small>Generated by StayBill</small>
        </footer>
      </div>
    </div>
  );
}
