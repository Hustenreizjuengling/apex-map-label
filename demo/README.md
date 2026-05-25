# Map Label Demo (APEX 26.1 / APEXLang)

Ein selbstständiges APEX-Toolkit zum Erkunden der `apex-map-label`-Library:
13 deutsche Städte (Inline-SQL, keine Tabelle nötig) plus interaktive Seiten für
Formatierung, Fonts, Interaktion/Links und einen Performance-Test.

## Seiten / Toolkit

| Seite | Was sie demonstriert |
|-------|----------------------|
| **10 · Map Label Demo** | Minimalbeispiel – „es funktioniert einfach". |
| **20 · Playground** | Live-Tuning per Page-Items: `textSize`, `textColor`, `haloColor/Width`, `position`, `offsetPx`, `textTransform`, `textJustify`, `letterSpacing`, `maxWidth`, `allowOverlap` → `setOptions()` bei jeder Änderung. |
| **30 · Fonts** | `font`-Option live umschalten (Open Sans, Noto, Roboto … bzw. Auto-Detect). |
| **40 · Interaction & Links** | `onClick`: Zoom zum Punkt, Namen als Notification, oder OpenStreetMap-Link öffnen. |
| **50 · Performance** | 100–50.000 zufällige Punkte generieren (`CONNECT BY`), Label-Count + Build-Zeit messen. Testet den v2.1 Stall-Timeout/Performance-Fix. |

## Inhalt

```
demo/
├── deploy.sql                          SQLcl: validate + import Kommandos
└── apex-app/
├── application.apx                     App "Map Label Demo" (Alias MAPLBL-DEMO)
├── deployments/default.json            App-ID (Workspace kommt aus der Connection)
├── pages/
│   ├── p00000-global-page.apx
│   ├── p00001-home.apx
│   ├── p00010-map-demo.apx             Minimal-Demo (Static ID MAP_DEMO)
│   ├── p00020-playground.apx           Live-Formatierung
│   ├── p00030-fonts.apx                Font-Umschalter
│   ├── p00040-interaction.apx          onClick / Links
│   ├── p00050-performance.apx          Random-Punkte / Last-Test
│   └── p09999-login.apx
└── shared-components/
    ├── static-files.apx                deklariert apex_map_label.js
    ├── static-files/apex_map_label.js  Kopie der Library (v2.1.0)
    ├── lists.apx                        Navigations-Einträge aller Seiten
    └── … (Theme, Auth etc. aus dem Standard-Scaffold)
```

## So wird die Library eingebunden

Aufbau analog zu einer aus APEX exportierten Map-Page:

1. **Library laden** – im `javaScript`-Block der Seite als File-URL:
   ```apexlang
   javaScript {
       fileUrls: #APP_FILES#apex_map_label.js
   }
   ```
2. **Static ID setzen** – die Map-Region bekommt ihre Static ID über
   `advanced { htmlDomId: MAP_DEMO }`; genau dieser Wert ist `regionId` unten.
3. **Daten** – die Region-Source liefert eine `GEOJSON`-Spalte (Punkte) plus
   `NAME`; der Layer `Cities` referenziert die Region-Source
   (`source { location: regionSource }`) und zeigt `NAME` als Tooltip.
4. **Initialisieren** – per Dynamic Action auf dem Map-Event
   `region/map/spatialmapinitialized` (zuverlässiger als Page-Load):
   ```javascript
   window.cityLabels = apexMapLabel({
     regionId:    'MAP_DEMO',   // = advanced.htmlDomId der Region
     layerName:   'Cities',     // = Name des Layers (case-sensitive)
     column:      'NAME',       // Label-Quelle (aus der Tooltip-Spalte NAME)
     position:    'top',
     offsetPx:    14,
     hideTooltip: true,         // nativen Tooltip-Popup verstecken
     debug:       true          // Logs in die Browser-Konsole
   });
   ```

> Die Struktur (Region-Source + `location: regionSource`, `geojsonColumn`,
> `htmlDomId`, Tooltip via `htmlExpression: &NAME.`) ist bewusst 1:1 an einem
> echten APEX-26.1-Export orientiert, damit `apex validate`/`import` sauber
> durchläuft.

## Deployment

1. **App-ID prüfen:** `demo/apex-app/deployments/default.json` enthält
   `app.id` (Default `200`). Der **Workspace** wird aus der SQLcl-Verbindung
   abgeleitet (kein Workspace-Name in der Datei nötig). Die App-ID nur ändern,
   falls in deinem Workspace schon eine App mit dieser ID existiert – ein Import
   auf eine vorhandene ID **überschreibt** diese App.
2. **Verbinden:** In der Oracle SQL Developer VS Code Extension mit dem Schema
   des Ziel-Workspace verbinden und ein SQLcl-Terminal öffnen.
3. **Prüfen & importieren:** `@demo/deploy.sql` ausführen. Das Skript
   führt zuerst `apex validate` aus; nach erfolgreicher Prüfung die
   `apex import`-Zeile entkommentieren (validate + import in **derselben**
   Session).
4. **Öffnen:** App "Map Label Demo" starten → Menüpunkt **Map Label Demo** →
   die Städtenamen erscheinen als Labels über den Punkten.

> `debug: true` ist aktiv – die Browser-Konsole zeigt, wann Map + Layer bereit
> sind und wie viele Labels gesetzt wurden. Für Produktivnutzung entfernen.
