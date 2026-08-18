// Petites maquettes visuelles de chaque module, pour le site vitrine
// (components/LandingPage.js) — construites en CSS pur, avec les mêmes
// couleurs/rôles que les vrais écrans (var(--accent), var(--emerald)
// pour "OK", var(--amber) pour une alerte de stock...), plutôt qu'une
// simple icône ou une vraie capture d'écran (jamais à jour, et beaucoup
// plus lourde). Aucun texte réel à l'intérieur — uniquement des formes —
// donc rien à traduire ni à synchroniser avec lib/i18n.
export default function ModuleMockup({ type }) {
  switch (type) {
    case "dashboard":
      return (
        <div className="sb-mockup sb-mockup-dashboard" aria-hidden="true">
          <div className="sb-mockup-stats">
            <span className="sb-mockup-stat sb-mockup-stat-accent" />
            <span className="sb-mockup-stat sb-mockup-stat-emerald" />
            <span className="sb-mockup-stat sb-mockup-stat-gray" />
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
        <div className="sb-mockup sb-mockup-rows" aria-hidden="true">
          <div className="sb-mockup-row">
            <i className="sb-mockup-bar" style={{ width: "58%" }} />
            <span className="sb-mockup-pill sb-mockup-pill-ok" />
          </div>
          <div className="sb-mockup-row">
            <i className="sb-mockup-bar" style={{ width: "72%" }} />
            <span className="sb-mockup-pill sb-mockup-pill-warn" />
          </div>
          <div className="sb-mockup-row">
            <i className="sb-mockup-bar" style={{ width: "42%" }} />
            <span className="sb-mockup-pill sb-mockup-pill-ok" />
          </div>
        </div>
      );
    case "clients":
      return (
        <div className="sb-mockup sb-mockup-people" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="sb-mockup-person" key={i}>
              <span className="sb-mockup-avatar" />
              <span className="sb-mockup-lines">
                <i />
                <i style={{ width: "60%" }} />
              </span>
            </div>
          ))}
        </div>
      );
    case "commandes":
      return (
        <div className="sb-mockup sb-mockup-table" aria-hidden="true">
          <div className="sb-mockup-thead" />
          {[0, 1, 2].map((i) => (
            <div className="sb-mockup-trow" key={i}>
              <i className="sb-mockup-cell" style={{ width: "26%" }} />
              <i className="sb-mockup-cell" style={{ width: "34%" }} />
              <span className={`sb-mockup-pill ${i === 1 ? "sb-mockup-pill-warn" : "sb-mockup-pill-ok"}`} />
            </div>
          ))}
        </div>
      );
    case "catalogue":
      return (
        <div className="sb-mockup sb-mockup-catalogue" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span className="sb-mockup-thumb" key={i} />
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
