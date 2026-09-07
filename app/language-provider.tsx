"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Language = "en" | "de";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const STORAGE_KEY = "whatspulled-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

const german: Record<string, string> = {
  "Access code": "Zugangscode",
  "Access required": "Zugang erforderlich",
  "Account required": "Account erforderlich",
  "An account turns the tracker into your personal chase desk.":
    "Mit einem Account wird der Tracker zu deinem persönlichen Chase Desk.",
  "Add chase card": "Chase-Karte hinzufügen",
  "Add to favorites": "Zu Favoriten hinzufügen",
  "Add a store listing and move the card to available.":
    "Füge ein Shop-Angebot hinzu und setze die Karte auf verfügbar.",
  "All rankings": "Alle Platzierungen",
  "All Sports": "Alle Sportarten",
  "All Time": "Gesamt",
  "Amount": "Betrag",
  "Approved pulls will appear here with value, date, set and card links.":
    "Bestätigte Pulls erscheinen hier mit Wert, Datum, Set und Kartenlink.",
  "Awaiting approved collector pulls": "Warten auf bestätigte Collector-Pulls",
  "Awaiting approved pulls.": "Warten auf bestätigte Pulls.",
  "Available": "Verfügbar",
  "Base checklist, numbered parallels, RC tags, and pull progress in one place.":
    "Base-Checkliste, nummerierte Parallels, RC-Tags und Pull-Fortschritt an einem Ort.",
  "Best Pull": "Bester Pull",
  "Bid saved. The owner can review it.":
    "Gebot gespeichert. Der Besitzer kann es prüfen.",
  "Bids": "Gebote",
  "Breaker Scoreboard": "Breaker-Rangliste",
  "Break Archive": "Break-Archiv",
  "Card added to favorites.": "Karte wurde zu den Favoriten hinzugefügt.",
  "Card summary": "Kartenübersicht",
  "Catalog": "Katalog",
  "Catalog Search": "Katalogsuche",
  "Chase board": "Chase-Übersicht",
  "Claim card": "Karte claimen",
  "Claimed": "Geclaimt",
  "Claimed value": "Wert geclaimter Karten",
  "Claim request saved. We will verify the proof before changing the status.":
    "Claim-Anfrage gespeichert. Wir prüfen den Nachweis, bevor sich der Status ändert.",
  "Collector Actions": "Collector-Aktionen",
  "Collector Incentives": "Collector-Belohnungen",
  "Collector Points": "Collector-Punkte",
  "Complete": "Komplett",
  "Country": "Land",
  "Create account": "Account erstellen",
  "Create an account for claims, pulls, favorites, and bids.":
    "Erstelle einen Account für Claims, Pulls, Favoriten und Gebote.",
  "Create an account or log in to view your watchlist.":
    "Erstelle einen Account oder logge dich ein, um deine Watchlist zu sehen.",
  "Create an account to submit pulls or claim this card.":
    "Erstelle einen Account, um Pulls einzureichen oder diese Karte zu claimen.",
  "Create or update a card record in Neon.":
    "Erstelle oder aktualisiere einen Karteneintrag in Neon.",
  "Current standings": "Aktueller Stand",
  "Database connected": "Datenbank verbunden",
  "Database connection is not available.": "Datenbankverbindung ist nicht verfügbar.",
  "Detector App": "Erkennungs-App",
  "Estimated value": "Geschätzter Wert",
  "Favorites and bids are saved to your account.":
    "Favoriten und Gebote werden in deinem Account gespeichert.",
  "Featured set": "Vorgestelltes Set",
  "Find your next chase": "Finde deinen nächsten Chase",
  "Follow": "Folgen",
  "Found in a store? Make it visible.": "Im Shop gefunden? Mach die Karte sichtbar.",
  "Fresh verified hits": "Neue bestätigte Hits",
  "Freshly pulled by Erick Schmerick23, with claim and bid signals.":
    "Frisch gezogen von Erick Schmerick23, mit Claim- und Gebotssignalen.",
  "Global rank": "Globale Platzierung",
  "Home": "Startseite",
  "Just dropped": "Neu erschienen",
  "Live chase tracker": "Live-Chase-Tracker",
  "Live soon on Whatnot": "Demnächst live auf Whatnot",
  "List Available Card": "Verfügbare Karte anbieten",
  "List available card": "Verfügbare Karte anbieten",
  "Login required": "Login erforderlich",
  "Login to update the database": "Einloggen, um die Datenbank zu aktualisieren",
  "Login / Create account": "Login / Account erstellen",
  "Logout": "Abmelden",
  "Market signal": "Marktsignal",
  "Marketplace signal": "Marketplace-Signal",
  "New this week": "Neu diese Woche",
  "Next break": "Nächster Break",
  "No entries yet.": "Noch keine Einträge.",
  "No points yet": "Noch keine Punkte",
  "No sets found": "Keine Sets gefunden",
  "No top pull yet": "Noch kein Top-Pull",
  "No verified pull yet": "Noch kein bestätigter Pull",
  "Not claimed yet": "Noch nicht geclaimt",
  "Not synced yet": "Noch nicht synchronisiert",
  "Numbered Cards": "Nummerierte Karten",
  "Open": "Offen",
  "Open chase cards": "Offene Chase-Karten",
  "Open checklist": "Checkliste öffnen",
  "Open ranking": "Rangliste öffnen",
  "Open Set": "Set öffnen",
  "Open set": "Set öffnen",
  "Open shop": "Shop öffnen",
  "Owner name": "Name des Besitzers",
  "Owned by": "Besitzer",
  "Password": "Passwort",
  "Past Breaks": "Vergangene Breaks",
  "Place bid": "Gebot abgeben",
  "Platform": "Plattform",
  "Previous break": "Vorheriger Break",
  "Player ranking": "Spieler-Rangliste",
  "Pull Leaderboard": "Pull-Rangliste",
  "Pull of the Week": "Pull der Woche",
  "Pull Progress": "Pull-Fortschritt",
  "Pull submitted. We will verify the proof before updating the counter.":
    "Pull eingereicht. Wir prüfen den Nachweis, bevor der Zähler aktualisiert wird.",
  "Pulled": "Gezogen",
  "Race ranking": "Race-Rangliste",
  "Recently Pulled": "Kürzlich gezogen",
  "Registration failed. Use a new email address and at least 8 characters.":
    "Registrierung fehlgeschlagen. Nutze eine neue E-Mail-Adresse und mindestens 8 Zeichen.",
  "Report pull": "Pull melden",
  "Request claim": "Claim anfragen",
  "Save Card": "Karte speichern",
  "Save favorite": "Favorit speichern",
  "Save Listing": "Angebot speichern",
  "Save Pull": "Pull speichern",
  "Schedule": "Zeitplan",
  "Search checklist": "Checkliste durchsuchen",
  "Search set, player, serial number...": "Set, Spieler oder Seriennummer suchen...",
  "Search set or player": "Set oder Spieler suchen",
  "Search sports, sets, players": "Sportarten, Sets und Spieler suchen",
  "See at a glance which versions are open, pulled, claimed, or complete.":
    "Sieh auf einen Blick, welche Versionen offen, gezogen, geclaimt oder komplett sind.",
  "Send a private offer to the owner.": "Sende dem Besitzer ein privates Angebot.",
  "Set Tracker live": "Set-Tracker live",
  "See which rare trading cards are still open, who pulled the biggest hits, and where claimed cards become available for sale.":
    "Sieh, welche seltenen Trading Cards noch offen sind, wer die größten Hits gezogen hat und wo geclaimte Karten zum Verkauf stehen.",
  "Shop": "Shop",
  "Since": "Seit",
  "Sport": "Sportart",
  "Sports": "Sportarten",
  "Still open": "Noch offen",
  "Stores can upload a card, prove availability, and connect with collectors already watching that exact chase card.":
    "Shops können eine Karte hochladen, die Verfügbarkeit nachweisen und Sammler erreichen, die genau diese Chase-Karte beobachten.",
  "Submit bid": "Gebot senden",
  "Submit proof, watch cards, and place bids":
    "Nachweis senden, Karten beobachten und Gebote abgeben",
  "Submit pull": "Pull einreichen",
  "Submit a pull with proof for verification.":
    "Reiche einen Pull mit Nachweis zur Prüfung ein.",
  "The world's top breakers": "Die besten Breaker der Welt",
  "This Month": "Dieser Monat",
  "This Week": "Diese Woche",
  "Time": "Uhrzeit",
  "Top Breakers": "Top-Breaker",
  "Total Pull Value": "Gesamter Pull-Wert",
  "Track Card": "Karte tracken",
  "Tracked": "Erfasst",
  "Tracked Sets": "Erfasste Sets",
  "Upcoming Breaks": "Kommende Breaks",
  "Update Whats Pulled from the frontend": "Whats Pulled über das Frontend aktualisieren",
  "Using demo data": "Demo-Daten werden verwendet",
  "Value": "Wert",
  "Variants": "Varianten",
  "Variants grouped by card": "Varianten nach Karte gruppiert",
  "Verified Pulls": "Bestätigte Pulls",
  "Verified pulls": "Bestätigte Pulls",
  "View card": "Karte ansehen",
  "View leaderboard": "Rangliste ansehen",
  "View pulls": "Pulls ansehen",
  "View ranking": "Rangliste ansehen",
  "Watchlist": "Watchlist",
  "Your name or store": "Dein Name oder Shop",
};

