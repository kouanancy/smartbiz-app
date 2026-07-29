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
  Clock,
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

export default function Sidebar({ business, onSignOut }) {
  const pathname = usePathname();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const businessName = business?.name;
  const logo = business?.logo_url;

  const joursRestants =
    business?.subscription_status === "essai" && business?.subscription_expires_at
      ? Math.max(1, Math.ceil((new Date(business.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

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
      <nav className="sb-nav">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={<item.icon size={16} />}
            label={t(`sidebar.nav.${item.key}`)}
            active={pathname === item.href}
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

function NavItem({ href, icon, label, active }) {
  return (
    <Link href={href} className={`sb-nav-item${active ? " active" : ""}`}>
      {icon}
      {label}
    </Link>
  );
}
