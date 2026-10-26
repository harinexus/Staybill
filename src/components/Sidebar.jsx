
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BedDouble,
  Users,
  Receipt,
  Settings,
  Hotel,
  LogOut,
  History,
  ChartNoAxesCombined,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

const menuItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Rooms", path: "/rooms", icon: BedDouble },
  { name: "Guests", path: "/guests", icon: Users },
  { name: "Billing", path: "/billing", icon: Receipt },
  { name: "Bill History", path: "/bill-history", icon: History },
  { name: "Reports", path: "/reports", icon: ChartNoAxesCombined },
  
];

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Hotel size={23} />
        </div>
        <div>
          <h2>StayBill</h2>
          <p>Hotel Billing System</p>
        </div>
      </div>

      <p className="menu-label">MAIN MENU</p>

      <nav className="sidebar-nav">
        {menuItems.map(({ name, path, icon: Icon }) => (
          <NavLink
            key={name}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `nav-item ${isActive ? "active" : ""}`
            }
          >
            <Icon size={19} />
            <span>{name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p>StayBill v1.0</p>
        <span>Hotel management made simple</span>

        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
