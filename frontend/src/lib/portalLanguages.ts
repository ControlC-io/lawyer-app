export const PORTAL_LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "lb", label: "Lëtzebuergesch" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
] as const;

export type PortalLanguageCode = (typeof PORTAL_LANGUAGES)[number]["code"];

export const PORTAL_LANGUAGE_LABELS: Record<PortalLanguageCode, string> = PORTAL_LANGUAGES.reduce(
  (acc, lang) => {
    acc[lang.code] = lang.label;
    return acc;
  },
  {} as Record<PortalLanguageCode, string>,
);

export const PORTAL_LANGUAGE_FLAGS: Record<PortalLanguageCode, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  de: "🇩🇪",
  lb: "🇱🇺",
  pt: "🇵🇹",
  es: "🇪🇸",
};

const PORTAL_START_LABELS: Record<PortalLanguageCode, string> = {
  fr: "Commencer",
  en: "Start",
  de: "Starten",
  lb: "Starten",
  pt: "Iniciar",
  es: "Comenzar",
};

export function getPortalLanguageDisplay(languageCode: PortalLanguageCode): string {
  const label = PORTAL_LANGUAGE_LABELS[languageCode] || languageCode;
  const flag = PORTAL_LANGUAGE_FLAGS[languageCode];
  return flag ? `${flag} ${label}` : label;
}

export function getPortalStartLabel(languageCode: PortalLanguageCode): string {
  return PORTAL_START_LABELS[languageCode] || PORTAL_START_LABELS.en;
}