const dynamicGerman: Array<[RegExp, string | ((...matches: string[]) => string)]> = [
  [/^(\d+) sets · (\d+) tracked cards$/, "$1 Sets · $2 erfasste Karten"],
  [/^(\d+) base cards · (\d+) tracked variants in this set\.$/, "$1 Base-Karten · $2 erfasste Varianten in diesem Set."],
  [/^(\d+)\/(\d+) variants complete$/, "$1/$2 Varianten komplett"],
  [/^(\d+) of (\d+) variants$/, "$1 von $2 Varianten"],
  [/^(\d+) verified pulls?$/, "$1 bestätigte Pulls"],
  [/^(\d+) verified hits?$/, "$1 bestätigte Hits"],
  [/^(\d+) tracked sets?$/, "$1 erfasste Sets"],
  [/^(\d+) pulls?$/, "$1 Pulls"],
  [/^View (\d+) pulls$/, "$1 Pulls ansehen"],
  [/^(\d+) open$/, "$1 offen"],
  [/^(\d+) tracked$/, "$1 erfasst"],
  [/^(\d+) sets?$/, "$1 Sets"],
  [/^Today, (.+)$/, "Heute, $1"],
  [/^Tomorrow, (.+)$/, "Morgen, $1"],
  [/^Wed, (.+)$/, "Mi., $1"],
  [/^Fri, (.+)$/, "Fr., $1"],
  [/^Follow (.+)$/, "$1 folgen"],
  [/^View (.+) pulls$/, "$1-Pulls ansehen"],
  [/^Owned by · (.+)$/, "Besitzer · $1"],
  [/^Since (.+)$/, "Seit $1"],
  [/^(\d+) bids(?: on this copy)? · (\d+) favorites total$/, "$1 Gebote · $2 Favoriten gesamt"],
];

