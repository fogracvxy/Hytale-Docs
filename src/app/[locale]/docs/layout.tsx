import { setRequestLocale } from "next-intl/server";
import { Navbar, Footer, Sidebar } from "@/components/layout";
import { DocumentationProgress } from "@/components/documentation-progress";
import { DocsDisclaimer } from "@/components/docs-disclaimer";
import { DisclaimerToast } from "@/components/disclaimer-toast";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <DocumentationProgress />
      <DocsDisclaimer />
      <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex gap-6 lg:gap-8">
          <Sidebar />
          <main className="flex-1 min-w-0 py-6">{children}</main>
        </div>
      </div>
      <Footer />
      <DisclaimerToast />
    </div>
  );
}
