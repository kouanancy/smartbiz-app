"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const NotificationsContext = createContext(null);

// Pas d'abonnement Supabase Realtime (déjà pas utilisé ailleurs dans
// l'app) : un rafraîchissement périodique suffit largement pour des
// notifications qui ne changent qu'une poignée de fois par jour
// (rappel d'expiration quotidien, justificatif envoyé de temps en temps).
const POLL_INTERVAL_MS = 60000;

export function NotificationsProvider({ businessId, children }) {
  const [notifications, setNotifications] = useState([]);

  // Fonction locale (comme le "load" de PaiementAbonnement.js/admin/page.js)
  // plutôt qu'un useCallback exposé à l'effect par référence : le setState
  // ne peut alors survenir qu'après l'await, jamais de façon synchrone dans
  // le corps de l'effect.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    async function charger() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (active) setNotifications(data || []);
    }
    charger();
    const interval = setInterval(charger, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [businessId]);

  // Mise à jour optimiste : l'action doit se sentir immédiate au clic,
  // l'écriture réelle en base suit derrière (RLS déjà limitée à ses
  // propres notifications, voir supabase-notifications-migration.sql).
  const marquerLue = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, lue: true } : n)));
    await supabase.from("notifications").update({ lue: true }).eq("id", id);
  }, []);

  const marquerToutesLues = useCallback(async () => {
    const idsNonLues = notifications.filter((n) => !n.lue).map((n) => n.id);
    if (idsNonLues.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, lue: true })));
    await supabase.from("notifications").update({ lue: true }).in("id", idsNonLues);
  }, [notifications]);

  const nonLues = notifications.filter((n) => !n.lue).length;

  const value = { notifications, nonLues, marquerLue, marquerToutesLues };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications doit être utilisé à l'intérieur de <NotificationsProvider>");
  return ctx;
}
