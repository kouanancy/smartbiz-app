"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session === undefined) return;
    router.replace(session ? "/dashboard" : "/login");
  }, [session, router]);

  return <div className="sb-loading-screen">Chargement…</div>;
}
