
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Plus, BedDouble, Trash2 } from "lucide-react";

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomType, setRoomType] = useState("Standard");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "rooms"),
      (snapshot) => {
        setRooms(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setError("");
      },
      (err) => {
        console.error("Room loading failed:", err);
        setError("Unable to load rooms. Check your Firestore security rules.");
      }
    );

    return unsubscribe;
  }, []);

  async function handleAddRoom(event) {
    event.preventDefault();
    setError("");

    const cleanNumber = roomNumber.trim();
    const numericRate = Number(rate);

    if (!cleanNumber || !Number.isFinite(numericRate) || numericRate <= 0) {
      setError("Enter a room number and a valid rate greater than zero.");
      return;
    }

    if (rooms.some((room) => room.roomNumber === cleanNumber)) {
      setError("This room number already exists.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "rooms"), {
        roomNumber: cleanNumber,
        roomType,
        rate: numericRate,
        status: "Available",
        createdAt: serverTimestamp(),
      });

      setRoomNumber("");
      setRate("");
    } catch (err) {
      console.error("Room creation failed:", err);
      setError("Room could not be saved. Check your database permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(id) {
    const confirmed = window.confirm("Delete this room?");
    if (!confirmed) return;

    setError("");

    try {
      await deleteDoc(doc(db, "rooms", id));
    } catch (err) {
      console.error("Room deletion failed:", err);
      setError("Room could not be deleted.");
    }
  }

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">HOTEL MANAGEMENT</p>
          <h1>Rooms</h1>
          <p className="muted">Manage room numbers, types and nightly rates.</p>
        </div>
      </header>

      <section className="room-form-card">
        <h2><Plus size={19} /> Add a room</h2>

        <form className="room-form" onSubmit={handleAddRoom}>
          <label>
            Room number
            <input
              value={roomNumber}
              onChange={(event) => setRoomNumber(event.target.value)}
              placeholder="e.g. 101"
              required
            />
          </label>

          <label>
            Room type
            <select
              value={roomType}
              onChange={(event) => setRoomType(event.target.value)}
            >
              <option>Standard</option>
              <option>Deluxe</option>
              <option>Suite</option>
              <option>Family</option>
            </select>
          </label>

          <label>
            Rate per night (₹)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder="e.g. 1500"
              required
            />
          </label>

          <button type="submit" disabled={saving}>
            <Plus size={17} />
            {saving ? "Saving..." : "Add Room"}
          </button>
        </form>

        {error && <p className="room-error" role="alert">{error}</p>}
      </section>

      <section className="rooms-list-section">
        <div className="rooms-list-heading">
          <h2>All Rooms</h2>
          <span>{rooms.length} rooms</span>
        </div>

        {rooms.length === 0 ? (
          <div className="rooms-empty">
            <BedDouble size={32} />
            <h3>No rooms yet</h3>
            <p>Add your first room using the form above.</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room) => (
              <article className="room-card" key={room.id}>
                <div className="room-card-top">
                  <div className="stat-icon"><BedDouble size={21} /></div>
                  <span className="room-status">{room.status || "Available"}</span>
                </div>

                <h3>Room {room.roomNumber}</h3>
                <p>{room.roomType}</p>
                <strong>₹{Number(room.rate).toLocaleString("en-IN")} <small>/ night</small></strong>

                <button
                  className="room-delete-button"
                  onClick={() => handleDeleteRoom(room.id)}
                  aria-label={`Delete room ${room.roomNumber}`}
                >
                  <Trash2 size={16} /> Delete room
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
