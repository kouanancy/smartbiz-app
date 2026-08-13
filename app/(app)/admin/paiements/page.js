"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

// Page dédiée (accès permanent depuis le bouton en haut de l'espace
// Administration, badge compris) plutôt qu'une simple carte conditionnelle
// sur le tableau de bord — c'est aussi la cible de la notification push
// reçue par l'administratrice à chaque nouveau justificatif (voir
// app/api/push-admin-paiement, qui pointe en fait directement sur la fiche
// du paiement concerné quand elle est connue, cette liste servant surtout
// de point d'entrée permanent et de vue d'ensemble).
export default function PaiementsEnAttentePage() {
  const { business } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const [businesses, setBusinesses] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (business && !business.is_admin) router.replace("/dashboard");
  }, [business, router]);

  useEffect(() => {
    if (!business?.is_admin) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [{ data: liste }, { data: enAttente }] = await Promise.all([
        supabase.rpc("admin_list_businesses"),
        supabase.from("paiements_abonnement").select("*").eq("statut", "en_attente").order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      setBusinesses(liste || []);
      setPaiements(enAttente || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.is_admin]);

  if (!business?.is_admin) return null;
  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const maintenant = new Date();

  function nomBoutique(businessId) {
    return businesses.find((x) => x.id === businessId)?.name || t("common.defaultBusinessName");
  }

  function formuleBoutique(businessId) {
    return businesses.find((x) => x.id === businessId)?.plan || "autonome";
  }

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/admin")}>
        <ArrowLeft size={15} /> {t("admin.detailBackToList")}
      </button>

      <h1 className="sb-h1">{t("admin.paiementsEnAttenteTitle")}</h1>
      <p className="sb-sub">{t("admin.paiementsEnAttenteSub")}</p>

      {paiements.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("admin.aucunPaiementEnAttente")}</p>
      ) : (
        <div className="sb-card">
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("admin.colBoutique")}</th>
                  <th>{t("admin.colFormule")}</th>
                  <th>{t("paiement.colMontant")}</th>
                  <th>{t("admin.colDateSoumission")}</th>
                </tr>
              </thead>
              <tbody>
                {paiements.map((p) => {
                  const jours = Math.floor((maintenant - new Date(p.created_at)) / (1000 * 60 * 60 * 24));
                  return (
                    <tr key={p.id} className="sb-row-clickable" onClick={() => router.push(`/admin/commercants/${p.business_id}`)}>
                      <td>{nomBoutique(p.business_id)}</td>
                      <td>{t(`common.plans.${formuleBoutique(p.business_id)}.nom`)}</td>
                      <td className="sb-mono">{fmt(p.montant)}</td>
                      <td>
                        {new Date(p.created_at).toLocaleDateString(dateLocale(business?.langue))}{" "}
                        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>({t("admin.depuisNJours", { n: jours })})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
