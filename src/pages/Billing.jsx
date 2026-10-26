
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function getNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;

  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);

  return Math.max(0, Math.round((end - start) / 86400000));
}

// Checkout is exclusive: a new guest may check in on
// the same date the previous guest checks out.
function datesOverlap(
  newCheckIn,
  newCheckOut,
  existingCheckIn,
  existingCheckOut
) {
  return (
    newCheckIn < existingCheckOut &&
    newCheckOut > existingCheckIn
  );
}

function hasRoomConflict(bills, room, checkIn, checkOut) {
  if (
    !room ||
    !checkIn ||
    !checkOut ||
    getNights(checkIn, checkOut) <= 0
  ) {
    return false;
  }

  return bills.some((bill) => {
    const sameRoom =
      bill.roomId === room.id ||
      (!bill.roomId &&
        String(bill.roomNumber) === String(room.roomNumber));

    if (!sameRoom || !bill.checkIn || !bill.checkOut) {
      return false;
    }

    return datesOverlap(
      checkIn,
      checkOut,
      bill.checkIn,
      bill.checkOut
    );
  });
}

export default function Billing() {
  const navigate = useNavigate();

  const [guests, setGuests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [existingBills, setExistingBills] = useState([]);

  const [guestId, setGuestId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const [extraCharges, setExtraCharges] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [taxPercent, setTaxPercent] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let guestReady = false;
    let roomReady = false;
    let billsReady = false;

    let active = true;

    const finishLoading = () => {
      if (guestReady && roomReady && billsReady && active) {
        setLoading(false);
      }
    };

    const stopGuests = onSnapshot(
      collection(db, "guests"),
      (snapshot) => {
        setGuests(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );

        guestReady = true;
        finishLoading();
      },
      (err) => {
        console.error("Error loading guests:", err);
        setError("Could not load guests. Check Firebase permissions.");
        guestReady = true;
        finishLoading();
      }
    );

    const stopRooms = onSnapshot(
      collection(db, "rooms"),
      (snapshot) => {
        setRooms(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );

        roomReady = true;
        finishLoading();
      },
      (err) => {
        console.error("Error loading rooms:", err);
        setError("Could not load rooms. Check Firebase permissions.");
        roomReady = true;
        finishLoading();
      }
    );

    const stopBills = onSnapshot(
      collection(db, "bills"),
      (snapshot) => {
        setExistingBills(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );

        billsReady = true;
        finishLoading();
      },
      (err) => {
        console.error("Error loading existing bills:", err);
        setError(
          "Could not load existing bookings. Check Firebase permissions."
        );
        billsReady = true;
        finishLoading();
      }
    );

    return () => {
      active = false;
      stopGuests();
      stopRooms();
      stopBills();
    };
  }, []);

  const selectedGuest = guests.find(
    (guest) => guest.id === guestId
  );

  const selectedRoom = rooms.find(
    (room) => room.id === roomId
  );

  const nights = getNights(checkIn, checkOut);

  // Calculate the bill using the selected room and stay dates.
  const bill = useMemo(() => {
    const rate = Number(selectedRoom?.rate) || 0;
    const extras = Math.max(0, Number(extraCharges) || 0);
    const requestedDiscount = Math.max(
      0,
      Number(discount) || 0
    );

    const taxRate = Math.min(
      100,
      Math.max(0, Number(taxPercent) || 0)
    );

    const roomCharge = rate * nights;
    const subtotal = roomCharge + extras;

    const actualDiscount = Math.min(
      subtotal,
      requestedDiscount
    );

    const taxableAmount = subtotal - actualDiscount;
    const taxAmount = (taxableAmount * taxRate) / 100;
    const grandTotal = taxableAmount + taxAmount;

    const paid = Math.min(
      grandTotal,
      Math.max(0, Number(amountPaid) || 0)
    );

    return {
      rate,
      roomCharge,
      extras,
      subtotal,
      discount: actualDiscount,
      taxRate,
      taxAmount,
      grandTotal,
      paid,
      balance: grandTotal - paid,
    };
  }, [
    selectedRoom,
    nights,
    extraCharges,
    discount,
    taxPercent,
    amountPaid,
  ]);

  const roomConflict = hasRoomConflict(
    existingBills,
    selectedRoom,
    checkIn,
    checkOut
  );

  const paymentStatus =
    bill.balance <= 0
      ? "Paid"
      : bill.paid > 0
        ? "Partially Paid"
        : "Pending";

  const handleCreateBill = async () => {
    setError("");
    setSuccess("");

    if (!guestId || !selectedGuest) {
      setError("Please select a guest.");
      return;
    }

    if (!roomId || !selectedRoom) {
      setError("Please select a room.");
      return;
    }

    if (!checkIn || !checkOut || nights <= 0) {
      setError("Please enter valid check-in and check-out dates.");
      return;
    }

    const numericFields = [
      extraCharges,
      discount,
      taxPercent,
      amountPaid,
    ];

    const invalidAmount = numericFields.some(
      (value) =>
        value.trim() === "" ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
    );

    if (invalidAmount) {
      setError("Please enter valid, non-negative billing amounts.");
      return;
    }

    if (Number(taxPercent) > 100) {
      setError("Tax cannot exceed 100%.");
      return;
    }

    if (Number(discount) > bill.subtotal) {
      setError("Discount cannot exceed the subtotal.");
      return;
    }

    if (Number(amountPaid) > bill.grandTotal) {
      setError("Payment cannot exceed the bill total.");
      return;
    }

    if (roomConflict) {
      setError(
        "This room is already booked for overlapping dates. Please select another room or change the dates."
      );
      return;
    }

    if (saving) return;

    setSaving(true);

    try {
      // Recheck Firestore immediately before saving.
      // This helps catch bookings added since the live listener updated.
      const latestBillsSnapshot = await getDocs(
        collection(db, "bills")
      );

      const latestBills = latestBillsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (
        hasRoomConflict(
          latestBills,
          selectedRoom,
          checkIn,
          checkOut
        )
      ) {
        setExistingBills(latestBills);

        setError(
          "This room has just been booked for overlapping dates. Please select another room or change the dates."
        );
        return;
      }

      const billData = {
        guestId: selectedGuest.id,
        guestName: selectedGuest.name || "",
        guestPhone: selectedGuest.phone || "",

        roomId: selectedRoom.id,
        roomNumber: String(selectedRoom.roomNumber || ""),
        roomType: selectedRoom.roomType || "",
        roomRate: bill.rate,

        checkIn,
        checkOut,
        nights,

        roomAmount: bill.roomCharge,
        extraCharges: bill.extras,
        subtotal: bill.subtotal,
        discount: bill.discount,
        discountType: "fixed",
        discountValue: Number(discount),
        taxPercent: bill.taxRate,
        taxAmount: bill.taxAmount,
        grandTotal: bill.grandTotal,

        paidAmount: bill.paid,
        balanceAmount: bill.balance,
        paymentStatus,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(
        collection(db, "bills"),
        billData
      );

      setSuccess(
        `Bill created successfully! Bill ID: ${docRef.id}`
      );

      navigate(`/invoice/${docRef.id}`);
    } catch (err) {
      console.error("Error saving bill:", err);

      if (err.code === "permission-denied") {
        setError(
          "Permission denied by Firestore. Check your bills collection security rules."
        );
      } else {
        setError(
          "Could not save the bill. Check your internet connection and Firebase configuration, then try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // A room must have an Available status and no overlapping bill.
  const availableRooms = rooms.filter((room) => {
    if (room.status !== "Available") return false;

    return !hasRoomConflict(
      existingBills,
      room,
      checkIn,
      checkOut
    );
  });

  return (
    <main className="billing-page">
      <header className="billing-page-header">
        <div>
          <p className="billing-eyebrow">STAYBILL / BILLING</p>
          <h1>Create Bill</h1>
          <p className="billing-subtitle">
            Prepare a guest invoice and calculate stay charges.
          </p>
        </div>

        <div className="billing-header-icon">₹</div>
      </header>

      {error && (
        <div className="billing-alert" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="billing-loading">
          Loading rooms, guests and bookings...
        </div>
      ) : (
        <div className="billing-layout">
          <div className="billing-main-column">
            <section className="billing-card">
              <div className="billing-section-heading">
                <span className="billing-step">01</span>
                <div>
                  <h2>Guest and Room Details</h2>
                  <p>Select the guest, room and stay dates.</p>
                </div>
              </div>

              <div className="billing-form-grid">
                <div className="billing-field">
                  <label htmlFor="bill-guest">
                    Select Guest
                  </label>

                  <select
                    id="bill-guest"
                    value={guestId}
                    onChange={(e) => {
                      setGuestId(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  >
                    <option value="">Choose a guest</option>

                    {guests.map((guest) => (
                      <option key={guest.id} value={guest.id}>
                        {guest.name} — {guest.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="billing-field">
                  <label htmlFor="bill-room">
                    Select Available Room
                  </label>

                  <select
                    id="bill-room"
                    value={roomId}
                    onChange={(e) => {
                      setRoomId(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  >
                    <option value="">Choose a room</option>

                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.roomNumber} — {room.roomType} —{" "}
                        {formatINR(Number(room.rate) || 0)}/night
                      </option>
                    ))}

                    {roomId &&
                      selectedRoom &&
                      !availableRooms.some(
                        (room) => room.id === selectedRoom.id
                      ) && (
                        <option value={selectedRoom.id}>
                          Room {selectedRoom.roomNumber} — Unavailable
                        </option>
                      )}
                  </select>

                  {checkIn && checkOut && nights > 0 && (
                    <p className="billing-helper">
                      {availableRooms.length} room
                      {availableRooms.length === 1 ? "" : "s"} available
                      for the selected dates.
                    </p>
                  )}
                </div>

                <div className="billing-field">
                  <label htmlFor="check-in">
                    Check-in Date
                  </label>

                  <input
                    id="check-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCheckIn(value);

                      if (checkOut && value >= checkOut) {
                        setCheckOut("");
                      }

                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>

                <div className="billing-field">
                  <label htmlFor="check-out">
                    Check-out Date
                  </label>

                  <input
                    id="check-out"
                    type="date"
                    min={checkIn || undefined}
                    value={checkOut}
                    onChange={(e) => {
                      setCheckOut(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>
              </div>

              {selectedGuest && (
                <div className="billing-guest-note">
                  <div className="billing-avatar">
                    {(selectedGuest.name || "G")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <strong>{selectedGuest.name}</strong>
                    <span>{selectedGuest.phone}</span>
                  </div>

                  {nights > 0 && (
                    <span className="billing-stay-pill">
                      {nights} night{nights === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}

              {checkIn && checkOut && nights === 0 && (
                <p className="billing-validation">
                  Check-out must be later than check-in.
                </p>
              )}

              {roomConflict && (
                <p className="billing-validation" role="alert">
                  This room is already booked for the selected dates.
                  Please choose another room or change the dates.
                </p>
              )}
            </section>

            <section className="billing-card">
              <div className="billing-section-heading">
                <span className="billing-step">02</span>
                <div>
                  <h2>Charges and Payment</h2>
                  <p>
                    Add extra charges, discount, tax and payment received.
                  </p>
                </div>
              </div>

              <div className="billing-form-grid">
                <div className="billing-field">
                  <label htmlFor="extra-charges">
                    Extra Charges (₹)
                  </label>

                  <input
                    id="extra-charges"
                    type="number"
                    min="0"
                    step="0.01"
                    value={extraCharges}
                    onChange={(e) => {
                      setExtraCharges(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>

                <div className="billing-field">
                  <label htmlFor="discount">
                    Discount (₹)
                  </label>

                  <input
                    id="discount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => {
                      setDiscount(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>

                <div className="billing-field">
                  <label htmlFor="tax-percent">
                    Tax (%)
                  </label>

                  <input
                    id="tax-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxPercent}
                    onChange={(e) => {
                      setTaxPercent(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>

                <div className="billing-field">
                  <label htmlFor="amount-paid">
                    Amount Paid (₹)
                  </label>

                  <input
                    id="amount-paid"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => {
                      setAmountPaid(e.target.value);
                      setError("");
                      setSuccess("");
                    }}
                  />
                </div>
              </div>

              <p className="billing-helper">
                Tax is calculated after discount. Payment cannot exceed
                the bill total.
              </p>
            </section>
          </div>

          <aside className="billing-summary-card">
            <div className="billing-summary-top">
              <div>
                <p className="billing-eyebrow">INVOICE PREVIEW</p>
                <h2>Bill Summary</h2>
              </div>

              <span
                className={`billing-status billing-status-${paymentStatus
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
              >
                {paymentStatus}
              </span>
            </div>

            <div className="billing-summary-details">
              <div className="billing-summary-row">
                <span>Room rate</span>
                <strong>{formatINR(bill.rate)} / night</strong>
              </div>

              <div className="billing-summary-row">
                <span>Room charge ({nights} nights)</span>
                <strong>{formatINR(bill.roomCharge)}</strong>
              </div>

              <div className="billing-summary-row">
                <span>Additional charges</span>
                <strong>{formatINR(bill.extras)}</strong>
              </div>

              <div className="billing-summary-row">
                <span>Subtotal</span>
                <strong>{formatINR(bill.subtotal)}</strong>
              </div>

              <div className="billing-summary-row billing-discount-row">
                <span>Discount</span>
                <strong>− {formatINR(bill.discount)}</strong>
              </div>

              <div className="billing-summary-row">
                <span>Tax ({bill.taxRate}%)</span>
                <strong>{formatINR(bill.taxAmount)}</strong>
              </div>
            </div>

            <div className="billing-grand-total">
              <span>Grand Total</span>
              <strong>{formatINR(bill.grandTotal)}</strong>
            </div>

            <div className="billing-payment-details">
              <div className="billing-summary-row">
                <span>Amount Paid</span>
                <strong>{formatINR(bill.paid)}</strong>
              </div>

              <div className="billing-summary-row billing-balance-row">
                <span>Balance Due</span>
                <strong>{formatINR(bill.balance)}</strong>
              </div>
            </div>

            <div className="billing-preview-notice">
              <span>ⓘ</span>
              <p>
                Your bill will be saved and its invoice will open
                automatically after successful creation.
              </p>
            </div>

            {success && (
              <div className="billing-success" role="status">
                {success}
              </div>
            )}

            <button
              type="button"
              className="billing-create-button"
              onClick={handleCreateBill}
              disabled={saving || loading || roomConflict}
            >
              {saving ? "Saving Bill..." : "Create Bill"}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}
