
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import Guests from "./pages/Guests";
import Billing from "./pages/Billing";
import BillHistory from "./pages/BillHistory";
import Reports from "./pages/Reports";
import Invoice from "./pages/Invoice";
import "./index.css";

function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/guests" element={<Guests />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/bill-history" element={<BillHistory />} />
          <Route path="/reports" element={<Reports />} />

          <Route
            path="*"
            element={
              <div className="placeholder-page">
                <h1>Coming Soon</h1>
                <p>This section is under development.</p>
                <a href="/">Return to Dashboard</a>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Loading StayBill...</p>
    </div>
  );
}

function AuthenticatedApp() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCheckingAuth(false);
    });

    return unsubscribe;
  }, []);

  if (checkingAuth) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        path="/invoice/:billId"
        element={user ? <Invoice /> : <Navigate to="/login" replace />}
      />

      <Route
        path="/*"
        element={user ? <AppLayout /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthenticatedApp />
    </BrowserRouter>
  );
}
