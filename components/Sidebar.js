"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  ClipboardList,
  LayoutGrid,
  Palette,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
  { href: "/nouvelle", icon: ShoppingCart, label: "Nouvelle commande" },
  { href: "/commandes", icon: ClipboardList, label: "Commandes" },
  { href: "/articles", icon: Package, label: "Stock / Articles" },
  { href: "/clients", icon: Users, label: "Clients" },
  { href: "/catalogue", icon: LayoutGrid, label: "Catalogue" },
  { href: "/parametres", icon: Palette, label: "Paramètres" },
];

export default function Sidebar({ business, onSignOut }) {
  const pathname = usePathname();
  const businessName = business?.name;
  const logo = business?.logo_url;

  return (
    <aside className="sb-sidebar">
      <div className="sb-brand">
        {logo ? (
          <div className="sb-brand-logo">
            <img src={logo} alt={businessName || "Logo"} />
            <span>{businessName || "Ma boutique"}</span>
          </div>
        ) : businessName ? (
          <span>{businessName}</span>
        ) : (
          <>
            Smart<span>Biz</span>
          </>
        )}
      </div>
      <nav className="sb-nav">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={<item.icon size={16} />}
            label={item.label}
            active={pathname === item.href}
          />
        ))}
        <button className="sb-nav-item" onClick={onSignOut} type="button">
          <LogOut size={16} />
          Déconnexion
        </button>
      </nav>
      <div className="sb-sidebar-footer">Propulsé par SmartBiz</div>
    </aside>
  );
}

function NavItem({ href, icon, label, active }) {
  return (
    <Link href={href} className={`sb-nav-item${active ? " active" : ""}`}>
      {icon}
      {label}
    </Link>
  );
}
