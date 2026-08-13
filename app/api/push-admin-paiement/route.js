import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const VAPID_SUBJECT = "mailto:koua.nancy@gmail.com";

// Route serveur (jamais exposée au navigateur) : déclenchée directement
// depuis Supabase (pg_net, voir notifier_admins_nouveau_justificatif dans
// supabase-push-notifications-migration.sql) dès qu'un commerçant envoie
// un justificatif. Remplace l'ancienne notification par e-mail
// (/api/alerte-paiement, retirée — jamais fiabilisée malgré plusieurs
// correctifs) par une vraie notification push envoyée à tous les comptes
// admin abonnés sur leur téléphone/ordinateur. Protégée par
// PUSH_ADMIN_SECRET, même mécanisme que CRON_SECRET/l'ancien
// PAYMENT_ALERT_SECRET : sans elle, ou avec un jeton incorrect, la route
// refuse tout appel.
export async function POST(request) {
  const pushSecret = process.env.PUSH_ADMIN_SECRET;
  if (!pushSecret) {
    console.error("[push-admin-paiement] PUSH_ADMIN_SECRET absente : route désactivée.");
    return Response.json({ sent: 0, reason: "missing_push_secret" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${pushSecret}`) {
    return Response.json({ sent: 0, reason: "unauthorized" }, { status: 401 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("[push-admin-paiement] Clés VAPID absentes : notification push ignorée.");
    return Response.json({ sent: 0, reason: "missing_vapid_keys" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[push-admin-paiement] SUPABASE_SERVICE_ROLE_KEY absente : notification push ignorée.");
    return Response.json({ sent: 0, reason: "missing_service_role_key" });
  }

  const { businessName, businessId } = await request.json().catch(() => ({}));
  console.log(`[push-admin-paiement] appel reçu — boutique="${businessName || "?"}"`);

  webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  // Client à droits élevés, comme app/api/cron/expiration-reminders :
  // nécessaire pour lire push_subscriptions de tous les comptes admin
  // (RLS restreint chaque admin à ses propres lignes, pas d'accès
  // multi-comptes possible avec la clé publique).
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: abonnements, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, businesses!inner(is_admin)")
    .eq("businesses.is_admin", true);
  if (error) {
    console.error("[push-admin-paiement] échec de lecture de push_subscriptions :", error);
    return Response.json({ sent: 0, reason: "db_error" }, { status: 500 });
  }

  // Emmène directement sur la fiche du paiement concerné plutôt que sur
  // le tableau de bord général quand on connaît la boutique (toujours le
  // cas ici, businessId vient de new.business_id côté trigger) — voir
  // README, « Notifications push (Web Push) ».
  const payload = JSON.stringify({
    title: "Nouveau paiement à vérifier",
    body: `${businessName || "Une boutique"} a envoyé un justificatif de paiement à vérifier.`,
    url: businessId ? `/admin/commercants/${businessId}` : "/admin",
  });

  let envoyes = 0;
  const aSupprimer = [];
  for (const abo of abonnements || []) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        payload
      );
      envoyes += 1;
    } catch (err) {
      // 404/410 : l'abonnement n'est plus valide côté navigateur
      // (désinstallation, permission révoquée...) — nettoyé pour ne plus
      // jamais réessayer dessus. Toute autre erreur (réseau, clé VAPID
      // incorrecte...) reste seulement journalisée, best effort comme
      // pour l'ancien e-mail.
      if (err.statusCode === 404 || err.statusCode === 410) {
        aSupprimer.push(abo.id);
      } else {
        console.error(`[push-admin-paiement] échec d'envoi pour l'abonnement ${abo.id} :`, err.message || err);
      }
    }
  }

  if (aSupprimer.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", aSupprimer);
  }

  console.log(`[push-admin-paiement] ${envoyes}/${(abonnements || []).length} notification(s) envoyée(s), ${aSupprimer.length} abonnement(s) expiré(s) nettoyé(s).`);
  return Response.json({ sent: envoyes, total: (abonnements || []).length, cleaned: aSupprimer.length });
}
