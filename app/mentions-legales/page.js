import fs from "fs";
import path from "path";
import LegalDocument from "@/components/LegalDocument";
import LegalBackLink from "@/components/LegalBackLink";

export const metadata = {
  title: "Mentions Légales — Doka",
  description: "Mentions légales de Doka.",
};

export default function MentionsLegalesPage() {
  const content = fs.readFileSync(path.join(process.cwd(), "doka-mentions-legales.md"), "utf-8");
  return (
    <div className="sb-legal-screen">
      <div className="sb-legal-card">
        <LegalBackLink />
        <LegalDocument content={content} />
      </div>
    </div>
  );
}
