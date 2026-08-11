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

  if (!apiKey) {
    console.warn("RESEND_API_KEY absente : notification admin de paiement ignorée.");
    return Response.json({ sent: false });
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
    if (!res.ok) throw new Error(await res.text());
    return Response.json({ sent: true });
  } catch (err) {
    console.error("Échec de l'envoi de l'e-mail de notification admin :", err);
    return Response.json({ sent: false });
  }
}
