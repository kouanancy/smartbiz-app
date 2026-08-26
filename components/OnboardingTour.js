"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

// Visite guidée interactive (coachmark) pour les nouveaux commerçants —
// déclenchée automatiquement à la toute première arrivée sur le Dashboard
// (voir app/(app)/dashboard/page.js, businesses.visite_guidee_vue) ou
// relancée manuellement depuis Aide (app/(app)/aide/page.js,
// ?tour=1). Toutes les étapes visent des éléments déjà présents sur le
// Dashboard/la barre de navigation — jamais de changement de page pendant
// la visite, pour rester un flux simple et prévisible : id="sb-tour-*"
// posés sur les liens concernés dans components/Sidebar.js, et
// .sb-grid-stats pour l'étape d'accueil (déjà unique sur cette page).
const STEPS = [
  { selector: ".sb-grid-stats", titleKey: "tour.step1Titre", textKey: "tour.step1Texte" },
  { selector: "#sb-tour-articles", titleKey: "tour.step2Titre", textKey: "tour.step2Texte" },
  { selector: "#sb-tour-clients", titleKey: "tour.step3Titre", textKey: "tour.step3Texte" },
  { selector: "#sb-tour-nouvelle", titleKey: "tour.step4Titre", textKey: "tour.step4Texte" },
  { selector: "#sb-tour-aide", titleKey: "tour.step5Titre", textKey: "tour.step5Texte" },
];

const BUBBLE_WIDTH = 300;
const BUBBLE_HEIGHT_ESTIMATE = 190;
const MARGIN = 14;

// Pas de bibliothèque de positionnement (popper/floating-ui) pour un
// unique besoin ponctuel : bulle à droite de la cible si la place le
// permet, sinon en dessous, sinon au-dessus, toujours ramenée dans le
// viewport en dernier recours. rect=null (cible introuvable/invisible,
// ex. menu mobile replié) => bulle centrée, sans repère visuel.
function computeBubblePosition(rect) {
  // Garde défensive : `open` ne devient vrai que dans un effect (donc
  // jamais pendant un rendu serveur pour l'usage réel du composant,
  // toujours déclenché après coup côté client), mais mieux vaut ne
  // jamais dépendre de `window` sans filet si ce composant était un jour
  // monté autrement.
  if (typeof window === "undefined") return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { top: vh / 2 - BUBBLE_HEIGHT_ESTIMATE / 2, left: vw / 2 - BUBBLE_WIDTH / 2 };
  }
  let left = rect.right + MARGIN;
  let top = rect.top + rect.height / 2 - BUBBLE_HEIGHT_ESTIMATE / 2;
  if (left + BUBBLE_WIDTH > vw - 8) {
    left = rect.left;
    top = rect.bottom + MARGIN;
    if (top + BUBBLE_HEIGHT_ESTIMATE > vh - 8) {
      top = rect.top - BUBBLE_HEIGHT_ESTIMATE - MARGIN;
    }
  }
  top = Math.max(8, Math.min(top, vh - BUBBLE_HEIGHT_ESTIMATE - 8));
  left = Math.max(8, Math.min(left, vw - BUBBLE_WIDTH - 8));
  return { top, left };
}

export default function OnboardingTour({ open, onClose, t }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remet la visite à sa première étape à chaque (ré)ouverture (ex. relance manuelle depuis Aide après une première visite déjà terminée) ; le composant reste monté en permanence sur le Dashboard, donc pas de remontage naturel pour repartir de zéro autrement
    if (open) setStepIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function measure() {
      const el = document.querySelector(STEPS[stepIndex].selector);
      const r = el?.getBoundingClientRect();
      // Rectangle vide (display: none) OU entièrement hors du viewport
      // (menu mobile replié sous 860px — voir components/Sidebar.js,
      // .sb-nav y reste translaté hors écran, avec une taille non nulle) :
      // dans les deux cas, la cible n'est pas réellement visible — bulle
      // centrée sans repère visuel plutôt que positionnée dessus.
      const visible =
        r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
      setRect(visible ? r : null);
    }

    measure();
    window.addEventListener("resize", measure);
    // capture: true — le scroll ne bouillonne pas nativement, mais un
    // écouteur en phase de capture sur window voit quand même le scroll
    // d'un conteneur interne défilant indépendamment de la fenêtre.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, stepIndex]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const { top, left } = computeBubblePosition(rect);
  const padding = 8;

  function suivant() {
    if (isLast) {
      onClose();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  return (
    <div className="sb-tour-overlay">
      {rect ? (
        <div
          className="sb-tour-spotlight"
          style={{
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
          }}
        />
      ) : (
        <div className="sb-tour-dim" />
      )}
      <div className="sb-tour-bubble" style={{ top, left, width: BUBBLE_WIDTH }}>
        <div className="sb-tour-bubble-title">{t(step.titleKey)}</div>
        <p className="sb-tour-bubble-text">{t(step.textKey)}</p>
        <div className="sb-tour-bubble-footer">
          <span className="sb-tour-step-count">{t("tour.etapeSur", { step: stepIndex + 1, total: STEPS.length })}</span>
          <div className="sb-tour-bubble-actions">
            <button type="button" className="sb-btn sb-btn-ghost" onClick={onClose}>
              {t("tour.passer")}
            </button>
            <button type="button" className="sb-btn sb-btn-primary" onClick={suivant}>
              {isLast ? t("tour.terminer") : t("tour.suivant")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
