# WHATS PULLED: Supabase + Cloudflare R2

## Stand

Die kostenlose Supabase-Organisation **WHATS PULLED** (`jdjwpnmxdwawzffzfmoh`)
und das Free-Projekt **whats-pulled** (`qdgxpyolsdopkqcxykhc`, Frankfurt)
sind eingerichtet. Die Data API ist nachweislich deaktiviert.
R2 ist aktiviert: `whats-pulled-images` und `whats-pulled-private`, beide Standard
in Westeuropa. Der Objektzugang ist auf diese beiden Buckets beschränkt.

Die Anwendung ist auf Standard-PostgreSQL und R2 vorbereitet. Ein produktiver
Umzug ist erst nach Kontoeinrichtung, Backup, Testimport und Funktionstest fertig.
Die vorhandenen Neon-Daten und Vercel-Blob-Dateien werden von diesen Werkzeugen
niemals gelöscht. Die Spaltennamen `*_data_url` bleiben vorerst bestehen; neue
Werte sind Dateiverweise statt Base64-Inhalte.

Die schreibgeschützte Live-Abfrage am 11.09.2026 ergab **48.963.584 Bytes
(PostgreSQL-Anzeige: 47 MB)** Gesamtgröße. Davon entfallen rund 21 MB auf
`detector_training_samples`, 12 MB auf `tennis_player_profiles` und 4,8 MB auf
`cards`. Die Tabelle `direct_upload_verifications` fehlt im aktuellen Live-Bestand;
sie muss vor dem Funktionstest mit der vorhandenen Migration 0005 angelegt werden.
Die Datenbankgröße liegt damit aktuell deutlich unter dem Supabase-Free-Limit;
dies sagt noch nichts über künftiges Wachstum oder Transferverbrauch aus.

Die zusätzliche Live-Prüfung ergab 6.624 Karten (4 eingebettete Bilder,
504.576 Bytes), 38 Trainingsdatensätze (38 eingebettete Bilder,
9.269.458 Bytes) und 8 Detektorbeobachtungen (keine eingebetteten Bilder im
Hauptbildfeld). Diese Zählung erfasst die drei geprüften Hauptbildfelder;
das CLI-Audit prüft zusätzlich Text-/JSON-Felder für die eigentliche Migration.

## Lokale Prüfung dieser Vorbereitung

- Alle 42 Tests erfolgreich, darunter sechs Speicher-/Migrationstests und ein PostgreSQL-Test für
  wiederholbare Tabellenvorbereitung ohne Verlust bestehender Nachweise.
- TypeScript-Prüfung und Produktionsbuild erfolgreich. Die unvollständige
  OpenCV-Typdefinition für `RotatedRect.points` wurde ohne Änderung des Laufzeitverhaltens ergänzt.
- Uploader lokal im Browser geprüft; HTTP 200. Private Nachweisroute ohne
  Admin-Sitzung: HTTP 401 mit `private, no-store`. Ungültiger Upload: HTTP 400.
- Originalbackup: `backups/neon-original-2026-09-11.dump`, mit geschützten Dateirechten.
  Vollständig auf einem lokalen PostgreSQL-18-Testserver wiederhergestellt.
  **18 Tabellen und 7.039 Datensätze** stimmten beim Vergleich inhaltlich mit Neon überein.
  Der Vergleich normalisiert Zeitzonen; der Restore bewahrt das vorbestehende Schema `public`.
- Anwendung gegen die lokale Kopie geprüft: Startseite, Set, Kartendetails und
  Detektorkatalog HTTP 200; ein tatsächlich vorhandenes eingebettetes Kartenbild
  HTTP 200/WebP; Adminbereich mit gültiger Sitzung HTTP 200, privater Nachweis ohne
  Sitzung HTTP 401. Die fehlende Direktupload-Tabelle wurde nur in der Testkopie angelegt.
- Echter R2-Upload und Download in beiden Buckets erfolgreich; Bytevergleich identisch.
  Private Dateien sind ohne signierten Link nicht abrufbar.
- Medienmigration an der lokalen Kopie erfolgreich: 103 Medienverweise in 100 Feldern
  ersetzt; anschließendes Audit: 0 alte Medienverweise, 0 unbekannte Blob-Hosts.
