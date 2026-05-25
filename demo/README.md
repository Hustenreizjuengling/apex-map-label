# Map Label Demo (APEX 26.1 / APEXLang)

Eine kleine, selbstständige APEX-Anwendung zum Testen der `apex-map-label`-Library.
Sie zeigt eine Map-Region mit ~13 deutschen Städten (Inline-SQL, keine Tabelle
nötig) und beschriftet jeden Punkt über die Library.

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
│   ├── p00010-map-demo.apx             Die Map-Page (Static ID MAP_DEMO, Layer Cities)
│   └── p09999-login.apx
└── shared-components/
    ├── static-files.apx                deklariert apex_map_label.js
    ├── static-files/apex_map_label.js  Kopie der Library (v2.1.0)
    ├── lists.apx                        Navigations-Eintrag "Map Label Demo"
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
