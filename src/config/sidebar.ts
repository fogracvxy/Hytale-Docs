export interface SidebarItem {
  titleKey: string;
  href?: string;
  items?: SidebarItem[];
}

export const sidebarConfig: SidebarItem[] = [
  { titleKey: "introduction", href: "/docs/intro" },
  {
    titleKey: "playerGuide",
    items: [
      { titleKey: "overview", href: "/docs/gameplay/overview" },
      { titleKey: "beginnersGuide", href: "/docs/guides/beginners-guide" },
      { titleKey: "faq", href: "/docs/getting-started/faq" },
      { titleKey: "systemRequirements", href: "/docs/getting-started/system-requirements" },
      { titleKey: "hytaleVsMinecraft", href: "/docs/getting-started/hytale-vs-minecraft" },
      { titleKey: "knownIssues", href: "/docs/getting-started/known-issues" },
      {
        titleKey: "gettingStarted",
        items: [
          { titleKey: "firstSteps", href: "/docs/gameplay/getting-started/first-steps" },
          { titleKey: "controls", href: "/docs/gameplay/getting-started/controls" },
          { titleKey: "interface", href: "/docs/gameplay/getting-started/interface" },
        ],
      },
      {
        titleKey: "theWorld",
        items: [
          { titleKey: "overview", href: "/docs/gameplay/world/overview" },
          { titleKey: "worldZones", href: "/docs/gameplay/world-zones" },
          { titleKey: "regions", href: "/docs/gameplay/world/regions" },
        ],
      },
      {
        titleKey: "combat",
        items: [
          { titleKey: "combatSystem", href: "/docs/gameplay/combat/overview" },
          { titleKey: "weapons", href: "/docs/gameplay/combat/weapons" },
          { titleKey: "magic", href: "/docs/gameplay/combat/magic" },
        ],
      },
      {
        titleKey: "creatures",
        items: [
          { titleKey: "overview", href: "/docs/gameplay/creatures/overview" },
          { titleKey: "hostileCreatures", href: "/docs/gameplay/creatures/hostile" },
        ],
      },
      {
        titleKey: "crafting",
        items: [
          { titleKey: "craftingGuide", href: "/docs/gameplay/crafting-guide" },
          { titleKey: "itemsDatabase", href: "/docs/gameplay/items-database" },
        ],
      },
      { titleKey: "performanceOptimization", href: "/docs/guides/performance-optimization" },
    ],
  },
  {
    titleKey: "devGettingStarted",
    items: [
      { titleKey: "introduction", href: "/docs/getting-started/introduction" },
      { titleKey: "prerequisites", href: "/docs/getting-started/prerequisites" },
      {
        titleKey: "environmentSetup",
        href: "/docs/getting-started/environment-setup",
      },
      { titleKey: "firstMod", href: "/docs/getting-started/first-mod" },
      { titleKey: "firstModQuick", href: "/docs/guides/first-mod-quick" },
    ],
  },
  {
    titleKey: "modding",
    items: [
      { titleKey: "overview", href: "/docs/modding/overview" },
      { titleKey: "architecture", href: "/docs/modding/architecture" },
      {
        titleKey: "dataAssets",
        items: [
          { titleKey: "overview", href: "/docs/modding/data-assets/overview" },
          {
            titleKey: "blocks",
            items: [
              { titleKey: "overview", href: "/docs/modding/data-assets/blocks/overview" },
              { titleKey: "properties", href: "/docs/modding/data-assets/blocks/properties" },
              { titleKey: "behaviors", href: "/docs/modding/data-assets/blocks/behaviors" },
            ],
          },
          {
            titleKey: "items",
            items: [
              { titleKey: "overview", href: "/docs/modding/data-assets/items/overview" },
              { titleKey: "properties", href: "/docs/modding/data-assets/items/properties" },
              { titleKey: "behaviors", href: "/docs/modding/data-assets/items/behaviors" },
            ],
          },
          {
            titleKey: "npcs",
            items: [
              { titleKey: "overview", href: "/docs/modding/data-assets/npcs/overview" },
              { titleKey: "aiSystem", href: "/docs/modding/data-assets/npcs/ai-system" },
              { titleKey: "behaviors", href: "/docs/modding/data-assets/npcs/behaviors" },
            ],
          },
        ],
      },
      {
        titleKey: "plugins",
        items: [
          { titleKey: "overview", href: "/docs/modding/plugins/overview" },
          { titleKey: "projectSetup", href: "/docs/modding/plugins/project-setup" },
          { titleKey: "pluginLifecycle", href: "/docs/modding/plugins/plugin-lifecycle" },
          { titleKey: "events", href: "/docs/modding/plugins/events" },
          { titleKey: "commands", href: "/docs/modding/plugins/commands" },
        ],
      },
      {
        titleKey: "artAssets",
        items: [
          { titleKey: "overview", href: "/docs/modding/art-assets/overview" },
          { titleKey: "models", href: "/docs/modding/art-assets/models" },
          { titleKey: "textures", href: "/docs/modding/art-assets/textures" },
          { titleKey: "animations", href: "/docs/modding/art-assets/animations" },
        ],
      },
    ],
  },
  {
    titleKey: "servers",
    items: [
      { titleKey: "overview", href: "/docs/servers/overview" },
      {
        titleKey: "setup",
        items: [
          { titleKey: "requirements", href: "/docs/servers/setup/requirements" },
          { titleKey: "installation", href: "/docs/servers/setup/installation" },
          { titleKey: "configuration", href: "/docs/servers/setup/configuration" },
        ],
      },
      {
        titleKey: "administration",
        items: [
          { titleKey: "commands", href: "/docs/servers/administration/commands" },
          { titleKey: "permissions", href: "/docs/servers/administration/permissions" },
          { titleKey: "whitelist", href: "/docs/servers/administration/whitelist" },
        ],
      },
      {
        titleKey: "hosting",
        items: [
          { titleKey: "selfHosting", href: "/docs/servers/hosting/self-hosting" },
          { titleKey: "budgetHosting", href: "/docs/servers/budget-hosting" },
          { titleKey: "docker", href: "/docs/servers/hosting/docker" },
          { titleKey: "cloudProviders", href: "/docs/servers/hosting/providers" },
        ],
      },
    ],
  },
  {
    titleKey: "apiReference",
    items: [
      { titleKey: "overview", href: "/docs/api/overview" },
      {
        titleKey: "officialApi",
        items: [
          { titleKey: "endpoints", href: "/docs/api/official/endpoints" },
          { titleKey: "authentication", href: "/docs/api/official/authentication" },
        ],
      },
      {
        titleKey: "sdks",
        items: [
          { titleKey: "javascript", href: "/docs/api/sdks/javascript" },
          { titleKey: "php", href: "/docs/api/sdks/php" },
        ],
      },
    ],
  },
  {
    titleKey: "tools",
    items: [
      { titleKey: "overview", href: "/docs/tools/overview" },
      {
        titleKey: "blockbench",
        items: [
          { titleKey: "installation", href: "/docs/tools/blockbench/installation" },
          { titleKey: "pluginSetup", href: "/docs/tools/blockbench/plugin-setup" },
          { titleKey: "modeling", href: "/docs/tools/blockbench/modeling" },
          { titleKey: "animation", href: "/docs/tools/blockbench/animation" },
        ],
      },
      {
        titleKey: "assetEditor",
        items: [
          { titleKey: "overview", href: "/docs/tools/asset-editor/overview" },
          { titleKey: "editingData", href: "/docs/tools/asset-editor/editing-data" },
        ],
      },
      { titleKey: "creativeMode", href: "/docs/tools/creative-mode" },
      { titleKey: "machinima", href: "/docs/tools/machinima" },
    ],
  },
  {
    titleKey: "guides",
    items: [
      { titleKey: "firstBlock", href: "/docs/guides/first-block" },
      { titleKey: "firstItem", href: "/docs/guides/first-item" },
      { titleKey: "firstNpc", href: "/docs/guides/first-npc" },
      { titleKey: "customBiome", href: "/docs/guides/custom-biome" },
    ],
  },
  {
    titleKey: "community",
    items: [
      { titleKey: "contributing", href: "/docs/community/contributing" },
      { titleKey: "codeOfConduct", href: "/docs/community/code-of-conduct" },
      { titleKey: "resources", href: "/docs/community/resources" },
      { titleKey: "mods", href: "/docs/community/mods" },
      { titleKey: "communityServers", href: "/docs/community/servers" },
      { titleKey: "contentCreators", href: "/docs/community/content-creators" },
      { titleKey: "buildsGallery", href: "/docs/community/builds-gallery" },
      { titleKey: "events", href: "/docs/community/events" },
    ],
  },
];
