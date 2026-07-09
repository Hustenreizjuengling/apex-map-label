# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und folgt [Semantic Versioning](https://semver.org/lang/de/).

## [2.3.0] – 2026-07-09

### Hinzugefügt
- **`clusterLabel`** (`true` | `(feature) => string`): Beschriftet Cluster mit ihrer
  Punktanzahl (`point_count_abbreviated`), statt sie wie bisher zu überspringen.
  Cluster priorisieren sich automatisch über ihre Größe (`symbol-sort-key`).
- **`properties`** (`(feature) => object`): Kopiert Zusatzwerte in die Label-Features –
  damit funktionieren data-driven Mapbox-Expressions, z. B.
  `textColor: ['match', ['get','status'], 'INACTIVE', '#dc2626', '#1f2937']`.
- **`placement`** (`'point'` | `'line'` | `'line-center'`): Labels folgen dem Verlauf von
  Linien (und Polygon-Umrissen) statt am Centroid zu kleben – die Original-Geometrie wird
  durchgereicht und `symbol-placement` entsprechend gesetzt. Punkte bleiben Punkte.
- **`autoRefresh`** (Default `true`): Abonniert das `apexafterrefresh`-Event der Region –
  die manuelle After-Refresh-DA mit `ctrl.refresh()` entfällt. Abschaltbar per Option,
  live umschaltbar via `setOptions()`.
- **`apexMapLabel.fixApexClusterSource(map)`**: Workaround für einen APEX-26.1-Bug, durch
  den Layer mit aktiviertem Point Clustering gar nicht gerendert werden (das Widget übergibt
  sein Cluster-Konfigobjekt als `cluster`-Property, MapLibre validiert strikt:
  *"cluster: boolean expected, object found"* → `addSource` schlägt fehl, der komplette
  Layer fehlt). Patcht `map.addSource`; danach die Region einmal refreshen.

### Behoben
- **Labels verschwanden nach einem Region-Refresh** (z. B. Filter-Änderung): Die Library
  konnte nach einem Daten-Reload mit veralteten Layer-Referenzen ins Leere greifen und
  leer rendern. Die Layer-Referenzen werden jetzt bei Bedarf über den Layer-Namen neu
  aufgelöst; ist der Layer während des Reloads kurz nicht verfügbar, bleiben die alten
  Labels stehen statt leer zu rendern. (End-to-End verifiziert: 1000 → 500 Punkte auf der
  Performance-Demo-Seite aktualisiert die Labels jetzt korrekt.)
- **`placement: 'line'` renderte keine Labels**: Der aus `position`/`offsetPx` berechnete
  `text-anchor`/`text-offset` verhinderte die Platzierung entlang der Linie komplett. Bei
  Linien-Placement werden Anchor/Offset jetzt neutralisiert (`center`/`[0,0]`), manuelle
  `anchor`/`offset`-Overrides bleiben möglich.
- **Labels blieben nach Region-Refresh unsichtbar, obwohl die Source korrekt aktualisiert
  wurde**: APEX schiebt beim Refresh (`_updateLayersPosition`) seine Layer per `moveLayer()`
  über den Label-Layer; die APEX-Icons (`icon-overlap: always`) gewinnen dann die
  Kollisions-Platzierung und unterdrücken sämtliche Labels. Die Library prüft jetzt bei
  jedem Update die Layer-Reihenfolge und schiebt den Label-Layer bei Bedarf wieder über
  den APEX-Layer (respektiert `addBefore`).

### Geändert
- Change-Detection-Signatur umfasst jetzt alle Feature-Properties (inkl. `properties()`-
  Zusatzdaten) und Nicht-Punkt-Geometrien.

## [2.2.0] – 2026-07-09

### Sicherheit
- **`stripHtml()` nutzt jetzt `DOMParser` statt `innerHTML`**: Das bisherige Parsen über ein
  detached `<div>` führte Event-Handler wie `<img onerror=...>` aus Tooltip-/InfoWindow-Inhalten
  aus (potenzielles XSS über DB-Daten). `DOMParser` erzeugt ein inertes Dokument – nichts wird
  geladen oder ausgeführt.

### Behoben
- **`hideTooltip: true` blendete auch das InfoWindow aus**: Beide rendern als
  Mapbox/MapLibre-Popup; die pauschale Popup-Regel traf beides. Die CSS-Regeln unterscheiden
  jetzt über `:has(.infoWindow)`, sodass `hideTooltip: true, hideInfoWindow: false` (wie in
  `examples/advanced.js`) korrekt nur den Tooltip versteckt.
- **Change-Detection verschluckte Updates**: Die 3-Punkt-Sample-Signatur (erstes/mittleres/
  letztes Label) übersah geänderte Labels in der Mitte sowie reine Positions-Änderungen
  (bewegte Features). Die Signatur umfasst jetzt alle Labels + Koordinaten.
