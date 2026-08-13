"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, FileText, Palette, Plus, Truck, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { activerNotificationsPush } from "@/lib/push";
import { fmt as fmtBase } from "@/lib/format";
import { THEMES, MODES_AFFICHAGE } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import ImageUploadField from "@/components/ImageUploadField";
import PaiementAbonnement from "@/components/PaiementAbonnement";

export default function ParametresPage() {
  const { business, setBusiness } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [nameDraft, setNameDraft] = useState(business?.name || "");
  const [logoDraft, setLogoDraft] = useState(business?.logo_url || "");
  const [emailDraft, setEmailDraft] = useState(business?.notif_email || "");
  const [confirmationEmail, setConfirmationEmail] = useState(business?.confirmation_email || false);
  const [savedMsg, setSavedMsg] = useState("");
  const [notifMsg, setNotifMsg] = useState("");
  const [pushMsg, setPushMsg] = useState({ texte: "", ok: false });
  const [pushEnCours, setPushEnCours] = useState(false);

  // Réservé au compte admin (bouton masqué ci-dessous pour les autres) —
  // voir lib/push.js et README, section « Notifications push (Web Push) ».
  async function onClickActiverPush() {
    setPushMsg({ texte: "", ok: false });
    setPushEnCours(true);
    const resultat = await activerNotificationsPush(business.id);
    setPushEnCours(false);
    if (resultat.ok) {
      setPushMsg({ texte: t("parametres.pushActive"), ok: true });
      return;
    }
    if (resultat.reason === "unsupported") setPushMsg({ texte: t("parametres.pushUnsupported"), ok: false });
    else if (resultat.reason === "permission_denied") setPushMsg({ texte: t("parametres.pushPermissionRefusee"), ok: false });
    else setPushMsg({ texte: t("parametres.pushErreur", { message: resultat.message || resultat.reason }), ok: false });
  }

  const [zones, setZones] = useState([]);
  const [zoneForm, setZoneForm] = useState({ zone: "", frais: "" });
  const [zoneMsg, setZoneMsg] = useState("");

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    supabase
      .from("zones_livraison")
      .select("*")
      .eq("business_id", business.id)
      .order("zone")
      .then(({ data }) => {
        if (active) setZones(data || []);
      });
    return () => {
      active = false;
    };
  }, [business?.id]);

  async function updateBusiness(patch) {
    const { data, error } = await supabase.from("businesses").update(patch).eq("id", business.id).select().single();
    if (!error && data) setBusiness(data);
    return { data, error };
  }

  async function enregistrerNom() {
    const { error } = await updateBusiness({ name: nameDraft.trim() || t("common.defaultBusinessName"), logo_url: logoDraft.trim() || null });
    setSavedMsg(error ? t("common.error", { message: error.message }) : t("parametres.savedMsg"));
  }

  async function enregistrerTheme(key) {
    await updateBusiness({ theme_key: key });
  }

  async function enregistrerModeAffichage(mode) {
    await updateBusiness({ mode_affichage: mode });
  }

  async function enregistrerDevise(d) {
    await updateBusiness({ devise: d });
  }

  async function enregistrerLangue(l) {
    await updateBusiness({ langue: l });
  }

  async function enregistrerNotifications() {
    const { error } = await updateBusiness({ notif_email: emailDraft.trim() || null });
    setNotifMsg(error ? t("common.error", { message: error.message }) : t("parametres.notifSavedMsg"));
  }

  async function toggleConfirmationEmail(checked) {
    setConfirmationEmail(checked);
    await updateBusiness({ confirmation_email: checked });
  }

  async function ajouterZone() {
    const zone = zoneForm.zone.trim();
    const frais = Number(zoneForm.frais);
    if (!zone || Number.isNaN(frais) || frais < 0) {
      setZoneMsg(t("parametres.zoneMsgInvalid"));
      return;
    }
    const { data, error } = await supabase.from("zones_livraison").insert({ business_id: business.id, zone, frais }).select().single();
    if (error) {
      setZoneMsg(error.message);
      return;
    }
    setZones((prev) => [...prev, data].sort((a, b) => a.zone.localeCompare(b.zone)));
    setZoneForm({ zone: "", frais: "" });
    setZoneMsg("");
  }

  async function supprimerZone(id) {
    const { error } = await supabase.from("zones_livraison").delete().eq("id", id);
    if (error) {
      setZoneMsg(error.message);
      return;
    }
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  const themeKey = business?.theme_key || "orange";
  const planKey = business?.plan || "autonome";

  return (
    <div>
      <h1 className="sb-h1">{t("parametres.title")}</h1>
      <p className="sb-sub">{t("parametres.subtitle")}</p>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.boutiqueTitle")}</div>
        {savedMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 10, fontSize: 12.5, padding: "6px 10px" }}>
            {savedMsg}
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          {business?.id ? (
            <ImageUploadField
              label={t("parametres.logoLabel")}
              businessId={business.id}
              folder="logo"
              value={logoDraft}
              onChange={(url) => {
                setLogoDraft(url);
                setSavedMsg("");
              }}
            />
          ) : (
            <div className="sb-logo-preview">
              <Palette size={20} color="var(--text-faint)" />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="sb-field" style={{ flex: 1 }}>
            <label>{t("parametres.nomLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("parametres.nomPlaceholder")}
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setSavedMsg("");
              }}
            />
          </div>
          <button className="sb-btn sb-btn-primary" onClick={enregistrerNom}>
            {t("parametres.enregistrer")}
          </button>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.themeTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.themeSub")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(THEMES).map(([key, theme]) => (
            <button
              key={key}
              onClick={() => enregistrerTheme(key)}
              className="sb-theme-swatch"
              style={{ background: theme.accent, borderColor: themeKey === key ? "var(--ink)" : "transparent" }}
              title={t(`common.themes.${key}`)}
              type="button"
            >
              {themeKey === key && <CheckCircle2 size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.modeAffichageTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.modeAffichageSub")}</p>
        <div className="sb-toggle-group" style={{ display: "inline-flex" }}>
          {MODES_AFFICHAGE.map((mode) => (
            <button
              key={mode}
              className={`sb-toggle-item${(business?.mode_affichage || "clair") === mode ? " active" : ""}`}
              onClick={() => enregistrerModeAffichage(mode)}
            >
              {t(`parametres.mode${mode === "clair" ? "Clair" : mode === "sombre" ? "Sombre" : "Auto"}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.deviseTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.deviseSub")}</p>
        <div className="sb-toggle-group" style={{ display: "inline-flex" }}>
          {[
            { key: "FCFA", label: "FCFA" },
            { key: "EUR", label: "EUR (€)" },
            { key: "USD", label: "USD ($)" },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`sb-toggle-item${(business?.devise || "FCFA") === opt.key ? " active" : ""}`}
              onClick={() => enregistrerDevise(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.langueTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.langueSub")}</p>
        <div className="sb-toggle-group" style={{ display: "inline-flex" }}>
          {[
            { key: "fr", label: t("parametres.langueFr") },
            { key: "en", label: t("parametres.langueEn") },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`sb-toggle-item${(business?.langue || "fr") === opt.key ? " active" : ""}`}
              onClick={() => enregistrerLangue(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Truck size={15} /> {t("parametres.zonesTitle")}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.zonesSub")}</p>
        {zones.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {zones.map((z) => (
              <span key={z.id} className="sb-badge sb-badge-emerald" style={{ padding: "5px 10px", fontSize: 12 }}>
                {z.zone} — {fmt(z.frais)}
                <X size={11} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => supprimerZone(z.id)} />
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="sb-field" style={{ flex: 2, minWidth: 140 }}>
            <label>{t("parametres.zoneLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("parametres.zonePlaceholder")}
              value={zoneForm.zone}
              onChange={(e) => setZoneForm({ ...zoneForm, zone: e.target.value })}
            />
          </div>
          <div className="sb-field" style={{ flex: 1, minWidth: 100 }}>
            <label>{t("parametres.fraisLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("parametres.fraisPlaceholder")}
              type="number"
              value={zoneForm.frais}
              onChange={(e) => setZoneForm({ ...zoneForm, frais: e.target.value })}
            />
          </div>
          <button className="sb-btn sb-btn-primary" onClick={ajouterZone}>
            <Plus size={14} /> {t("parametres.ajouter")}
          </button>
        </div>
        {zoneMsg && <p style={{ fontSize: 12, color: "var(--coral)", margin: "8px 2px 0" }}>{zoneMsg}</p>}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">{t("parametres.notificationsTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.notificationsSub")}</p>

        {notifMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {notifMsg}
          </div>
        )}

        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>{t("parametres.emailLabel")}</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            className="sb-input"
            type="email"
            placeholder={t("parametres.emailPlaceholder")}
            value={emailDraft}
            onChange={(e) => {
              setEmailDraft(e.target.value);
              setNotifMsg("");
            }}
          />
          <button className="sb-btn sb-btn-primary" onClick={enregistrerNotifications}>
            {t("parametres.enregistrer")}
          </button>
        </div>

        <div style={{ opacity: business?.notif_email ? 1 : 0.45, pointerEvents: business?.notif_email ? "auto" : "none" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={confirmationEmail} onChange={(e) => toggleConfirmationEmail(e.target.checked)} />
            {t("parametres.confirmationEmailLabel")}
          </label>
        </div>

        {!business?.notif_email && (
          <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "12px 2px 0" }}>{t("parametres.emailRequiredNote")}</p>
        )}
      </div>

      {/* Réservé aux comptes admin : c'est l'administratrice qui doit être
          alertée d'un nouveau justificatif à vérifier, jamais un
          commerçant ordinaire — voir push_subscriptions (RLS) et
          app/api/push-admin-paiement. */}
      {business?.is_admin && (
        <div className="sb-card" style={{ marginBottom: 16 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={15} /> {t("parametres.pushTitle")}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("parametres.pushSub")}</p>

          {pushMsg.texte && (
            <div className={`sb-badge ${pushMsg.ok ? "sb-badge-emerald" : "sb-badge-coral"}`} style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
              {pushMsg.texte}
            </div>
          )}

          <button className="sb-btn sb-btn-primary" onClick={onClickActiverPush} disabled={pushEnCours}>
            <Bell size={14} /> {pushEnCours ? t("parametres.pushActivating") : t("parametres.pushActiverBtn")}
          </button>
        </div>
      )}

      {/* L'abonnement/la formule ne concernent jamais un compte
          administrateur — accès permanent, aucun paiement à faire (voir
          app/(app)/layout.js, qui contourne déjà le blocage pour
          is_admin). Rien de cette section n'a de sens pour ce compte. */}
      {!business?.is_admin && (
        <>
          <div className="sb-card" style={{ marginBottom: 16 }}>
            <div className="sb-section-title">{t("parametres.abonnementTitle")}</div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
              {t("parametres.statutActuelLabel")}
              <strong>{t(`common.subscriptionStatus.${business?.subscription_status}`)}</strong>
            </p>
            {business?.id && <PaiementAbonnement business={business} plan={planKey} />}
          </div>

          <div className="sb-card" style={{ marginBottom: 16 }}>
            <div className="sb-section-title">{t("parametres.formuleTitle")}</div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 4px" }}>
              {t("parametres.formuleActuelleLabel")} <strong>{t(`common.plans.${planKey}.nom`)}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "0 0 16px" }}>{t("parametres.formuleNote")}</p>
            <Link href="/parametres/formule" className="sb-btn sb-btn-primary">
              {t("parametres.changerFormule")}
            </Link>
          </div>
        </>
      )}

      <div className="sb-card">
        <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={15} /> {t("parametres.legalTitle")}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/cgu" target="_blank" className="sb-btn sb-btn-ghost">
            {t("parametres.legalCgu")}
          </Link>
          <Link href="/confidentialite" target="_blank" className="sb-btn sb-btn-ghost">
            {t("parametres.legalConfidentialite")}
          </Link>
          <Link href="/mentions-legales" target="_blank" className="sb-btn sb-btn-ghost">
            {t("parametres.legalMentions")}
          </Link>
        </div>
      </div>
    </div>
  );
}
