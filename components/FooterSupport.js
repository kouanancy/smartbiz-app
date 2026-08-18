"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toWhatsAppNumber } from "@/lib/format";

const SUPPORT_EMAIL = "contact@doka.ci";

// Pied de page du site vitrine : mêmes canaux de support réels que
// app/(app)/aide/page.js (WhatsApp + e-mail), pas une simple mention
// décorative — même lecture publique de
// parametres_globaux.support_telephone (aucune session requise). Le lien
// WhatsApp n'apparaît que si un numéro est configuré, comme sur la page
// Aide.
export default function FooterSupport() {
  const [supportTelephone, setSupportTelephone] = useState("");

  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("support_telephone")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSupportTelephone(data?.support_telephone || ""));
  }, []);

  const numeroWhatsApp = toWhatsAppNumber(supportTelephone);

  return (
    <div className="sb-landing-footer-support">
      <span>Support :</span>
      {numeroWhatsApp && (
        <a href={`https://wa.me/${numeroWhatsApp}`} target="_blank" rel="noreferrer">
          <MessageCircle size={13} /> WhatsApp
        </a>
      )}
      <a href={`mailto:${SUPPORT_EMAIL}`}>
        <Mail size={13} /> {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
