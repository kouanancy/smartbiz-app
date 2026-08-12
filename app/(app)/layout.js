"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { NotificationsProvider } from "@/lib/NotificationsProvider";
import { supabase } from "@/lib/supabaseClient";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import Sidebar from "@/components/Sidebar";
import PremierPaiement from "@/components/PremierPaiement";
import Reabonnement from "@/components/Reabonnement";
import CompteSuspendu from "@/components/CompteSuspendu";

export default function AppLayout({ children }) {
  const { session, business, setBusiness, signOut, refreshBusiness, paiementInfo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = (key) => tBase(business?.langue, key);

  // Accès rapide au mode d'affichage depuis la sidebar — même mutation que
  // le sélecteur complet des Paramètres, exposée ici pour ne pas avoir à
  // naviguer jusqu'à Paramètres juste pour ce réglage.
  async function changerModeAffichage(mode) {
    const { data, error } = await supabase.from("businesses").update({ mode_affichage: mode }).eq("id", business.id).select().single();
    if (!error && data) setBusiness(data);
  }

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  // Reprend business à chaque changement de page (pas seulement à la
  // connexion initiale) : si l'administratrice rejette un justificatif
  // pendant que le commerçant a déjà l'app ouverte dans un autre onglet,
  // son subscription_status en base change mais l'état React local
  // (chargé une seule fois par AuthProvider) ne le sait pas tant que rien
  // ne le rafraîchit — il garderait donc l'accès jusqu'à une déconnexion
  // manuelle. Un aller simple par navigation suffit à détecter ce
  // changement dès la prochaine action, sans polling en arrière-plan.
  // Ignore le tout premier rendu : AuthProvider vient déjà de charger
  // business, un second appel immédiat serait redondant.
  const dejaMonte = useRef(false);
  useEffect(() => {
    if (!dejaMonte.current) {
      dejaMonte.current = true;
      return;
    }
    if (session) refreshBusiness();
  }, [pathname, session, refreshBusiness]);

  // Applique le thème de la boutique aux variables CSS globales (--accent,
  // --accent-deep, --accent-soft) sur <html> plutôt que sur un seul wrapper :
  // ça couvre aussi bien la sidebar/les boutons que le reçu imprimé, qui est
  // rendu via un portail directement dans <body> (voir components/Receipt.js).
  useEffect(() => {
    if (!business) return;
    const theme = THEMES[business.theme_key] || THEMES.orange;
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-deep", theme.deep);
    root.style.setProperty("--accent-soft", theme.soft);
    return () => {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-deep");
      root.style.removeProperty("--accent-soft");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only theme_key matters, not the whole business object
  }, [business?.theme_key]);

  if (session === undefined || session === null) {
    return <div className="sb-loading-screen">{t("layout.loadingSession")}</div>;
  }

  if (business === undefined) {
    return <div className="sb-loading-screen">{t("layout.loadingBusiness")}</div>;
  }

  if (business === null) {
    return <div className="sb-loading-screen">{t("layout.loadError")}</div>;
  }

  // 'essai' donne un accès complet, au même titre que 'actif' — seule la
  // sidebar affiche un indicateur du temps d'essai restant (voir
  // Sidebar.js). L'expiration de l'essai est gérée en amont dans
  // AuthProvider (bascule vers 'en_attente_paiement' dès que la date est
  // dépassée), donc arriver ici avec 'essai' signifie qu'il reste du temps.
  // Un compte administrateur garde un accès complet quel que soit son
  // subscription_status : le blocage automatique à l'expiration ne
  // concerne que les comptes commerçants classiques. paiementInfo.bloquant
  // (lib/AuthProvider.js, recalculé à chaque connexion et à chaque
  // revérification de navigation ci-dessus) bloque en plus l'accès même si
  // subscription_status vaut encore 'actif'/'essai' : deuxième vérification
  // indépendante du statut du compte, sur le dernier paiement en date — un
  // premier paiement jamais validé, ou un abonnement déjà réellement
  // expiré, doit bloquer quoi qu'il arrive à subscription_status par
  // ailleurs (admin_reject_payment/verifier_expiration_abonnement mettent
  // déjà subscription_status à jour dans ces cas, mais ce n'est pas la
  // seule chose qui fait foi). En revanche, un renouvellement anticipé
  // (compte déjà 'actif'/'essai' avec une échéance encore dans le futur)
  // n'est JAMAIS bloquant, même en_attente/echoue — voir
  // lib/paiements.js — d'où paiementInfo.bloquant plutôt que la simple
  // présence d'un paiement en_attente/echoue.
  const statutBloquant = business.subscription_status !== "actif" && business.subscription_status !== "essai";
  if (!business.is_admin && (statutBloquant || paiementInfo.bloquant)) {
    // Trois écrans distincts, jamais le même texte entre eux (voir
    // PremierPaiement.js et Reabonnement.js) : 'en_attente_paiement' ne
    // se produit qu'après un essai jamais payé (premier paiement),
    // 'expire' qu'après un abonnement actif retombé (réabonnement) — voir
    // EXPIRATION_SUIVANTE dans lib/AuthProvider.js. 'suspendu' n'a pas de
    // flux de paiement (pas forcément lié à un problème de paiement).
    // paiementInfo.bloquant peut déclencher ce blocage même quand
    // subscription_status ne le fait pas lui-même (encore 'actif'/'essai') :
    // dans ce cas il n'y a pas d'écran dédié, on retombe sur
    // PremierPaiement.js, qui affiche le message adapté ('en_attente' ou
    // 'echoue') dès que paiementInfo.statut est renseigné.
    if (business.subscription_status === "expire") return <Reabonnement business={business} paiementBlocage={paiementInfo.statut} />;
    if (business.subscription_status === "suspendu") return <CompteSuspendu business={business} />;
    return <PremierPaiement business={business} paiementBlocage={paiementInfo.statut} />;
  }

  return (
    <NotificationsProvider businessId={business.id}>
      <div className="sb-root">
        <Sidebar business={business} onSignOut={signOut} onChangeMode={changerModeAffichage} />
        <main className="sb-main">{children}</main>
      </div>
    </NotificationsProvider>
  );
}
