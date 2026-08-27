import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "Doka <onboarding@resend.dev>";
const VAPID_SUBJECT = "mailto:koua.nancy@gmail.com";

// Route serveur (jamais exposée au navigateur) : seul endroit où
// SUPABASE_SERVICE_ROLE_KEY est utilisée. Déclenchée une fois par jour par
// Vercel Cron (voir vercel.json). Protégée par CRON_SECRET — Vercel envoie
// automatiquement "Authorization: Bearer <CRON_SECRET>" sur les appels
// cron dès que cette variable est configurée sur le projet ; sans elle,
// n'importe qui pourrait déclencher la route à volonté et spammer les
// commerçants de rappels, donc on refuse de fonctionner tant qu'elle n'est
// pas définie plutôt que de fonctionner en clair par défaut.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET absente : rappel d'expiration désactivé.");
    return Response.json({ error: "CRON_SECRET manquante" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY absente : rappel d'expiration ignoré.");
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  }

  // Client à droits élevés, jamais utilisé côté navigateur : nécessaire
  // pour parcourir toutes les boutiques (generer_notifications_expiration
  // n'est volontairement accordée à aucun rôle client, voir
  // supabase-notifications-migration.sql).
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: boutiques, error } = await supabaseAdmin.rpc("generer_notifications_expiration");
  if (error) {
    console.error("Échec de generer_notifications_expiration :", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // generer_notifications_expiration() ne renvoie que les boutiques pour
  // lesquelles une notification a vraiment été créée cette fois-ci (grâce
  // au ON CONFLICT (dedupe_key) DO NOTHING côté SQL) : l'e-mail et la
  // notification push ne sont donc envoyés, comme la notification en
  // base, qu'une seule fois par échéance — jamais à chaque exécution
  // quotidienne tant que l'abonnement reste dans la fenêtre des 3 jours.
  const resendApiKey = process.env.RESEND_API_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const pushDisponible = Boolean(vapidPublicKey && vapidPrivateKey);
  if (pushDisponible) webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  const resultats = [];
  for (const b of boutiques || []) {
    const dateTexte = new Date(b.subscription_expires_at).toLocaleDateString("fr-FR");
    let emailEnvoye = false;
    if (resendApiKey && b.business_email) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: b.business_email,
            subject: "Ton abonnement Doka expire bientôt",
            text: `Bonjour ${b.business_name || ""},\n\nTon abonnement Doka expire le ${dateTexte}. Rends-toi dans Paramètres pour le renouveler et éviter toute interruption de service.`,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        emailEnvoye = true;
      } catch (err) {
        console.error(`Échec de l'e-mail de rappel d'expiration pour ${b.business_id} :`, err);
      }
    }

    // Vraie notification Web Push, en plus de la cloche déjà posée par
    // generer_notifications_expiration() — voir Paramètres, section
    // « Notification push » (commune aux comptes admin et commerçant
    // classique). Sans abonnement actif sur aucun appareil, la boucle
    // ci-dessous ne trouve simplement rien à envoyer.
    let pushEnvoyes = 0;
    if (pushDisponible) {
      const { data: abonnements } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("business_id", b.business_id);
      const payload = JSON.stringify({
        title: "Abonnement bientôt expiré",
        body: `Ton abonnement Doka expire le ${dateTexte}.`,
        url: "/parametres",
      });
      const aSupprimer = [];
      for (const abo of abonnements || []) {
        try {
          await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, payload);
          pushEnvoyes += 1;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) aSupprimer.push(abo.id);
          else console.error(`Échec d'envoi push de rappel d'expiration pour l'abonnement ${abo.id} :`, err.message || err);
        }
      }
      if (aSupprimer.length > 0) await supabaseAdmin.from("push_subscriptions").delete().in("id", aSupprimer);
    }

    resultats.push({ business_id: b.business_id, email: emailEnvoye, push: pushEnvoyes });
  }

  return Response.json({ notifiees: resultats.length, resultats });
}