- Originalbackup nach Supabase importiert: 18 Tabellen / 7.039 Datensätze.
  App gegen Supabase Transaction Pooler geprüft: Startseite und Detektorkatalog HTTP 200,
  privater Nachweis ohne Sitzung HTTP 401. TLS-Zertifikat und Hostname werden geprüft.
- Nach bestätigter Pause der parallelen Arbeiten frisches Backup erstellt:
  `backups/neon-final-2026-09-11.dump`. Die vorherige Supabase-Testkopie wurde
  separat als `backups/supabase-staging-before-final.dump` gesichert und atomar ersetzt.
- Finaler Vergleich vor Medienumstellung: **20 Tabellen / 7.043 Datensätze vollständig identisch**.
  Danach in Supabase die leere Direktupload-Tabelle ergänzt und 103 Medienverweise
  in 100 Feldern auf R2 umgestellt. Ergebnis: **21 Tabellen / 7.043 Datensätze**,
  keine alten eingebetteten Medien-/Blob-Verweise. Physische Zielgröße rund 28 MiB.
- Alle 62 öffentlichen R2-Dateien (5.539.536 Bytes, einschließlich eines synthetischen
  Testbilds) über die HTTPS-Bilddomain geladen: SHA-256-Prüfung und CORS erfolgreich.
  Privater Routen-Endtest: ohne Sitzung 401, mit Admin-Sitzung 307, signierter Download
  bytegleich; synthetischen Datenbank-Testeintrag danach entfernt.
- Abschließendes Zielbackup: `backups/supabase-r2-ready-2026-09-11.dump`.
  Neon und die ursprünglichen Blob-Dateien wurden nicht verändert oder gelöscht.
- **Produktive Umschaltung blockiert:** Vercel-Team wegen Fair-Use-Limit gesperrt.
  Website antwortet 402 / DEPLOYMENT_DISABLED; selbst das Speichern von Umgebungsvariablen
  wird durch die API abgelehnt. Dashboard: Fluid Active CPU 22h 19m / 4h,
  angezeigter Zeitraum Aug 12, 19:00 – Sep 11. Kein kostenpflichtiges Upgrade ausgelöst.
  Es wurden **keine** neuen Vercel-Variablen gespeichert und kein Deployment gestartet.
- Fertige, geschützte Zielkonfiguration: `backups/production-target.env`.
  `.env.local` und Vercel zeigen weiterhin auf Neon. Nach Entsperrung Zielvariablen
  für Production eintragen, bestehende AUTH_SECRET/ADMIN_ACCESS_CODE/OpenAI-Konfiguration
  erhalten, bereitstellen und Live-Flows prüfen. Preview darf keine produktive Datenbank
  erhalten. Bei zwischenzeitlichen Neon-Schreibzugriffen erneut aktuellen Gesamtstand
  übernehmen; die jetzige Zielkopie ist der dokumentierte eingefrorene Stand.

## DNS-Stand am 11.09.2026

IONOS-Zone vor Änderung in `backups/ionos-dns-before.txt` gesichert. Alle zehn
Records (A, sechs CNAME, zwei MX, SPF-TXT) zu Cloudflare übernommen; die beiden
DKIM-CNAMEs mussten ergänzt werden. Antworten der bisherigen IONOS-Nameserver
und `ram.ns.cloudflare.com` stimmen für alle Record-Sätze überein. DNSSEC-DS war
nicht gesetzt. Bestehende Records bleiben DNS-only.

IONOS hat die Änderung auf `ram.ns.cloudflare.com` und `sara.ns.cloudflare.com`
bestätigt. Cloudflare ist aktiv, die Registrierung bleibt bei IONOS.
`images.whatspulled.com` ist mit dem öffentlichen R2-Bucket verbunden; HTTPS und
Prüfsummenabgleich funktionieren. Öffentliche GET-/HEAD-Abrufe erlauben CORS,
Schreibzugriffe bleiben auf den Server beschränkt.

Testadresse: `https://pub-02382665cf6c409d9216bda1c915cd53.r2.dev`. Nur für Tests,
kein Produktions-Cutover auf dieser Adresse. Der private Bucket hat keine
öffentliche Adresse.

