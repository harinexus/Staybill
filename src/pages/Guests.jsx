
import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export default function Guests() {
  const [guests, setGuests] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "guests"),
      (snapshot) => {
        setGuests(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Guest loading failed:", err);
        setError("Could not load guests. Check database permissions.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  async function handleAddGuest(event) {
    event.preventDefault();
    setError("");

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanPhone) {
      setError("Please enter the guest's name and phone number.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "guests"), {
        name: cleanName,
        phone: cleanPhone,
        createdAt: serverTimestamp(),
      });

      setName("");
      setPhone("");
    } catch (err) {
      console.error("Guest creation failed:", err);
      setError("Could not save guest. Check database permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGuest(guestId) {
    if (!window.confirm("Delete this guest?")) return;

    try {
      await deleteDoc(doc(db, "guests", guestId));
    } catch (err) {
      console.error("Guest deletion failed:", err);
      setError("Could not delete guest. Check database permissions.");
    }
  }

 
return (
  <section className="guest-page">
    <div className="guest-header">
      <div>
        <h1>Guest Management</h1>
        <p>Manage guest contact details for hotel billing.</p>
      </div>

      <div className="guest-count">
        <span>Total guests</span>
        <strong>{guests.length}</strong>
      </div>
    </div>

    <form className="guest-form-card" onSubmit={handleAddGuest}>
      <h2 className="guest-section-heading">Add New Guest</h2>
      <p className="guest-section-description">
        Enter the guest's details below.
      </p>

      <div className="guest-form-grid">
        <div className="guest-field">
          <label htmlFor="guest-name">Guest name</label>
          <input
            id="guest-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Hari Krishnan"
            maxLength={100}
            required
          />
        </div>

        <div className="guest-field">
          <label htmlFor="guest-phone">Phone number</label>
          <input
            id="guest-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Enter phone number"
            maxLength={20}
            required
          />
        </div>
      </div>

      <button
        className="guest-submit-button"
        type="submit"
        disabled={saving}
      >
        {saving ? "Saving guest..." : "+ Add Guest"}
      </button>

      {error && <p className="guest-error">{error}</p>}
    </form>

    <div className="guest-list-card">
      <div className="guest-list-header">
        <div>
          <h2>Guest Directory</h2>
          <p>Saved guest records</p>
        </div>
      </div>

      {loading ? (
        <p>Loading guests...</p>
      ) : guests.length === 0 ? (
        <div className="guest-empty-state">
          No guests added yet. Add your first guest above.
        </div>
      ) : (
        <div className="guest-grid">
          {guests.map((guest) => (
            <article className="guest-card" key={guest.id}>
              <div className="guest-avatar">
                {guest.name?.charAt(0) || "G"}
              </div>

              <div className="guest-card-details">
                <h3>{guest.name}</h3>
                <p>{guest.phone}</p>
              </div>

              <button
                type="button"
                className="guest-delete-button"
                onClick={() => handleDeleteGuest(guest.id)}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  </section>
);

}
