"use client";

import { useState } from "react";
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
  Clock,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { t as tBase } from "@/lib/i18n";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/nouvelle", icon: ShoppingCart, key: "nouvelle" },
  { href: "/commandes", icon: ClipboardList, key: "commandes" },
  { href: "/articles", icon: Package, key: "articles" },
  { href: "/clients", icon: Users, key: "clients" },
  { href: "/catalogue", icon: LayoutGrid, key: "catalogue" },
  { href: "/parametres", icon: Palette, key: "parametres" },
];

const ADMIN_NAV_ITEM = { href: "/admin", icon: ShieldCheck, key: "admin" };

export default function Sidebar({ business, onSignOut }) {
  const pathname = usePathname();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const businessName = business?.name;
  const logo = business?.logo_url;
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Referme le menu mobile à chaque changement de page (ajustement pendant
  // le rendu plutôt que dans un effect, pour éviter un rendu en cascade —
  // sans ça, un lien vers la page déjà active ne fermerait jamais le menu).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  const joursRestants =
    !business?.is_admin && business?.subscription_status === "essai" && business?.subscription_expires_at
      ? Math.max(1, Math.ceil((new Date(business.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;
  const navItems = business?.is_admin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <aside className="sb-sidebar">
      <div className="sb-brand">
        {logo ? (
          <div className="sb-brand-logo">
            <img src={logo} alt={businessName || t("common.defaultBusinessName")} />
            <span>{businessName || t("common.defaultBusinessName")}</span>
          </div>
        ) : businessName ? (
          <span>{businessName}</span>
        ) : (
          <>
            Smart<span>Biz</span>
          </>
        )}
        {joursRestants !== null && (
          <div className="sb-trial-badge">
            <Clock size={11} /> {t("sidebar.essaiJoursRestants", { n: joursRestants })}
          </div>
        )}
      </div>
      <button
        type="button"
        className="sb-menu-toggle"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? t("sidebar.fermerMenu") : t("sidebar.ouvrirMenu")}
        aria-expanded={menuOpen}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {menuOpen && <div className="sb-nav-backdrop" onClick={() => setMenuOpen(false)} />}
      <nav className={`sb-nav${menuOpen ? " sb-nav-open" : ""}`}>
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={<item.icon size={16} />}
            label={t(`sidebar.nav.${item.key}`)}
            active={pathname === item.href}
            onClick={() => setMenuOpen(false)}
          />
        ))}
        <button className="sb-nav-item" onClick={onSignOut} type="button">
          <LogOut size={16} />
          {t("sidebar.logout")}
        </button>
      </nav>
      <div className="sb-sidebar-footer">{t("common.poweredBy")}</div>
    </aside>
  );
}

function NavItem({ href, icon, label, active, onClick }) {
  return (
    <Link href={href} className={`sb-nav-item${active ? " active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </Link>
  );
}
