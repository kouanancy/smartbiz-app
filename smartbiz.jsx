import React, { useState, useMemo } from "react";
import {
  LayoutDashboard, Users, Package, ShoppingCart, ClipboardList,
  AlertTriangle, Plus, X, Search, Printer, TrendingUp, CheckCircle2,
  Minus, Trash2, ChevronRight, RefreshCw, Palette, Upload, MessageCircle,
  LayoutGrid, Copy, Share2
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";

/* ------------------------------------------------------------------ */
/*  SmartBiz — prototype fonctionnel (données en mémoire, pas de backend) */
/* ------------------------------------------------------------------ */

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";

const monthLabel = (d) =>
  d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");

function seedData() {
  const today = new Date();

  const articles = [
    { id: "a1", nom: 'Perruque Lace Front 20"', categorie: "Perruques", prixAchat: 25000, fraisAnnexes: 2000, prixVente: 45000, stock: 8, seuil: 3 },
    { id: "a2", nom: 'Perruque Full Lace 24"', categorie: "Perruques", prixAchat: 40000, fraisAnnexes: 3000, prixVente: 70000, stock: 2, seuil: 3 },
    { id: "a3", nom: "Mèches Brésiliennes 22\" (paquet)", categorie: "Mèches", prixAchat: 8000, fraisAnnexes: 1000, prixVente: 15000, stock: 20, seuil: 5 },
    { id: "a4", nom: "Mèches Péruviennes 18\" (paquet)", categorie: "Mèches", prixAchat: 7000, fraisAnnexes: 1000, prixVente: 13000, stock: 0, seuil: 5 },
    { id: "a5", nom: 'Perruque Bob Curly 14"', categorie: "Perruques", prixAchat: 15000, fraisAnnexes: 1500, prixVente: 28000, stock: 6, seuil: 3 },
    { id: "a6", nom: "Mèches Malaisiennes 24\" (paquet)", categorie: "Mèches", prixAchat: 9000, fraisAnnexes: 1200, prixVente: 17000, stock: 4, seuil: 5 },
  ];

  const clients = [
    { id: "c1", nom: "Aïcha Koné", telephone: "07 01 22 33 44", adresse: "Cocody, Abidjan", email: "" },
    { id: "c2", nom: "Fatou Diabaté", telephone: "05 44 55 66 77", adresse: "Yopougon, Abidjan", email: "fatou.diabate@example.com" },
    { id: "c3", nom: "Grace Yao", telephone: "01 22 33 44 55", adresse: "Marcory, Abidjan", email: "" },
    { id: "c4", nom: "Mariam Traoré", telephone: "07 88 99 00 11", adresse: "Bingerville", email: "" },
  ];

  const mk = (id, num, monthsAgo, clientId, lignesRef) => {
    const date = new Date(today);
    date.setMonth(date.getMonth() - monthsAgo);
    date.setDate(Math.min(28, 3 + num));
    const lignes = lignesRef.map((l) => {
      const art = articles.find((a) => a.id === l.articleId);
      return { articleId: l.articleId, quantite: l.quantite, prixVente: art.prixVente, prixAchat: art.prixAchat, fraisAnnexes: art.fraisAnnexes || 0 };
    });
    const ca = lignes.reduce((s, l) => s + l.prixVente * l.quantite, 0);
    const marge = lignes.reduce((s, l) => s + (l.prixVente - l.prixAchat - l.fraisAnnexes) * l.quantite, 0);
    return { id, numero: `CMD-${String(num).padStart(4, "0")}`, date: date.toISOString(), clientId, lignes, ca, marge };
  };

  const commandes = [
    mk("o1", 1, 5, "c1", [{ articleId: "a1", quantite: 1 }]),
    mk("o2", 2, 5, "c2", [{ articleId: "a3", quantite: 2 }]),
    mk("o3", 3, 4, "c3", [{ articleId: "a5", quantite: 1 }, { articleId: "a3", quantite: 1 }]),
    mk("o4", 4, 3, "c1", [{ articleId: "a6", quantite: 1 }]),
    mk("o5", 5, 3, "c4", [{ articleId: "a2", quantite: 1 }]),
    mk("o6", 6, 2, "c2", [{ articleId: "a1", quantite: 1 }, { articleId: "a3", quantite: 3 }]),
    mk("o7", 7, 1, "c3", [{ articleId: "a5", quantite: 2 }]),
    mk("o8", 8, 0, "c4", [{ articleId: "a3", quantite: 1 }]),
    mk("o9", 9, 0, "c1", [{ articleId: "a6", quantite: 1 }, { articleId: "a5", quantite: 1 }]),
  ];

  return { articles, clients, commandes, nextNum: 10 };
}

const THEMES = {
  orange: { label: "Orange", accent: "#E07A29", deep: "#C7601A", soft: "#F3B278" },
  bleu: { label: "Bleu", accent: "#2F6FED", deep: "#1E4FBF", soft: "#A9C4FB" },
  vert: { label: "Vert", accent: "#0E8F6E", deep: "#0B6E55", soft: "#8FD9C4" },
  violet: { label: "Violet", accent: "#7C4DDC", deep: "#5E34B0", soft: "#C9B3F5" },
  rose: { label: "Rose", accent: "#D6487D", deep: "#B12F62", soft: "#F3AFC7" },
  rouge: { label: "Rouge", accent: "#D6483C", deep: "#B22F24", soft: "#F3A79E" },
};

const ZONES_LIVRAISON = [
  { zone: "Cocody", frais: 1000 },
  { zone: "Hors Cocody", frais: 1500 },
  { zone: "Bingerville", frais: 1500 },
  { zone: "Bassam / Anyama", frais: 2000 },
];

const OPERATEURS_MOBILE_MONEY = ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave"];

export default function SmartBiz() {
  const seed = useMemo(() => seedData(), []);
  const [articles, setArticles] = useState(seed.articles);
  const [categories, setCategories] = useState(["Perruques", "Mèches", "Accessoires"]);
  const [reappros, setReappros] = useState([]);
  const [clients, setClients] = useState(seed.clients);
  const [commandes, setCommandes] = useState(seed.commandes);
  const [nextNum, setNextNum] = useState(seed.nextNum);
  const [page, setPage] = useState("dashboard");
  const [businessName, setBusinessName] = useState("");
  const [logo, setLogo] = useState(null);
  const [themeKey, setThemeKey] = useState("orange");
  const [notifEmail, setNotifEmail] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState(false);
  const [rapportStock, setRapportStock] = useState("aucun");
  const theme = THEMES[themeKey];
  const [receipt, setReceipt] = useState(null);

  const clientName = (id) => clients.find((c) => c.id === id)?.nom ?? "—";
  const getClient = (id) => clients.find((c) => c.id === id);
  const articleName = (id) => articles.find((a) => a.id === id)?.nom ?? "—";

  /* ---------- calculs dashboard ---------- */
  const now = new Date();
  const isSameMonth = (iso) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const commandesDuMois = commandes.filter((c) => isSameMonth(c.date));
  const caDuMois = commandesDuMois.reduce((s, c) => s + c.ca, 0);
  const margeDuMois = commandesDuMois.reduce((s, c) => s + c.marge, 0);

  const stockFaible = articles.filter((a) => a.stock <= a.seuil);

  /* ---------- actions ---------- */
  function addClient(nom, telephone, adresse, email) {
    const id = "c" + Date.now();
    setClients((prev) => [...prev, { id, nom, telephone, adresse: adresse || "", email: email || "" }]);
    return id;
  }

  function passerCommande({ clientId, lignes, livraison, paiement }) {
    const numero = `CMD-${String(nextNum).padStart(4, "0")}`;
    const fullLignes = lignes.map((l) => {
      const art = articles.find((a) => a.id === l.articleId);
      return { articleId: l.articleId, quantite: l.quantite, prixVente: art.prixVente, prixAchat: art.prixAchat, fraisAnnexes: art.fraisAnnexes || 0 };
    });
    const ca = fullLignes.reduce((s, l) => s + l.prixVente * l.quantite, 0);
    const marge = fullLignes.reduce((s, l) => s + (l.prixVente - l.prixAchat - l.fraisAnnexes) * l.quantite, 0);
    const commande = { id: "o" + Date.now(), numero, date: new Date().toISOString(), clientId, lignes: fullLignes, ca, marge, livraison, paiement };

    setArticles((prev) =>
      prev.map((a) => {
        const l = fullLignes.find((x) => x.articleId === a.id);
        return l ? { ...a, stock: a.stock - l.quantite } : a;
      })
    );
    setCommandes((prev) => [commande, ...prev]);
    setNextNum((n) => n + 1);
    setReceipt(commande);
    setPage("commandes");
  }

  return (
    <div className="sb-root" style={{ "--accent": theme.accent, "--accent-deep": theme.deep, "--accent-soft": theme.soft }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .sb-root { --ink:#2E2C2B; --ink-soft:#4A4745; --paper:#F2F1EF; --card:#FFFFFF;
          --emerald:#0E8F6E; --amber:#C9862B; --coral:#C24E37; --line:#E1DEDC; --muted:#6E6B68;
          --accent:#E07A29; --accent-soft:#F3B278; --accent-deep:#C7601A;
          font-family:'Inter',sans-serif; background:var(--paper); color:var(--ink); min-height:600px;
          display:flex; border-radius:12px; overflow:hidden; border:1px solid var(--line); }
        .sb-mono { font-family:'IBM Plex Mono',monospace; }
        .sb-display { font-family:'Space Grotesk',sans-serif; }
        .sb-sidebar { width:210px; background:linear-gradient(180deg, #46433F 0%, #201F1D 100%); color:#EDEBE8; flex-shrink:0; display:flex; flex-direction:column; }
        .sb-brand { padding:22px 20px 16px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:19px; letter-spacing:-0.02em; border-bottom:1px solid rgba(255,255,255,0.14); }
        .sb-brand span { color:var(--accent-soft); }
        .sb-nav { padding:14px 10px; display:flex; flex-direction:column; gap:2px; }
        .sb-nav-item { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:8px; font-size:13.5px; font-weight:500; cursor:pointer; color:#D6D2CD; transition:all .15s; }
        .sb-nav-item:hover { background:rgba(255,255,255,0.08); color:#fff; }
        .sb-nav-item.active { background:linear-gradient(135deg, var(--accent-soft), var(--accent-deep)); color:#fff; }
        .sb-main { flex:1; padding:26px 30px; overflow-y:auto; max-height:720px; }
        .sb-h1 { font-family:'Space Grotesk',sans-serif; font-size:21px; font-weight:600; margin:0 0 3px; }
        .sb-sub { color:var(--muted); font-size:13px; margin:0 0 22px; }
        .sb-card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px 18px; }
        .sb-stat-label { font-size:11.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); font-weight:600; margin-bottom:6px; }
        .sb-stat-value { font-family:'IBM Plex Mono',monospace; font-size:22px; font-weight:600; }
        .sb-grid-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:20px; }
        .sb-table { width:100%; border-collapse:collapse; font-size:13px; }
        .sb-table th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); font-weight:600; padding:8px 10px; border-bottom:1px dashed var(--line); }
        .sb-table td { padding:9px 10px; border-bottom:1px dashed var(--line); vertical-align:middle; }
        .sb-table tr:last-child td { border-bottom:none; }
        .sb-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:3px 8px; border-radius:20px; }
        .sb-badge-amber { background:#FBF0DF; color:var(--amber); }
        .sb-badge-coral { background:#FBE7E1; color:var(--coral); }
        .sb-badge-emerald { background:#E1F3EC; color:var(--emerald); }
        .sb-btn { font-family:'Inter',sans-serif; font-weight:600; font-size:13px; border:none; border-radius:8px; padding:9px 16px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        .sb-btn-primary { background:linear-gradient(135deg, var(--ink-soft), var(--ink)); color:#fff; }
        .sb-btn-primary:hover { background:linear-gradient(135deg, var(--accent), var(--accent-deep)); }
        .sb-btn-emerald { background:var(--emerald); color:#fff; }
        .sb-btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
        .sb-btn:disabled { opacity:.4; cursor:not-allowed; }
        .sb-input { font-family:'Inter',sans-serif; font-size:13px; border:1px solid var(--line); border-radius:7px; padding:8px 10px; width:100%; background:#fff; }
        .sb-input:focus { outline:2px solid var(--emerald); outline-offset:1px; }
        .sb-section-title { font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:14.5px; margin:0 0 12px; }
        .sb-modal-overlay { position:fixed; inset:0; background:rgba(27,42,74,0.55); display:flex; align-items:center; justify-content:center; z-index:50; }
        .sb-stamp { transform:rotate(-8deg); border:3px solid var(--accent-deep); color:var(--accent-deep); font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; padding:6px 14px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; }
        .sb-toggle-group { display:flex; gap:2px; background:#EEECEA; border-radius:8px; padding:3px; }
        .sb-toggle-item { border:none; background:transparent; font-family:'Inter',sans-serif; font-size:12px; font-weight:600; padding:6px 12px; border-radius:6px; cursor:pointer; color:#726E6C; }
        .sb-toggle-item.active { background:#fff; color:var(--accent-deep); box-shadow:0 1px 3px rgba(0,0,0,0.08); }
        .sb-ticker { height:168px; overflow:hidden; position:relative; border-radius:8px; background:#FBF8F5; border:1px solid var(--line); mask-image:linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent); }
        .sb-ticker-track { display:flex; flex-direction:column; animation-name:sb-scroll-up; animation-timing-function:linear; animation-iteration-count:infinite; }
        .sb-ticker-track:hover { animation-play-state:paused; }
        .sb-ticker-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 14px; font-size:12.5px; border-bottom:1px dashed var(--line); }
        @keyframes sb-scroll-up { 0% { transform:translateY(0); } 100% { transform:translateY(-50%); } }
        .sb-dash-split { display:grid; grid-template-columns:1.3fr 1fr; gap:16px; }
        .sb-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .sb-table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        .sb-table-scroll .sb-table { min-width:560px; }

        @media (max-width: 860px) {
          .sb-root { flex-direction:column; border-radius:0; min-height:auto; }
          .sb-sidebar { width:100%; flex-direction:row; align-items:center; }
          .sb-brand { border-bottom:none; border-right:1px solid rgba(255,255,255,0.14); padding:14px 16px; white-space:nowrap; }
          .sb-nav { flex-direction:row; padding:8px 10px; gap:4px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
          .sb-nav-item { white-space:nowrap; flex-shrink:0; }
          .sb-main { padding:18px 16px; max-height:none; }
          .sb-grid-stats { grid-template-columns:repeat(2, 1fr); }
          .sb-dash-split, .sb-form-grid { grid-template-columns:1fr; }
        }

        @media (max-width: 480px) {
          .sb-grid-stats { grid-template-columns:1fr; }
          .sb-h1 { font-size:18px; }
          .sb-stat-value { font-size:18px; }
          .sb-main { padding:16px 12px; }
          .sb-card { padding:14px; }
        }

        .sb-brand-logo { display:flex; align-items:center; gap:8px; font-family:'Inter',sans-serif; font-weight:600; font-size:14px; }
        .sb-brand-logo img { width:26px; height:26px; border-radius:6px; object-fit:cover; }
        .sb-sidebar-footer { margin-top:auto; padding:12px 20px; font-size:10.5px; color:rgba(255,255,255,0.45); border-top:1px solid rgba(255,255,255,0.1); }
        .sb-logo-preview { width:56px; height:56px; border-radius:10px; background:#F2F1EF; border:1px dashed var(--line); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; }
        .sb-logo-preview img { width:100%; height:100%; object-fit:cover; }
        .sb-theme-swatch { width:34px; height:34px; border-radius:50%; border:2px solid transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.15); }
        .sb-preview-sidebar { background:linear-gradient(180deg, #46433F 0%, #201F1D 100%); border-radius:10px; padding:16px; color:#fff; display:flex; flex-direction:column; gap:14px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; }
        .sb-preview-btn { align-self:flex-start; color:#fff; font-family:'Inter',sans-serif; font-weight:600; font-size:12px; padding:8px 14px; border-radius:8px; }

        @media (max-width: 860px) {
          .sb-sidebar-footer { display:none; }
        }

        .sb-client-fiche { display:flex; flex-wrap:wrap; gap:18px; margin-top:12px; padding:10px 12px; background:#F8F7F5; border-radius:8px; border:1px solid var(--line); }
        .sb-client-fiche div { display:flex; flex-direction:column; gap:2px; font-size:12.5px; }
        .sb-client-fiche span { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:#8A8682; }
        .sb-preview-prix { display:flex; flex-wrap:wrap; gap:18px; margin-top:12px; padding:10px 12px; background:#F8F7F5; border-radius:8px; border:1px solid var(--line); }
        .sb-preview-prix div { display:flex; flex-direction:column; gap:2px; font-size:12.5px; }
        .sb-preview-prix span { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:#8A8682; }
        .sb-preview-prix strong { font-family:'IBM Plex Mono',monospace; font-weight:600; }
        .sb-resume-commande { display:flex; flex-direction:column; gap:8px; }
        .sb-resume-commande > div { display:flex; justify-content:space-between; font-size:13px; }
        .sb-resume-commande span { color:#6E6B68; }
        .sb-resume-commande strong { font-family:'IBM Plex Mono',monospace; font-weight:600; }
        .sb-resume-total { padding-top:8px; border-top:1px dashed var(--line); font-size:15px !important; }
        .sb-resume-total strong { font-size:17px; }

        .sb-catalogue-header { display:flex; align-items:center; gap:10px; padding:12px 14px; background:#F8F7F5; border:1px solid var(--line); border-radius:10px; margin-bottom:16px; }
        .sb-catalogue-header img { width:36px; height:36px; border-radius:8px; object-fit:cover; }
        .sb-catalogue-logo-fallback { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:13px; flex-shrink:0; }
        .sb-catalogue-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px; }
        .sb-catalogue-card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:6px; }
        .sb-catalogue-thumb { width:100%; aspect-ratio:1.4; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:22px; opacity:0.85; }
        .sb-catalogue-thumb-img { width:100%; aspect-ratio:1.4; border-radius:8px; overflow:hidden; }
        .sb-catalogue-thumb-img img { width:100%; height:100%; object-fit:cover; }
        .sb-catalogue-cat { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:#8A8682; }
        .sb-catalogue-nom { font-size:13px; font-weight:600; line-height:1.3; }
        .sb-catalogue-prix { font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:13.5px; color:var(--accent-deep); }

        .sb-thumb-upload { width:36px; height:36px; border-radius:7px; background:#F2F1EF; border:1px dashed var(--line); display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; }
        .sb-thumb-upload img { width:100%; height:100%; object-fit:cover; }

        @media print {
          .sb-sidebar, .sb-no-print { display:none !important; }
          .sb-root { display:block; border:none; border-radius:0; min-height:auto; background:#fff; }
          .sb-main { padding:0; max-height:none; overflow:visible; }
          .sb-catalogue-grid { grid-template-columns:repeat(3, 1fr); gap:14px; }
          .sb-catalogue-card { break-inside:avoid; box-shadow:none; }
        }
      `}</style>

      <aside className="sb-sidebar">
        <div className="sb-brand">
          {logo ? (
            <div className="sb-brand-logo">
              <img src={logo} alt={businessName || "Logo"} />
              <span>{businessName || "Ma boutique"}</span>
            </div>
          ) : businessName ? (
            <span>{businessName}</span>
          ) : (
            <>Smart<span>Biz</span></>
          )}
        </div>
        <nav className="sb-nav">
          <NavItem icon={<LayoutDashboard size={16} />} label="Tableau de bord" active={page === "dashboard"} onClick={() => setPage("dashboard")} />
          <NavItem icon={<ShoppingCart size={16} />} label="Nouvelle commande" active={page === "nouvelle"} onClick={() => setPage("nouvelle")} />
          <NavItem icon={<ClipboardList size={16} />} label="Commandes" active={page === "commandes"} onClick={() => setPage("commandes")} />
          <NavItem icon={<Package size={16} />} label="Stock / Articles" active={page === "articles"} onClick={() => setPage("articles")} />
          <NavItem icon={<Users size={16} />} label="Clients" active={page === "clients"} onClick={() => setPage("clients")} />
          <NavItem icon={<LayoutGrid size={16} />} label="Catalogue" active={page === "catalogue"} onClick={() => setPage("catalogue")} />
          <NavItem icon={<Palette size={16} />} label="Paramètres" active={page === "personnalisation"} onClick={() => setPage("personnalisation")} />
        </nav>
        <div className="sb-sidebar-footer">Propulsé par SmartBiz</div>
      </aside>

      <main className="sb-main">
        {page === "dashboard" && (
          <Dashboard
            caDuMois={caDuMois}
            margeDuMois={margeDuMois}
            commandes={commandes}
            stockFaible={stockFaible}
            nbClients={clients.length}
            clientName={clientName}
            articleName={articleName}
            setPage={setPage}
            accent={theme.accent}
          />
        )}
        {page === "articles" && (
          <ArticlesView
            articles={articles}
            setArticles={setArticles}
            categories={categories}
            setCategories={setCategories}
            reappros={reappros}
            setReappros={setReappros}
            accent={theme.accent}
          />
        )}
        {page === "clients" && <ClientsView clients={clients} commandes={commandes} addClient={addClient} />}
        {page === "commandes" && (
          <CommandesView commandes={commandes} clientName={clientName} articleName={articleName} onReprint={setReceipt} />
        )}
        {page === "nouvelle" && (
          <NouvelleCommande articles={articles} clients={clients} addClient={addClient} passerCommande={passerCommande} nextNum={nextNum} />
        )}
        {page === "catalogue" && (
          <CatalogueView articles={articles} categories={categories} businessName={businessName} logo={logo} accent={theme.accent} />
        )}
        {page === "personnalisation" && (
          <PersonnalisationView
            businessName={businessName}
            setBusinessName={setBusinessName}
            logo={logo}
            setLogo={setLogo}
            themeKey={themeKey}
            setThemeKey={setThemeKey}
            notifEmail={notifEmail}
            setNotifEmail={setNotifEmail}
            confirmationEmail={confirmationEmail}
            setConfirmationEmail={setConfirmationEmail}
            rapportStock={rapportStock}
            setRapportStock={setRapportStock}
          />
        )}
      </main>

      {receipt && (
        <Receipt commande={receipt} clientName={clientName} getClient={getClient} articleName={articleName} onClose={() => setReceipt(null)} businessName={businessName} logo={logo} accent={theme.accent} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NavItem({ icon, label, active, onClick }) {
  return (
    <div className={`sb-nav-item${active ? " active" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </div>
  );
}

function buildEvolution(commandes, mode) {
  const now = new Date();
  if (mode === "mois") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weeksCount = Math.ceil(daysInMonth / 7);
    const buckets = Array.from({ length: weeksCount }, (_, i) => ({ label: `Sem ${i + 1}`, ca: 0 }));
    commandes.forEach((c) => {
      const d = new Date(c.date);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const w = Math.min(weeksCount, Math.ceil(d.getDate() / 7));
        buckets[w - 1].ca += c.ca;
      }
    });
    return buckets;
  }
  const monthsBack = mode === "trimestre" ? 3 : 6;
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(d), ca: 0 });
  }
  commandes.forEach((c) => {
    const d = new Date(c.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find((x) => x.key === key);
    if (b) b.ca += c.ca;
  });
  return buckets;
}

function Dashboard({ caDuMois, margeDuMois, commandes, stockFaible, nbClients, clientName, articleName, setPage, accent }) {
  const [intervalMode, setIntervalMode] = useState("trimestre");
  const evolution = useMemo(() => buildEvolution(commandes, intervalMode), [commandes, intervalMode]);
  const dernieresCommandes = useMemo(
    () => [...commandes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [commandes]
  );
  const rupturesTriees = [...stockFaible].sort((a, b) => a.stock - b.stock);
  const tickerItems = [...rupturesTriees, ...rupturesTriees]; // dupliqué pour la boucle de défilement

  return (
    <div>
      <h1 className="sb-h1">Tableau de bord</h1>
      <p className="sb-sub">Vue d'ensemble de votre activité ce mois-ci</p>

      <div className="sb-grid-stats">
        <div className="sb-card">
          <div className="sb-stat-label">Chiffre d'affaires du mois</div>
          <div className="sb-stat-value" style={{ color: accent }}>{fmt(caDuMois)}</div>
        </div>
        <div className="sb-card">
          <div className="sb-stat-label">Marge réelle du mois</div>
          <div className="sb-stat-value" style={{ color: "#0E8F6E" }}>{fmt(margeDuMois)}</div>
        </div>
        <div className="sb-card">
          <div className="sb-stat-label">Nombre de clients</div>
          <div className="sb-stat-value" style={{ color: "#2E2C2B" }}>{nbClients}</div>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="sb-section-title" style={{ margin: 0 }}>Évolution des ventes</div>
          <div className="sb-toggle-group">
            {[
              { key: "mois", label: "Mois" },
              { key: "trimestre", label: "Trimestre" },
              { key: "semestre", label: "Semestre" },
            ].map((opt) => (
              <button
                key={opt.key}
                className={`sb-toggle-item${intervalMode === opt.key ? " active" : ""}`}
                onClick={() => setIntervalMode(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={evolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E2D8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B6A63" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6B6A63" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E2D8" }} />
            <Bar dataKey="ca" fill={accent} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sb-dash-split">
        <div className="sb-card">
          <div className="sb-section-title">Dernières commandes</div>
          {dernieresCommandes.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B6A63" }}>Aucune commande enregistrée pour le moment.</p>
          ) : (
            <div className="sb-table-scroll">
<table className="sb-table">
              <thead><tr><th>N°</th><th>Cliente</th><th>Date</th><th>CA</th></tr></thead>
              <tbody>
                {dernieresCommandes.map((c) => (
                  <tr key={c.id}>
                    <td className="sb-mono">{c.numero}</td>
                    <td>{clientName(c.clientId)}</td>
                    <td style={{ color: "#6B6A63" }}>{new Date(c.date).toLocaleDateString("fr-FR")}</td>
                    <td className="sb-mono">{fmt(c.ca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
</div>
          )}
          <button className="sb-btn sb-btn-ghost" style={{ marginTop: 14 }} onClick={() => setPage("commandes")}>
            Voir toutes les commandes <ChevronRight size={14} />
          </button>
        </div>

        <div className="sb-card">
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} color="#C9862B" /> Presque en rupture
          </div>
          {rupturesTriees.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B6A63" }}>Aucune alerte — tous les stocks sont suffisants.</p>
          ) : (
            <div className="sb-ticker">
              <div
                className="sb-ticker-track"
                style={{ animationDuration: `${Math.max(6, rupturesTriees.length * 3)}s` }}
              >
                {tickerItems.map((a, i) => (
                  <div className="sb-ticker-item" key={i}>
                    <span>{a.nom}</span>
                    {a.stock === 0
                      ? <span className="sb-badge sb-badge-coral">Rupture</span>
                      : <span className="sb-badge sb-badge-amber">{a.stock} restant{a.stock > 1 ? "s" : ""}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="sb-btn sb-btn-ghost" style={{ marginTop: 14 }} onClick={() => setPage("articles")}>
            Voir le stock complet <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogueView({ articles, categories, businessName, logo, accent }) {
  const [filtreCategorie, setFiltreCategorie] = useState("Toutes");
  const [copyMsg, setCopyMsg] = useState("");

  const disponibles = articles.filter((a) => a.stock > 0);
  const filtres = filtreCategorie === "Toutes" ? disponibles : disponibles.filter((a) => a.categorie === filtreCategorie);

  function buildTexte() {
    const titre = `🛍️ Catalogue — ${businessName || "SmartBiz"}`;
    const lignes = filtres.map((a) => `• ${a.nom} — ${fmt(a.prixVente)}`).join("\n");
    return `${titre}\n\n${lignes}\n\nCommande par WhatsApp !`;
  }

  async function copierTexte() {
    try {
      await navigator.clipboard.writeText(buildTexte());
      setCopyMsg("✅ Texte copié — colle-le dans ta bio ou légende Instagram");
    } catch {
      setCopyMsg("Impossible de copier automatiquement, sélectionne le texte manuellement.");
    }
  }

  function partagerWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildTexte())}`, "_blank");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">Catalogue</h1>
          <p className="sb-sub">{disponibles.length} article(s) disponible(s) à partager</p>
        </div>
        <div className="sb-no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="sb-btn sb-btn-ghost" onClick={copierTexte}><Copy size={13} /> Copier le texte</button>
          <button className="sb-btn" style={{ background: "#25D366", color: "#fff" }} onClick={partagerWhatsApp}>
            <Share2 size={13} /> Partager
          </button>
          <button className="sb-btn sb-btn-primary" onClick={() => window.print()}>
            <Printer size={13} /> Imprimer / PDF
          </button>
        </div>
      </div>

      {copyMsg && (
        <div className="sb-badge sb-badge-emerald sb-no-print" style={{ margin: "12px 0", fontSize: 12.5, padding: "6px 10px" }}>
          {copyMsg}
        </div>
      )}

      <div className="sb-toggle-group sb-no-print" style={{ margin: "14px 0", flexWrap: "wrap", display: "inline-flex" }}>
        {["Toutes", ...categories].map((c) => (
          <button
            key={c}
            className={`sb-toggle-item${filtreCategorie === c ? " active" : ""}`}
            onClick={() => setFiltreCategorie(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="sb-catalogue-header">
        {logo ? (
          <img src={logo} alt={businessName || "Logo"} />
        ) : (
          <div className="sb-catalogue-logo-fallback" style={{ background: accent }}>{(businessName || "SB").slice(0, 2).toUpperCase()}</div>
        )}
        <div>
          <div className="sb-display" style={{ fontWeight: 700, fontSize: 16 }}>{businessName || "Ma boutique"}</div>
          <div style={{ fontSize: 11.5, color: "#8A8682" }}>Catalogue des produits disponibles</div>
        </div>
      </div>

      {filtres.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6B6A63", marginTop: 16 }}>Aucun article disponible dans cette catégorie pour le moment.</p>
      ) : (
        <div className="sb-catalogue-grid">
          {filtres.map((a) => (
            <div key={a.id} className="sb-catalogue-card">
              {a.image ? (
                <div className="sb-catalogue-thumb-img"><img src={a.image} alt={a.nom} /></div>
              ) : (
                <div className="sb-catalogue-thumb" style={{ background: accent }}>{a.nom.slice(0, 1).toUpperCase()}</div>
              )}
              <div className="sb-catalogue-cat">{a.categorie}</div>
              <div className="sb-catalogue-nom">{a.nom}</div>
              <div className="sb-catalogue-prix">{fmt(a.prixVente)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="sb-no-print" style={{ fontSize: 11, color: "#8A8682", marginTop: 16 }}>
        Instagram ne permet pas d'envoi automatique depuis le navigateur — utilise « Copier le texte » puis colle-le dans ta bio, ta story ou ta légende de publication.
      </p>
    </div>
  );
}

function ArticlesView({ articles, setArticles, categories, setCategories, reappros, setReappros, accent }) {
  const [form, setForm] = useState({ nom: "", categorie: categories[0] ?? "", prixAchat: "", fraisAnnexes: "", prixVente: "", stock: "", seuil: "3", image: null });
  const [showForm, setShowForm] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catMsg, setCatMsg] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("Toutes");
  const [reapproId, setReapproId] = useState(null);
  const [reapproForm, setReapproForm] = useState({ quantite: "", prixAchat: "", fraisAnnexes: "" });

  function ouvrirReappro(article) {
    setReapproId(article.id);
    setReapproForm({ quantite: "", prixAchat: String(article.prixAchat), fraisAnnexes: String(article.fraisAnnexes || 0) });
  }

  function validerReappro() {
    const qte = Number(reapproForm.quantite);
    if (!qte || qte < 1) return;
    const nouveauPrixAchat = Number(reapproForm.prixAchat) || 0;
    const nouveauxFraisAnnexes = Number(reapproForm.fraisAnnexes) || 0;

    setArticles((prev) =>
      prev.map((a) =>
        a.id === reapproId
          ? { ...a, stock: a.stock + qte, prixAchat: nouveauPrixAchat, fraisAnnexes: nouveauxFraisAnnexes }
          : a
      )
    );
    setReappros((prev) => [
      { id: "r" + Date.now(), articleId: reapproId, date: new Date().toISOString(), quantite: qte, prixAchat: nouveauPrixAchat, fraisAnnexes: nouveauxFraisAnnexes },
      ...prev,
    ]);
    setReapproId(null);
  }

  function adjustStock(id, delta) {
    setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, stock: Math.max(0, a.stock + delta) } : a)));
  }

  function handleFormImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result }));
    reader.readAsDataURL(file);
  }

  function handleExistingImage(id, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, image: reader.result } : a)));
    };
    reader.readAsDataURL(file);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.nom || !form.prixVente) return;
    setArticles((prev) => [
      ...prev,
      {
        id: "a" + Date.now(),
        nom: form.nom,
        categorie: form.categorie || categories[0] || "Autre",
        prixAchat: Number(form.prixAchat) || 0,
        fraisAnnexes: Number(form.fraisAnnexes) || 0,
        prixVente: Number(form.prixVente) || 0,
        stock: Number(form.stock) || 0,
        seuil: Number(form.seuil) || 3,
        image: form.image || null,
      },
    ]);
    setForm({ nom: "", categorie: categories[0] ?? "", prixAchat: "", fraisAnnexes: "", prixVente: "", stock: "", seuil: "3", image: null });
    setShowForm(false);
  }

  function addCategory() {
    const nom = newCat.trim();
    if (!nom) return;
    if (categories.some((c) => c.toLowerCase() === nom.toLowerCase())) {
      setCatMsg("Cette catégorie existe déjà.");
      return;
    }
    setCategories((prev) => [...prev, nom]);
    setNewCat("");
    setCatMsg("");
  }

  function removeCategory(nom) {
    const utilisee = articles.some((a) => a.categorie === nom);
    if (utilisee) {
      setCatMsg(`« ${nom} » est utilisée par au moins un article — impossible à supprimer.`);
      return;
    }
    setCategories((prev) => prev.filter((c) => c !== nom));
    setCatMsg("");
    if (filtreCategorie === nom) setFiltreCategorie("Toutes");
  }

  const articlesFiltres = filtreCategorie === "Toutes" ? articles : articles.filter((a) => a.categorie === filtreCategorie);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">Stock / Articles</h1>
          <p className="sb-sub">{articles.length} article(s) référencé(s)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sb-btn sb-btn-ghost" onClick={() => setShowCatManager((s) => !s)}>Catégories</button>
          <button className="sb-btn sb-btn-primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Nouvel article
          </button>
        </div>
      </div>

      {showCatManager && (
        <div className="sb-card" style={{ marginBottom: 16 }}>
          <div className="sb-section-title">Catégories du commerce</div>
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
            Configure ici les catégories propres à ton activité (ex. Extensions capillaires, Accessoires...).
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {categories.map((c) => (
              <span key={c} className="sb-badge sb-badge-emerald" style={{ padding: "5px 10px", fontSize: 12 }}>
                {c}
                <X size={11} style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => removeCategory(c)} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="sb-input" placeholder="Nouvelle catégorie (ex. Accessoires)" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="sb-btn sb-btn-primary" onClick={addCategory}><Plus size={14} /> Ajouter</button>
          </div>
          {catMsg && <p style={{ fontSize: 12, color: "#C24E37", margin: "8px 2px 0" }}>{catMsg}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <input className="sb-input" placeholder="Nom de l'article" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ gridColumn: "1 / 3" }} />
          <select className="sb-input" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
            {categories.length === 0
              ? <option value="">Aucune catégorie — ajoute-en une d'abord</option>
              : categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="sb-input" placeholder="Stock initial" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          <input className="sb-input" placeholder="Prix d'achat (FCFA)" type="number" value={form.prixAchat} onChange={(e) => setForm({ ...form, prixAchat: e.target.value })} />
          <input className="sb-input" placeholder="Frais annexes / unité — facultatif (transport, import...)" type="number" value={form.fraisAnnexes} onChange={(e) => setForm({ ...form, fraisAnnexes: e.target.value })} />
          <input className="sb-input" placeholder="Prix de vente (FCFA)" type="number" value={form.prixVente} onChange={(e) => setForm({ ...form, prixVente: e.target.value })} />
          <input className="sb-input" placeholder="Seuil d'alerte" type="number" value={form.seuil} onChange={(e) => setForm({ ...form, seuil: e.target.value })} />
          <div style={{ gridColumn: "1 / 3", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="sb-logo-preview" style={{ width: 44, height: 44 }}>
              {form.image ? <img src={form.image} alt="" /> : <Upload size={16} color="#A6A29D" />}
            </div>
            <label className="sb-btn sb-btn-ghost" style={{ cursor: "pointer" }}>
              Photo du produit — facultative
              <input type="file" accept="image/*" onChange={handleFormImage} style={{ display: "none" }} />
            </label>
            {form.image && (
              <button type="button" className="sb-btn sb-btn-ghost" onClick={() => setForm((f) => ({ ...f, image: null }))}>Retirer</button>
            )}
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>Ajouter l'article</button>
        </form>
      )}

      <div className="sb-toggle-group" style={{ marginBottom: 14, flexWrap: "wrap", display: "inline-flex" }}>
        {["Toutes", ...categories].map((c) => (
          <button
            key={c}
            className={`sb-toggle-item${filtreCategorie === c ? " active" : ""}`}
            onClick={() => setFiltreCategorie(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div className="sb-table-scroll">
<table className="sb-table">
          <thead>
            <tr><th></th><th>Article</th><th>Catégorie</th><th>Achat</th><th>Frais annexes</th><th>Vente</th><th>Marge réelle</th><th>Stock</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {articlesFiltres.map((a) => {
              const margeReelle = a.prixVente - a.prixAchat - (a.fraisAnnexes || 0);
              return (
                <tr key={a.id}>
                  <td>
                    <label className="sb-thumb-upload">
                      {a.image ? <img src={a.image} alt="" /> : <Upload size={13} color="#A6A29D" />}
                      <input type="file" accept="image/*" onChange={(e) => handleExistingImage(a.id, e.target.files?.[0])} style={{ display: "none" }} />
                    </label>
                  </td>
                  <td>{a.nom}</td>
                  <td style={{ color: "#6B6A63" }}>{a.categorie}</td>
                  <td className="sb-mono">{fmt(a.prixAchat)}</td>
                  <td className="sb-mono">{fmt(a.fraisAnnexes || 0)}</td>
                  <td className="sb-mono">{fmt(a.prixVente)}</td>
                  <td className="sb-mono" style={{ color: margeReelle >= 0 ? "#0E8F6E" : "#C24E37" }}>{fmt(margeReelle)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => adjustStock(a.id, -1)}><Minus size={12} /></button>
                      <span className="sb-mono" style={{ minWidth: 20, textAlign: "center" }}>{a.stock}</span>
                      <button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => adjustStock(a.id, 1)}><Plus size={12} /></button>
                    </div>
                  </td>
                  <td>
                    {a.stock === 0
                      ? <span className="sb-badge sb-badge-coral">Rupture</span>
                      : a.stock <= a.seuil
                      ? <span className="sb-badge sb-badge-amber">Faible</span>
                      : <span className="sb-badge sb-badge-emerald">OK</span>}
                  </td>
                  <td>
                    <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirReappro(a)}>
                      <RefreshCw size={12} /> Réappro.
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
</div>
      </div>

      <div className="sb-card">
        <div className="sb-section-title">Marge réelle sur le stock actuel</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
          Prend en compte les frais annexes (transport, importation...) pour estimer la marge réellement disponible sur les articles en stock.
        </p>
        <div className="sb-table-scroll">
<table className="sb-table">
          <thead>
            <tr><th>Article</th><th>Coût réel / unité</th><th>Marge réelle / unité</th><th>Stock</th><th>Marge réelle totale</th></tr>
          </thead>
          <tbody>
            {articlesFiltres.map((a) => {
              const coutReel = a.prixAchat + (a.fraisAnnexes || 0);
              const margeUnitaire = a.prixVente - coutReel;
              const margeTotale = margeUnitaire * a.stock;
              return (
                <tr key={a.id}>
                  <td>{a.nom}</td>
                  <td className="sb-mono">{fmt(coutReel)}</td>
                  <td className="sb-mono" style={{ color: margeUnitaire >= 0 ? "#0E8F6E" : "#C24E37" }}>{fmt(margeUnitaire)}</td>
                  <td className="sb-mono">{a.stock}</td>
                  <td className="sb-mono" style={{ fontWeight: 600 }}>{fmt(margeTotale)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 600, borderTop: "1px solid var(--line)" }}>Total</td>
              <td style={{ borderTop: "1px solid var(--line)" }}></td>
              <td style={{ borderTop: "1px solid var(--line)" }}></td>
              <td style={{ borderTop: "1px solid var(--line)" }}></td>
              <td className="sb-mono" style={{ fontWeight: 700, borderTop: "1px solid var(--line)", color: accent }}>
                {fmt(articlesFiltres.reduce((s, a) => s + (a.prixVente - a.prixAchat - (a.fraisAnnexes || 0)) * a.stock, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
</div>
      </div>

      {reappros.length > 0 && (
        <div className="sb-card" style={{ marginTop: 20 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} color={accent} /> Historique des réapprovisionnements
          </div>
          <div className="sb-table-scroll">
<table className="sb-table">
            <thead>
              <tr><th>Date</th><th>Article</th><th>Quantité ajoutée</th><th>Prix d'achat</th><th>Frais annexes</th></tr>
            </thead>
            <tbody>
              {reappros.slice(0, 10).map((r) => {
                const art = articles.find((a) => a.id === r.articleId);
                return (
                  <tr key={r.id}>
                    <td>{new Date(r.date).toLocaleDateString("fr-FR")}</td>
                    <td>{art ? art.nom : "—"}</td>
                    <td className="sb-mono">+{r.quantite}</td>
                    <td className="sb-mono">{fmt(r.prixAchat)}</td>
                    <td className="sb-mono">{fmt(r.fraisAnnexes || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
</div>
        </div>
      )}

      {reapproId && (() => {
        const art = articles.find((a) => a.id === reapproId);
        return (
          <div className="sb-modal-overlay" onClick={() => setReapproId(null)}>
            <div className="sb-card" style={{ width: 340, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div className="sb-section-title" style={{ margin: 0 }}>Réapprovisionner</div>
                <button onClick={() => setReapproId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}><X size={16} /></button>
              </div>
              <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 14px" }}>{art?.nom}</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input className="sb-input" placeholder="Quantité ajoutée *" type="number" min={1} value={reapproForm.quantite} onChange={(e) => setReapproForm({ ...reapproForm, quantite: e.target.value })} />
                <input className="sb-input" placeholder="Nouveau prix d'achat (FCFA)" type="number" value={reapproForm.prixAchat} onChange={(e) => setReapproForm({ ...reapproForm, prixAchat: e.target.value })} />
                <input className="sb-input" placeholder="Frais annexes / unité — facultatif" type="number" value={reapproForm.fraisAnnexes} onChange={(e) => setReapproForm({ ...reapproForm, fraisAnnexes: e.target.value })} />
                <p style={{ fontSize: 11, color: "#6E6B68", margin: 0 }}>
                  Le stock, le prix d'achat et les frais annexes de l'article seront mis à jour avec ces valeurs.
                </p>
                <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={validerReappro} disabled={!reapproForm.quantite}>
                  <CheckCircle2 size={14} /> Confirmer le réapprovisionnement
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PersonnalisationView({
  businessName, setBusinessName, logo, setLogo, themeKey, setThemeKey,
  notifEmail, setNotifEmail, confirmationEmail, setConfirmationEmail, rapportStock, setRapportStock,
}) {
  const [nameDraft, setNameDraft] = useState(businessName);
  const [emailDraft, setEmailDraft] = useState(notifEmail);
  const [savedMsg, setSavedMsg] = useState("");
  const [notifMsg, setNotifMsg] = useState("");

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  }

  function enregistrerNom() {
    setBusinessName(nameDraft.trim());
    setSavedMsg("✅ Nom de la boutique enregistré");
  }

  function enregistrerNotifications() {
    setNotifEmail(emailDraft.trim());
    setNotifMsg("✅ Préférences de notifications enregistrées");
  }

  return (
    <div>
      <h1 className="sb-h1">Paramètres</h1>
      <p className="sb-sub">Adapte SmartBiz à l'image de ta boutique</p>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">Logo</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="sb-logo-preview">
            {logo ? <img src={logo} alt="Logo" /> : <Palette size={20} color="#A6A29D" />}
          </div>
          <div>
            <label className="sb-btn sb-btn-ghost" style={{ cursor: "pointer" }}>
              <Upload size={13} /> Choisir une image
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
            </label>
            {logo && (
              <button className="sb-btn sb-btn-ghost" style={{ marginLeft: 8 }} onClick={() => setLogo(null)}>
                Retirer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">Nom de la boutique</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
          Affiché dans la barre latérale et sur les confirmations de commande, à la place de « SmartBiz ».
        </p>
        {savedMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 10, fontSize: 12.5, padding: "6px 10px" }}>
            {savedMsg}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="sb-input"
            placeholder="Ex. Chez Aïcha Beauté"
            value={nameDraft}
            onChange={(e) => { setNameDraft(e.target.value); setSavedMsg(""); }}
          />
          <button className="sb-btn sb-btn-primary" onClick={enregistrerNom}>Enregistrer</button>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">Thème de couleur</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
          Choisis la couleur d'accent utilisée dans toute l'application.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(THEMES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setThemeKey(key)}
              className="sb-theme-swatch"
              style={{ background: t.accent, borderColor: themeKey === key ? "#2E2C2B" : "transparent" }}
              title={t.label}
            >
              {themeKey === key && <CheckCircle2 size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">Notifications</div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>
          Entièrement facultatif — utile si tu as une adresse e-mail (ex. Gmail) et que tu veux un suivi à distance. Sinon, tu peux tout gérer directement dans l'appli.
        </p>

        {notifMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {notifMsg}
          </div>
        )}

        <label style={{ fontSize: 12, color: "#6E6B68", display: "block", marginBottom: 6 }}>Adresse e-mail de réception</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            className="sb-input"
            type="email"
            placeholder="ex. maboutique@gmail.com"
            value={emailDraft}
            onChange={(e) => { setEmailDraft(e.target.value); setNotifMsg(""); }}
          />
          <button className="sb-btn sb-btn-primary" onClick={enregistrerNotifications}>Enregistrer</button>
        </div>

        <div style={{ opacity: notifEmail ? 1 : 0.45, pointerEvents: notifEmail ? "auto" : "none" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={confirmationEmail} onChange={(e) => setConfirmationEmail(e.target.checked)} />
            Recevoir aussi les confirmations de commande par e-mail
          </label>

          <label style={{ fontSize: 12, color: "#6E6B68", display: "block", marginBottom: 6 }}>Rapport de stock automatique (PDF par e-mail)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "aucun", label: "Aucun" },
              { key: "journalier", label: "Journalier" },
              { key: "hebdomadaire", label: "Hebdomadaire" },
            ].map((opt) => (
              <button
                key={opt.key}
                className={`sb-toggle-item${rapportStock === opt.key ? " active" : ""}`}
                style={{ background: rapportStock === opt.key ? "#fff" : "#EEECEA" }}
                onClick={() => setRapportStock(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {!notifEmail && (
          <p style={{ fontSize: 11, color: "#8A8682", margin: "12px 2px 0" }}>
            Renseigne d'abord une adresse e-mail pour activer ces options.
          </p>
        )}
      </div>

      <div className="sb-card">
        <div className="sb-section-title">Aperçu</div>
        <div className="sb-preview-sidebar">
          {logo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={logo} alt="Logo" style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
              <span>{businessName || "Ma boutique"}</span>
            </div>
          ) : (
            <span>{businessName || <>Smart<span style={{ color: THEMES[themeKey].soft }}>Biz</span></>}</span>
          )}
          <div className="sb-preview-btn" style={{ background: `linear-gradient(135deg, ${THEMES[themeKey].soft}, ${THEMES[themeKey].deep})` }}>
            Nouvelle commande
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#6E6B68", margin: "10px 2px 0" }}>
          La mention « Propulsé par SmartBiz » reste visible sur les confirmations de commande, quelle que soit ta personnalisation.
        </p>
      </div>
    </div>
  );
}

function ClientsView({ clients, commandes, addClient }) {
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", adresse: "", email: "", telephone: "" });
  const [erreurTel, setErreurTel] = useState(false);
  const [msg, setMsg] = useState("");

  const stats = (id) => {
    const own = commandes.filter((c) => c.clientId === id);
    return { count: own.length, total: own.reduce((s, c) => s + c.ca, 0) };
  };
  const filtered = clients.filter((c) => c.nom.toLowerCase().includes(q.toLowerCase()));

  function submit(e) {
    e.preventDefault();
    if (!form.telephone.trim()) {
      setErreurTel(true);
      return;
    }
    setErreurTel(false);
    addClient(form.nom.trim(), form.telephone.trim(), form.adresse.trim(), form.email.trim());
    setMsg(`✅ ${form.nom.trim() || "Client"} enregistré(e) avec succès`);
    setForm({ nom: "", adresse: "", email: "", telephone: "" });
    setShowForm(false);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">Clients</h1>
          <p className="sb-sub">{clients.length} client(s) enregistré(s)</p>
        </div>
        <button className="sb-btn sb-btn-primary" onClick={() => { setShowForm((s) => !s); setMsg(""); }}>
          <Plus size={14} /> Nouveau client
        </button>
      </div>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <input className="sb-input" placeholder="Nom et prénoms" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={{ gridColumn: "1 / 3" }} />
          <input className="sb-input" placeholder="Adresse" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} style={{ gridColumn: "1 / 3" }} />
          <input className="sb-input" placeholder="E-mail (facultatif)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div>
            <input
              className="sb-input"
              placeholder="Téléphone *"
              value={form.telephone}
              onChange={(e) => { setForm({ ...form, telephone: e.target.value }); if (erreurTel) setErreurTel(false); }}
              style={erreurTel ? { borderColor: "#C24E37" } : undefined}
            />
            <p style={{ fontSize: 11, color: erreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
              {erreurTel ? "Le numéro de téléphone est obligatoire." : "Obligatoire — de préférence un numéro WhatsApp."}
            </p>
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            <CheckCircle2 size={14} /> Enregistrer le client
          </button>
        </form>
      )}

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 280 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#6B6A63" }} />
        <input className="sb-input" style={{ paddingLeft: 30 }} placeholder="Rechercher un client" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="sb-card">
        <div className="sb-table-scroll">
<table className="sb-table">
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Adresse</th><th>E-mail</th><th>Commandes</th><th>Total achats</th></tr></thead>
          <tbody>
            {filtered.map((c) => {
              const s = stats(c.id);
              return (
                <tr key={c.id}>
                  <td>{c.nom}</td>
                  <td style={{ color: "#6B6A63" }}>{c.telephone}</td>
                  <td style={{ color: "#6B6A63" }}>{c.adresse || "—"}</td>
                  <td style={{ color: "#6B6A63" }}>{c.email || "—"}</td>
                  <td className="sb-mono">{s.count}</td>
                  <td className="sb-mono">{fmt(s.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}

function CommandesView({ commandes, clientName, articleName, onReprint }) {
  return (
    <div>
      <h1 className="sb-h1">Commandes</h1>
      <p className="sb-sub">Historique complet — {commandes.length} commande(s)</p>

      <div className="sb-card">
        <div className="sb-table-scroll">
<table className="sb-table">
          <thead>
            <tr><th>N°</th><th>Date</th><th>Cliente</th><th>Articles</th><th>CA</th><th>Marge réelle</th><th></th></tr>
          </thead>
          <tbody>
            {commandes.map((c) => (
              <tr key={c.id}>
                <td className="sb-mono">{c.numero}</td>
                <td>{new Date(c.date).toLocaleDateString("fr-FR")}</td>
                <td>{clientName(c.clientId)}</td>
                <td style={{ color: "#6B6A63", fontSize: 12.5 }}>
                  {c.lignes.map((l) => `${articleName(l.articleId)} ×${l.quantite}`).join(", ")}
                </td>
                <td className="sb-mono">{fmt(c.ca)}</td>
                <td className="sb-mono" style={{ color: "#0E8F6E" }}>{fmt(c.marge)}</td>
                <td>
                  <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => onReprint(c)}>
                    <Printer size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}

function NouvelleCommande({ articles, clients, addClient, passerCommande, nextNum }) {
  const [mode, setMode] = useState("existant");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauAdresse, setNouveauAdresse] = useState("");
  const [nouveauEmail, setNouveauEmail] = useState("");
  const [nouveauTel, setNouveauTel] = useState("");
  const [erreurTel, setErreurTel] = useState(false);
  const [clientMsg, setClientMsg] = useState("");
  const [lignes, setLignes] = useState([]);
  const [articleSel, setArticleSel] = useState(articles[0]?.id ?? "");
  const [qte, setQte] = useState(1);
  const [typeLivraison, setTypeLivraison] = useState("boutique");
  const [zoneLivraison, setZoneLivraison] = useState(ZONES_LIVRAISON[0].zone);
  const [modePaiement, setModePaiement] = useState("livraison");
  const [operateur, setOperateur] = useState(OPERATEURS_MOBILE_MONEY[0]);

  const numeroPrevu = `CMD-${String(nextNum).padStart(4, "0")}`;
  const clientSelectionne = clients.find((c) => c.id === clientId);
  const articleSelectionne = articles.find((a) => a.id === articleSel);

  const stockDispo = (id) => {
    const art = articles.find((a) => a.id === id);
    const deja = lignes.filter((l) => l.articleId === id).reduce((s, l) => s + l.quantite, 0);
    return art ? art.stock - deja : 0;
  };

  function addLigne() {
    if (!articleSel || qte < 1 || qte > stockDispo(articleSel)) return;
    setLignes((prev) => {
      const existe = prev.find((l) => l.articleId === articleSel);
      if (existe) return prev.map((l) => (l.articleId === articleSel ? { ...l, quantite: l.quantite + qte } : l));
      return [...prev, { articleId: articleSel, quantite: qte }];
    });
    setQte(1);
  }

  function removeLigne(id) {
    setLignes((prev) => prev.filter((l) => l.articleId !== id));
  }

  const totalCa = lignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + art.prixVente * l.quantite;
  }, 0);

  const totalMargeReelle = lignes.reduce((s, l) => {
    const art = articles.find((a) => a.id === l.articleId);
    return s + (art.prixVente - art.prixAchat - (art.fraisAnnexes || 0)) * l.quantite;
  }, 0);

  const fraisLivraison = typeLivraison === "livraison"
    ? (ZONES_LIVRAISON.find((z) => z.zone === zoneLivraison)?.frais || 0)
    : 0;
  const totalAvecLivraison = totalCa + fraisLivraison;

  const peutValider = lignes.length > 0 && !!clientId;

  function enregistrerClient() {
    if (!nouveauTel.trim()) {
      setErreurTel(true);
      return;
    }
    setErreurTel(false);
    const id = addClient(nouveauNom.trim(), nouveauTel.trim(), nouveauAdresse.trim(), nouveauEmail.trim());
    setClientId(id);
    setMode("existant");
    setClientMsg(`✅ ${nouveauNom.trim() || "Cliente"} enregistrée avec succès`);
    setNouveauNom("");
    setNouveauAdresse("");
    setNouveauEmail("");
    setNouveauTel("");
  }

  function valider() {
    passerCommande({
      clientId,
      lignes,
      livraison: {
        type: typeLivraison,
        zone: typeLivraison === "livraison" ? zoneLivraison : null,
        frais: fraisLivraison,
      },
      paiement: {
        mode: modePaiement,
        operateur: modePaiement === "mobile_money" ? operateur : null,
      },
    });
    setLignes([]);
    setClientMsg("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">Nouvelle commande</h1>
          <p className="sb-sub">Cliente → articles → livraison → paiement → confirmation</p>
        </div>
        <div className="sb-badge sb-badge-emerald" style={{ fontSize: 12.5, padding: "6px 10px" }}>
          N° {numeroPrevu}
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">1. Cliente</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`sb-btn ${mode === "existant" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => { setMode("existant"); setClientMsg(""); }}>Cliente existante</button>
          <button className={`sb-btn ${mode === "nouveau" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => { setMode("nouveau"); setClientMsg(""); }}>Nouvelle cliente</button>
        </div>

        {clientMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {clientMsg}
          </div>
        )}

        {mode === "existant" ? (
          <>
            <select className="sb-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nom} — {c.telephone}</option>)}
            </select>
            {clientSelectionne && (
              <div className="sb-client-fiche">
                <div><span>Téléphone</span><strong>{clientSelectionne.telephone}</strong></div>
                <div><span>Adresse</span><strong>{clientSelectionne.adresse || "—"}</strong></div>
                <div><span>E-mail</span><strong>{clientSelectionne.email || "—"}</strong></div>
              </div>
            )}
          </>
        ) : (
          <div className="sb-form-grid">
            <input className="sb-input" placeholder="Nom et prénoms" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} style={{ gridColumn: "1 / 3" }} />
            <input className="sb-input" placeholder="Adresse" value={nouveauAdresse} onChange={(e) => setNouveauAdresse(e.target.value)} style={{ gridColumn: "1 / 3" }} />
            <input className="sb-input" placeholder="E-mail (facultatif)" type="email" value={nouveauEmail} onChange={(e) => setNouveauEmail(e.target.value)} />
            <div>
              <input
                className="sb-input"
                placeholder="Téléphone *"
                value={nouveauTel}
                onChange={(e) => { setNouveauTel(e.target.value); if (erreurTel) setErreurTel(false); }}
                style={erreurTel ? { borderColor: "#C24E37" } : undefined}
              />
              <p style={{ fontSize: 11, color: erreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
                {erreurTel ? "Le numéro de téléphone est obligatoire." : "Obligatoire — de préférence un numéro WhatsApp."}
              </p>
            </div>
            <button className="sb-btn sb-btn-emerald" style={{ gridColumn: "1 / 3", justifyContent: "center" }} onClick={enregistrerClient}>
              <CheckCircle2 size={14} /> Enregistrer la cliente
            </button>
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">2. Articles</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <select className="sb-input" value={articleSel} onChange={(e) => setArticleSel(e.target.value)} style={{ flex: 2, minWidth: 160 }}>
            {articles.map((a) => (
              <option key={a.id} value={a.id} disabled={a.stock === 0}>
                {a.nom} — {fmt(a.prixVente)} ({a.stock} en stock)
              </option>
            ))}
          </select>
          <input className="sb-input" type="number" min={1} max={stockDispo(articleSel)} value={qte} onChange={(e) => setQte(Number(e.target.value))} style={{ flex: 0.5, minWidth: 70 }} />
          <button className="sb-btn sb-btn-primary" onClick={addLigne} disabled={stockDispo(articleSel) < 1}><Plus size={14} /> Ajouter</button>
        </div>

        {articleSelectionne && (
          <div className="sb-preview-prix">
            <div><span>Prix de vente</span><strong>{fmt(articleSelectionne.prixVente)}</strong></div>
            <div><span>Prix d'achat</span><strong>{fmt(articleSelectionne.prixAchat)}</strong></div>
            <div>
              <span>Marge réelle / unité</span>
              <strong style={{ color: (articleSelectionne.prixVente - articleSelectionne.prixAchat - (articleSelectionne.fraisAnnexes || 0)) >= 0 ? "#0E8F6E" : "#C24E37" }}>
                {fmt(articleSelectionne.prixVente - articleSelectionne.prixAchat - (articleSelectionne.fraisAnnexes || 0))}
              </strong>
            </div>
          </div>
        )}

        {lignes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6B6A63", marginTop: 12 }}>Aucun article ajouté pour l'instant.</p>
        ) : (
          <div className="sb-table-scroll" style={{ marginTop: 14 }}>
            <table className="sb-table">
              <thead><tr><th>Article</th><th>Prix vente</th><th>Prix achat</th><th>Marge</th><th>Qté</th><th>Sous-total</th><th></th></tr></thead>
              <tbody>
                {lignes.map((l) => {
                  const art = articles.find((a) => a.id === l.articleId);
                  const margeUnitaire = art.prixVente - art.prixAchat - (art.fraisAnnexes || 0);
                  return (
                    <tr key={l.articleId}>
                      <td>{art.nom}</td>
                      <td className="sb-mono">{fmt(art.prixVente)}</td>
                      <td className="sb-mono">{fmt(art.prixAchat)}</td>
                      <td className="sb-mono" style={{ color: margeUnitaire >= 0 ? "#0E8F6E" : "#C24E37" }}>{fmt(margeUnitaire)}</td>
                      <td className="sb-mono">{l.quantite}</td>
                      <td className="sb-mono">{fmt(art.prixVente * l.quantite)}</td>
                      <td><button className="sb-btn sb-btn-ghost" style={{ padding: "3px 6px" }} onClick={() => removeLigne(l.articleId)}><Trash2 size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">3. Livraison</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`sb-btn ${typeLivraison === "boutique" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => setTypeLivraison("boutique")}>Récupération en boutique</button>
          <button className={`sb-btn ${typeLivraison === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => setTypeLivraison("livraison")}>Livraison</button>
        </div>
        {typeLivraison === "livraison" ? (
          <select className="sb-input" value={zoneLivraison} onChange={(e) => setZoneLivraison(e.target.value)}>
            {ZONES_LIVRAISON.map((z) => (
              <option key={z.zone} value={z.zone}>{z.zone} — {fmt(z.frais)}</option>
            ))}
          </select>
        ) : (
          <p style={{ fontSize: 12.5, color: "#6E6B68", margin: 0 }}>Aucun frais de livraison — la cliente récupère sa commande en boutique.</p>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div className="sb-section-title">4. Paiement</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={`sb-btn ${modePaiement === "livraison" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => setModePaiement("livraison")}>Paiement à la livraison</button>
          <button className={`sb-btn ${modePaiement === "mobile_money" ? "sb-btn-primary" : "sb-btn-ghost"}`} onClick={() => setModePaiement("mobile_money")}>Mobile Money</button>
        </div>
        {modePaiement === "mobile_money" && (
          <select className="sb-input" value={operateur} onChange={(e) => setOperateur(e.target.value)}>
            {OPERATEURS_MOBILE_MONEY.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        )}
      </div>

      <div className="sb-card">
        <div className="sb-section-title">Résumé</div>
        <div className="sb-resume-commande">
          <div><span>Total articles</span><strong>{fmt(totalCa)}</strong></div>
          <div><span>Frais de livraison</span><strong>{fmt(fraisLivraison)}</strong></div>
          <div className="sb-resume-total"><span>Total à payer</span><strong>{fmt(totalAvecLivraison)}</strong></div>
          <div><span>Marge réelle estimée</span><strong style={{ color: totalMargeReelle >= 0 ? "#0E8F6E" : "#C24E37" }}>{fmt(totalMargeReelle)}</strong></div>
        </div>
        <button className="sb-btn sb-btn-emerald" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} disabled={!peutValider} onClick={valider}>
          <CheckCircle2 size={15} /> Enregistrer & confirmer
        </button>
      </div>
    </div>
  );
}

function toWhatsAppNumber(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("225")) return digits;
  if (digits.startsWith("0")) return "225" + digits.slice(1);
  return "225" + digits;
}

function Receipt({ commande, clientName, getClient, articleName, onClose, businessName, logo, accent }) {
  const client = getClient ? getClient(commande.clientId) : null;
  const totalGeneral = commande.ca + (commande.livraison?.frais || 0);

  function envoyerWhatsApp() {
    const numero = toWhatsAppNumber(client?.telephone);
    if (!numero) return;
    const lignesTxt = commande.lignes.map((l) => `- ${articleName(l.articleId)} ×${l.quantite}`).join("\n");
    const message =
      `Bonjour ${clientName(commande.clientId)}, voici la confirmation de votre commande ${commande.numero} chez ${businessName || "SmartBiz"} :\n\n` +
      `${lignesTxt}\n\n` +
      (commande.livraison?.frais > 0 ? `Frais de livraison : ${fmt(commande.livraison.frais)}\n` : "") +
      `Total : ${fmt(totalGeneral)}\n\n` +
      `Merci pour votre confiance ! ✅`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div className="sb-modal-overlay" onClick={onClose}>
      <div className="sb-card" style={{ width: 380, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          {logo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={logo} alt={businessName || "Logo"} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
              <span className="sb-display" style={{ fontWeight: 700, fontSize: 16 }}>{businessName || "Ma boutique"}</span>
            </div>
          ) : businessName ? (
            <span className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>{businessName}</span>
          ) : (
            <div className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>Smart<span style={{ color: accent }}>Biz</span></div>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: "#6B6A63", margin: "0 0 14px" }}>Confirmation de commande</p>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
          <span style={{ color: "#6B6A63" }}>N° commande</span><span className="sb-mono">{commande.numero}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
          <span style={{ color: "#6B6A63" }}>Date</span><span>{new Date(commande.date).toLocaleDateString("fr-FR")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
          <span style={{ color: "#6B6A63" }}>Cliente</span><span>{clientName(commande.clientId)}</span>
        </div>

        {commande.livraison && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>Livraison</span>
            <span>{commande.livraison.type === "livraison" ? `${commande.livraison.zone} (${fmt(commande.livraison.frais)})` : "Récupération en boutique"}</span>
          </div>
        )}
        {commande.paiement && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
            <span style={{ color: "#6B6A63" }}>Paiement</span>
            <span>{commande.paiement.mode === "mobile_money" ? commande.paiement.operateur : "À la livraison"}</span>
          </div>
        )}

        <div style={{ borderTop: "1px dashed #E4E2D8", borderBottom: "1px dashed #E4E2D8", padding: "10px 0", marginBottom: 12 }}>
          {commande.lignes.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span>{articleName(l.articleId)} ×{l.quantite}</span>
              <span className="sb-mono">{fmt(l.prixVente * l.quantite)}</span>
            </div>
          ))}
          {commande.livraison?.frais > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>Frais de livraison</span>
              <span className="sb-mono">{fmt(commande.livraison.frais)}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14.5, marginBottom: 16 }}>
          <span>Total</span><span className="sb-mono">{fmt(commande.ca + (commande.livraison?.frais || 0))}</span>
        </div>

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <span className="sb-stamp"><CheckCircle2 size={15} /> CONFIRMÉE</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="sb-btn" style={{ width: "100%", justifyContent: "center", background: "#25D366", color: "#fff" }} onClick={envoyerWhatsApp} disabled={!toWhatsAppNumber(client?.telephone)}>
            <MessageCircle size={14} /> Envoyer par WhatsApp
          </button>
          <button className="sb-btn sb-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.print()}>
            <Printer size={14} /> Imprimer / Télécharger en PDF
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: 10.5, color: "#A6A29D", margin: "12px 0 0" }}>Propulsé par SmartBiz</p>
      </div>
    </div>
  );
}
