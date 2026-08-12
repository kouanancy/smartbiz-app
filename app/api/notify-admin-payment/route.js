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
// RESEND_API_KEY est utilisée. Notification "best effort" — son échec ne
// doit jamais bloquer l'envoi du justificatif par le commerçant, l'admin
// voit de toute façon les paiements en attente dans l'espace
// Administration.
export async function POST(request) {
  const { businessName, plan } = await request.json().catch(() => ({}));
  const apiKey = process.env.RESEND_API_KEY;
  const formule = libelleFormule(plan);

  // Marqueur explicite à chaque appel (même en succès) : sans ça, un
  // échec silencieux côté Resend (mauvaise adresse d'expéditeur, clé
  // révoquée...) ne laisse aucune trace exploitable dans les logs
  // Vercel — impossible de distinguer "jamais appelée" de "appelée mais
  // échouée en silence" sans ce log systématique.
  console.log(`[notify-admin-payment] appel reçu — boutique="${businessName || "?"}" formule=${plan || "?"}`);

  if (!apiKey) {
    console.warn("[notify-admin-payment] RESEND_API_KEY absente : notification admin de paiement ignorée.");
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
      console.error(`[notify-admin-payment] Resend a répondu ${res.status} : ${bodyText}`);
      return Response.json({ sent: false, reason: "resend_error", status: res.status });
    }
    console.log(`[notify-admin-payment] e-mail envoyé avec succès à ${ADMIN_EMAIL}`);
    return Response.json({ sent: true });
  } catch (err) {
    console.error("[notify-admin-payment] échec réseau lors de l'appel à Resend :", err);
    return Response.json({ sent: false, reason: "network_error" });
  }
}