## Zielaufbau

- Vercel: Next.js-Website und Serverrouten.
- Supabase PostgreSQL: Karten, Sets, Nutzer, Pulls, Metadaten und Dateiverweise.
- R2 Standard, öffentlicher Bucket: komprimierte Karten-/Detektorbilder und Vorschaubilder.
- R2 Standard, separater privater Bucket: direkte Verifikationsbilder und Videos.
  Nur eine gültige Admin-Sitzung erhält einen fünf Minuten gültigen Downloadlink.
  Die Dateien werden direkt von R2 geladen; Videos unterstützen so auch Range Requests.

Die Hash-Dateinamen verhindern Duplikate bei wiederholten Uploads. Bilder werden
maximal 1600 × 1600 Pixel groß und als WebP gespeichert. Originale von
Verifikationsvideos bleiben unverändert. Detektor-Vorschaubilder sind maximal
280 × 360 Pixel groß. Bestehende optimierte Blob-Dateien werden unverändert kopiert.

## Konten und Konfiguration

1. Supabase-Projekt im Free-Tarif in einer passenden EU-Region erstellen.
   In den API-Einstellungen die **Data API deaktivieren**, bevor Anwendungsdaten
   importiert werden: Die Anwendung nutzt ausschließlich die serverseitige
   PostgreSQL-Verbindung und ihre bestehende Authentifizierung. Die importierten
   Tabellen enthalten unter anderem Passwort-Hashes; sie dürfen nicht über
   automatisch angebotene öffentliche Tabellen-APIs erreichbar sein.
2. Cloudflare R2 aktivieren und zwei getrennte Buckets anlegen:
   `whats-pulled-images` und `whats-pulled-private`. Speicherklasse Standard.
   R2 kann zur Aktivierung Zahlungsdaten verlangen. Keinen kostenpflichtigen
   Zusatzdienst oder Tarif ohne entsprechende Entscheidung aktivieren.
3. Nur den Bilder-Bucket mit einer eigenen Mediendomain verbinden, beispielsweise
   `images.whatspulled.com`, falls die Domain in Cloudflare verwaltet wird.
   Die `r2.dev`-Adresse ist für Tests, nicht den produktiven Betrieb vorgesehen.
   Beim Evidence-Bucket bleiben öffentliche Domain und `r2.dev` ausgeschaltet.
4. Einen auf diese beiden Buckets beschränkten R2-Zugang für Objekt-Lese- und
   Schreibzugriffe einrichten. Keine Account-Administrationsrechte erforderlich.
5. Die Variablen aus `.env.example` in `.env.local` bzw. Vercel hinterlegen:

| Variable | Verwendung |
| --- | --- |
| `DATABASE_URL` | Aktuelle Laufzeitdatenbank; später Supabase Transaction Pooler, Port 6543 |
| `DATABASE_DIRECT_URL` | Aktuelle Datenbank für Migration/Backup; direkter Zugang oder Session Pooler, Port 5432 |
| `DATABASE_SSL_CA` | Offizielles Supabase-CA-Zertifikat als PEM für den Server; TLS-Zertifikats-/Hostprüfung bleibt aktiv |
| `TARGET_DATABASE_DIRECT_URL` | Nur lokal: direkte/session-gepoolte Verbindung zur neuen Supabase-Datenbank |
| `AUTH_SECRET` | Stabiler Sitzungsschlüssel, unabhängig vom Datenbankanbieter |
| `R2_ENDPOINT` | S3-Endpunkt aus dem Cloudflare-Dashboard; EU-Jurisdiktionsendpunkt bei entsprechendem Bucket |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Server-Zugang zu den beiden R2-Buckets |
| `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET` | Zwei unterschiedliche Bucketnamen |
| `R2_PUBLIC_URL` | HTTPS-Adresse des öffentlichen Bilder-Buckets |
| `MEDIA_STORAGE_PROVIDER` | `r2`; temporär `vercel-blob` nur für Detektor-Kompatibilität |
| `LEGACY_BLOB_HOSTS` | Exakte alte öffentliche Blob-Hostnamen, komma-getrennt; Ausgabe von `storage:audit` |

