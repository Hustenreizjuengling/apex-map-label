# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und folgt [Semantic Versioning](https://semver.org/lang/de/).

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
