"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";

// Crée immédiatement le brouillon (receptions, numéro REC-xxxx attribué
// par le trigger) -- voir supabase-achats-approvisionnement-migration.sql
// -- puis redirige vers son écran d'édition (app/(app)/achats/[id]/page.js),
// seul endroit où les lignes sont ensuite ajoutées. ?article=<id> (bouton
// "Réapprovisionner" d'une fiche article, module actif) pré-remplit une
// première ligne pour cet article, quantité 1 par défaut, au coût d'achat
// actuellement enregistré -- l'utilisateur ajuste ensuite librement avant
// de valider.
export default function NouvelleReceptionPage() {
  const { business } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [erreur, setErreur] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!business?.id || started.current) return;
    started.current = true;
    const articleId = searchParams.get("article");

    async function creer() {
      const { data: reception, error } = await supabase
        .from("receptions")
        .insert({
          business_id: business.id,
          taux_change_valeur: business.taux_change_valeur,
          taux_change_devise: business.taux_change_devise,
        })
        .select()
        .single();
      if (error || !reception) {
        setErreur(error?.message || t("achats.creationError"));
        return;
      }

      if (articleId) {
        const { data: article } = await supabase.from("articles").select("prix_achat").eq("id", articleId).eq("business_id", business.id).maybeSingle();
        if (article) {
          await supabase.from("reception_lignes").insert({
            reception_id: reception.id,
            article_id: articleId,
            quantite: 1,
            cout_unitaire: article.prix_achat,
          });
        }
      }

      router.replace(`/achats/${reception.id}`);
    }
    creer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t change de comportement en même temps que business?.langue, déjà couvert par la dépendance business
  }, [business, router, searchParams]);

  if (erreur) return <p className="sb-sub" style={{ color: "var(--coral)" }}>{erreur}</p>;
  return <p className="sb-sub">{t("common.loading")}</p>;
}
