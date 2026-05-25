/**
 * apex_map_label.js  ·  v2.1
 * --------------------------------------------------------------------------
 * Always-on, performante Beschriftungen für Oracle APEX Map Regions.
 *
 * Funktioniert mit:
 *   – APEX 21.2  (Mapbox GL JS)
 *   – APEX 22.1+ (MapLibre GL JS)
 *
 * Architektur in Kürze:
 *   1. Wartet event-getrieben bis Map + Layer verfügbar sind
 *      (Stall-Timeout statt fixer Deadline – übersteht langes Daten-Laden).
 *   2. Liest die APEX-Layer-Features (querySourceFeatures).
 *   3. Erzeugt eine eigene GeoJSON-Source mit den Label-Texten.
 *   4. Rendert über einen nativen Symbol-Layer (GPU, skaliert auf 1000e Points).
 *   5. Aktualisiert bei map "idle" / "sourcedata" mit rAF-Debounce.
 *
 * Minimal-Beispiel:
 *   const lbl = apexMapLabel({
 *     regionId:  'MY_MAP',
 *     layerName: 'Stations',
 *     column:    'NAME',
 *     position:  'top',
 *     offsetPx:  20,
 *     hideTooltip: true
 *   });
 *
 * Vollständige Options-Referenz: siehe DEFAULTS-Objekt weiter unten.
 *
 * Return-API:
 *   refresh()        Neu aufbauen (nach Daten-Refresh der Region)
 *   setOptions(o)    Live-Update einzelner Optionen
 *   getLabelCount()  Aktuelle Anzahl gerenderter Labels
 *   getLayerId()     Interne Symbol-Layer-ID (z.B. zum Stylen via Mapbox-API)
 *   getSourceId()    Interne GeoJSON-Source-ID
 *   getMap()         Map-Objekt
 *   destroy()        Komplettes Cleanup
 */