Keine Zugangsdaten mit `NEXT_PUBLIC_` versehen oder ins Repository einchecken.
Produktions- und Preview-Datenbanken getrennt halten. Beim Umstellen auf Supabase
auch `DATABASE_DIRECT_URL` aktualisieren; sie darf nicht versehentlich auf Neon bleiben.
Falls bisher kein eigener `AUTH_SECRET` gesetzt war, führt ein neuer stabiler
Schlüssel einmalig zur erneuten Anmeldung bestehender Nutzer.

## Ablauf ohne Datenverlust

Node.js und npm sowie PostgreSQL-Clientprogramme `pg_dump`/`pg_restore` installieren.
Die Clientversion muss zur Version des Quellservers passen. Die Programme übergeben
Datenbankpasswörter nur per Prozessumgebung, nicht als Kommandozeilenargumente.

### 1. Bestand prüfen und Originalbackup erstellen

`DATABASE_URL`/`DATABASE_DIRECT_URL` zeigen noch auf Neon.

```sh
npm run storage:audit
mkdir -p backups
npm run db:backup -- backups/neon-original.dump
```

Das Audit ist schreibgeschützt und zeigt Tabellenumfänge sowie alte Medienverweise.
Es gibt keine Nutzerinhalte oder Zugangsdaten aus. Die Dump-Datei wird mit
Dateirechten 0600 neu erstellt; vorhandene Dateien werden nicht überschrieben.
Sichere zusätzlich eine Kopie außerhalb dieses Rechners auf einem geschützten Medium.
Ein Archivstrukturtest ersetzt keinen Test-Restore.

### 2. R2-Anbindung vor dem Datenbankwechsel testen

Die im Live-Bestand fehlende Direktupload-Tabelle nach dem Originalbackup ergänzen:

```sh
npm run storage:prepare
npm run storage:prepare -- --apply
```

Dies führt ausschließlich die vorhandene, wiederholbare Migration 0005 aus und
löscht keine Daten. Zuerst in der isolierten Testdatenbank prüfen.

Diese Codeversion mit R2-Konfiguration zunächst gegen eine isolierte Testdatenbank
prüfen. Dann mit der noch bestehenden Neon-Datenbank bereitstellen. Der neue
PostgreSQL-Treiber unterstützt beide Anbieter. Direktuploads brauchen **beide**
R2-Buckets; der Detektor-Fallback `vercel-blob` gilt nicht für private Direktuploads.

Pflichttests: Kartenansicht, Nutzer- und Admin-Login, Claim, Listing, Detektorbild
mit Vorschau, Direktupload mit Video, Nachweisabruf im Adminbereich, verweigerter
Nachweisabruf ohne Anmeldung, Pull-Freigabe und Rücknahme.

### 3. Bestehende Medien auslagern

Erst nach erfolgreichem R2-Test und Bereitstellung des neuen Readers starten.
Alle Schreibzugriffe pausieren (Website, Detektor, Import-/Ranking-Skripte).
Das Wartungsfenster muss organisatorisch sichergestellt sein: Der CLI-Schalter
aktiviert **keinen** Wartungsmodus auf der Website.

```sh
npm run storage:migrate
npm run storage:migrate -- --apply --maintenance-window --backup=backups/neon-original.dump
npm run storage:verify
```

Ohne `--apply` wird nichts verändert. Jede Datei wird zuerst in R2 gespeichert
und mit Länge/Hash-Metadaten geprüft. Erst danach wird der zugehörige Datenbankwert
ersetzt, sofern er sich zwischenzeitlich nicht geändert hat. Ein Abbruch lässt
sich durch erneutes Ausführen fortsetzen. Keine Quelldatei wird gelöscht.
Auch eingebettete Medien in JSON-Payloads werden erfasst.

Das Skript lädt nur explizit erlaubte öffentliche Vercel-Blob-Hosts und folgt
keinen Weiterleitungen. Fremde Katalog-URLs bleiben unverändert. Datenbankbilder
über 4 MiB, Videos über 3 MiB, Blob-Bilder über 20 MiB und nicht unterstützte
Formate brechen den Lauf ab und müssen gesondert geprüft werden.
Nicht-UUID-Tabellen werden im Audit gezählt, aber nicht automatisch umgeschrieben.

### 4. Bereinigte Datenbank übertragen

