/**
 * v2.3-FEATURES – Cluster-Labels, Linien-Labels, data-driven Styling, Auto-Refresh
 */

// 1) Cluster mit Anzahl beschriften (Clustering im APEX-Layer aktivieren!)
window.clusterLabels = apexMapLabel({
  regionId:     'MY_MAP',
  layerName:    'Stations',
  column:       'NAME',
  clusterLabel: true,        // point_count auf Clustern; Einzelpunkte normal
  position:     'center'
});

// 2) Linien beschriften – Label folgt dem Verlauf
window.routeLabels = apexMapLabel({
  regionId:  'MY_MAP',
  layerName: 'Routes',
  column:    'ROUTE_NAME',
  placement: 'line',         // oder 'line-center' für genau ein Label mittig
  textSize:  12
});

// 3) Labelfarbe je Feature-Status (data-driven Expression)
window.statusLabels = apexMapLabel({
  regionId:  'MY_MAP',
  layerName: 'Stations',
  column:    'NAME',
  properties: (f) => ({
    status: JSON.parse(f.properties.tooltip).columns.STATUS
  }),
  textColor: ['match', ['get', 'status'],
    'INACTIVE', '#dc2626',
    '#1f2937'
  ]
});

// 4) Auto-Refresh ist Default: nach einem Region-Refresh (z.B. Filter-DA)
//    aktualisieren sich die Labels von selbst – keine After-Refresh-DA nötig.
//    Abschalten: autoRefresh: false, dann manuell ctrl.refresh() rufen.
