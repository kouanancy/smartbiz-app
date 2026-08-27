// Petites maquettes visuelles de chaque module, pour le site vitrine
// (components/LandingPage.js, components/DeviceComposition.js) —
// construites en s'appuyant fidèlement sur le vrai code de l'app (mêmes
// structures, mêmes couleurs/rôles que les vrais écrans) et avec de vrais
// libellés/valeurs d'exemple plutôt que de simples barres vides, pour
// ressembler à un aperçu réel plutôt qu'à un squelette abstrait — les
// valeurs ci-dessous sont illustratives (aria-hidden, jamais de vraies
// données d'une boutique) :
// - dashboard : app/(app)/dashboard/page.js — trois cartes KPI
//   (.sb-grid-stats/.sb-card/.sb-stat-value, CA en accent, marge en
//   emerald, clients en ink) suivies du graphique d'évolution.
// - nouvelle : app/(app)/nouvelle/page.js — même stepper que
//   nouvelle.subtitle ("Cliente → articles → livraison → paiement →
//   confirmation").
// - articles : app/(app)/articles/page.js — table réelle avec vignette
//   photo, nom, et badge de stock (OK/Faible/Rupture, mêmes couleurs que
//   common.badgeOk/badgeFaible/badgeRupture).
// - clients : app/(app)/clients/page.js — table réelle (nom, téléphone),
//   jamais une liste d'avatars qui n'existe nulle part dans l'app.
// - commandes : app/(app)/commandes/page.js — table réelle (N°, Cliente,
//   CA, Statut).
// - catalogue : app/(app)/catalogue/page.js — grille de fiches produit
//   (vignette + nom + prix), comme .sb-catalogue-grid/.sb-catalogue-card.
// - tresorerie : app/(app)/tresorerie/page.js — graphique d'évolution +
//   deux totaux (CA total, marge totale).
//
// imageSrc (optionnel) : remplace la maquette CSS par une vraie capture
// d'écran une fois disponible (voir components/LandingPage.js et
// components/DeviceComposition.js — il suffit de renseigner un chemin
// sous /public, rien d'autre à changer ici).
export default function ModuleMockup({ type, imageSrc, imageAlt = "" }) {
  if (imageSrc) {
    return (
      <div className="sb-mockup sb-mockup-image" aria-hidden={imageAlt ? undefined : "true"}>
        <img src={imageSrc} alt={imageAlt} />
      </div>
    );
  }

  switch (type) {
    case "dashboard":
      return (
        <div className="sb-mockup sb-mockup-dashboard" aria-hidden="true">
          <div className="sb-mockup-kpis">
            <div className="sb-mockup-kpi">
              <i className="sb-mockup-kpi-label">CA</i>
              <span className="sb-mockup-kpi-value sb-mockup-kpi-value-accent">128k</span>
            </div>
            <div className="sb-mockup-kpi">
              <i className="sb-mockup-kpi-label">Marge</i>
              <span className="sb-mockup-kpi-value sb-mockup-kpi-value-emerald">32%</span>
            </div>
            <div className="sb-mockup-kpi">
              <i className="sb-mockup-kpi-label">Clients</i>
              <span className="sb-mockup-kpi-value sb-mockup-kpi-value-ink">56</span>
            </div>
          </div>
          <div className="sb-mockup-bars">
            <i style={{ height: "38%" }} />
            <i style={{ height: "62%" }} />
            <i style={{ height: "48%" }} />
            <i style={{ height: "80%" }} />
            <i style={{ height: "58%" }} />
            <i style={{ height: "70%" }} />
          </div>
        </div>
      );
    case "nouvelle":
      return (
        <div className="sb-mockup sb-mockup-stepper" aria-hidden="true">
          <span className="sb-mockup-step sb-mockup-step-done" />
          <i className="sb-mockup-step-line sb-mockup-step-line-done" />
          <span className="sb-mockup-step sb-mockup-step-done" />
          <i className="sb-mockup-step-line sb-mockup-step-line-done" />
          <span className="sb-mockup-step sb-mockup-step-active" />
          <i className="sb-mockup-step-line" />
          <span className="sb-mockup-step" />
        </div>
      );
    case "articles":
      return (
        <div className="sb-mockup sb-mockup-table" aria-hidden="true">
          <div className="sb-mockup-thead" />
          {[
            { nom: "Perruque lisse 24\"", pill: "ok", statut: "OK" },
            { nom: "Mèches ivoirienne", pill: "warn", statut: "Faible" },
            { nom: "Tissage bouclé", pill: "coral", statut: "Rupture" },
          ].map((row) => (
            <div className="sb-mockup-trow" key={row.nom}>
              <span className="sb-mockup-thumb-sm" />
              <i className="sb-mockup-cell">{row.nom}</i>
              <span className={`sb-mockup-pill sb-mockup-pill-${row.pill}`}>{row.statut}</span>
            </div>
          ))}
        </div>
      );
    case "clients":
      return (
        <div className="sb-mockup sb-mockup-table" aria-hidden="true">
          <div className="sb-mockup-thead" />
          {[
            { nom: "Awa K.", tel: "07 •• •• ••", n: 5 },
            { nom: "Fatou D.", tel: "05 •• •• ••", n: 12 },
            { nom: "Mariam S.", tel: "01 •• •• ••", n: 3 },
          ].map((row) => (
            <div className="sb-mockup-trow" key={row.nom}>
              <i className="sb-mockup-cell">{row.nom}</i>
              <i className="sb-mockup-cell sb-mockup-cell-muted">{row.tel}</i>
              <span className="sb-mockup-count-badge">{row.n}</span>
            </div>
          ))}
        </div>
      );
    case "commandes":
      return (
        <div className="sb-mockup sb-mockup-table" aria-hidden="true">
          <div className="sb-mockup-thead" />
          {[
            { n: "#014", client: "Awa K.", ca: "24 500", pill: "ok", statut: "Livrée" },
            { n: "#013", client: "Fatou D.", ca: "12 000", pill: "warn", statut: "En cours" },
            { n: "#012", client: "Mariam S.", ca: "38 200", pill: "ok", statut: "Livrée" },
          ].map((row) => (
            <div className="sb-mockup-trow" key={row.n}>
              <i className="sb-mockup-cell sb-mockup-cell-num">{row.n}</i>
              <i className="sb-mockup-cell">{row.client}</i>
              <i className="sb-mockup-cell sb-mockup-cell-muted">{row.ca}</i>
              <span className={`sb-mockup-pill sb-mockup-pill-${row.pill}`}>{row.statut}</span>
            </div>
          ))}
        </div>
      );
    case "catalogue":
      return (
        <div className="sb-mockup sb-mockup-catalogue" aria-hidden="true">
          {[
            { nom: "Lace 24\"", prix: "35 000" },
            { nom: "Mèches", prix: "8 000" },
            { nom: "Tissage", prix: "15 000" },
            { nom: "Perruque", prix: "45 000" },
          ].map((p) => (
            <div className="sb-mockup-product" key={p.nom}>
              <span className="sb-mockup-thumb" />
              <i className="sb-mockup-product-line">{p.nom}</i>
              <i className="sb-mockup-product-line sb-mockup-product-price">{p.prix} F</i>
            </div>
          ))}
        </div>
      );
    case "tresorerie":
      return (
        <div className="sb-mockup sb-mockup-tresorerie" aria-hidden="true">
          <svg viewBox="0 0 120 46" preserveAspectRatio="none" className="sb-mockup-chart-svg">
            <polyline points="0,38 20,32 40,34 60,20 80,24 100,10 120,6" />
          </svg>
          <div className="sb-mockup-tresorerie-stats">
            <span className="sb-mockup-bar" style={{ width: "48%" }} />
            <span className="sb-mockup-bar sb-mockup-bar-light" style={{ width: "30%" }} />
          </div>
        </div>
      );
    default:
      return null;
  }
}
