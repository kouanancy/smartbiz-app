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
  Wallet,
  LifeBuoy,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { t as tBase } from "@/lib/i18n";
import { MODES_AFFICHAGE } from "@/lib/constants";
import NotificationBell from "@/components/NotificationBell";

const MODE_ICON = { clair: Sun, sombre: Moon, auto: Monitor };

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/nouvelle", icon: ShoppingCart, key: "nouvelle" },
  { href: "/commandes", icon: ClipboardList, key: "commandes" },
  { href: "/tresorerie", icon: Wallet, key: "tresorerie" },
  { href: "/articles", icon: Package, key: "articles" },
  { href: "/clients", icon: Users, key: "clients" },
  { href: "/catalogue", icon: LayoutGrid, key: "catalogue" },
  { href: "/parametres", icon: Palette, key: "parametres" },
  { href: "/aide", icon: LifeBuoy, key: "aide" },
];

const ADMIN_NAV_ITEM = { href: "/admin", icon: ShieldCheck, key: "admin" };

export default function Sidebar({ business, onSignOut, onChangeMode }) {
  const pathname = usePathname();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const businessName = business?.name;
  const logo = business?.logo_url;
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const modeAffichage = business?.mode_affichage || "clair";
  const ModeIcon = MODE_ICON[modeAffichage] || Sun;
  const modeLabel = t(`parametres.mode${modeAffichage === "clair" ? "Clair" : modeAffichage === "sombre" ? "Sombre" : "Auto"}`);

  // Accès rapide : un clic fait défiler clair → sombre → automatique →
  // clair, sans passer par Paramètres.
  function cyclerModeAffichage() {
    const i = MODES_AFFICHAGE.indexOf(modeAffichage);
    onChangeMode?.(MODES_AFFICHAGE[(i + 1) % MODES_AFFICHAGE.length]);
  }

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
        <div className="sb-brand-row">
          <div className="sb-brand-title">
            {logo ? (
              <div className="sb-brand-logo">
                <img src={logo} alt={businessName || t("common.defaultBusinessName")} />
                <span>{businessName || t("common.defaultBusinessName")}</span>
              </div>
            ) : businessName ? (
              <span>{businessName}</span>
            ) : (
              <span>Doka</span>
            )}
          </div>
          <NotificationBell business={business} className="sb-notif-desktop" />
        </div>
        {joursRestants !== null && (
          <div className="sb-trial-badge">
            <Clock size={11} /> {t("sidebar.essaiJoursRestants", { n: joursRestants })}
          </div>
        )}
      </div>
      <div className="sb-mobile-actions">
        <NotificationBell business={business} />
        <button
          type="button"
          className="sb-icon-btn"
          onClick={cyclerModeAffichage}
          aria-label={t("sidebar.modeAffichageLabel", { mode: modeLabel })}
          title={t("sidebar.modeAffichageLabel", { mode: modeLabel })}
        >
          <ModeIcon size={20} />
        </button>
        <button
          type="button"
          className="sb-menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? t("sidebar.fermerMenu") : t("sidebar.ouvrirMenu")}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
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
