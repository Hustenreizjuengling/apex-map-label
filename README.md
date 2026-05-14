# apex-map-label

> Always-on Beschriftungen für Oracle APEX Map Regions – performant, flexibel, ein-Datei-Library.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![APEX](https://img.shields.io/badge/APEX-21.2%2B-orange.svg)]()

APEX Map Regions zeigen Tooltips beim Hover und Info-Windows beim Klick – aber **keine permanent sichtbaren Labels** an den Markern. Diese Library schließt diese Lücke mit einer einzigen JavaScript-Datei.

![Demo Screenshot](https://via.placeholder.com/800x400?text=Map+with+labels)

## Inhaltsverzeichnis

- [Features](#features)
- [Wie funktioniert das?](#wie-funktioniert-das)
- [Installation](#installation)
- [Quick Start (60 Sekunden)](#quick-start-60-sekunden)
- [Tutorial: Von 0 auf Karte mit Labels](#tutorial-von-0-auf-karte-mit-labels)
- [API-Referenz](#api-referenz)
- [Rezepte](#rezepte)
- [Troubleshooting](#troubleshooting)
- [Performance-Hinweise](#performance-hinweise)
- [Browser- & APEX-Kompatibilität](#browser--apex-kompatibilität)
- [Architektur](#architektur)
- [Mitarbeiten](#mitarbeiten)
- [Lizenz](#lizenz)

---

## Features

- 🚀 **GPU-gerendert** – nutzt einen nativen Symbol-Layer, kein DOM pro Marker
- 🎯 **Skaliert** mühelos auf mehrere Tausend Punkte
- 🔧 **Flexible Label-Quelle** – aus Spalte, Tooltip, InfoWindow oder Custom-Funktion
- 🎨 **Live-Reconfiguration** – Stil zur Laufzeit ändern ohne Reload
- 🛡️ **Robust gegen Timing-Probleme** – wartet automatisch auf Map + Layer
- 🧹 **Sauberes Cleanup** – `destroy()` entfernt Layer, Source, Listener und CSS
- 📦 **Zero Dependencies** – nutzt nur die Mapbox/MapLibre-Instanz die APEX schon lädt
- 🎁 **Kompatibel** mit APEX 21.2 (Mapbox) und 22.1+ (MapLibre)

---

## Wie funktioniert das?

APEX Map Regions speichern Spaltenwerte als JSON-String in den Feature-Properties `tooltip` und `infoWindow`. Eine direkte `text-field`-Expression mit `['get', 'NAME']` greift deshalb ins Leere.

Die Library löst das so:

1. **Wartet**, bis APEX die Map UND den gewünschten Layer im Style registriert hat (Polling).
2. **Liest** die Features per `querySourceFeatures()` aus dem APEX-Layer.
3. **Extrahiert** den Label-Text aus Tooltip-JSON / InfoWindow-JSON / direkter Property.
4. **Erzeugt** eine parallele GeoJSON-Source mit Punkten + Label-Property.
5. **Rendert** über einen nativen Symbol-Layer (GPU, schnell).
6. **Aktualisiert** automatisch bei `idle`/`sourcedata`-Events mit rAF-Debounce.

```
┌──────────────────┐        ┌─────────────────────┐        ┌──────────────────┐
│ APEX Map Region  │ ──→    │  apex_map_label.js  │ ──→    │  Symbol-Layer    │
│ (Mapbox/MapLibre │        │  (parses tooltip,   │        │  (text-field,    │
│  data layer)     │        │   builds GeoJSON)   │        │   GPU rendering) │
└──────────────────┘        └─────────────────────┘        └──────────────────┘
```

---

## Installation

### Option A: APEX Application Static File (empfohlen)

1. Repo klonen oder `src/apex_map_label.js` herunterladen.
2. In APEX: **Shared Components → Static Application Files → Upload File**.
3. Auf der Seite mit der Map: **Page Designer → Page Properties → JavaScript → File URLs**:
   ```
   #APP_FILES#apex_map_label.js
   ```

### Option B: CDN via jsDelivr

Wenn das Repo öffentlich auf GitHub liegt:

```
https://cdn.jsdelivr.net/gh/USER/REPO@main/src/apex_map_label.js
```

URL in den **JavaScript File URLs** der Seite eintragen.

### Option C: Inline auf einer einzelnen Seite

Wenn du die Library nur auf einer Seite brauchst, kannst du den Inhalt direkt in **Page Properties → JavaScript → Function and Global Variable Declaration** einfügen.

---

## Quick Start (60 Sekunden)

**Voraussetzungen:** Du hast eine APEX Map Region mit mindestens einem Layer.

1. **Static ID** auf der Map-Region setzen, z. B. `MY_MAP`.
2. **Library einbinden** (siehe Installation oben).
3. **Spalte als Tooltip-Spalte** im Layer konfigurieren (z. B. `NAME`).
4. **Dynamic Action** auf der Region anlegen:
   - **When → Event:** `Map Initialized [Map]`
   - **When → Selection Type:** `Region` → deine Map-Region
   - **True Action:** `Execute JavaScript Code`
   - **Code:**
     ```javascript
     apexMapLabel({
       regionId:    'MY_MAP',
       layerName:   'Stations',
       column:      'NAME',
       hideTooltip: true     // optional: nativen Tooltip ausblenden
     });
     ```
5. Seite ausführen ✓

---

## Tutorial: Von 0 auf Karte mit Labels

### Voraussetzung: Beispiel-Tabelle

Falls du noch keine Daten hast, lege diese Tabelle an:

```sql
CREATE TABLE stations (
  id      NUMBER PRIMARY KEY,
  name    VARCHAR2(100),
  status  VARCHAR2(20),
  lat     NUMBER(9, 6),
  lng     NUMBER(9, 6)
);

INSERT INTO stations VALUES (1, 'Köln Hbf',      'ACTIVE',  50.9430, 6.9589);
INSERT INTO stations VALUES (2, 'Düsseldorf Hbf','ACTIVE',  51.2199, 6.7944);
INSERT INTO stations VALUES (3, 'Bonn Hbf',      'ACTIVE',  50.7320, 7.0966);
INSERT INTO stations VALUES (4, 'Aachen Hbf',    'INACTIVE',50.7682, 6.0915);
COMMIT;
```

### Schritt 1: Map Region anlegen

1. Neue Seite erstellen (oder vorhandene öffnen).
2. **Create Region → Map**.
3. **Region**-Attribute:
   - **Title:** `Stationen`
   - **Static ID:** `MY_MAP`
   - **Initial Position:** Latitude `51.0`, Longitude `7.0`, Zoom `9`

### Schritt 2: Layer konfigurieren

In der Map-Region anklicken: **Layers → Layer 1**.

- **Identification → Name:** `Stations` ← wichtig!
- **Source → Type:** `SQL Query`
- **Source → SQL Query:**
  ```sql
  SELECT id, name, status, lat, lng FROM stations
  ```
- **Column Mapping:**
  - **Geometry Column Data Type:** `Longitude / Latitude`
  - **Longitude Column:** `LNG`
  - **Latitude Column:** `LAT`
  - **Primary Key:** `ID`
- **Tooltip → Column:** `NAME` ← essenziell! Sonst kommt der Wert nicht ans Frontend.

Seite speichern und ausführen – du solltest 4 Pins ohne Beschriftung sehen.

### Schritt 3: Library einbinden

Lade `src/apex_map_label.js` herunter und uploade sie unter **Shared Components → Static Application Files**.

Auf der Seite: **Page Properties → JavaScript → File URLs**:
```
#APP_FILES#apex_map_label.js
```

Speichern.

### Schritt 4: Labels per Dynamic Action aktivieren

Rechtsklick auf die Map-Region → **Create Dynamic Action**.

| Feld | Wert |
|---|---|
| **Name** | `Init Map Labels` |
| **When → Event** | `Map Initialized [Map]` |
| **When → Selection Type** | `Region` |
| **When → Region** | `Stationen` |

True Action hinzufügen: **Execute JavaScript Code**.

**Code:**
```javascript
window.stationLabels = apexMapLabel({
  regionId:    'MY_MAP',
  layerName:   'Stations',
  column:      'NAME',
  position:    'top',        // Label über dem Icon
  offsetPx:    20,           // 20 px Abstand
  textSize:    13,
  textColor:   '#0f172a',
  haloColor:   '#ffffff',
  haloWidth:   2.5,
  hideTooltip: true,         // nativen APEX-Tooltip ausblenden
  debug:       true          // Console-Logs aktivieren
});
```

Seite speichern und ausführen. In der Browser-Console solltest du sehen:

```
[apexMapLabel] map + layer ready: Stations → 1234567890123
[apexMapLabel] using font: ["Roboto Regular"]
[apexMapLabel] updated 4 labels
```

Und auf der Karte: 4 Pins, jeweils mit dem Stationsnamen darüber. 🎉

### Schritt 5: Anpassen und experimentieren

Probier in der Browser-Console:

```javascript
// Style ändern
stationLabels.setOptions({ textSize: 18, textColor: '#dc2626' });

// Nur bestimmte Stationen labeln
stationLabels.setOptions({
  filter: (feat) => {
    const cols = JSON.parse(feat.properties.tooltip).columns;
    return cols.STATUS === 'ACTIVE';
  }
});

// Label entfernen
stationLabels.destroy();
```

---

## API-Referenz

### `apexMapLabel(options)`

Hauptfunktion. Gibt ein Controller-Objekt zurück.

#### Options

##### Pflicht

| Option | Typ | Beschreibung |
|---|---|---|
| `regionId` | `string` | Static ID der APEX Map Region |
| `layerName` | `string` | „Name"-Attribut des Layers (case-sensitive) |

##### Label-Quelle (genau eine)

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `column` | `string` | `null` | Spaltenname (z. B. `'NAME'`). Sucht in Tooltip-/InfoWindow-Columns. |
| `source` | `string` | `null` | `'tooltip'` oder `'infoWindow'` – nutzt den gerenderten Volltext |
| `format` | `function` | `null` | `(cols, feature) => string` – volle Kontrolle |

##### Positionierung (einfach)

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `position` | `string` | `'top'` | `'top'` \| `'bottom'` \| `'left'` \| `'right'` \| `'center'` |
| `offsetPx` | `number` | `16` | Abstand zum Punkt in Pixeln |

##### Positionierung (Profi, überschreibt obiges)

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `anchor` | `string` | `null` | Direktes Mapbox `text-anchor` (z. B. `'top-left'`) |
| `offset` | `[x, y]` | `null` | Direktes `text-offset` in em |

##### Typografie

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `textSize` | `number` | `12` | Schriftgröße in px |
| `textColor` | `string` | `'#1f2937'` | Hex/RGB/HSL oder Mapbox-Color-Expression |
| `haloColor` | `string` | `'#ffffff'` | Halo-Farbe |
| `haloWidth` | `number` | `2` | Halo-Dicke |
| `haloBlur` | `number` | `0` | Halo-Weichzeichnung |
| `maxWidth` | `number` | `12` | Zeilenumbruch ab N em |
| `padding` | `number` | `2` | `text-padding` in px |
| `letterSpacing` | `number` | `0` | in em |
| `rotate` | `number` | `0` | Rotation in Grad |
| `textJustify` | `string` | `'center'` | `'auto'` \| `'left'` \| `'center'` \| `'right'` |
| `font` | `[string]` | `null` (auto) | Font-Stack, z. B. `['Roboto Medium']` |
| `textTransform` | `string` | `'none'` | `'none'` \| `'uppercase'` \| `'lowercase'` |

##### Sichtbarkeit & Verhalten

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `minZoom` | `number` | `0` | Erst ab Zoom N anzeigen |
| `maxZoom` | `number` | `24` | Bis Zoom N anzeigen |
| `zoomBasedSize` | `[n, m]` | `null` | Lineare Skalierung zwischen min/maxZoom |
| `allowOverlap` | `boolean` | `false` | Labels dürfen sich überlappen |
| `ignorePlacement` | `boolean` | `false` | Andere Labels ignorieren beim Platzieren |
| `textOptional` | `boolean` | `true` | Label weglassen wenn Platz fehlt |
| `sortKey` | `function` | `null` | `(feature) => number` – höhere Werte priorisiert |
| `maxLabels` | `number` | `null` | Hartes Limit (mit `sortKey` kombinieren!) |
| `filter` | `function` | `null` | `(feature) => boolean` |

##### Layer-Reihenfolge

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `addBefore` | `string` | `null` | Mapbox-Layer-ID, vor der der Label-Layer eingefügt wird |

##### Interaktion

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `onClick` | `function` | `null` | `(feature, event)` |
| `clickToZoom` | `boolean` | `false` | Klick aufs Label fliegt zum Punkt |
| `onUpdate` | `function` | `null` | `(count, features)` nach jedem Refresh |
| `cursor` | `string` | `'pointer'` | CSS-Cursor beim Hover |

##### APEX-Integration

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `hideTooltip` | `boolean` | `false` | APEX-Tooltip dieser Region per CSS ausblenden |
| `hideInfoWindow` | `boolean` | `false` | InfoWindow-Popup dieser Region ausblenden |

##### Timing & Debug

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `waitTimeoutMs` | `number` | `10000` | Max. Wartezeit auf Map+Layer |
| `debug` | `boolean` | `false` | Console-Logs |

#### Return-Object (Controller)

```javascript
const ctrl = apexMapLabel({...});

ctrl.refresh()         // Labels neu aufbauen (z. B. nach Region-Refresh)
ctrl.setOptions(o)     // Live-Update; Style-Props werden hot-reloaded
ctrl.getLabelCount()   // Aktuelle Anzahl gerenderter Labels (number)
ctrl.getLayerId()      // Interne Symbol-Layer-ID (string)
ctrl.getSourceId()     // Interne GeoJSON-Source-ID (string)
ctrl.getMap()          // Map-Objekt für direkte Mapbox/MapLibre-Calls
ctrl.destroy()         // Komplettes Cleanup
```

#### Globale Properties

```javascript
apexMapLabel.VERSION    // '2.0.0'
apexMapLabel.DEFAULTS   // alle Default-Werte (read-only)
```

---

## Rezepte

### Tooltip ausblenden, Spalte trotzdem nutzen

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations', column: 'NAME',
  hideTooltip: true
});
```

### Mehrere Felder kombinieren

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations',
  format: (cols) => `${cols.NAME}\n${cols.STATUS}`
});
```

### Erst ab bestimmtem Zoom anzeigen

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations', column: 'NAME',
  minZoom: 10
});
```

### Schriftgröße wächst mit Zoom

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Cities', column: 'NAME',
  zoomBasedSize: [10, 18],  // 10px bei minZoom, 18px bei maxZoom
  minZoom: 6, maxZoom: 16
});
```

### Tausende Punkte: Top-N labeln

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Cities', column: 'NAME',
  sortKey:   (f) => Number(JSON.parse(f.properties.tooltip).columns.POPULATION),
  maxLabels: 50
});
```

### Nur „aktive" Features beschriften

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations', column: 'NAME',
  filter: (f) => {
    const cols = JSON.parse(f.properties.tooltip).columns;
    return cols.STATUS === 'ACTIVE';
  }
});
```

### Klick aufs Label → APEX-Seite öffnen

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations', column: 'NAME',
  onClick: (feat) => {
    apex.navigation.redirect(
      'f?p=&APP_ID.:20:&SESSION.::::P20_ID:' + feat.properties.__srcId
    );
  }
});
```

### Label-Counter im UI aktualisieren

```javascript
apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Stations', column: 'NAME',
  onUpdate: (count) => {
    apex.item('P1_LABEL_COUNT').setValue(count);
  }
});
```

### Style zur Laufzeit ändern

```javascript
// In einer anderen Dynamic Action oder per Console:
window.stationLabels.setOptions({
  textSize: 16,
  textColor: '#dc2626',
  position: 'right',
  offsetPx: 12
});
```

### Refresh nach Region-Reload

Falls du die Map-Region per DA „Refresh"-st (z. B. nach Filter-Änderung):

- **DA Event:** `After Refresh`
- **Region:** deine Map
- **Action:** `Execute JavaScript Code`

```javascript
window.stationLabels && window.stationLabels.refresh();
```

### Mehrere Layer einer Map beschriften

```javascript
window.cityLabels = apexMapLabel({
  regionId: 'MY_MAP', layerName: 'Cities',   column: 'NAME', textColor: '#0f172a'
});
window.poiLabels  = apexMapLabel({
  regionId: 'MY_MAP', layerName: 'POIs',     column: 'TITLE', textColor: '#7c3aed', textSize: 11
});
```

### Cleanup beim Verlassen der Seite

In den Page Properties → JavaScript → Execute when Page Loads:

```javascript
window.addEventListener('beforeunload', () => {
  window.stationLabels && window.stationLabels.destroy();
});
```

---

## Troubleshooting

### `[apexMapLabel] regionId and layerName are required`

Du hast einen der beiden Parameter vergessen oder als leerer String übergeben.

### `[apexMapLabel] Region "..." not found or not a Map Region`

- Static ID stimmt nicht mit der Region überein – Page Designer öffnen, Region anklicken, **Advanced → Static ID** prüfen.
- Du rufst die Funktion auf einer Seite ohne die Map-Region auf.

### `[apexMapLabel] Map object not available after 10000ms`

Die DA feuert zu früh. Prüfe:
1. **Event** ist `Map Initialized [Map]` (nicht „Page Load"!)
2. **Selection Type** ist `Region` und die richtige Region ausgewählt.
3. Die Map ist sichtbar (nicht in einer ausgeblendeten Tab).
4. Bei sehr großen Datasets: `waitTimeoutMs: 30000` setzen.

### `[apexMapLabel] Layer "..." not found within 10000ms`

- **Name** ist case-sensitive. Im Page Designer Layer anklicken, exakter Name oben.
- Diagnose-Snippet in der Console:
  ```javascript
  console.log(apex.region('MY_MAP').layers.map(l => l.name));
  ```

### Labels werden gar nicht angezeigt, aber Log sagt `updated N labels`

Klassisches Font-Problem. Im Console-Output suchen nach Zeilen wie:
```
GET https://elocation.oracle.com/.../font/.../0-255.pbf 500
```
→ Der Default-Font ist im Glyph-Endpoint nicht verfügbar. Lösung:

```javascript
apexMapLabel({
  ..., 
  font: ['Roboto Regular']   // oder ['Noto Sans Regular']
});
```

Welche Fonts der Style hat, sieht man mit:
```javascript
const m = apex.region('MY_MAP').call('getMapObject');
const fonts = new Set();
m.getStyle().layers.forEach(l => {
  const f = l.layout?.['text-font']; 
  if (f) fonts.add(JSON.stringify(f));
});
console.log('Verfügbare Fonts:', [...fonts]);
```

### Spaltenwert kommt nicht im Label an

Standardmäßig sendet APEX **nur** Spalten ans Frontend, die als Tooltip- oder Info-Window-Spalte konfiguriert sind. Zwei Lösungen:

1. Spalte als **Tooltip Column** im Layer hinzufügen.
2. Falls du den Tooltip optisch nicht willst: `hideTooltip: true` in der Library-Config setzen.

### Labels überschneiden sich / verschwinden bei Zoom

```javascript
apexMapLabel({
  ..., 
  allowOverlap: true,    // Labels dürfen sich überlappen
  textOptional: false    // Label IMMER zeigen, nie weglassen
});
```

Vorsicht: Bei dichten Datasets wird's dann sehr voll.

### „Layer is already in style" Fehler bei Hot-Reload

In APEX Builder: nach JavaScript-Änderungen einmal `F5` machen, nicht nur die Region neu laden.

---

## Performance-Hinweise

| Feature-Anzahl | Empfehlung |
|---|---|
| < 100 | Alles default lassen |
| 100–1.000 | `textOptional: true` (default), evtl. `allowOverlap: false` |
| 1.000–10.000 | `maxLabels: 200` mit sinnvollem `sortKey` |
| > 10.000 | `minZoom` setzen + zoom-basierte Anzeige |

**Was die Library intern macht für Performance:**

- Single Symbol-Layer (GPU) statt DOM-Marker pro Punkt
- rAF-Debounce: niemals mehr als ein Update pro Frame
- Change-Detection: bei identischen Daten kein erneutes `setData`
- Cached Font-Detection
- `querySourceFeatures` statt `queryRenderedFeatures` (alle Punkte, nicht nur sichtbar)

---

## Browser- & APEX-Kompatibilität

| APEX-Version | Map-Engine | Status |
|---|---|---|
| 21.2 – 21.2.x | Mapbox GL JS | ✅ Getestet |
| 22.1 – 22.2.x | MapLibre GL JS | ✅ Getestet |
| 23.x | MapLibre GL JS | ✅ Erwartet kompatibel |
| 24.x | MapLibre GL JS | ✅ Erwartet kompatibel |

**Browser:** Alle modernen Browser (Chrome, Firefox, Safari, Edge). IE11 wird nicht unterstützt.

---

## Architektur

Für Contributors und Neugierige.

### Datei-Struktur

```
apex-map-label/
├── README.md              # Diese Datei
├── CHANGELOG.md           # Versionsverlauf
├── LICENSE                # MIT
├── .gitignore
├── src/
│   └── apex_map_label.js  # Die Library (~800 Zeilen)
└── examples/              # Code-Snippets aus den Rezepten
    ├── basic.js
    ├── multi-layer.js
    └── advanced.js
```

### Modul-Aufbau

Die Library ist eine **IIFE** ohne externe Abhängigkeiten. Intern:

```
┌─────────────────────────────────────────────────────────────┐
│ Public API                                                  │
│   apexMapLabel(opts) → Controller                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ normalizeOptions(cfg)      → validiert + mergt mit DEFAULTS │
│ waitForMapAndLayer(...)    → Polling-Loop (abbrechbar)      │
│ injectScopedCSS(...)       → Tooltip-CSS injizieren         │
└────────────────────────┬────────────────────────────────────┘
                         │ Map + Layer ready
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ initLabelLayer(ctx)                                         │
│  ├── resolveLayerId         → robust gegen ID-Varianten     │
│  ├── detectStyleFont        → einmal cachen                 │
│  ├── collectFeatures        → querySourceFeatures + filter  │
│  ├── deriveLabel            → JSON parsen, Template anwenden│
│  ├── buildFC                → GeoJSON + Dedup + Top-K       │
│  ├── ensureLayer            → Source + Symbol-Layer anlegen │
│  └── schedule/update        → rAF-Debounce, Change-Detection│
└─────────────────────────────────────────────────────────────┘
```

### Wichtige Design-Entscheidungen

- **Parallele GeoJSON-Source statt Reuse der APEX-Source.** Mapbox-Expressions können kein JSON parsen, deshalb müssen wir die Label-Werte in eine Top-Level-Property bringen.
- **Polling statt Event-Listening.** APEX's `Map Initialized`-Event feuert manchmal vor dem Hinzufügen der Daten-Layer; Polling ist hier robuster als das Erraten der Event-Reihenfolge.
- **Closures statt Klassen.** Kein `this`-Stress, kleinere Code-Footprint, perfekt für eine Single-File-Lib.
- **Sentinel-Controller bei Fehlern.** `noopCtrl()` – ein Controller, dessen Methoden alle leer sind – verhindert NPE im User-Code wenn Init scheitert.

---

## Mitarbeiten

PRs willkommen! Beim Beitragen bitte:

1. Fork → Branch → PR
2. Code-Style: 2 Spaces, single quotes, semicolons
3. Keine Dependencies hinzufügen
4. Bei API-Änderungen: CHANGELOG.md updaten

### Lokale Entwicklung

Da das Tool in einer APEX-Umgebung läuft, gibt es keinen klassischen Dev-Server. Workflow:

1. Code in `src/apex_map_label.js` ändern
2. Datei als Static File in APEX neu hochladen (oder über CDN)
3. Seite mit `Cmd/Ctrl+Shift+R` neu laden
4. Browser-Console im Auge behalten

### Ideen für Verbesserungen

- TypeScript-Definitionen
- Plugin-Architektur für Custom-Label-Renderer (HTML statt Text)
- Animierte Labels
- Cluster-Support (Anzahl-Label auf Cluster anzeigen)

---

## Lizenz

[MIT](./LICENSE) – frei verwendbar, auch kommerziell.
