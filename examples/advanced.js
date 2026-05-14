/**
 * ADVANCED – komplexer Anwendungsfall:
 *  - Top-50 Städte nach Einwohnerzahl
 *  - Klick fliegt zum Punkt
 *  - Counter wird in APEX-Item geschrieben
 *  - Größe skaliert mit Zoom
 *  - Filter ändert sich abhängig von Page-Item
 */

window.cityLabels = apexMapLabel({
  regionId:  'MY_MAP',
  layerName: 'Cities',

  // Label: Stadtname mit Einwohnerzahl in Klammern
  format: (cols) => {
    const pop = Number(cols.POPULATION);
    const popK = pop >= 1_000_000
      ? (pop / 1_000_000).toFixed(1) + 'M'
      : Math.round(pop / 1000) + 'k';
    return `${cols.NAME} (${popK})`;
  },

  // Nur die 50 größten Städte, sortiert nach Einwohnerzahl
  sortKey: (f) => {
    const cols = JSON.parse(f.properties.tooltip).columns;
    return Number(cols.POPULATION) || 0;
  },
  maxLabels: 50,

  // Filter aus Page-Item ziehen
  filter: (f) => {
    const minPop = Number(apex.item('P1_MIN_POPULATION').getValue()) || 0;
    const cols = JSON.parse(f.properties.tooltip).columns;
    return Number(cols.POPULATION) >= minPop;
  },

  // Typografie
  textSize:      13,
  zoomBasedSize: [10, 18],   // wächst mit Zoom
  textColor:     '#1e293b',
  haloColor:     '#ffffff',
  haloWidth:     2,
  position:      'top',
  offsetPx:      18,
  textTransform: 'uppercase',
  letterSpacing: 0.05,

  // Interaktion
  clickToZoom: true,
  onClick: (feat) => {
    console.log('Clicked city ID:', feat.properties.__srcId);
  },
  onUpdate: (count) => {
    apex.item('P1_VISIBLE_CITIES').setValue(count);
  },

  // APEX-Integration
  hideTooltip: true,
  hideInfoWindow: false,   // InfoWindow weiterhin beim Klick auf Icon

  // Debug
  debug: false
});

// Wenn der User das Filter-Item ändert, Labels aktualisieren
apex.jQuery('#P1_MIN_POPULATION').on('change', () => {
  window.cityLabels?.refresh();
});

// Bei Region-Refresh ebenfalls
apex.jQuery('#MY_MAP').on('apexafterrefresh', () => {
  window.cityLabels?.refresh();
});