const textState = new WeakMap<Text, { source: string; applied: string }>();
const attributeState = new WeakMap<Element, Map<string, { source: string; applied: string }>>();

function preserveWhitespace(source: string, translated: string) {
  const start = source.match(/^\s*/)?.[0] ?? "";
  const end = source.match(/\s*$/)?.[0] ?? "";
  return `${start}${translated}${end}`;
}

function translateValue(source: string, language: Language) {
  if (language === "en") return source;

  const trimmed = source.trim();
  if (!trimmed) return source;

  const exact = german[trimmed];
  if (exact) return preserveWhitespace(source, exact);

  for (const [pattern, replacement] of dynamicGerman) {
    if (pattern.test(trimmed)) {
      return preserveWhitespace(source, trimmed.replace(pattern, replacement as string));
    }
  }

  return source;
}

function shouldSkip(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("[data-no-translate], script, style, code, pre"));
}

function translateTextNode(node: Text, language: Language) {
  if (shouldSkip(node)) return;

  const current = node.data;
  const state = textState.get(node) ?? { source: current, applied: current };

  if (current !== state.applied) state.source = current;

  const next = translateValue(state.source, language);
  state.applied = next;
  textState.set(node, state);

  if (current !== next) node.data = next;
}

function translateAttributes(element: Element, language: Language) {
  if (shouldSkip(element)) return;

  const states = attributeState.get(element) ?? new Map();

  for (const attribute of ["aria-label", "placeholder", "title"]) {
    const current = element.getAttribute(attribute);
    if (!current) continue;

    const state = states.get(attribute) ?? { source: current, applied: current };
    if (current !== state.applied) state.source = current;

    const next = translateValue(state.source, language);
    state.applied = next;
    states.set(attribute, state);

    if (current !== next) element.setAttribute(attribute, next);
  }

  attributeState.set(element, states);
}

function translateTree(root: Node, language: Language) {
  if (root instanceof Text) {
    translateTextNode(root, language);
    return;
  }

  if (!(root instanceof Element) && root !== document.body) return;
  if (root instanceof Element) translateAttributes(root, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  while (current) {
    if (current instanceof Text) translateTextNode(current, language);
    if (current instanceof Element) translateAttributes(current, language);
    current = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "de" || saved === "en") setLanguageState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    translateTree(document.body, language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => translateTree(node, language));
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        window.localStorage.setItem(STORAGE_KEY, nextLanguage);
        document.cookie = `wp-language=${nextLanguage}; path=/; max-age=31536000; samesite=lax`;
        setLanguageState(nextLanguage);
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function LanguageSelector({ mobile = false }: { mobile?: boolean }) {
  const context = useContext(LanguageContext);

  if (!context) return null;

  return (
    <label
      className={`language-selector${mobile ? " mobile-language-selector" : ""}`}
      data-no-translate
    >
      <span aria-hidden="true">{context.language.toUpperCase()}</span>
      <select
        aria-label="Language"
        onChange={(event) => context.setLanguage(event.target.value as Language)}
        value={context.language}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </label>
  );
}
