"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/NotificationsProvider";
import { dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

// Composant purement visuel : l'état (liste, compteur, marquage) vient de
// NotificationsProvider, monté une seule fois dans (app)/layout.js — ce
// composant, lui, est monté deux fois dans Sidebar.js (sidebar ordinateur,
// à côté du ☰ mobile) pour que la cloche apparaisse au même endroit que le
// sélecteur de mode d'affichage selon la taille d'écran, sans dupliquer les
// requêtes réseau (une seule source de vérité, deux affichages).
export default function NotificationBell({ business, className }) {
  const { notifications, nonLues, marquerLue, marquerToutesLues } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  useEffect(() => {
    if (!open) return;
    function onClickDehors(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickDehors);
    return () => document.removeEventListener("mousedown", onClickDehors);
  }, [open]);

  function onClickNotification(n) {
    if (!n.lue) marquerLue(n.id);
    setOpen(false);
  }

  return (
    <div className={`sb-notif-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="sb-icon-btn sb-notif-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("notifications.title")}
        aria-expanded={open}
      >
        <Bell size={19} />
        {nonLues > 0 && <span className="sb-notif-badge">{nonLues > 9 ? "9+" : nonLues}</span>}
      </button>
      {open && (
        <div className="sb-notif-panel">
          <div className="sb-notif-panel-header">
            <span>{t("notifications.title")}</span>
            {nonLues > 0 && (
              <button type="button" className="sb-notif-marktoutes" onClick={marquerToutesLues}>
                {t("notifications.marquerToutesLues")}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="sb-notif-empty">{t("notifications.aucune")}</p>
          ) : (
            <ul className="sb-notif-list">
              {notifications.map((n) => (
                <li key={n.id} className={`sb-notif-item${n.lue ? "" : " sb-notif-item-unread"}`}>
                  {n.lien ? (
                    <Link href={n.lien} className="sb-notif-link" onClick={() => onClickNotification(n)}>
                      <NotifContenu n={n} business={business} />
                    </Link>
                  ) : (
                    <button type="button" className="sb-notif-link" onClick={() => onClickNotification(n)}>
                      <NotifContenu n={n} business={business} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotifContenu({ n, business }) {
  const date = new Date(n.created_at).toLocaleString(dateLocale(business?.langue), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <>
      <p className="sb-notif-message">{n.message}</p>
      <span className="sb-notif-date">{date}</span>
    </>
  );
}
