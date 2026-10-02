import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageShell } from "./PageShell";
import { pageGate, type ConditionId } from "@/lib/conditions";

type Props = {
  namespace: "privacy" | "terms";
  gate: ConditionId;
  sections: readonly string[];
};

// The privacy policy and terms until UX & PM's final text arrives (W3):
// section headings only, served as drafts on Preview and as a 404 on
// Production (pageGate). The final text replaces the "pending" bodies.
export async function LegalSkeleton({ namespace, gate, sections }: Props) {
  const state = pageGate(gate);
  if (state === "hidden") notFound();
  const t = await getTranslations(namespace);

  return (
    <PageShell title={t("title")} draft={state === "draft"}>
      {sections.map((key) => (
        <section key={key} className="pt-2">
          <h2 className="text-xl font-medium text-text">{t(key)}</h2>
          <p className="mt-2 italic">{t("pending")}</p>
        </section>
      ))}
    </PageShell>
  );
}
