"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { PLANS } from "./constants";
import { dernierPaiementRejete } from "./paiements";

const AuthContext = createContext(null);

// Pas de tâche planifiée côté serveur pour faire expirer les abonnements :
// on vérifie donc paresseusement à chaque chargement de la boutique, en
// comparant subscription_expires_at à maintenant. Deux cas, selon d'où on
// vient : un essai dépassé n'a jamais été payé ('en_attente_paiement',
// même écran de blocage qu'un abonnement classique non payé) ; un
// abonnement actif dépassé, lui, a été payé puis a expiré ('expire',
// écran de blocage dédié). Une fois CinetPay branché, le webhook de
// paiement passera le statut à 'actif' sans se soucier de la valeur
// précédente. Correspondance à garder synchronisée avec la fonction SQL
// verifier_expiration_abonnement (supabase-businesses-colonnes-restreintes-
// migration.sql), qui applique exactement cette même bascule côté serveur.
const EXPIRATION_SUIVANTE = { essai: "en_attente_paiement", actif: "expire" };

async function verifierExpirationAbonnement(business) {
  // Un compte administrateur garde toujours un accès complet, quel que soit
  // son subscription_status ou subscription_expires_at — le blocage
  // automatique à l'expiration ne s'applique qu'aux comptes commerçants
  // classiques.
  if (business.is_admin) return business;

  const nouveauStatut = EXPIRATION_SUIVANTE[business.subscription_status];
  if (!nouveauStatut || !business.subscription_expires_at) return business;
  if (new Date(business.subscription_expires_at) > new Date()) return business;

  // RPC plutôt qu'un update direct de subscription_status : le GRANT UPDATE
  // sur businesses est volontairement restreint (voir
  // supabase-businesses-colonnes-restreintes-migration.sql) et ne couvre
  // plus cette colonne pour le client, justement pour qu'aucun commerçant
  // ne puisse se remettre 'actif' lui-même par un autre chemin qu'une
  // validation admin. La fonction recalcule tout côté serveur à partir de
  // la ligne réelle en base, jamais des valeurs locales de `business`.
  const { data: updated, error } = await supabase.rpc("verifier_expiration_abonnement", { p_business_id: business.id }).single();
  if (error) {
    console.error("Impossible de mettre à jour le statut d'abonnement expiré :", error);
    return business;
  }
  return updated;
}

