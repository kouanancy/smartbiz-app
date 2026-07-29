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
  const t = (key) => tBase(business?.langue, key);
  const businessName = business?.name;
  const logo = business?.logo_url;

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
