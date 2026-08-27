import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const VAPID_SUBJECT = "mailto:koua.nancy@gmail.com";

// Route serveur (jamais exposée au navigateur) : appelée directement par
// le client admin (app/(app)/admin/commercants/[id]/page.js,
// `marquerPaye()`) juste après le succès de la RPC
// admin_mark_subscription_paid, qui insère déjà la notification 🔔
// "paiement_valide" en base — cette route ne fait qu'ajouter la vraie
// notification Web Push par-dessus, si le commerçant a activé le push sur
// au moins un appareil (voir Paramètres, section « Notification push »).
// Best effort côté client (voir marquerPaye) : un échec ici ne remet
// jamais en cause la validation du paiement elle-même, déjà faite.
//
// Auth par jeton (Bearer + is_admin_user()), pas par secret partagé —
// même schéma que app/api/admin/supprimer-commercant : l'appelant est
// toujours un navigateur admin authentifié, jamais une tâche planifiée
// Vercel ni un trigger Postgres, donc pas besoin du mécanisme
// CRON_SECRET/PUSH_ADMIN_SECRET (Vault + pg_net) utilisé par les routes
// déclenchées côté serveur.
export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[push-paiement-valide] Variables d'environnement Supabase manquantes.");
    return Response.json({ sent: 0, reason: "server_misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return Response.json({ sent: 0, reason: "unauthorized" }, { status: 401 });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return Response.json({ sent: 0, reason: "unauthorized" }, { status: 401 });
  }

  const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("is_admin_user");
  if (adminCheckError || !isAdmin) {
    return Response.json({ sent: 0, reason: "forbidden" }, { status: 403 });
  }

  const { businessId, expiresAt } = await request.json().catch(() => ({}));
  if (!businessId) {
    return Response.json({ sent: 0, reason: "missing_business_id" }, { status: 400 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("[push-paiement-valide] Clés VAPID absentes : notification push ignorée.");
    return Response.json({ sent: 0, reason: "missing_vapid_keys" });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  // Droits élevés seulement à partir d'ici : le statut admin de l'appelant
  // est déjà vérifié ci-dessus via is_admin_user() — nécessaire pour lire
  // push_subscriptions d'une autre boutique que la sienne.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: abonnements, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("business_id", businessId);
  if (error) {
    console.error("[push-paiement-valide] échec de lecture de push_subscriptions :", error);
    return Response.json({ sent: 0, reason: "db_error" }, { status: 500 });
  }

  // Même texte que la notification 🔔 posée par admin_mark_subscription_paid
  // (supabase-confirmation-paiement-migration.sql), pour rester cohérent
  // entre les deux canaux.
  const dateTexte = expiresAt ? new Date(expiresAt).toLocaleDateString("fr-FR") : "";
  const payload = JSON.stringify({
    title: "Paiement validé",
    body: dateTexte ? `Ton paiement a été validé, ton abonnement est actif jusqu'au ${dateTexte}.` : "Ton paiement a été validé.",
    url: "/parametres",
  });

  let envoyes = 0;
  const aSupprimer = [];
  for (const abo of abonnements || []) {
    try {
      await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, payload);
      envoyes += 1;
    } catch (err) {
      // 404/410 : abonnement expiré côté navigateur, nettoyé pour ne plus
      // jamais réessayer dessus — même logique que
      // app/api/push-admin-paiement et app/api/cron/rapport-hebdo.
      if (err.statusCode === 404 || err.statusCode === 410) {
        aSupprimer.push(abo.id);
      } else {
        console.error(`[push-paiement-valide] échec d'envoi pour l'abonnement ${abo.id} :`, err.message || err);
      }
    }
  }

  if (aSupprimer.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", aSupprimer);
  }

  return Response.json({ sent: envoyes, total: (abonnements || []).length, cleaned: aSupprimer.length });
}