Nach der Auslagerung kann PostgreSQL den freigewordenen Platz intern wiederverwenden;
die physische Dateigröße schrumpft dadurch nicht zwingend sofort. Der frische
Import beseitigt diese Altlast. Den tatsächlichen Platzbedarf im Ziel messen.

```sh
npm run db:backup -- backups/neon-external-media.dump
npm run db:restore -- backups/neon-external-media.dump --apply --maintenance-window
npm run db:compare -- --maintenance-window
```

`TARGET_DATABASE_DIRECT_URL` muss auf die frische Supabase-Datenbank zeigen.
Restore verweigert standardmäßig ein Ziel mit vorhandenen Tabellen in `public` oder `drizzle`.
Nur eine ausdrücklich ungenutzte Staging-Kopie kann mit `--replace-staging` und
`--target-backup=backups/SEPARATES-ZIELBACKUP.dump` atomar neu aufgebaut werden.
Dieser Modus ersetzt vom Archiv erfasste Objekte; vorab Zielbackup erstellen und
prüfen. Nicht gegen eine bereits verwendete Produktionsdatenbank einsetzen.
Er läuft in einer Transaktion und entfernt keine bestehenden Zieltabellen.
Der vollständige Export nimmt Anwendungsfunktionen, Trigger, Indizes und die
Drizzle-Historie mit. **Nicht** zuerst `db:push`/Seed gegen das neue Ziel ausführen:
Die historische SQL-Migrationsfolge allein bildet den Live-Bestand nicht vollständig ab.

Der Vergleich prüft Zeilenzahlen und Inhaltsprüfsummen aller `public`-Tabellen,
einschließlich Metadaten und Medienverweisen. Er ersetzt nicht die oben genannten
Funktionstests und prüft keine Bildpixel beim öffentlichen Domainabruf.
Erst weitergehen, wenn Vergleich, tatsächliche Zielgröße und Funktionstests stimmen.

### 5. Umschalten und später aufräumen

`DATABASE_URL` und `DATABASE_DIRECT_URL` in Vercel auf Supabase ändern, neu
bereitstellen, dieselben Pflichttests auf der Live-Website wiederholen und dann
Schreibzugriffe freigeben. Neon und Blob zunächst behalten. Bei Problemen vor
Wiederaufnahme der Schreibzugriffe kann die Verbindung zurückgestellt werden.
Nach neuen Schreibzugriffen auf Supabase ist ein Abgleich nötig; einfaches
Zurückschalten würde neue Datensätze verlieren.

Erst nach stabiler Nutzung, Backup-Prüfung und bestätigtem `storage:verify`
den alten Neon-/Blob-Speicher gesondert entfernen. Die Tools erledigen das nicht.

## Laufende Pflege und Kosten

- Im Supabase-Free-Tarif sind laut Preisstand vom 11.09.2026 500 MB Datenbankplatz
  enthalten, automatische Backups nicht. Regelmäßig `db:backup` ausführen und
  Wiederherstellung testen. Es ist noch kein Backup-Zeitplan eingerichtet.
- R2 Standard enthält 10 GB Speicher, 1 Mio. Schreib-/Listenoperationen und
  10 Mio. Leseoperationen pro Monat; Mehrverbrauch wird abgerechnet.
  Free-Kontingente sind kein hartes Ausgabenlimit. Speicher und Abrufzahlen beobachten.
- Keine automatischen Löschregeln für Nachweise aktivieren, solange
  Aufbewahrungsdauer und Verwendungszweck nicht festgelegt sind. Verwaiste Uploads
  können nach fehlgeschlagenen Datenbankschreibvorgängen verbleiben; sie dürfen
  erst nach Abgleich aller Datenbankverweise entfernt werden.
- Häufige öffentliche Bildabrufe über die R2-Mediendomain ausliefern. Ein Proxy
  oder zusätzliche Bildoptimierung über Vercel kann eigene Kosten erzeugen.

Quellen: [Supabase Drizzle](https://supabase.com/docs/guides/database/drizzle),
[Supabase Verbindungen](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase Preise](https://supabase.com/pricing),
[R2 S3 SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/),
[R2 Preise](https://developers.cloudflare.com/r2/pricing/).
