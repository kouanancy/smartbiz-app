"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase } from "@/lib/format";
import { OPERATEURS_MOBILE_MONEY } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import Receipt from "@/components/Receipt";

export default function NouvelleCommandePage() {
  const { business, setBusiness } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [zones, setZones] = useState([]);
  const [enAttenteParArticle, setEnAttenteParArticle] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [mode, setMode] = useState("existant");
  const [clientId, setClientId] = useState("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauAdresse, setNouveauAdresse] = useState("");
  const [nouveauEmail, setNouveauEmail] = useState("");
  const [nouveauTel, setNouveauTel] = useState("");
  const [erreurTel, setErreurTel] = useState(false);
  const [clientMsg, setClientMsg] = useState("");

  const [lignes, setLignes] = useState([]);
  const [articleSel, setArticleSel] = useState("");
  const [qte, setQte] = useState(1);

  const [typeLivraison, setTypeLivraison] = useState("boutique");
  const [zoneLivraison, setZoneLivraison] = useState("");
  const [modePaiement, setModePaiement] = useState("livraison");
  const [operateur, setOperateur] = useState(OPERATEURS_MOBILE_MONEY[0]);

  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [clientsRes, articlesRes, zonesRes, enAttenteRes] = await Promise.all([
        supabase.from("clients").select("*").eq("business_id", business.id).eq("actif", true).order("nom"),
        supabase.from("articles").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("zones_livraison").select("*").eq("business_id", business.id).order("zone"),
        supabase
          .from("commande_lignes")
          .select("article_id, quantite, commandes!inner(business_id, statut)")
          .eq("commandes.business_id", business.id)
          .eq("commandes.statut", "en_attente"),
      ]);
      if (!active) return;
      setClients(clientsRes.data || []);
      setArticles(articlesRes.data || []);
      setZones(zonesRes.data || []);
      setZoneLivraison(zonesRes.data?.[0]?.zone ?? "");
      const parArticle = {};
      (enAttenteRes.data || []).forEach((l) => {
        parArticle[l.article_id] = (parArticle[l.article_id] || 0) + l.quantite;
      });
      setEnAttenteParArticle(parArticle);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const numeroPrevu = `CMD-${String(business?.next_numero ?? 1).padStart(4, "0")}`;
  const clientSelectionne = clients.find((c) => c.id === clientId);
  const articleSelectionne = articles.find((a) => a.id === articleSel);

  const stockDispo = (id) => {
    const art = articles.find((a) => a.id === id);
    const deja = lignes.filter((l) => l.articleId === id).reduce((s, l) => s + l.quantite, 0);
    return art ? art.stock - deja : 0;
  };

  // Stock réel moins ce que les commandes déjà en attente de livraison
  // couvrent sur cet article — purement informatif, ne bloque pas la
  // sélection (seul le stock réel, via stockDispo, la limite).
  const stockTheorique = (id) => {
    const art = articles.find((a) => a.id === id);
    if (!art) return 0;
    return art.stock - (enAttenteParArticle[id] || 0);
  };

  function addLigne() {
    if (!articleSel || qte < 1 || qte > stockDispo(articleSel)) return;
    setLignes((prev) => {
      const existe = prev.find((l) => l.articleId === articleSel);
      if (existe) return prev.map((l) => (l.articleId === articleSel ? { ...l, quantite: l.quantite + qte } : l));
      return [...prev, { articleId: articleSel, quantite: qte }];
    });
    setQte(1);
  }

  function removeLigne(id) {
    setLignes((prev) => prev.filter((l) => l.articleId !== id));
  }

  const totalCa = lignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + art.prix_vente * l.quantite;
  }, 0);
  const totalMargeReelle = lignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + (art.prix_vente - art.prix_achat - (art.frais_annexes || 0)) * l.quantite;
  }, 0);
  const fraisLivraison =
    typeLivraison === "livraison" ? zones.find((z) => z.zone === zoneLivraison)?.frais || 0 : 0;
  const totalAvecLivraison = totalCa + fraisLivraison;
  const peutValider = lignes.length > 0 && !!clientId && !saving;

  async function enregistrerClient() {
    if (!nouveauTel.trim()) {
      setErreurTel(true);
      return;
    }
    setErreurTel(false);
    const normTel = nouveauTel.replace(/\D/g, "");
    const doublon = clients.find((c) => c.telephone?.replace(/\D/g, "") === normTel);
    if (doublon) {
      setClientMsg(t("nouvelle.duplicatePhone", { nom: doublon.nom || t("nouvelle.autreCliente") }));
      return;
    }
    const { data, error } = await supabase
      .from("clients")
      .insert({
        business_id: business.id,
        nom: nouveauNom.trim(),
        telephone: nouveauTel.trim(),
        adresse: nouveauAdresse.trim() || null,
        email: nouveauEmail.trim() || null,
      })
      .select()
      .single();
    if (error) {
      setClientMsg(t("common.error", { message: error.message }));
      return;
    }
    setClients((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    setClientId(data.id);
    setMode("existant");
    setClientMsg(t("nouvelle.clienteSavedSuccess", { nom: data.nom || t("nouvelle.defaultClienteNom") }));
    setNouveauNom("");
    setNouveauAdresse("");
    setNouveauEmail("");
    setNouveauTel("");
  }

  async function valider() {
    setSaveError("");
    setSaving(true);
    try {
      const fullLignes = lignes.map((l) => {
        const art = articles.find((a) => a.id === l.articleId);
        return {
          articleId: l.articleId,
          nom: art.nom,
          quantite: l.quantite,
          prix_vente: art.prix_vente,
          prix_achat: art.prix_achat,
          frais_annexes: art.frais_annexes || 0,
        };
      });
      const ca = fullLignes.reduce((s, l) => s + l.prix_vente * l.quantite, 0);
      const marge = fullLignes.reduce(
        (s, l) => s + (l.prix_vente - l.prix_achat - l.frais_annexes) * l.quantite,
        0
      );
      const numero = numeroPrevu;

      const { data: commande, error: commandeError } = await supabase
        .from("commandes")
        .insert({
          business_id: business.id,
          numero,
          client_id: clientId,
          ca,
          marge,
          livraison_type: typeLivraison,
          livraison_zone: typeLivraison === "livraison" ? zoneLivraison : null,
          livraison_frais: fraisLivraison,
          paiement_mode: modePaiement,
          paiement_operateur: modePaiement === "mobile_money" ? operateur : null,
        })
        .select()
        .single();
      if (commandeError) throw commandeError;

      const { error: lignesError } = await supabase.from("commande_lignes").insert(
        fullLignes.map((l) => ({
          commande_id: commande.id,
          article_id: l.articleId,
          quantite: l.quantite,
          prix_vente: l.prix_vente,
          prix_achat: l.prix_achat,
          frais_annexes: l.frais_annexes,
        }))
      );
      if (lignesError) throw lignesError;

      // Le stock n'est plus déduit ici : la commande démarre "en attente de
      // livraison" (statut par défaut en base) et ne touche au stock qu'au
      // moment où elle est marquée "Livrée" depuis la page Commandes.

      const { data: updatedBusiness } = await supabase
        .from("businesses")
        .update({ next_numero: (business.next_numero || 1) + 1 })
        .eq("id", business.id)
        .select()
        .single();
      if (updatedBusiness) setBusiness(updatedBusiness);

      setEnAttenteParArticle((prev) => {
        const next = { ...prev };
        fullLignes.forEach((l) => {
          next[l.articleId] = (next[l.articleId] || 0) + l.quantite;
        });
        return next;
      });

      setReceipt({
        numero,
        created_at: commande.created_at,
        client: clientSelectionne,
        lignes: fullLignes,
        ca,
        livraison_type: typeLivraison,
        livraison_zone: typeLivraison === "livraison" ? zoneLivraison : null,
        livraison_frais: fraisLivraison,
        paiement_mode: modePaiement,
        paiement_operateur: modePaiement === "mobile_money" ? operateur : null,
      });
      // Formulaire entièrement remis à son état initial pour la prochaine
      // saisie — la commande qui vient d'être enregistrée reste consultable
      // via le reçu qui s'ouvre juste après.
      setMode("existant");
      setClientId("");
      setNouveauNom("");
      setNouveauAdresse("");
      setNouveauEmail("");
      setNouveauTel("");
      setErreurTel(false);
      setClientMsg("");
      setLignes([]);
      setArticleSel("");
      setQte(1);
      setTypeLivraison("boutique");
      setZoneLivraison(zones[0]?.zone ?? "");
      setModePaiement("livraison");
      setOperateur(OPERATEURS_MOBILE_MONEY[0]);
    } catch (err) {
      setSaveError(err.message || t("nouvelle.genericSaveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">{t("nouvelle.title")}</h1>
          <p className="sb-sub">{t("nouvelle.subtitle")}</p>
        </div>
        <div className="sb-badge sb-badge-emerald" style={{ fontSize: 12.5, padding: "6px 10px" }}>
          {t("nouvelle.numeroPrefix", { numero: numeroPrevu })}
        </div>
      </div>

      {saveError && <div className="sb-auth-error">{saveError}</div>}

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("nouvelle.step1")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={`sb-btn ${mode === "existant" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => {
              setMode("existant");
              setClientMsg("");
            }}
          >
            {t("nouvelle.clienteExistante")}
          </button>
          <button
            className={`sb-btn ${mode === "nouveau" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => {
              setMode("nouveau");
              setClientMsg("");
            }}
          >
            {t("nouvelle.nouvelleCliente")}
          </button>
        </div>

        {clientMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {clientMsg}
          </div>
        )}

        {mode === "existant" ? (
          clients.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B6A63" }}>{t("nouvelle.aucuneCliente")}</p>
          ) : (
            <>
              <div className="sb-field">
                <label>{t("nouvelle.clienteLabel")}</label>
                <select className="sb-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">{t("nouvelle.selectCliente")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} — {c.telephone}
                    </option>
                  ))}
                </select>
              </div>
              {clientSelectionne && (
                <div className="sb-client-fiche">
                  <div>
                    <span>{t("nouvelle.telephoneFiche")}</span>
                    <strong>{clientSelectionne.telephone}</strong>
                  </div>
                  <div>
                    <span>{t("nouvelle.adresseFiche")}</span>
                    <strong>{clientSelectionne.adresse || "—"}</strong>
                  </div>
                  <div>
                    <span>{t("nouvelle.emailFiche")}</span>
                    <strong>{clientSelectionne.email || "—"}</strong>
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <div className="sb-form-grid">
            <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
              <label>{t("nouvelle.nomLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("nouvelle.nomPlaceholder")}
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
              />
            </div>
            <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
              <label>{t("nouvelle.adresseLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("nouvelle.adressePlaceholder")}
                value={nouveauAdresse}
                onChange={(e) => setNouveauAdresse(e.target.value)}
              />
            </div>
            <div className="sb-field">
              <label>{t("nouvelle.emailLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("nouvelle.emailPlaceholder")}
                type="email"
                value={nouveauEmail}
                onChange={(e) => setNouveauEmail(e.target.value)}
              />
            </div>
            <div className="sb-field">
              <label>{t("nouvelle.telephoneLabel")}</label>
              <input
                className="sb-input"
                placeholder={t("nouvelle.telephonePlaceholder")}
                value={nouveauTel}
                onChange={(e) => {
                  setNouveauTel(e.target.value);
                  if (erreurTel) setErreurTel(false);
                }}
                style={erreurTel ? { borderColor: "#C24E37" } : undefined}
              />
              <p style={{ fontSize: 11, color: erreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
                {erreurTel ? t("nouvelle.telephoneRequiredError") : t("nouvelle.telephoneHint")}
              </p>
            </div>
            <button
              className="sb-btn sb-btn-emerald"
              style={{ gridColumn: "1 / 3", justifyContent: "center" }}
              onClick={enregistrerClient}
            >
              <CheckCircle2 size={14} /> {t("nouvelle.saveCliente")}
            </button>
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("nouvelle.step2")}</div>
        {articles.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6B6A63" }}>
            {t("nouvelle.aucunArticlePrefix")} <Link href="/articles">{t("sidebar.nav.articles")}</Link>.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="sb-field" style={{ flex: 2, minWidth: 160 }}>
                <label>{t("nouvelle.articleLabel")}</label>
                <select className="sb-input" value={articleSel} onChange={(e) => setArticleSel(e.target.value)}>
                  <option value="">{t("nouvelle.selectArticle")}</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.stock === 0}>
                      {a.nom} — {fmt(a.prix_vente)} {t("nouvelle.stockSuffix", { n: a.stock })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sb-field" style={{ flex: 0.5, minWidth: 70 }}>
                <label>{t("nouvelle.quantiteLabel")}</label>
                <input
                  className="sb-input"
                  type="number"
                  min={1}
                  max={articleSel ? stockDispo(articleSel) : undefined}
                  value={qte}
                  onChange={(e) => setQte(Number(e.target.value))}
                />
              </div>
              <button className="sb-btn sb-btn-primary" onClick={addLigne} disabled={!articleSel || stockDispo(articleSel) < 1}>
                <Plus size={14} /> {t("nouvelle.ajouter")}
              </button>
            </div>

            {articleSelectionne && (
              <div className="sb-preview-prix">
                <div>
                  <span>{t("nouvelle.prixVente")}</span>
                  <strong>{fmt(articleSelectionne.prix_vente)}</strong>
                </div>
                <div>
                  <span>{t("nouvelle.prixAchat")}</span>
                  <strong>{fmt(articleSelectionne.prix_achat)}</strong>
                </div>
                <div>
                  <span>{t("nouvelle.margeUnitaire")}</span>
                  <strong
                    style={{
                      color:
                        articleSelectionne.prix_vente - articleSelectionne.prix_achat - (articleSelectionne.frais_annexes || 0) >= 0
                          ? "#0E8F6E"
                          : "#C24E37",
                    }}
                  >
                    {fmt(articleSelectionne.prix_vente - articleSelectionne.prix_achat - (articleSelectionne.frais_annexes || 0))}
                  </strong>
                </div>
              </div>
            )}

            {articleSelectionne && stockTheorique(articleSelectionne.id) <= 0 && (
              <div
                className="sb-badge sb-badge-amber"
                style={{ marginTop: 10, fontSize: 12, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}
              >
                <AlertTriangle size={13} />
                {t("nouvelle.dejaCommandeWarning")}
              </div>
            )}

            {lignes.length === 0 ? (
              <p style={{ fontSize: 13, color: "#6B6A63", marginTop: 12 }}>{t("nouvelle.aucunArticleAjoute")}</p>
            ) : (
              <div className="sb-table-scroll" style={{ marginTop: 14 }}>
                <table className="sb-table">
                  <thead>
                    <tr>
                      <th>{t("nouvelle.colArticle")}</th>
                      <th>{t("nouvelle.colPrixVente")}</th>
                      <th>{t("nouvelle.colPrixAchat")}</th>
                      <th>{t("nouvelle.colMarge")}</th>
                      <th>{t("nouvelle.colQte")}</th>
                      <th>{t("nouvelle.colSousTotal")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const art = articles.find((a) => a.id === l.articleId);
                      const margeUnitaire = art.prix_vente - art.prix_achat - (art.frais_annexes || 0);
                      return (
                        <tr key={l.articleId}>
                          <td>{art.nom}</td>
                          <td className="sb-mono">{fmt(art.prix_vente)}</td>
                          <td className="sb-mono">{fmt(art.prix_achat)}</td>
                          <td className="sb-mono" style={{ color: margeUnitaire >= 0 ? "#0E8F6E" : "#C24E37" }}>
                            {fmt(margeUnitaire)}
                          </td>
                          <td className="sb-mono">{l.quantite}</td>
                          <td className="sb-mono">{fmt(art.prix_vente * l.quantite)}</td>
                          <td>
                            <button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => removeLigne(l.articleId)}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("nouvelle.step3")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={`sb-btn ${typeLivraison === "boutique" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => setTypeLivraison("boutique")}
          >
            {t("nouvelle.recuperationBoutique")}
          </button>
          <button
            className={`sb-btn ${typeLivraison === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => setTypeLivraison("livraison")}
            disabled={zones.length === 0}
          >
            {t("nouvelle.livraison")}
          </button>
        </div>
        {typeLivraison === "livraison" ? (
          <div className="sb-field">
            <label>{t("nouvelle.zoneLivraisonLabel")}</label>
            <select className="sb-input" value={zoneLivraison} onChange={(e) => setZoneLivraison(e.target.value)}>
              {zones.map((z) => (
                <option key={z.id} value={z.zone}>
                  {z.zone} — {fmt(z.frais)}
                </option>
              ))}
            </select>
          </div>
        ) : zones.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: 0 }}>
            {t("nouvelle.aucuneZonePrefix")} <Link href="/parametres">{t("sidebar.nav.parametres")}</Link>.
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: 0 }}>{t("nouvelle.aucunFraisLivraison")}</p>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("nouvelle.step4")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            className={`sb-btn ${modePaiement === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => setModePaiement("livraison")}
          >
            {t("nouvelle.paiementLivraison")}
          </button>
          <button
            className={`sb-btn ${modePaiement === "mobile_money" ? "sb-btn-primary" : "sb-btn-ghost"}`}
            onClick={() => setModePaiement("mobile_money")}
          >
            {t("nouvelle.mobileMoney")}
          </button>
        </div>
        {modePaiement === "mobile_money" && (
          <div className="sb-field">
            <label>{t("nouvelle.operateurLabel")}</label>
            <select className="sb-input" value={operateur} onChange={(e) => setOperateur(e.target.value)}>
              {OPERATEURS_MOBILE_MONEY.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="sb-card">
        <div className="sb-section-title">{t("nouvelle.resume")}</div>
        <div className="sb-resume-commande">
          <div>
            <span>{t("nouvelle.totalArticles")}</span>
            <strong>{fmt(totalCa)}</strong>
          </div>
          <div>
            <span>{t("nouvelle.fraisLivraison")}</span>
            <strong>{fmt(fraisLivraison)}</strong>
          </div>
          <div className="sb-resume-total">
            <span>{t("nouvelle.totalAPayer")}</span>
            <strong>{fmt(totalAvecLivraison)}</strong>
          </div>
          <div>
            <span>{t("nouvelle.margeEstimee")}</span>
            <strong style={{ color: totalMargeReelle >= 0 ? "#0E8F6E" : "#C24E37" }}>{fmt(totalMargeReelle)}</strong>
          </div>
        </div>
        <button className="sb-btn sb-btn-emerald" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} disabled={!peutValider} onClick={valider}>
          <CheckCircle2 size={15} /> {saving ? t("nouvelle.enregistrement") : t("nouvelle.enregistrerConfirmer")}
        </button>
      </div>

      {receipt && <Receipt commande={receipt} business={business} onClose={() => setReceipt(null)} />}
    </div>
  );
}
