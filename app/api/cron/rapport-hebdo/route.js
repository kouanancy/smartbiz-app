import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { t } from "@/lib/i18n";

const VAPID_SUBJECT = "mailto:koua.nancy@gmail.com";

// Route serveur (jamais exposée au navigateur) : déclenchée une fois par
// jour par Vercel Cron (voir vercel.json), même mécanisme que
// app/api/cron/expiration-reminders — protégée par le même CRON_SECRET
// (Vercel envoie automatiquement "Authorization: Bearer <CRON_SECRET>" sur
// tous les appels cron du projet dès que cette variable est configurée).
//
// boutiques_dues_rapport_hebdo() (voir supabase-rapport-hebdo-migration.sql)
// ne sélectionne QUE les boutiques où rapport_hebdo_actif = true et dont le
// jour d'envoi choisi correspond à aujourd'hui — respecte ainsi la
// contrainte du plan Vercel actuel (une seule exécution par jour, à heure
// fixe pour toutes les boutiques, jamais une granularité horaire par
// boutique) : c'est exactement la leçon tirée de l'ancien "Rapport de
// stock automatique" (retiré, voir README), qui avait dû abandonner un
// créneau horaire personnalisé pour cette même raison.
//
// Cette route ne calcule plus elle-même le contenu du rapport (CA, marge,
// top ventes, alertes de stock) : cette annonce ne fait plus que
// notifier — le contenu chiffré n'apparaît jamais dans une notification
// (visible même verrouillé sur l'écran d'un téléphone), seulement une
// fois la page /rapport-hebdo ouverte, qui recalcule elle-même la même
// fenêtre glissante de 7 jours à la demande (voir
// app/(app)/rapport-hebdo/page.js) — page consultable à tout moment,
// pas seulement au moment de cette notification (bouton "Rapport hebdo"
// du Dashboard).
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[rapport-hebdo] CRON_SECRET absente : rapport hebdomadaire désactivé.");
    return Response.json({ error: "CRON_SECRET manquante" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[rapport-hebdo] SUPABASE_SERVICE_ROLE_KEY absente : rapport hebdomadaire ignoré.");
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const pushDisponible = Boolean(vapidPublicKey && vapidPrivateKey);
  if (pushDisponible) webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  // boutiques_dues_rapport_hebdo() marque déjà rapport_hebdo_dernier_envoi
  // = aujourd'hui de façon atomique (update ... returning) au moment même
  // où elle sélectionne : une boutique due ne peut donc jamais être
  // sélectionnée deux fois, même si cette route tournait deux fois le
  // même jour.
  const { data: boutiques, error } = await supabaseAdmin.rpc("boutiques_dues_rapport_hebdo");
  if (error) {
    console.error("[rapport-hebdo] échec de boutiques_dues_rapport_hebdo :", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const resultats = [];

  for (const b of boutiques || []) {
    try {
      const langue = b.langue || "fr";
      const message = t(langue, "rapportHebdo.pushBody");

      // Canal unique : notification push (voir Paramètres, section
      // « Notification push », commune à tous les comptes). Notification
      // en cloche (historique consultable en app) systématique + vraie
      // notification Web Push si le commerçant a activé le push sur au
      // moins un appareil — sinon la boutique voit son rapport dans le
      // centre de notifications à sa prochaine connexion, sans erreur.
      // Les deux pointent vers /rapport-hebdo, jamais /dashboard : cliquer
      // dessus doit ouvrir directement la page du rapport.
      await supabaseAdmin
        .from("notifications")
        .insert({ business_id: b.business_id, type: "rapport_hebdo", message, lien: "/rapport-hebdo" });

      if (pushDisponible) {
        const { data: abonnements } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("business_id", b.business_id);
        const payload = JSON.stringify({ title: t(langue, "rapportHebdo.title"), body: message, url: "/rapport-hebdo" });
        const aSupprimer = [];
        for (const abo of abonnements || []) {
          try {
            await webpush.sendNotification({ endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } }, payload);
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) aSupprimer.push(abo.id);
            else console.error(`[rapport-hebdo] échec d'envoi push pour l'abonnement ${abo.id} :`, err.message || err);
          }
        }
        if (aSupprimer.length > 0) await supabaseAdmin.from("push_subscriptions").delete().in("id", aSupprimer);
      }

      resultats.push({ business_id: b.business_id, ok: true });
    } catch (err) {
      console.error(`[rapport-hebdo] échec pour la boutique ${b.business_id} :`, err);
      resultats.push({ business_id: b.business_id, ok: false });
    }
  }

  return Response.json({ traitees: resultats.length, resultats });
}
