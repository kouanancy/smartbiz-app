"use client";

import { useEffect, useRef, useState } from "react";

// Compteur qui monte progressivement de 0 à `to` dès qu'il entre dans le
// viewport (site vitrine, components/LandingPage.js) — jamais avant, pour
// ne pas déclencher l'animation sur un chiffre jamais vu par le visiteur.
// requestAnimationFrame plutôt qu'un setInterval : suit le rafraîchissement
// réel de l'écran, jamais de à-coups. Se fige définitivement une fois
// arrivé à `to` (pas de boucle), et prefers-reduced-motion saute directement
// à la valeur finale plutôt que d'imposer l'animation.
export default function Counter({ to, suffix = "", duration = 1100 }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture ponctuelle de matchMedia au montage, valeur finale affichée directement sans animation
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        const start = performance.now();
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          setValue(Math.round(to * progress));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}
