"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

const PENDING_NAME_KEY = "smartbiz_pending_business_name";

export function rememberPendingBusinessName(name) {
  if (typeof window === "undefined") return;
  if (name && name.trim()) {
    window.localStorage.setItem(PENDING_NAME_KEY, name.trim());
  }
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
      if (existing) return existing;

      const pendingName =
        typeof window !== "undefined" ? window.localStorage.getItem(PENDING_NAME_KEY) : null;
      const payload = { owner_id: user.id };
      if (pendingName) payload.name = pendingName;

      const { data: created, error: insertError } = await supabase
        .from("businesses")
        .insert(payload)
        .select()
        .single();

      if (typeof window !== "undefined") window.localStorage.removeItem(PENDING_NAME_KEY);
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
