"use client";

import { useEffect, useRef, useState } from "react";

// Révélation au défilement (fondu + léger mouvement vers le haut) pour les
// sections du site vitrine (components/LandingPage.js) — jamais tout
// affiché statiquement d'un coup. IntersectionObserver plutôt qu'un
// écouteur de scroll manuel : natif, pas de dépendance, se déclenche une
// seule fois (observer.disconnect() dès l'entrée visible, jamais de
// réapparition/disparition en boucle en remontant). prefers-reduced-motion
// est géré côté CSS (.sb-reveal, app/globals.css) — la classe est bien
// posée ici, mais sans transition pour ces comptes.
export default function Reveal({ children, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`sb-reveal${visible ? " sb-reveal-visible" : ""}${className ? ` ${className}` : ""}`}>{children}</div>;
}
