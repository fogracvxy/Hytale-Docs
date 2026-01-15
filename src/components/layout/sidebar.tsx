"use client";

import * as React from "react";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { ChevronRight, BadgeCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { sidebarConfig, type SidebarItem } from "@/config/sidebar";
import { SidebarAd } from "@/components/ads";

function SidebarLink({
  item,
  level = 0,
  t,
}: {
  item: SidebarItem;
  level?: number;
  t: (key: string) => string;
}) {
  const pathname = usePathname();
  const isActive = item.href === pathname;
  const hasChildren = item.items && item.items.length > 0;
  const isChildActive =
    hasChildren &&
    item.items?.some(
      (child) =>
        child.href === pathname ||
        child.items?.some((grandchild) => grandchild.href === pathname)
    );

  const [isOpen, setIsOpen] = React.useState(isActive || isChildActive);

  React.useEffect(() => {
    if (isActive || isChildActive) {
      setIsOpen(true);
    }
  }, [isActive, isChildActive]);

  const title = t(item.titleKey);

  if (hasChildren) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted hover:text-primary">
          <span className={cn("truncate", isChildActive && "text-primary")}>
            {title}
          </span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-2.5 border-l border-border pl-2.5">
            {item.items?.map((child) => (
              <SidebarLink key={child.titleKey} item={child} level={level + 1} t={t} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Link
      href={item.href || "#"}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
        isActive
          ? "bg-primary/10 font-medium text-primary border-l-2 border-primary -ml-[2px] pl-[12px]"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="truncate">{title}</span>
      {item.verified && (
        <Tooltip>
          <TooltipTrigger asChild>
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[--color-hytale-green]" />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {t("verified")}
          </TooltipContent>
        </Tooltip>
      )}
    </Link>
  );
}

export function Sidebar() {
  const t = useTranslations("sidebar");

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 xl:w-72 2xl:w-80 shrink-0 border-r border-border lg:block">
      <ScrollArea className="h-full py-4 pr-3">
        <nav className="space-y-0.5 pl-3">
          {sidebarConfig.map((item) => (
            <SidebarLink key={item.titleKey} item={item} t={t} />
          ))}
        </nav>
        {/* Discrete ad at bottom of sidebar */}
        <div className="pl-3 pr-1">
          <SidebarAd />
        </div>
      </ScrollArea>
    </aside>
  );
}

export function MobileSidebar() {
  const t = useTranslations("sidebar");

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <nav className="space-y-1 p-4">
        {sidebarConfig.map((item) => (
          <SidebarLink key={item.titleKey} item={item} t={t} />
        ))}
      </nav>
    </ScrollArea>
  );
}
