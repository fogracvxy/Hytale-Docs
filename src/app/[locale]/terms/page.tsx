import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Navbar, Footer } from "@/components/layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return {
    title: t("title"),
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 container px-4 py-12 max-w-4xl">
        <TermsContent />
      </main>
      <Footer />
    </div>
  );
}

function TermsContent() {
  const t = useTranslations("terms");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>{t("title")}</h1>
      <p className="text-muted-foreground">{t("lastUpdated")}: January 2026</p>

      <h2>{t("acceptance.title")}</h2>
      <p>{t("acceptance.content")}</p>

      <h2>{t("use.title")}</h2>
      <p>{t("use.content")}</p>

      <h2>{t("content.title")}</h2>
      <p>{t("content.content")}</p>

      <h2>{t("disclaimer.title")}</h2>
      <p>{t("disclaimer.content")}</p>

      <h2>{t("affiliation.title")}</h2>
      <p>{t("affiliation.content")}</p>

      <h2>{t("changes.title")}</h2>
      <p>{t("changes.content")}</p>
    </article>
  );
}
