import { supabase } from "@/lib/supabaseClient";

// applicationServerKey attend un Uint8Array, pas la chaîne base64url
// telle quelle — conversion standard pour l'API Push.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Activation des notifications push sur cet appareil (compte admin
// uniquement, voir Paramètres) : demande la permission navigateur,
// enregistre le service worker (public/sw.js), s'abonne auprès du
// service de push du navigateur, puis enregistre l'abonnement en base
// (push_subscriptions, lu par app/api/push-admin-paiement à l'envoi
// d'un justificatif). `onConflict: "endpoint"` : ré-activer sur un
// appareil déjà abonné met simplement à jour la ligne existante plutôt
// que d'échouer sur la contrainte unique.
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
