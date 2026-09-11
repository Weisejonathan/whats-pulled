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
  "Select the set and year, then start capture or upload a frame.": "Wähle Set und Jahr. Starte dann die Aufnahme oder lade ein Kartenbild hoch.",
  "No login required. Your review queue belongs to this browser; keep its cookies to retain access.": "Keine Anmeldung nötig. Deine Prüfliste ist mit diesem Browser verbunden. Behalte seine Cookies, um weiter darauf zuzugreifen.",
  "Admin access: all review entries are visible.": "Admin-Ansicht: Alle Prüfeinträge sind sichtbar.",
  "Preparing local recognition models. The first download may take a moment; later starts use the browser cache.": "Die Erkennungsmodelle werden vorbereitet. Der erste Download kann etwas dauern; später werden gespeicherte Modelle verwendet.",
  "AI review is running for one frame. Other cards are read locally.": "Ein Bild wird gerade mit KI geprüft. Weitere Karten werden weiterhin lokal gelesen.",
  "Breaker or collector": "Breaker oder Sammler",
  "From OBS Studio": "Aus OBS Studio",
  "Actual recognition image": "Tatsächlich ausgewertetes Kartenbild",
  "Full name unreadable": "Vollständiger Name nicht lesbar",
  "Player unreadable": "Spieler nicht lesbar",
  "Player": "Spieler",
  "Variant": "Variante",
  "Checklist number": "Checklisten-Nummer",
  "Full serial (copy / print run)": "Vollständige Nummerierung (Exemplar / Auflage)",
  "Autograph": "Autogramm",
  "Unknown": "Unbekannt",
  "Yes": "Ja",
  "No": "Nein",
  "Retry upload": "Erneut hochladen",
  "Camera": "Kamera",
  "Default camera": "Standardkamera",
  "Withdraw pull": "Pull zurückziehen",
  "Retry overlay": "OBS-Übertragung wiederholen",

  "Live card detector": "Live-Kartenerkennung",
  "Capture settings": "Aufnahme einrichten",
  "Set and year": "Set und Jahr",
  "Pulled by": "Gezogen von",
  "Source / video URL": "Quelle / Video-URL",
  "Overlay key (optional)": "Overlay-Key (optional)",
  "Select a catalog set": "Set auswählen",
  "Start capture": "Aufnahme starten",
  "Stop capture": "Aufnahme stoppen",
  "Capture now": "Jetzt aufnehmen",
  "Upload frame": "Bild hochladen",
  "Review queue": "Ergebnisse prüfen",
  "Refresh": "Aktualisieren",
  "Export": "Exportieren",
  "Needs review": "Prüfung erforderlich",
  "Approved": "Bestätigt",
  "Rejected / withdrawn": "Abgelehnt / zurückgezogen",
  "All": "Alle",
  "Adjust focus area": "Erkennungsbereich anpassen",
  "Recognition preview": "Erkennungsvorschau",
  "Your live image appears here": "Hier erscheint dein Livebild",
  "Setup, accuracy and saving your results": "Einrichtung, Genauigkeit und Speicherung",
  "1. Prepare": "1. Vorbereiten",
  "2. Capture": "2. Aufnehmen",
  "3. Review": "3. Prüfen",
  "Screen and livestream": "Bildschirm und Livestream",
  "Camera and OBS": "Kamera und OBS",
  "Speed and image quality": "Geschwindigkeit und Bildqualität",
  "Autographs and AI review": "Autogramme und KI-Prüfung",
  "Saving and OBS overlays": "Speicherung und OBS-Overlay",
  "Open OBS Studio": "OBS Studio öffnen",
  "Read the full player name, numbered copy and visible autograph from a card. Check every result before publishing a pull.": "Erkenne den vollständigen Spielernamen, die individuelle Nummerierung und ein sichtbares Autogramm. Prüfe jedes Ergebnis, bevor du einen Pull veröffentlichst.",
  "Select the exact set and year. Wait for the reader to load, then start capture or upload a photo.": "Wähle das passende Set und Jahr. Warte, bis die Erkennung bereit ist, und starte die Aufnahme oder lade ein Foto hoch.",
  "Keep one complete card inside the focus area. Hold it steady with the name and serial visible and avoid reflections.": "Zeige eine vollständige Karte im Erkennungsbereich. Halte sie ruhig, vermeide Spiegelungen und lasse Name und Nummerierung sichtbar.",
  "Compare the proof, correct missing details and select the matching catalog card. Enter “Pulled by” to confirm.": "Vergleiche das Belegbild, korrigiere fehlende Angaben und wähle die passende Katalogkarte. Trage zum Bestätigen ein, wer die Karte gezogen hat.",
  "Open your livestream first. Start capture opens the browser sharing dialog: choose the video tab, window or screen. A source URL alone does not start recognition.": "Öffne zuerst deinen Livestream. „Aufnahme starten“ öffnet die Bildschirmfreigabe: Wähle den Video-Tab, ein Fenster oder den Bildschirm. Eine Quellen-URL allein startet keine Erkennung.",
  "Allow camera access and select your webcam or OBS Virtual Camera. Start the virtual camera in OBS first, then refresh this page if it is missing.": "Erlaube den Kamerazugriff und wähle deine Webcam oder OBS Virtual Camera. Starte die virtuelle Kamera zuerst in OBS und lade diese Seite neu, falls sie nicht erscheint.",
  "Use desktop Chrome for live capture. Screen sharing depends on your browser and device; on mobile, upload a PNG, JPEG or WebP photo instead.": "Nutze für Live-Aufnahmen Chrome am Computer. Bildschirmfreigaben hängen von Browser und Gerät ab. Auf dem Smartphone kannst du ein PNG-, JPEG- oder WebP-Foto hochladen.",
  "The first model download needs an internet connection and can take several seconds. After loading, the target is 1–2 seconds per readable card; device speed, blur and glare can increase this.": "Beim ersten Start werden die Erkennungsmodelle heruntergeladen. Dafür brauchst du Internet und einige Sekunden Geduld. Danach sind 1–2 Sekunden pro lesbarer Karte das Ziel; Gerät, Unschärfe und Reflexionen können die Erkennung verzögern.",
  "A serial such as 37/50 means copy 37 of 50. It is different from the printed checklist number. Hidden or conflicting details remain unknown.": "37/50 bedeutet Exemplar 37 von 50. Das ist nicht die aufgedruckte Checklisten-Nummer. Verdeckte oder widersprüchliche Angaben bleiben unbekannt.",
  "Local autograph detection looks for blue pen-like strokes near a readable certification label. Black ink or unclear cards may need review. This is not an authenticity check.": "Die lokale Autogrammerkennung sucht blaue Unterschriftszüge neben einem lesbaren Zertifizierungshinweis. Schwarze Tinte und unklare Bilder benötigen gegebenenfalls eine Prüfung. Die Echtheit wird damit nicht bestätigt.",
  "Optional AI review sends the captured image to the server and OpenAI and may incur API costs. It can take longer. You can turn it off and correct details yourself.": "Die optionale KI-Prüfung sendet das Kartenbild an den Server und OpenAI und kann API-Kosten verursachen. Sie kann länger dauern. Du kannst sie ausschalten und Angaben selbst korrigieren.",
  "Captures are uploaded to your review queue. Unsynced frames stay in this browser for retry; do not clear browser storage before syncing. Capture pauses at eight waiting frames.": "Aufnahmen werden in deine Prüfliste hochgeladen. Noch nicht übertragene Bilder bleiben zum erneuten Hochladen im Browser. Lösche vorher keine Browserdaten. Bei acht wartenden Bildern pausiert die Aufnahme.",
  "Only confirmed pulls are published. To send them to OBS, copy your session’s overlay key from OBS Studio. A source URL and overlay key are optional.": "Nur bestätigte Pulls werden veröffentlicht. Für die Ausgabe in OBS kopierst du den Overlay-Key deiner Sitzung aus OBS Studio. Quellen-URL und Overlay-Key sind optional.",
  "Required before capture. Match the set printed on your card.": "Vor der Aufnahme erforderlich. Wähle das Set deiner Karte.",
  "Required to confirm a pull; you can fill this in later.": "Zum Bestätigen eines Pulls erforderlich; kann später ausgefüllt werden.",
  "Optional link saved as evidence. Choose the video separately when starting capture.": "Optionaler Link als Nachweis. Das Video wählst du beim Aufnahmestart separat aus.",
  "Optional. Sends confirmed pulls to your OBS session.": "Optional. Überträgt bestätigte Pulls in deine OBS-Sitzung.",
  "Select a set to prepare the reader.": "Wähle ein Set, um die Erkennung vorzubereiten.",
  "Loading reader…": "Erkennung wird geladen…",
  "Reading the current card…": "Die aktuelle Karte wird gelesen…",
  "Live capture active": "Live-Aufnahme läuft",
  "Reader ready — start capture or upload a photo.": "Erkennung bereit – starte die Aufnahme oder lade ein Foto hoch.",
  "Start capture to choose a source, or use Upload frame for a single photo.": "Starte die Aufnahme, um eine Quelle auszuwählen, oder lade ein einzelnes Kartenfoto hoch.",
  "Your captured card and its reading will appear here. Keep the entire card visible, including its bottom edge.": "Hier erscheinen deine aufgenommene Karte und die Erkennung. Zeige die ganze Karte einschließlich des unteren Randes.",
  "Nothing is published until you confirm it in the review queue.": "Erst wenn du das Ergebnis in der Prüfliste bestätigst, wird es veröffentlicht.",
  "Check the captured proof against the catalog image. Use Correct details for missing names, serials or variants. Confirm pull becomes available after selecting a catalog match and entering Pulled by.": "Vergleiche das Belegbild mit dem Katalogbild. Korrigiere fehlende Namen, Nummerierungen oder Varianten über „Angaben korrigieren“. „Pull bestätigen“ wird verfügbar, sobald du eine Katalogkarte ausgewählt und „Gezogen von“ ausgefüllt hast.",
  "Correct details": "Angaben korrigieren",
  "Confirm pull": "Pull bestätigen",
  "AI review": "KI-Prüfung",
  "Use AI suggestion": "KI-Vorschlag verwenden",
  "Save and rematch": "Speichern und erneut zuordnen",
  "Cancel": "Abbrechen",
  "Reject": "Ablehnen",
  "No entries in this view. Captured cards will appear here for review.": "Hier gibt es noch keine Einträge. Aufgenommene Karten erscheinen hier zur Prüfung.",
  "Use AI for uncertain readings (slower; local capture continues)": "Unsichere Ergebnisse mit KI prüfen (langsamer; lokale Erkennung läuft weiter)",
  "Switch to camera": "Zur Kamera wechseln",
  "Switch to screen capture": "Zur Bildschirmaufnahme wechseln",

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
  "Create or update a card record.":
    "Erstelle oder aktualisiere einen Karteneintrag.",
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
