/**
 * BASIC – Einfachster Aufruf
 *
 * Verwendung in APEX:
 *   Dynamic Action auf der Map-Region
 *   Event: "Map Initialized [Map]"
 *   Action: "Execute JavaScript Code"
 *   → diesen Code einfügen
 */

window.stationLabels = apexMapLabel({
  regionId:    'MY_MAP',         // Static ID der Region
  layerName:   'Stations',       // Layer-Name (case-sensitive!)
  column:      'NAME',           // Spalte aus dem SQL
  position:    'top',            // Label über dem Icon
  offsetPx:    20,
  hideTooltip: true              // APEX-Tooltip dieser Region ausblenden
});
