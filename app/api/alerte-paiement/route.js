import { PLANS, PLAN_PRICES } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { fmt } from "@/lib/format";

const ADMIN_EMAIL = "koua.nancy@gmail.com";

// Libellé + prix indicatif d'une formule pour l'e-mail ci-dessous (ex.
// "Clé en main (5 000 FCFA/mois + 15 000 FCFA à l'installation)") — pour
// que l'admin sache immédiatement quel montant vérifier sans aller
// chercher l'information ailleurs. Toujours en français, comme le reste
// de cet e-mail interne.
function libelleFormule(plan) {
  const key = PLANS.includes(plan) ? plan : "autonome";
  const { mensuel, installation } = PLAN_PRICES[key];
  let prix = `${fmt(mensuel, "FCFA")}/mois`;
  if (installation) prix += ` + ${fmt(installation, "FCFA")} à l'installation`;
  return `${t("fr", `common.plans.${key}.nom`)} (${prix})`;
}

// Route serveur (jamais exposée au navigateur) : seul endroit où
// RESEND_API_KEY est utilisée. Déclenchée directement depuis Supabase
// (pg_net, voir notifier_admins_nouveau_justificatif dans
// supabase-alerte-paiement-serveur-migration.sql) dès qu'un commerçant
// envoie un justificatif — jamais depuis le navigateur du commerçant
// (contrairement à l'ancienne route /api/notify-admin-payment) : un
// fetch() envoyé depuis ce navigateur pouvait être bloqué en silence avant
// même de quitter la page (bloqueurs de pub filtrant par défaut toute URL
// contenant "notify"), sans laisser aucune trace exploitable côté serveur —
// d'où aussi ce renommage. Protégée par PAYMENT_ALERT_SECRET, même
// mécanisme que CRON_SECRET (app/api/cron/expiration-reminders) : sans
// elle, ou avec un jeton incorrect, la route refuse tout appel plutôt que
// d'accepter n'importe quel appelant.
export async function POST(request) {
  const alertSecret = process.env.PAYMENT_ALERT_SECRET;
  if (!alertSecret) {
    console.error("[alerte-paiement] PAYMENT_ALERT_SECRET absente : route désactivée.");
    return Response.json({ sent: false, reason: "missing_alert_secret" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${alertSecret}`) {
    return Response.json({ sent: false, reason: "unauthorized" }, { status: 401 });
  }

  const { businessName, plan } = await request.json().catch(() => ({}));
  const apiKey = process.env.RESEND_API_KEY;
  const formule = libelleFormule(plan);

  // Marqueur explicite à chaque appel (même en succès) : sans ça, un
  // échec silencieux côté Resend (mauvaise adresse d'expéditeur, clé
  // révoquée...) ne laisse aucune trace exploitable dans les logs
  // Vercel — impossible de distinguer "jamais appelée" de "appelée mais
  // échouée en silence" sans ce log systématique.
  console.log(`[alerte-paiement] appel reçu — boutique="${businessName || "?"}" formule=${plan || "?"}`);

  if (!apiKey) {
    console.warn("[alerte-paiement] RESEND_API_KEY absente : notification admin de paiement ignorée.");
    return Response.json({ sent: false, reason: "missing_api_key" });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Doka <onboarding@resend.dev>",
        to: ADMIN_EMAIL,
        subject: `Nouveau paiement à vérifier — ${businessName || "une boutique"}`,
        text: `${businessName || "Une boutique"} (formule ${formule}) vient d'envoyer un justificatif de paiement sur Doka. Rends-toi dans l'espace Administration pour le vérifier.`,
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      // Cause la plus fréquente avec l'adresse sandbox par défaut
      // (onboarding@resend.dev, utilisée tant que RESEND_FROM_EMAIL n'est
      // pas configurée avec un domaine vérifié) : Resend refuse d'envoyer
      // à toute adresse autre que celle du compte Resend lui-même — voir
      // README, section « Paiement manuel vérifié ».
      console.error(`[alerte-paiement] Resend a répondu ${res.status} : ${bodyText}`);
      return Response.json({ sent: false, reason: "resend_error", status: res.status });
    }
    console.log(`[alerte-paiement] e-mail envoyé avec succès à ${ADMIN_EMAIL}`);
    return Response.json({ sent: true });
  } catch (err) {
    console.error("[alerte-paiement] échec réseau lors de l'appel à Resend :", err);
    return Response.json({ sent: false, reason: "network_error" });
  }
}
