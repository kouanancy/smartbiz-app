const ADMIN_EMAIL = "koua.nancy@gmail.com";

// Route serveur (jamais exposée au navigateur) : seul endroit où
// RESEND_API_KEY est utilisée. Notification "best effort" — son échec ne
// doit jamais bloquer l'envoi du justificatif par le commerçant, l'admin
// voit de toute façon les paiements en attente dans l'espace
// Administration.
export async function POST(request) {
  const { businessName } = await request.json().catch(() => ({}));
  const apiKey = process.env.RESEND_API_KEY;

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
        from: process.env.RESEND_FROM_EMAIL || "SmartBiz <onboarding@resend.dev>",
        to: ADMIN_EMAIL,
        subject: `Nouveau paiement à vérifier — ${businessName || "une boutique"}`,
        text: `${businessName || "Une boutique"} vient d'envoyer un justificatif de paiement sur SmartBiz. Rends-toi dans l'espace Administration pour le vérifier.`,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return Response.json({ sent: true });
  } catch (err) {
    console.error("Échec de l'envoi de l'e-mail de notification admin :", err);
    return Response.json({ sent: false });
  }
}
