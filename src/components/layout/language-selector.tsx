"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const languages = [
  { code: "fr", name: "Francais", flag: "FR" },
  { code: "en", name: "English", flag: "EN" },
] as const;

export function LanguageSelector() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Sync localStorage to cookie on mount
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const preferredLanguage = localStorage.getItem("preferredLanguage");
      if (
        preferredLanguage &&
        (preferredLanguage === "en" || preferredLanguage === "fr")
      ) {
        // Set cookie for server-side access
        document.cookie = `preferredLanguage=${preferredLanguage}; path=/; max-age=31536000; SameSite=Lax; Secure`;

        // If current locale doesn't match preference, redirect
        if (locale !== preferredLanguage) {
          router.replace(pathname, {
            locale: preferredLanguage as "fr" | "en",
          });
        }
      }
    }
  }, [locale, pathname, router]);

  const handleLanguageChange = (newLocale: string) => {
    // Save to localStorage and cookie
    if (typeof window !== "undefined") {
      localStorage.setItem("preferredLanguage", newLocale);
      // Also set as cookie for server-side access
      document.cookie = `preferredLanguage=${newLocale}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    }
    router.replace(pathname, { locale: newLocale as "fr" | "en" });
  };

  const currentLanguage = languages.find((lang) => lang.code === locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={`Select language. Current: ${currentLanguage?.name || "Select language"}`}
        >
          <Globe className="h-5 w-5" />
          <span className="sr-only">
            {currentLanguage?.name || "Select language"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border-border">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className={`cursor-pointer ${
              locale === language.code
                ? "text-primary bg-primary/10"
                : "text-popover-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="mr-2 text-xs font-bold">{language.flag}</span>
            {language.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
