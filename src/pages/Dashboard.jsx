
import { useEffect, useState } from "react";
import {
  BedDouble,
  Users,
  Receipt,
  IndianRupee,
  ArrowUpRight,
  Clock3,
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function Dashboard() {
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let roomsLoaded = false;
    let guestsLoaded = false;
    let billsLoaded = false;

    const checkLoading = () => {
      if (roomsLoaded && guestsLoaded && billsLoaded) {
        setLoading(false);
      }
    };

    const handleError = (err) => {
      console.error("Dashboard data error:", err);
      setError("Some dashboard data could not be loaded. Check Firestore permissions.");
      setLoading(false);
    };

    const unsubscribeRooms = onSnapshot(
      collection(db, "rooms"),
      (snapshot) => {
        setRooms(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })));
        roomsLoaded = true;
        checkLoading();
      },
      handleError
    );

    const unsubscribeGuests = onSnapshot(
      collection(db, "guests"),
      (snapshot) => {
        setGuests(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })));
        guestsLoaded = true;
        checkLoading();
      },
      handleError
    );

    const unsubscribeBills = onSnapshot(
      collection(db, "bills"),
      (snapshot) => {
        setBills(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })));
        billsLoaded = true;
        checkLoading();
      },
      handleError
    );

    return () => {
      unsubscribeRooms();
      unsubscribeGuests();
      unsubscribeBills();
    };
  }, []);

  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startOfTomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  );

  const todaysBills = bills.filter((bill) => {
    if (!bill.createdAt?.toDate) return false;

    const createdDate = bill.createdAt.toDate();
    return (
      createdDate >= startOfToday &&
      createdDate < startOfTomorrow
    );
  });

  const todaysRevenue = todaysBills.reduce(
    (total, bill) => total + Number(bill.paidAmount || 0),
    0
  );

  const formatMoney = (amount) =>
    `₹${amount.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  const stats = [
    {
      title: "Total Rooms",
      value: rooms.length,
      description: "Rooms configured",
      icon: BedDouble,
    },
    {
      title: "Registered Guests",
      value: guests.length,
      description: "Guest records",
      icon: Users,
    },
    {
      title: "Today's Bills",
      value: todaysBills.length,
      description: "Bills created today",
      icon: Receipt,
    },
    {
      title: "Today's Revenue",
      value: formatMoney(todaysRevenue),
      description: "Paid amount on today's bills",
      icon: IndianRupee,
    },
  ];

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Dashboard</h1>
          <p className="muted">
            Welcome back! Here's your hotel overview.
          </p>
        </div>

        <div className="date-badge">
          <Clock3 size={17} />
          <span>
            {today.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </header>

      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Loading dashboard data...</p>
      ) : (
        <section className="stats-grid">
          {stats.map(({ title, value, description, icon: Icon }) => (
            <article className="stat-card" key={title}>
              <div className="stat-top">
                <span>{title}</span>
                <div className="stat-icon">
                  <Icon size={21} />
                </div>
              </div>

              <h2>{value}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
      )}

      <section className="welcome-card">
        <div>
          <p className="eyebrow">STAYBILL WORKSPACE</p>
          <h2>Everything your hotel needs, in one place.</h2>
          <p>
            Manage rooms, maintain guest details, generate bills,
            and track payments from a single workspace.
          </p>
        </div>

        <div className="welcome-icon">
          <BedDouble size={52} />
          <ArrowUpRight size={23} />
        </div>
      </section>

      <section className="activity-section">
        <h2>Quick Overview</h2>

        <div className="activity-card">
          <div className="activity-icon">
            <Receipt size={20} />
          </div>
          <div>
            <h3>Billing workspace</h3>
            <p>{bills.length} bill(s) saved in your system.</p>
          </div>
          <span className="status-badge">Connected</span>
        </div>

        <div className="activity-card">
          <div className="activity-icon">
            <Users size={20} />
          </div>
          <div>
            <h3>Guest management</h3>
            <p>{guests.length} guest record(s) available.</p>
          </div>
          <span className="status-badge">Connected</span>
        </div>
      </section>
    </div>
  );
}
