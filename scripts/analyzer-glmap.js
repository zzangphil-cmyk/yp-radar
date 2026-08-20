/*yp-gl*/
// 분석기의 SVG 지도(spatialMap/regionalSpatialMap)를 실제 지도(MapLibre) 위 레이어로 교체한다.
// 생활권/시군구 단위·급지 색·드릴다운·단지 마커는 그대로 두고, 바닥에 Carto 다크 베이스맵을 깐다.
// 원본 스크립트가 클래식 스크립트라 그 전역(DATA, metric, zone, render 등)을 그대로 쓴다.
(function () {
  var GL = null, map = null, mapReady = false, pending = null, wired = false;

  var STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
  var SRC_Z = "ypZones", SRC_M = "ypMarks", SRC_L = "ypLabels";

  // maplibre는 ESM이라 동적 import. 워커는 같은 출처(public/maplibre)에서 받는다.
  import("/maplibre/maplibre-gl.mjs").then(function (m) {
    GL = m.default || m;
    try { if (!GL.getWorkerUrl()) GL.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); } catch (e) {}
    if (pending) { var p = pending; pending = null; draw(p); }
  }).catch(function (e) { console.error("maplibre 로드 실패", e); });

  function bboxOf(features) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    features.forEach(function (f) {
      collectPoints(f.geometry.coordinates, []).forEach(function (p) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      });
    });
    return [[minX, minY], [maxX, maxY]];
  }

  function centroid(f) {
    var ps = collectPoints(f.geometry.coordinates, []);
    var x = 0, y = 0;
    ps.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / ps.length, y / ps.length];
  }

  // 이름별로 가장 큰 조각 하나에만 라벨을 찍는다(섬·분리 구역 중복 방지)
  function labelPoints(features) {
    var best = {};
    features.forEach(function (f) {
      var name = f.properties._label;
      if (!name) return;
      var n = collectPoints(f.geometry.coordinates, []).length;
      if (!best[name] || n > best[name].n) best[name] = { n: n, f: f };
    });
    return {
      type: "FeatureCollection",
      features: Object.keys(best).map(function (name) {
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: centroid(best[name].f) },
          properties: { _label: name },
        };
      }),
    };
  }

  // 베이스맵 지명을 한글로
  function koreanLabels() {
    (map.getStyle().layers || []).forEach(function (l) {
      if (l.type !== "symbol") return;
      try {
        if (!map.getLayoutProperty(l.id, "text-field")) return;
        map.setLayoutProperty(l.id, "text-field",
          ["coalesce", ["get", "name:ko"], ["get", "name_ko"], ["get", "name"]]);
      } catch (e) {}
    });
  }

  function ensureContainer() {
    var host = document.getElementById("map");
    if (!host) return null;
    var el = document.getElementById("ypGl");
    if (!el || !host.contains(el)) {
      host.className = "map spatial";
      host.innerHTML = '<div id="ypGl" style="position:absolute;inset:0"></div>' +
                       '<div class="map-foot" id="ypGlFoot"></div>';
      el = document.getElementById("ypGl");
      map = null; mapReady = false; wired = false;
    }
    return el;
  }

  function setFoot(text) {
    var f = document.getElementById("ypGlFoot");
    if (f) f.textContent = text;
  }

  function draw(opts) {
    if (!GL) { pending = opts; return; }
    var el = ensureContainer();
    if (!el) return;
    setFoot(opts.foot || "");

    var fc = { type: "FeatureCollection", features: opts.features };
    var bounds = bboxOf(opts.features);

    if (!map) {
      map = new GL.Map({
        container: el,
        style: STYLE,
        bounds: bounds,
        fitBoundsOptions: { padding: 28, animate: false },
        attributionControl: false,
        dragRotate: false,
        maxZoom: 15,
      });
      map.on("load", function () {
        mapReady = true;
        koreanLabels();
        apply(fcRef, optsRef, boundsRef);
      });
    }
    // 최신 상태를 클로저 밖에 보관 (load 이후에도 정확한 데이터를 그리도록)
    fcRef = fc; optsRef = opts; boundsRef = bounds;
    if (mapReady) apply(fc, opts, bounds);
  }

  var fcRef = null, optsRef = null, boundsRef = null;

  function apply(fc, opts, bounds) {
    // 1) 구역 폴리곤
    if (!map.getSource(SRC_Z)) {
      map.addSource(SRC_Z, { type: "geojson", data: fc });
      var beforeId = (map.getStyle().layers || []).filter(function (l) { return l.type === "symbol"; })[0];
      beforeId = beforeId && beforeId.id;
      map.addLayer({
        id: SRC_Z + "-fill", type: "fill", source: SRC_Z,
        paint: {
          "fill-color": ["get", "_c"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.92, 0.74],
        },
      }, beforeId);
      map.addLayer({
        id: SRC_Z + "-line", type: "line", source: SRC_Z,
        paint: { "line-color": "rgba(8,8,11,.55)", "line-width": 0.8 },
      }, beforeId);
    } else {
      map.getSource(SRC_Z).setData(fc);
    }

    // 라벨은 별도 포인트 소스 — 한 구역이 여러 폴리곤(섬 등)으로 나뉘어도 이름은 하나만
    var labels = labelPoints(fc.features);
    if (!map.getSource(SRC_L)) {
      map.addSource(SRC_L, { type: "geojson", data: labels });
      map.addLayer({
        id: SRC_L + "-text", type: "symbol", source: SRC_L,
        layout: {
          "text-field": ["get", "_label"],
          "text-size": 12,
          "text-font": ["Open Sans Bold", "Noto Sans Bold"],
          "text-allow-overlap": false,
        },
        paint: { "text-color": "#eceef2", "text-halo-color": "rgba(8,8,11,.92)", "text-halo-width": 1.6 },
      });
    } else {
      map.getSource(SRC_L).setData(labels);
    }
    map.setLayoutProperty(SRC_L + "-text", "visibility", opts.showLabels ? "visible" : "none");

    // 2) 단지 마커
    var marks = { type: "FeatureCollection", features: opts.markers || [] };
    if (!map.getSource(SRC_M)) {
      map.addSource(SRC_M, { type: "geojson", data: marks });
      map.addLayer({
        id: SRC_M + "-dot", type: "circle", source: SRC_M,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "_r"], 3, 4, 12, 10],
          "circle-color": ["get", "_c"],
          "circle-stroke-color": "rgba(236,238,242,.75)",
          "circle-stroke-width": 1.2,
          "circle-opacity": 0.95,
        },
      });
    } else {
      map.getSource(SRC_M).setData(marks);
    }

    // 3) 상호작용 (한 번만)
    if (!wired) {
      wired = true;
      map.on("click", SRC_Z + "-fill", function (e) {
        var p = e.features && e.features[0] && e.features[0].properties;
        if (p && optsRef && optsRef.onPick) optsRef.onPick(p);
      });
      map.on("click", SRC_M + "-dot", function (e) {
        var p = e.features && e.features[0] && e.features[0].properties;
        if (!p) return;
        selectedComplex = DATA.zone_assignment.find(function (d) { return d.complex_id === p._id; });
        render();
      });
      var hoverId = null;
      map.on("mousemove", SRC_Z + "-fill", function (e) {
        map.getCanvas().style.cursor = "pointer";
        if (!e.features.length) return;
        if (hoverId !== null) map.setFeatureState({ source: SRC_Z, id: hoverId }, { hover: false });
        hoverId = e.features[0].id;
        if (hoverId !== undefined) map.setFeatureState({ source: SRC_Z, id: hoverId }, { hover: true });
      });
      map.on("mouseleave", SRC_Z + "-fill", function () {
        map.getCanvas().style.cursor = "";
        if (hoverId !== null) map.setFeatureState({ source: SRC_Z, id: hoverId }, { hover: false });
        hoverId = null;
      });
    }

    // 4) 현재 범위로 이동
    map.fitBounds(bounds, { padding: 28, animate: false, maxZoom: 14 });
  }

  // ── 원본 함수 교체 ────────────────────────────────────────────────────────
  spatialMap = function () {
    var features = DATA.geojson.features.filter(function (f) {
      var p = f.properties;
      return (!region || p.planning_region === region) && (!gu || p.sigungu === gu) &&
             (!zone || p.official_living_zone === zone);
    });
    if (!features.length) return;

    var counts = features.map(function (f) {
      return Number((zoneSummary(f.properties) || {}).complex_count_200_plus || 0);
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));
    var vals = features.map(function (f) { return metricValue(f.properties); }).filter(Number.isFinite);
    var minM = Math.min.apply(null, vals), maxM = Math.max.apply(null, vals);

    var out = features.map(function (f, i) {
      var p = f.properties;
      var fill = metric === "grade" ? gradeColor(zoneGrade(p))
        : (metric === "planning" || zone) ? COLORS[p.planning_region]
        : heatColor(metricValue(p), minM, maxM);
      return {
        type: "Feature", id: i, geometry: f.geometry,
        properties: {
          _c: fill,
          _label: p.official_living_zone,
          _region: p.planning_region, _gu: p.sigungu, _zone: p.official_living_zone,
        },
      };
    });

    var markers = [];
    if (zone) {
      DATA.zone_assignment.filter(function (d) {
        return d.sigungu === gu && d.official_living_zone === zone;
      }).forEach(function (d) {
        var lng = Number(d.longitude), lat = Number(d.latitude);
        if (!isFinite(lng) || !isFinite(lat)) return;
        var cg = DATA.complex_grade.find(function (x) { return x.complex_id === d.complex_id; });
        markers.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            _id: d.complex_id,
            _r: Math.max(3, Math.min(12, 3 + Math.sqrt(Number(d.households) || 0) / 10)),
            _c: metric === "grade" ? gradeColor(cg ? Number(cg.provisional_grade) : null) : "#f4e3b0",
          },
        });
      });
    }

    draw({
      features: out, markers: markers, showLabels: !!gu,
      foot: zone ? "점 크기: 세대수 · 단지를 누르면 상세"
                 : "경계를 누르면 생활권 상세 · 색은 예비급지",
      onPick: function (p) {
        region = p._region; gu = p._gu; zone = p._zone; selectedComplex = null; render();
      },
    });
    void maxCount;
  };

  regionalSpatialMap = function () {
    var features = DATA.sigungu_geojson.features.filter(function (f) {
      return f.properties.metro_area === metro;
    });
    if (!features.length) return;
    var out = features.map(function (f, i) {
      var p = f.properties;
      return {
        type: "Feature", id: i, geometry: f.geometry,
        properties: { _c: gradeColor(guMedianGrade(p.sigungu)), _label: p.sigungu, _gu: p.sigungu },
      };
    });
    $("#viewTitle").textContent = metro + " 시군구 실거래 분석";
    $("#viewMeta").textContent = features.length + "개 시군구 · 예비급지 기준 색상";
    draw({
      features: out, markers: [], showLabels: true,
      foot: "색은 예비급지(밝을수록 상급지) · 시군구를 누르면 상세",
      onPick: function (p) { region = metro; gu = p._gu; zone = null; selectedComplex = null; render(); },
    });
  };

  // 교체 후 한 번 다시 그린다
  if (typeof render === "function") render();
})();
