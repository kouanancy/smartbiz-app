"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

// Pas de tâche planifiée côté serveur pour faire expirer les abonnements :
// on vérifie donc paresseusement à chaque chargement de la boutique, en
// comparant subscription_expires_at à maintenant. Deux cas, selon d'où on
// vient : un essai dépassé n'a jamais été payé ('en_attente_paiement',
// même écran de blocage qu'un abonnement classique non payé) ; un
// abonnement actif dépassé, lui, a été payé puis a expiré ('expire',
// écran de blocage dédié). Une fois CinetPay branché, le webhook de
// paiement passera le statut à 'actif' sans se soucier de la valeur
// précédente.
const EXPIRATION_SUIVANTE = { essai: "en_attente_paiement", actif: "expire" };

async function verifierExpirationAbonnement(business) {
  const nouveauStatut = EXPIRATION_SUIVANTE[business.subscription_status];
  if (!nouveauStatut || !business.subscription_expires_at) return business;
  if (new Date(business.subscription_expires_at) > new Date()) return business;

  const { data: updated, error } = await supabase
    .from("businesses")
    .update({ subscription_status: nouveauStatut })
    .eq("id", business.id)
    .select()
    .single();
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
  const ensuring = useRef(new Map());

  const ensureBusiness = useCallback(async (user) => {
    if (!user) {
      setBusiness(null);
      return;
    }
    if (ensuring.current.has(user.id)) {
      setBusiness(await ensuring.current.get(user.id));
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
      const essaiFin = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        owner_id: user.id,
        email: user.email,
        subscription_status: "essai",
        subscription_expires_at: essaiFin,
      };
      if (pendingName) payload.name = pendingName;

      const { data: created, error: insertError } = await supabase
        .from("businesses")
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;
      return created;
    })();

    ensuring.current.set(user.id, task);
    try {
      const result = await task;
      setBusiness(result);
    } catch (err) {
      console.error("Impossible de charger/créer la boutique :", err);
      setBusiness(null);
    } finally {
      ensuring.current.delete(user.id);
    }
  }, []);

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
  }, []);

  const value = {
    session,
    user: session ? session.user : session === null ? null : undefined,
    business,
    setBusiness,
    refreshBusiness,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