- **`anchor` ohne `offset` wurde stillschweigend ignoriert**: Manuelle `anchor`/`offset`-Overrides
  gelten jetzt unabhängig voneinander.
- **`minZoom`/`maxZoom` werden validiert**: `minZoom >= maxZoom` erzeugte mit `zoomBasedSize`
  eine ungültige interpolate-Expression; jetzt Warning + Fallback auf 0/24.

### Geändert
- **`textTransform` nutzt das native `text-transform`-Layout-Property** statt der
  JS-Transformation – dadurch auch live per `setOptions()` umschaltbar.
- **`setOptions()` deckt jetzt alle Optionen live ab**: zusätzlich `minZoom`/`maxZoom`
  (`setLayerZoomRange`), `font`, `sortKey` (`symbol-sort-key`), `textTransform`,
  `hideTooltip`/`hideInfoWindow` (CSS-Reinjektion) sowie nachträglich gesetzte
  `onClick`/`clickToZoom`-Handler (Interaktion wird jetzt immer gebunden und zur Laufzeit geprüft).
- Doku präzisiert: `querySourceFeatures()` liefert Features der **geladenen Tiles**
  (Viewport + Puffer), nicht global alle – `maxLabels`/`sortKey` ist damit Top-N im aktuellen
  Kartenausschnitt.
- `npm run sync:demo` kopiert die Library in die Demo-App; `npm test` prüft die Syntax.

## [2.1.0] – 2026-05-25

### Geändert
- **Warten auf Map + Layer ist jetzt event-getrieben mit Stall-Timeout** statt fixer Deadline. `waitTimeoutMs` zählt nun reine *Inaktivität*: Solange die Map noch Daten lädt (`sourcedata`-Events bzw. `map.loaded() === false`), wird der Watchdog zurückgesetzt. Reagiert via `styledata`/`sourcedata`/`idle` sofort, sobald der Layer erscheint; langsamer Poll bleibt als Sicherheitsnetz.

### Behoben
- **Labels wurden bei datenintensiven Map-Regionen nicht gesetzt** und liefen in den Timeout: Taucht der APEX-Layer erst nach mehreren Sekunden (nach Abschluss des Daten-Ladens) im Style auf, riss die alte absolute 10s-Deadline vorzeitig ab – ohne Retry. Jetzt wird das Laden ausgesessen; der Timeout greift nur noch, wenn die Map zur Ruhe kommt und der Layer echt fehlt (falscher Name).

## [2.0.0] – 2026-05-14

### Hinzugefügt
- Vollständige Options-Validierung mit Warnings für ungültige Werte
- `hideTooltip` / `hideInfoWindow` für scoped CSS-Injection
- `position` + `offsetPx` für intuitive Label-Platzierung
- `zoomBasedSize` für linear skalierende Schriftgröße
- `maxLabels` mit optionalem `sortKey` für Top-N-Rendering
- `addBefore` für Layer-Reihenfolge im Map-Style
- `clickToZoom`, `onUpdate`, `cursor` für Interaktion
- `haloBlur`, `letterSpacing`, `rotate`, `textJustify` für Typografie-Feintuning
- `getLabelCount()` Methode im Controller
- `apexMapLabel.VERSION` und `apexMapLabel.DEFAULTS` als Properties
- CommonJS-Export für Build-Pipelines
- Abbrechbares Polling – `destroy()` direkt nach Init stoppt das Polling

### Geändert
- Default `position` von `'bottom'` auf `'top'` (häufigerer Use-Case)
- Font-Detection läuft jetzt nur einmal und wird gecacht
- Dedup-Key verwendet jetzt schnellere Strategie statt `JSON.stringify`
- Change-Detection nutzt 3-Punkt-Sample (erstes/mittleres/letztes Label)
- Konsequente Arrow Functions wo `this` egal ist
- Magic Numbers durch benannte Konstanten ersetzt
- Konsistentere Fehlerbehandlung mit Debug-Logging

### Behoben
- `hideTooltip` CSS deckt jetzt alle Popup-Anchor-Varianten ab, nicht nur `-top`
- `offsetPx` bei aktivem `zoomBasedSize` rechnet jetzt mit Mittelwert statt fix `textSize`
- `map.once('load')` wird jetzt korrekt in Cleanup registriert

## [1.0.0] – 2026-05-13

### Hinzugefügt
- Erste produktionsreife Version
- Always-on Labels für APEX Map Regions
- Native Symbol-Layer-Rendering
- Wartet auf Map + Layer (Polling)
- Label-Quellen: `column`, `source`, `format`
- Style- und Verhaltensoptionen
- `refresh()`, `setOptions()`, `destroy()` Controller-API