(function (global) {
  'use strict';

  // ==========================================================================
  // Konstanten
  // ==========================================================================
  const POLL_INTERVAL_MS    = 100;
  const DEFAULT_TIMEOUT_MS  = 10000;
  const DEFAULT_TEXT_SIZE   = 12;
  const DEFAULT_OFFSET_PX   = 16;
  const VALID_POSITIONS     = ['top', 'bottom', 'left', 'right', 'center'];
  const VALID_TRANSFORMS    = ['none', 'uppercase', 'lowercase'];

  // Vollständige Defaults – auch Dokumentation
  const DEFAULTS = Object.freeze({
    // -- Pflicht
    regionId:        null,         // string  – Static ID der Map-Region
    layerName:       null,         // string  – Name des APEX-Layers (case-sensitive)

    // -- Label-Quelle (genau eine)
    column:          null,         // string  – Spaltenname, sucht in tooltip/infoWindow.columns
    source:          null,         // 'tooltip' | 'infoWindow' – gerenderter Tooltip-Text
    format:          null,         // (cols, feature) => string – volle Kontrolle

    // -- Positionierung (intuitiv)
    position:        'top',        // 'top' | 'bottom' | 'left' | 'right' | 'center'
    offsetPx:        DEFAULT_OFFSET_PX, // number – Abstand zum Punkt in Pixeln

    // -- Positionierung (Profi-Override)
    anchor:          null,         // string  – direktes Mapbox text-anchor
    offset:          null,         // [x, y]  – direktes text-offset in em

    // -- Typografie
    textSize:        DEFAULT_TEXT_SIZE, // number  – Schriftgröße in px
    textColor:       '#1f2937',    // string  – Mapbox-Color-Expression möglich
    haloColor:       '#ffffff',
    haloWidth:       2,
    haloBlur:        0,
    maxWidth:        12,           // number  – Zeilenumbruch ab N em
    padding:         2,            // number  – text-padding in px
    letterSpacing:   0,            // number  – in em
    rotate:          0,            // number  – Grad
    textJustify:     'center',     // 'auto' | 'left' | 'center' | 'right'
    font:            null,         // [string] – z.B. ['Roboto Medium']; auto-detect wenn null
    textTransform:   'none',       // 'none' | 'uppercase' | 'lowercase'

    // -- Sichtbarkeit & Verhalten
    minZoom:         0,
    maxZoom:         24,
    zoomBasedSize:   null,         // [minSize, maxSize] – z.B. [10, 16]
    allowOverlap:    false,
    ignorePlacement: false,
    textOptional:    true,
    sortKey:         null,         // (feature) => number – höher = wichtiger
    maxLabels:       null,         // number  – hartes Limit
    filter:          null,         // (feature) => boolean

    // -- Layer-Reihenfolge
    addBefore:       null,         // string  – Mapbox-Layer-ID, vor der eingefügt werden soll

    // -- Interaktion
    onClick:         null,         // (feature, event)
    clickToZoom:     false,
    onUpdate:        null,         // (count, features)
    cursor:          'pointer',    // CSS-Cursor beim Hover

    // -- APEX-Integration
    hideTooltip:     false,        // APEX-Tooltip dieser Region per CSS verstecken
    hideInfoWindow:  false,        // dito InfoWindow

    // -- Timing / Debug
    waitTimeoutMs:   DEFAULT_TIMEOUT_MS, // number – Abbruch nach so vielen ms OHNE Fortschritt (Stall-Timeout, nicht absolut)
    debug:           false
  });

  // ==========================================================================
  // Utility: Library-Detection (versuch erst MapLibre, fallback Mapbox)
  // ==========================================================================
  const getLib = () => global.maplibregl || global.mapboxgl;

  // ==========================================================================
  // Utility: Logging
  // ==========================================================================
  const makeLogger = (enabled) => enabled
    ? (...args) => console.log('[apexMapLabel]', ...args)
    : () => {};

  const warn  = (...args) => console.warn ('[apexMapLabel]', ...args);
  const error = (...args) => console.error('[apexMapLabel]', ...args);

  // ==========================================================================
  // Utility: HTML & JSON
  // ==========================================================================
  function stripHtml(html) {
    if (html == null) return '';
    if (typeof html !== 'string') return String(html);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  function parseMaybeJSON(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    if (typeof v !== 'string') return null;
    try { return JSON.parse(v); } catch (_) { return null; }
  }

  function applyTemplate(tpl, columns) {
    if (!tpl) return '';
    if (!columns) return tpl;
    let s = tpl;
    for (const k in columns) {
      // APEX-Substitution: &SPALTE.
      s = s.split('&' + k + '.').join(columns[k] == null ? '' : String(columns[k]));
    }
    return s;
  }

  // ==========================================================================
  // Label-Text aus APEX-Feature ableiten
  // ==========================================================================
  function deriveLabel(feature, opts, debugLog) {
    const props = feature.properties || {};

    // 1) Custom format()
    if (typeof opts.format === 'function') {
      const merged = {};
      for (const src of ['tooltip', 'infoWindow']) {
        const data = parseMaybeJSON(props[src]);
        if (data && data.columns) Object.assign(merged, data.columns);
      }
      Object.assign(merged, props); // flache Props haben Vorrang
      try {
        const out = opts.format(merged, feature);
        return out == null ? null : String(out);
      } catch (e) {
        error('format() threw:', e);
        return null;
      }
    }

    // 2) Spezifische Spalte
    if (opts.column) {
      // Erst Top-Level (falls APEX die Spalte mal direkt liefert)
      if (props[opts.column] != null) return String(props[opts.column]);

      const sources = opts.source ? [opts.source] : ['tooltip', 'infoWindow'];
      for (const src of sources) {
        const data = parseMaybeJSON(props[src]);
        if (data && data.columns && data.columns[opts.column] != null) {
          return String(data.columns[opts.column]);
        }
      }
      debugLog && debugLog('column "' + opts.column + '" not found in feature', feature);
      return null;
    }

    // 3) Tooltip/InfoWindow als Volltext
    const src = opts.source || 'tooltip';
    const data = parseMaybeJSON(props[src]);
    if (!data || !data.content) return null;
    if (typeof data.content === 'string') return stripHtml(data.content);
    if (data.content.template) return stripHtml(applyTemplate(data.content.template, data.columns));
    if (data.content.body)     return stripHtml(data.content.body);
    return null;
  }

  // ==========================================================================
  // Centroid einer Geometrie
  // ==========================================================================
  function centroid(geom) {
    if (!geom) return null;
    if (geom.type === 'Point') return geom.coordinates;
    const lib = getLib();
    if (!lib) return null;
    const b = new lib.LngLatBounds();
    (function walk(arr) {
      if (typeof arr[0] === 'number') b.extend([arr[0], arr[1]]);
      else for (let i = 0; i < arr.length; i++) walk(arr[i]);
    })(geom.coordinates);
    return [(b.getWest() + b.getEast()) / 2, (b.getNorth() + b.getSouth()) / 2];
  }

  // ==========================================================================
  // Position → Anchor + Offset (Pixel → em umrechnen)
  // ==========================================================================
  function computePositioning(opts) {
    // Manuelle Werte haben Vorrang
    const hasManual = opts.anchor != null && opts.offset != null;
    if (hasManual) return { anchor: opts.anchor, offset: opts.offset };

    // Wenn zoomBasedSize aktiv: Mittelwert für statische Offset-Berechnung.
    // (Eine zoom-abhängige Offset-Expression wäre korrekter, aber komplexer
    //  und Mapbox bricht sie für text-offset nicht überall – Trade-off.)
    const refSize = Array.isArray(opts.zoomBasedSize) && opts.zoomBasedSize.length === 2
      ? (opts.zoomBasedSize[0] + opts.zoomBasedSize[1]) / 2
      : (opts.textSize > 0 ? opts.textSize : DEFAULT_TEXT_SIZE);

    const px   = opts.offsetPx != null ? opts.offsetPx : DEFAULT_OFFSET_PX;
    const dist = px / refSize;

    const pos = VALID_POSITIONS.indexOf(opts.position) >= 0 ? opts.position : 'top';

    switch (pos) {
      case 'top':    return { anchor: 'bottom', offset: [0, -dist] };
      case 'bottom': return { anchor: 'top',    offset: [0,  dist] };
      case 'left':   return { anchor: 'right',  offset: [-dist, 0] };
      case 'right':  return { anchor: 'left',   offset: [ dist, 0] };
      case 'center': return { anchor: 'center', offset: [0, 0] };
    }
  }

  // ==========================================================================
  // Layer-ID-Auflösung (mehrstufiger Fallback)
  // ==========================================================================
  function resolveLayerId(region, map, layerName) {
    let id = null;

    // 1) Offizielle API (falls vorhanden)
    try {
      const viaApi = region.call('getLayerIdByName', layerName);
      if (viaApi != null) id = String(viaApi);
    } catch (_) { /* Methode evtl. nicht vorhanden */ }

    if (id && map.getLayer(id)) return id;

    // 2) Über region.layers nach Name suchen
    const layers = region.layers || [];
    const info = layers.find(l => (l.name || l.label) === layerName);
    if (!info || info.id == null) return null;

    const candidate = String(info.id);
    if (map.getLayer(candidate)) return candidate;

    // 3) Suffix/Präfix-Match im Map-Style (manche APEX-Versionen suffixen)
    const style = map.getStyle();
    if (!style || !style.layers) return null;
    const match = style.layers.find(l =>
      l.id === candidate || l.id.endsWith(candidate) || l.id.startsWith(candidate)
    );
    return match ? match.id : null;
  }

  // ==========================================================================
  // Auf Map + Layer warten (event-getrieben, abbrechbar)
  // --------------------------------------------------------------------------
  // Wichtig: `timeoutMs` ist KEINE absolute Deadline, sondern ein Stall-/
  // Inaktivitäts-Timeout. Solange die Map noch Daten lädt (sourcedata-Events
  // feuern bzw. map.loaded() === false), wird der Watchdog zurückgesetzt – wir
  // warten beliebig lange, *solange Fortschritt da ist*. Erst wenn die Map zur
  // Ruhe kommt und der Layer immer noch fehlt, greift nach timeoutMs der
  // Abbruch (= dann ist es wirklich ein falscher Layer-Name, kein Ladeproblem).
  //
  // Das löst den Fall datenintensiver Regionen, deren Layer erst nach Sekunden
  // im Map-Style auftaucht – die alte fixe Deadline riss hier vorzeitig ab.
  // ==========================================================================
  function waitForMapAndLayer(region, layerName, timeoutMs, isCancelled, debugLog) {
    return new Promise((resolve) => {
      let settled     = false;
      let map         = null;
      let stallTimer  = null;
      let pollTimer   = null;
      let lastAttempt = 0;
      const offFns    = [];

      const cleanup = () => {
        clearTimeout(stallTimer);
        clearTimeout(pollTimer);
        for (const off of offFns) { try { off(); } catch (_) {} }
        offFns.length = 0;
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      // Watchdog: feuert nur, wenn timeoutMs lang KEIN Fortschritt mehr kam.
      const armStall = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          debugLog && debugLog(`stall timeout – ${timeoutMs}ms ohne Fortschritt, Layer nicht aufgetaucht`);
          finish({ map: map, layerId: null });
        }, timeoutMs);
      };

      // Versuch, Map + Layer aufzulösen (leicht gedrosselt gegen Event-Fluten).
      const attempt = (force) => {
        if (settled) return;
        if (isCancelled()) { finish({ map: null, layerId: null, cancelled: true }); return; }

        const now = Date.now();
        if (!force && now - lastAttempt < 40) return;
        lastAttempt = now;

        if (!map) {
          try { map = region.call('getMapObject'); } catch (_) {}
          if (map) {
            debugLog && debugLog('map object acquired – höre auf style/source-Events');
            bindMapEvents();
          }
        }
        if (map) {
          const id = resolveLayerId(region, map, layerName);
          if (id) { finish({ map: map, layerId: id }); return; }
        }
      };

      // Jedes Style-/Source-Event ist (a) eine Chance, den Layer zu finden und
      // (b) ein Zeichen von Fortschritt, das den Watchdog zurücksetzt.
      const bindMapEvents = () => {
        const onProgress = () => { armStall(); attempt(); };
        for (const ev of ['styledata', 'sourcedata', 'idle']) {
          map.on(ev, onProgress);
          offFns.push(() => { try { map.off(ev, onProgress); } catch (_) {} });
        }
      };

      // Langsamer Poll als Sicherheitsnetz: deckt die Phase vor dem Map-Objekt
      // ab und fängt evtl. verpasste Events. Hält den Watchdog am Leben, solange
      // die Map sich selbst noch als "nicht fertig geladen" meldet (z.B. bei
      // stillem AJAX-Datenabruf ohne zwischenzeitliche map-Events).
      const poll = () => {
        if (settled) return;
        attempt(true);
        if (map && typeof map.loaded === 'function' && !map.loaded()) armStall();
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      armStall();
      poll();
    });
  }

  // ==========================================================================
  // CSS-Injektion (scoped pro Region)
  // ==========================================================================
  function injectScopedCSS(regionId, instanceId, opts) {
    if (!opts.hideTooltip && !opts.hideInfoWindow) return null;

    const styleEl  = document.createElement('style');
    styleEl.id     = 'apxlbl-css-' + instanceId;
    styleEl.setAttribute('data-region', regionId);

    // CSS-ID-Selektoren brauchen valide CSS-Identifier
    const idSafe = regionId.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const scope  = `#${idSafe}, [id="${regionId}"]`;

    // Hilfsfn baut Regel: ":scope :where(<klassen>) { display: none !important; }"
    // :where() reduziert Spezifität, das stört aber wegen !important nicht.
    const rule = (selectors) =>
      `${scope.split(',').map(s => selectors.map(c => `${s.trim()} ${c}`).join(',')).join(',')} { display: none !important; }`;

    const rules = [];
    if (opts.hideTooltip) {
      // Sämtliche Popup-Varianten von Mapbox/MapLibre – alle Anchor-Klassen
      rules.push(rule(['.maplibregl-popup', '.mapboxgl-popup']));
    }
    if (opts.hideInfoWindow) {
      // APEX nutzt die Klasse "infoWindow" innerhalb des Popups.
      // Wir nehmen das Elternelement, falls :has() supportet wird, sonst nur das Kind.
      rules.push(rule(['.maplibregl-popup .infoWindow', '.mapboxgl-popup .infoWindow']));
      rules.push(rule(['.maplibregl-popup:has(.infoWindow)', '.mapboxgl-popup:has(.infoWindow)']));
    }

    styleEl.textContent = rules.join('\n');
    document.head.appendChild(styleEl);
    return styleEl;
  }

  // ==========================================================================
  // Options validieren + normalisieren
  // ==========================================================================
  function normalizeOptions(cfg) {
    const opts = Object.assign({}, DEFAULTS, cfg || {});

    if (opts.position && VALID_POSITIONS.indexOf(opts.position) < 0) {
      warn(`unknown position "${opts.position}", falling back to "top". ` +
           `Valid: ${VALID_POSITIONS.join(', ')}`);
      opts.position = 'top';
    }
    if (opts.textTransform && VALID_TRANSFORMS.indexOf(opts.textTransform) < 0) {
      warn(`unknown textTransform "${opts.textTransform}", using "none"`);
      opts.textTransform = 'none';
    }
    if (opts.zoomBasedSize != null && (!Array.isArray(opts.zoomBasedSize) || opts.zoomBasedSize.length !== 2)) {
      warn('zoomBasedSize must be [min, max] – ignoring');
      opts.zoomBasedSize = null;
    }
    if (opts.maxLabels != null && (typeof opts.maxLabels !== 'number' || opts.maxLabels < 1)) {
      warn('maxLabels must be a positive number – ignoring');
      opts.maxLabels = null;
    }
    return opts;
  }

  // ==========================================================================
  // Sentinel-Controller bei Fehlern / vor Init
  // ==========================================================================
  function makeNoopController() {
    return {
      refresh:       () => {},
      setOptions:    () => {},
      getLabelCount: () => 0,
      getLayerId:    () => null,
      getSourceId:   () => null,
      getMap:        () => null,
      destroy:       () => {}
    };
  }

  // ==========================================================================
  // Hauptfunktion (Public API)
  // ==========================================================================
  function apexMapLabel(cfg) {
    const opts = normalizeOptions(cfg);
    const log  = makeLogger(opts.debug);

    // Pre-Init Validierung
    if (!opts.regionId || !opts.layerName) {
      error('regionId and layerName are required.');
      return makeNoopController();
    }
    if (!global.apex || typeof apex.region !== 'function') {
      error('apex.region API not available.');
      return makeNoopController();
    }

    const region = apex.region(opts.regionId);
    if (!region || typeof region.call !== 'function') {
      error(`Region "${opts.regionId}" not found or not a Map Region.`);
      return makeNoopController();
    }

    // CSS sofort injizieren – soll auch funktionieren wenn die Map-Init scheitert
    const instanceId = `${opts.regionId}_${opts.layerName}_${Date.now()}`.replace(/\W+/g, '_');
    let cssEl = injectScopedCSS(opts.regionId, instanceId, opts);

    let cancelled  = false;        // destroy() vor/während Init
    let inner      = null;         // echter Controller nach Init
    const pending  = { refresh: false, setOptions: null };

    waitForMapAndLayer(region, opts.layerName, opts.waitTimeoutMs, () => cancelled, log).then(res => {
      if (cancelled) return;

      if (!res.map) {
        error(`Map object not available (no progress for ${opts.waitTimeoutMs}ms). ` +
              `Check the DA event ("Map Initialized [Map]") and Static ID.`);
        return;
      }
      if (!res.layerId) {
        const known = (region.layers || []).map(l => l.name || l.label);
        error(
          `Layer "${opts.layerName}" never appeared – the map went idle for ` +
          `${opts.waitTimeoutMs}ms without it. Likely a wrong layer name (not a ` +
          `data-loading delay; that is now waited out automatically).\n` +
          `Known layers: ${known.length ? known.map(n => `"${n}"`).join(', ') : '(none)'}`
        );
        return;
      }

      log('map + layer ready:', opts.layerName, '→', res.layerId);
      inner = initLabelLayer({
        region, map: res.map, opts, log, layerId: res.layerId, cssEl
      });

      // Aufgestaute Calls nachholen
      if (pending.setOptions) inner.setOptions(pending.setOptions);
      if (pending.refresh)    inner.refresh();
    });

    // Proxy-Controller: gibt sofort zurück, leitet später an `inner` weiter
    return {
      refresh: () => {
        if (inner) inner.refresh();
        else pending.refresh = true;
      },
      setOptions: (o) => {
        if (inner) inner.setOptions(o);
        else pending.setOptions = Object.assign(pending.setOptions || {}, o || {});
      },
      getLabelCount: () => inner ? inner.getLabelCount() : 0,
      getLayerId:    () => inner ? inner.getLayerId()    : null,
      getSourceId:   () => inner ? inner.getSourceId()   : null,
      getMap:        () => inner ? inner.getMap()        : null,
      destroy: () => {
        cancelled = true;
        if (inner) inner.destroy();
        else if (cssEl && cssEl.parentNode) cssEl.parentNode.removeChild(cssEl);
      }
    };
  }

  // ==========================================================================
  // Eigentliche Label-Layer-Initialisierung
  // ==========================================================================
  function initLabelLayer(ctx) {
    const { region, map, opts, log, layerId, cssEl } = ctx;

    const apexLayer    = map.getLayer(layerId);
    const apexSourceId = apexLayer ? apexLayer.source         : null;
    const apexSrcLayer = apexLayer ? apexLayer['source-layer'] : null;

    // Eindeutige IDs (mit Kollisionsschutz)
    const baseUid = `apxlbl_${opts.regionId}_${opts.layerName}`.replace(/\W+/g, '_');
    let srcId = `${baseUid}_src`;
    let lyrId = `${baseUid}_lyr`;
    for (let i = 1; map.getSource(srcId) || map.getLayer(lyrId); i++) {
      srcId = `${baseUid}_${i}_src`;
      lyrId = `${baseUid}_${i}_lyr`;
    }

    // -- State ---------------------------------------------------------------
    let destroyed   = false;
    let scheduled   = false;
    let lastSig     = '';
    let labelCount  = 0;
    let cachedFont  = null;             // detectStyleFont() Ergebnis cachen
    const cleanups  = [];               // alle off-Funktionen sammeln

    // -- Event-Binding mit automatischem Cleanup -----------------------------
    function on(target, event, layerOrFn, maybeFn) {
      const hasLayer = typeof layerOrFn === 'string';
      const fn       = hasLayer ? maybeFn : layerOrFn;
      if (hasLayer) {
        target.on(event, layerOrFn, fn);
        cleanups.push(() => { try { target.off(event, layerOrFn, fn); } catch (_) {} });
      } else {
        target.on(event, fn);
        cleanups.push(() => { try { target.off(event, fn); } catch (_) {} });
      }
    }

    // -- Font aus existierendem Symbol-Layer übernehmen ----------------------
    function detectStyleFont() {
      if (cachedFont !== null) return cachedFont || null;
      try {
        const layers = (map.getStyle() && map.getStyle().layers) || [];
        for (const l of layers) {
          if (l.type === 'symbol') {
            const f = (l.layout && l.layout['text-font']) ||
                      tryGetLayoutProp(l.id, 'text-font');
            if (f) { cachedFont = f; return f; }
          }
        }
      } catch (e) {
        opts.debug && log('detectStyleFont failed:', e);
      }
      cachedFont = false; // markiert: erfolglos, nicht nochmal probieren
      return null;
    }

    function tryGetLayoutProp(id, prop) {
      try { return map.getLayoutProperty(id, prop); } catch (_) { return null; }
    }

    // -- Features sammeln ----------------------------------------------------
    function collectFeatures() {
      // Bevorzugt: querySourceFeatures (liefert ALLE, nicht nur sichtbare)
      let src = [];
      try {
        if (apexSourceId) src = map.querySourceFeatures(apexSourceId) || [];
      } catch (e) {
        opts.debug && log('querySourceFeatures failed:', e);
      }
      if (apexSrcLayer) {
        src = src.filter(f => f.sourceLayer === apexSrcLayer);
      }

      // Fallback: queryRenderedFeatures
      if (!src.length) {
        try { src = map.queryRenderedFeatures({ layers: [layerId] }) || []; }
        catch (e) { opts.debug && log('queryRenderedFeatures failed:', e); }
      }
      return src;
    }

    // -- Dedup-Key: schneller als JSON.stringify ----------------------------
    function makeDedupKey(f) {
      if (f.id != null) return 'i:' + f.id;
      const g = f.geometry;
      if (!g) return 'g:none';
      if (g.type === 'Point') {
        const c = g.coordinates;
        return 'p:' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + c[0] + ',' + c[1];
      }
      // Polygons/Lines: erstes & letztes Koord-Paar reicht praktisch
      const flat = [];
      (function walk(a) {
        if (typeof a[0] === 'number') flat.push(a[0], a[1]);
        else if (flat.length < 4) for (let i = 0; i < a.length && flat.length < 4; i++) walk(a[i]);
      })(g.coordinates);
      return 'c:' + g.type + ':' + flat.join(',');
    }

    // -- Feature-Collection für unsere Source bauen --------------------------
    function buildFC() {
      const seen   = new Set();
      const out    = [];

      for (const f of collectFeatures()) {
        if (f.properties && f.properties.cluster) continue;
        if (opts.filter && !opts.filter(f)) continue;

        const key = makeDedupKey(f);
        if (seen.has(key)) continue;
        seen.add(key);

        let text = deriveLabel(f, opts, opts.debug ? log : null);
        if (text == null || text === '') continue;
        if (opts.textTransform === 'uppercase') text = text.toUpperCase();
        else if (opts.textTransform === 'lowercase') text = text.toLowerCase();

        const c = centroid(f.geometry);
        if (!c) continue;

        const sk = opts.sortKey ? (Number(opts.sortKey(f)) || 0) : 0;
        out.push({
          type: 'Feature',
          properties: { label: text, __srcId: f.id != null ? f.id : null, sk },
          geometry: { type: 'Point', coordinates: c }
        });
      }

      // maxLabels: Top-K nach sortKey
      if (opts.maxLabels && out.length > opts.maxLabels) {
        out.sort((a, b) => b.properties.sk - a.properties.sk);
        out.length = opts.maxLabels;
      }

      return { type: 'FeatureCollection', features: out };
    }

    // -- Layout-Property Helper ---------------------------------------------
    function getTextSizeExpression() {
      if (Array.isArray(opts.zoomBasedSize) && opts.zoomBasedSize.length === 2) {
        return [
          'interpolate', ['linear'], ['zoom'],
          opts.minZoom, opts.zoomBasedSize[0],
          opts.maxZoom, opts.zoomBasedSize[1]
        ];
      }
      return opts.textSize;
    }

    function buildLayout() {
      const pos = computePositioning(opts);
      const layout = {
        'text-field':            ['get', 'label'],
        'text-size':             getTextSizeExpression(),
        'text-offset':           pos.offset,
        'text-anchor':           pos.anchor,
        'text-justify':          opts.textJustify,
        'text-allow-overlap':    opts.allowOverlap,
        'text-ignore-placement': opts.ignorePlacement,
        'text-optional':         opts.textOptional,
        'text-max-width':        opts.maxWidth,
        'text-padding':          opts.padding,
        'text-letter-spacing':   opts.letterSpacing,
        'text-rotate':           opts.rotate
      };

      if (opts.sortKey) {
        // höher = wichtiger; Mapbox priorisiert kleinere Werte → invertieren
        layout['symbol-sort-key'] = ['-', 0, ['get', 'sk']];
      }
      const font = opts.font || detectStyleFont();
      if (font) {
        layout['text-font'] = font;
        log('using font:', font);
      } else {
        warn('Could not detect a font from the map style. ' +
             'If labels do not render, set the `font` option explicitly (e.g. ["Roboto Regular"]).');
      }
      return layout;
    }

    function buildPaint() {
      return {
        'text-color':      opts.textColor,
        'text-halo-color': opts.haloColor,
        'text-halo-width': opts.haloWidth,
        'text-halo-blur':  opts.haloBlur
      };
    }

    // -- Layer/Source anlegen ------------------------------------------------
    function ensureLayer(initialData) {
      if (map.getSource(srcId)) return;

      map.addSource(srcId, { type: 'geojson', data: initialData });

      map.addLayer({
        id:      lyrId,
        type:    'symbol',
        source:  srcId,
        minzoom: opts.minZoom,
        maxzoom: opts.maxZoom,
        layout:  buildLayout(),
        paint:   buildPaint()
      }, opts.addBefore || undefined);

      // Click/Hover-Interaktion
      const wantsInteraction = typeof opts.onClick === 'function' || opts.clickToZoom;
      if (wantsInteraction) {
        on(map, 'click', lyrId, (e) => {
          if (!e.features || !e.features[0]) return;
          const feat = e.features[0];
          if (opts.clickToZoom) {
            map.flyTo({
              center: feat.geometry.coordinates,
              zoom:   Math.max(map.getZoom(), 12)
            });
          }
          if (typeof opts.onClick === 'function') {
            try { opts.onClick(feat, e); } catch (err) { error('onClick threw:', err); }
          }
        });
        on(map, 'mouseenter', lyrId, () => { map.getCanvas().style.cursor = opts.cursor; });
        on(map, 'mouseleave', lyrId, () => { map.getCanvas().style.cursor = ''; });
      }
    }

    // -- Update / Schedule ---------------------------------------------------
    function update() {
      if (destroyed) return;
      const fc = buildFC();

      // Cheap Change-Detection (Anzahl + erste/letzte/mittlere Labels)
      const sample = fc.features.length > 0
        ? fc.features[0].properties.label + '|' +
          (fc.features[Math.floor(fc.features.length / 2)] || {}).properties?.label + '|' +
          (fc.features[fc.features.length - 1] || {}).properties?.label
        : '';
      const sig = fc.features.length + ':' + sample;
      if (sig === lastSig && map.getSource(srcId)) return;
      lastSig    = sig;
      labelCount = fc.features.length;

      if (map.getSource(srcId)) map.getSource(srcId).setData(fc);
      else                      ensureLayer(fc);

      log('updated', fc.features.length, 'labels');
      if (typeof opts.onUpdate === 'function') {
        try { opts.onUpdate(fc.features.length, fc.features); }
        catch (e) { error('onUpdate threw:', e); }
      }
    }

    function schedule() {
      if (destroyed || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        try { update(); }
        catch (e) { error('update failed:', e); }
      });
    }

    // -- Event-Wiring --------------------------------------------------------
    on(map, 'idle', schedule);
    on(map, 'sourcedata', (e) => {
      if (e && e.sourceId === apexSourceId && e.isSourceLoaded) schedule();
    });

    // Initial trigger (sicher gegen "load schon vorbei")
    if (map.loaded()) schedule();
    else {
      const onLoad = () => schedule();
      map.once('load', onLoad);
      cleanups.push(() => { try { map.off('load', onLoad); } catch (_) {} });
    }

    // -- Public Inner-API ----------------------------------------------------
    return {
      refresh: () => { lastSig = ''; schedule(); },

      setOptions: (newOpts) => {
        if (destroyed) return;
        const merged = normalizeOptions(Object.assign({}, opts, newOpts || {}));
        Object.keys(merged).forEach(k => { opts[k] = merged[k]; });

        // Style-Properties live updaten
        if (map.getLayer(lyrId)) {
          const pos   = computePositioning(opts);
          const paint = buildPaint();
          Object.keys(paint).forEach(k => map.setPaintProperty(lyrId, k, paint[k]));

          map.setLayoutProperty(lyrId, 'text-size',             getTextSizeExpression());
          map.setLayoutProperty(lyrId, 'text-offset',           pos.offset);
          map.setLayoutProperty(lyrId, 'text-anchor',           pos.anchor);
          map.setLayoutProperty(lyrId, 'text-justify',          opts.textJustify);
          map.setLayoutProperty(lyrId, 'text-allow-overlap',    opts.allowOverlap);
          map.setLayoutProperty(lyrId, 'text-ignore-placement', opts.ignorePlacement);
          map.setLayoutProperty(lyrId, 'text-optional',         opts.textOptional);
          map.setLayoutProperty(lyrId, 'text-max-width',        opts.maxWidth);
          map.setLayoutProperty(lyrId, 'text-padding',          opts.padding);
          map.setLayoutProperty(lyrId, 'text-letter-spacing',   opts.letterSpacing);
          map.setLayoutProperty(lyrId, 'text-rotate',           opts.rotate);
        }
        lastSig = '';
        schedule();
      },

      getLabelCount: () => labelCount,
      getLayerId:    () => lyrId,
      getSourceId:   () => srcId,
      getMap:        () => map,

      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        // Listener
        for (const fn of cleanups) fn();
        cleanups.length = 0;
        // Style
        try { if (map.getLayer(lyrId))  map.removeLayer(lyrId);  } catch (_) {}
        try { if (map.getSource(srcId)) map.removeSource(srcId); } catch (_) {}
        // CSS
        if (cssEl && cssEl.parentNode) cssEl.parentNode.removeChild(cssEl);
        log('destroyed');
      }
    };
  }

  // ==========================================================================
  // Export
  // ==========================================================================
  apexMapLabel.VERSION  = '2.1.0';
  apexMapLabel.DEFAULTS = DEFAULTS;

  global.apexMapLabel = apexMapLabel;

  // CommonJS / AMD support (optional)
  if (typeof module !== 'undefined' && module.exports) module.exports = apexMapLabel;
})(typeof window !== 'undefined' ? window : this);
