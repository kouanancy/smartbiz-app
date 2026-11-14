"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Package, Truck } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";

// Page d'accueil de "Stock" une fois module_achats_actif activé pour la
// boutique (voir supabase-achats-approvisionnement-migration.sql et
// components/Sidebar.js, qui pointe ici plutôt que directement sur
// /articles dans ce cas) — module inactif : /articles reste la cible
// directe du menu, cette page n'est alors jamais utilisée (et redirige
// par sécurité si on y arrive quand même, ex. lien gardé en favori après
// désactivation du module).
export default function StockPage() {
  const { business } = useAuth();
  const router = useRouter();
  const t = (key, vars) => tBase(business?.langue, key, vars);

  useEffect(() => {
    if (business && !business.module_achats_actif) {
      router.replace("/articles");
    }
  }, [business, router]);

  if (!business?.module_achats_actif) return null;

  return (
    <div>
      <h1 className="sb-h1">{t("stock.title")}</h1>
      <p className="sb-sub">{t("stock.subtitle")}</p>

      <div className="sb-choice-grid">
        <Link href="/articles" className="sb-card sb-choice-card">
          <div className="sb-choice-card-icon">
            <Package size={20} />
          </div>
          <div className="sb-choice-card-title">{t("stock.cardArticleTitle")}</div>
          <p className="sb-choice-card-desc">{t("stock.cardArticleDesc")}</p>
          <span className="sb-btn sb-btn-ghost" style={{ marginTop: "auto" }}>
            {t("stock.cardOuvrir")} <ChevronRight size={14} />
          </span>
        </Link>
        <Link href="/achats" className="sb-card sb-choice-card">
          <div className="sb-choice-card-icon">
            <Truck size={20} />
          </div>
          <div className="sb-choice-card-title">{t("stock.cardAchatsTitle")}</div>
          <p className="sb-choice-card-desc">{t("stock.cardAchatsDesc")}</p>
          <span className="sb-btn sb-btn-ghost" style={{ marginTop: "auto" }}>
            {t("stock.cardOuvrir")} <ChevronRight size={14} />
          </span>
        </Link>
      </div>
    </div>
  );
}