export function AuthProvider({ children }) {
  // undefined = encore en cours de chargement, null = déconnecté, objet = connecté
  const [session, setSession] = useState(undefined);
  const [business, setBusiness] = useState(undefined);
  // Deuxième ligne de défense indépendante de business.subscription_status
  // (voir lib/paiements.js) : recalculée à chaque ensureBusiness, donc à
  // chaque connexion et à chaque revérification déclenchée par
  // refreshBusiness (app/(app)/layout.js, à chaque navigation).
  const [paiementRejete, setPaiementRejete] = useState(false);
  // Valeur initiale calculée pendant le rendu (pas dans un effect) : seul
  // le mode 'auto' a besoin de connaître les réglages système, et
  // uniquement pour rester synchronisé s'ils changent pendant que l'app
  // est ouverte (voir l'effect plus bas, qui ne fait qu'écouter — jamais
  // d'appel à setState synchrone dans son corps).
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  const ensuring = useRef(new Map());

  // Applique le résultat d'ensureBusiness aux deux states à la fois — business
  // et paiementRejete doivent toujours être recalculés ensemble, sans quoi un
  // appel concurrent pourrait laisser paiementRejete sur une valeur obsolète
  // pendant que business avance déjà (voir les deux points d'appel plus bas).
  const appliquerBusiness = useCallback(async (result) => {
    setBusiness(result);
    setPaiementRejete(result && !result.is_admin ? await dernierPaiementRejete(result.id) : false);
  }, []);

  const ensureBusiness = useCallback(
    async (user) => {
      if (!user) {
        setBusiness(null);
        setPaiementRejete(false);
        return;
      }
      if (ensuring.current.has(user.id)) {
        await appliquerBusiness(await ensuring.current.get(user.id));
        return;
      }

      const task = (async () => {
        const { data: existing, error: selectError } = await supabase
          .from("businesses")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (selectError) throw selectError;
        if (existing) return await verifierExpirationAbonnement(existing);

        // Le nom saisi à l'inscription voyage dans les métadonnées utilisateur
        // Supabase (renvoyées avec `user`, quel que soit l'appareil/onglet qui
        // finalise la connexion — contrairement à un stockage local du
        // navigateur, qui serait perdu si la confirmation par e-mail est
        // ouverte ailleurs qu'à l'endroit où le compte a été créé).
        const pendingName = user.user_metadata?.business_name?.trim();
        const pendingPlan = user.user_metadata?.plan;
        const essaiFin = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const payload = {
          owner_id: user.id,
          email: user.email,
          subscription_status: "essai",
          subscription_expires_at: essaiFin,
        };
        if (pendingName) payload.name = pendingName;
        if (PLANS.includes(pendingPlan)) payload.plan = pendingPlan;

        const { data: created, error: insertError } = await supabase
          .from("businesses")
          .insert(payload)
          .select()
          .single();

        if (!insertError) return created;

        // Doublon : une autre requête concurrente (autre onglet, double
        // déclenchement de onAuthStateChange...) a déjà créé la boutique de ce
        // compte avant nous — la contrainte unique sur owner_id (voir
        // supabase-businesses-owner-unique-migration.sql) l'empêche d'être
        // créée deux fois. On récupère la ligne existante plutôt que d'échouer.
        if (insertError.code === "23505") {
          const { data: existingAfterRace, error: refetchError } = await supabase
            .from("businesses")
            .select("*")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (refetchError || !existingAfterRace) throw refetchError || insertError;
          return existingAfterRace;
        }

        throw insertError;
      })();

      ensuring.current.set(user.id, task);
      try {
        const result = await task;
        await appliquerBusiness(result);
      } catch (err) {
        console.error("Impossible de charger/créer la boutique :", err);
        setBusiness(null);
        setPaiementRejete(false);
      } finally {
        ensuring.current.delete(user.id);
      }
    },
    [appliquerBusiness]
  );

  const refreshBusiness = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await ensureBusiness(user ?? null);
  }, [ensureBusiness]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      ensureBusiness(session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSession(session);
      ensureBusiness(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [ensureBusiness]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBusiness(undefined);
    setPaiementRejete(false);
  }, []);

  // N'écoute que les changements de préférence système — jamais d'appel à
  // setState synchrone dans le corps de l'effect, seulement en réaction à
  // un vrai événement externe (voir systemPrefersDark ci-dessus pour la
  // valeur initiale, calculée pendant le rendu).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange(e) {
      setSystemPrefersDark(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Résout mode_affichage ('clair' | 'sombre' | 'auto') en 'light' | 'dark'
  // effectif — calcul pur dérivé du rendu, un seul endroit pour cette
  // logique plutôt que de la dupliquer partout où un graphique a besoin de
  // connaître le mode actif (voir Dashboard, Trésorerie, Admin). Tant
  // qu'aucune boutique n'est chargée (pré-connexion, page de connexion),
  // l'app reste en clair : pas de préférence de compte à appliquer à ce
  // stade.
  const modeAffichage = business?.mode_affichage || "clair";
  const effectiveTheme =
    !business || modeAffichage === "clair" ? "light" : modeAffichage === "sombre" ? "dark" : systemPrefersDark ? "dark" : "light";

  // Seul effet de bord réel restant : poser data-theme sur <html>, lu par
  // globals.css. Ne touche jamais au state React, donc pas de risque de
  // rendu en cascade.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [effectiveTheme]);

  const value = {
    session,
    user: session ? session.user : session === null ? null : undefined,
    business,
    setBusiness,
    paiementRejete,
    refreshBusiness,
    signOut,
    effectiveTheme,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
