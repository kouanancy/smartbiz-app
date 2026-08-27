import { supabase } from "@/lib/supabaseClient";

// applicationServerKey attend un Uint8Array, pas la chaîne base64url
// telle quelle — conversion standard pour l'API Push.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Activation des notifications push sur cet appareil (toute boutique,
// admin ou commerçant classique — même bouton, même mécanisme, voir
// Paramètres section « Notification push ») : demande la permission
// navigateur, enregistre le service worker (public/sw.js), s'abonne
// auprès du service de push du navigateur, puis enregistre l'abonnement
// en base (push_subscriptions, lu par app/api/push-admin-paiement et
// app/api/cron/rapport-hebdo selon le type de notification à envoyer).
// `onConflict: "endpoint"` : ré-activer sur un appareil déjà abonné met
// simplement à jour la ligne existante plutôt que d'échouer sur la
// contrainte unique.
export async function activerNotificationsPush(businessId) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied" };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, reason: "missing_vapid_key" };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ business_id: businessId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  if (error) return { ok: false, reason: "db_error", message: error.message };

  return { ok: true };
}

// Vérifie si CET appareil a déjà un abonnement push actif — sert à
// afficher un indicateur d'état (voir Paramètres, section « Notification
// push ») visible immédiatement à l'arrivée sur la page, sans attendre un
// clic sur le bouton d'activation. N'interroge jamais push_subscriptions
// côté serveur : si un abonnement navigateur existe encore, c'est qu'il a
// bien été enregistré en base au moment de l'activation
// (activerNotificationsPush ci-dessus) — la source de vérité pour « cet
// appareil précis est-il abonné » reste le navigateur lui-même.
export async function verifierAbonnementPushActif() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
}
