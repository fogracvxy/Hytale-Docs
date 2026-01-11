import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Navbar, Footer } from "@/components/layout";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("title"),
  };
}

export default async function PrivacyPage({
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
        <PrivacyContent />
      </main>
      <Footer />
    </div>
  );
}

function PrivacyContent() {
  const t = useTranslations("privacy");

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>{t("title")}</h1>
      <p className="text-muted-foreground">{t("lastUpdated")}: January 2026</p>

      <h2>{t("intro.title")}</h2>
      <p>{t("intro.content")}</p>

      <h2>{t("dataCollection.title")}</h2>
      <p>{t("dataCollection.content")}</p>
      <ul>
        <li>{t("dataCollection.item1")}</li>
        <li>{t("dataCollection.item2")}</li>
        <li>{t("dataCollection.item3")}</li>
      </ul>

      <h2>{t("cookies.title")}</h2>
      <p>{t("cookies.content")}</p>
      <ul>
        <li><strong>{t("cookies.essential")}</strong>: {t("cookies.essentialDesc")}</li>
        <li><strong>{t("cookies.analytics")}</strong>: {t("cookies.analyticsDesc")}</li>
        <li><strong>{t("cookies.advertising")}</strong>: {t("cookies.advertisingDesc")}</li>
      </ul>

      <h2>{t("thirdParty.title")}</h2>
      <p>{t("thirdParty.content")}</p>
      <ul>
        <li><strong>Google AdSense</strong>: {t("thirdParty.adsense")}</li>
        <li><strong>Umami Analytics</strong>: {t("thirdParty.analytics")}</li>
      </ul>

      <h2>{t("rights.title")}</h2>
      <p>{t("rights.content")}</p>

      <h2>{t("contact.title")}</h2>
      <p>{t("contact.content")}</p>
    </article>
  );
}
