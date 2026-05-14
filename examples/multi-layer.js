/**
 * MULTI-LAYER – mehrere Layer einer Map mit unterschiedlichen Stilen labeln
 */

// Großstädte: dunkel, fett, größer
window.cityLabels = apexMapLabel({
  regionId:  'MY_MAP',
  layerName: 'Cities',
  column:    'NAME',
  textSize:  14,
  textColor: '#0f172a',
  haloColor: '#ffffff',
  haloWidth: 2.5,
  textTransform: 'uppercase',
  minZoom:   6
});

// POIs: kleiner, lila, nur bei höherem Zoom
window.poiLabels = apexMapLabel({
  regionId:  'MY_MAP',
  layerName: 'POIs',
  column:    'TITLE',
  textSize:  11,
  textColor: '#7c3aed',
  minZoom:   12,
  position:  'right',
  offsetPx:  10
});

// Beim Verlassen der Seite aufräumen
window.addEventListener('beforeunload', () => {
  window.cityLabels?.destroy();
  window.poiLabels?.destroy();
});
