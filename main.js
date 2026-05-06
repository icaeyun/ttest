/* =========================================================
   상수
   ========================================================= */
const ANNOUNCE_DELAY_MS  = 900;
const DEFAULT_LEVEL      = 3;
const FALLBACK_LAT       = 37.5927;
const FALLBACK_LNG       = 127.0168;
const DRAG_DAMPING       = 0.45;
const POI_SEARCH_RADIUS  = 200;   // 주변 POI 검색 반경 (미터)
const WALK_SPEED_MPM     = 67;    // 도보 속도 약 67m/분 (≈4km/h)

/* =========================================================
   DOM
   ========================================================= */
const $splash   = document.getElementById('splash');
const $app      = document.getElementById('app');
const $mapEl    = document.getElementById('map');
const $pin      = document.getElementById('center-pin');
const $locName  = document.getElementById('location-name');
const $announce = document.getElementById('announce-region');
const $btnMyLoc = document.getElementById('btn-my-location');
const $btnConf  = document.getElementById('btn-confirm');

/* =========================================================
   상태
   ========================================================= */
let map         = null;
let geocoder    = null;
let places      = null;
let geoPos      = null;
let timer       = null;
let dragging    = false;
let lastPtrX    = 0;
let lastPtrY    = 0;
let activePtrId = null;
let requestGen  = 0;      // 비동기 요청 세대 (stale 결과 무시)

/* =========================================================
   유틸
   ========================================================= */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* =========================================================
   주변 정보 수집
   - 역지오코딩 (주소)
   - 카테고리 검색 3종 (카페·편의점·음식점)
   총 4개 비동기 요청을 병렬 실행 후 합산
   ========================================================= */
function gatherLocationInfo(lat, lng, gen, callback) {
  const pinPos = new kakao.maps.LatLng(lat, lng);
  const info   = { address: null, roadName: null, pois: [] };
  let pending  = 4;

  function done() {
    if (--pending > 0) return;
    if (gen !== requestGen) return;   // 이미 새 요청이 발생 → 무시
    callback(info);
  }

  /* 1) 역지오코딩 */
  geocoder.coord2Address(lng, lat, (res, status) => {
    if (status === kakao.maps.services.Status.OK && res.length > 0) {
      const r = res[0];
      info.address  = r.road_address ? r.road_address.address_name
                                     : r.address.address_name;
      info.roadName = r.road_address ? r.road_address.road_name : null;
    }
    done();
  });

  /* 2-4) 카테고리 검색: CE7 카페, CS2 편의점, FD6 음식점 */
  ['CE7', 'CS2', 'FD6'].forEach(cat => {
    places.categorySearch(cat, (data, status) => {
      if (status === kakao.maps.services.Status.OK && data) {
        data.slice(0, 5).forEach(p => {
          info.pois.push({
            name: p.place_name,
            dist: haversine(lat, lng, parseFloat(p.y), parseFloat(p.x)),
            cat: cat,
          });
        });
      }
      done();
    }, {
      location: pinPos,
      radius: POI_SEARCH_RADIUS,
      sort: kakao.maps.services.SortBy.DISTANCE,
    });
  });
}

/* =========================================================
   안내문 조합
   ========================================================= */
function composeAnnouncement(lat, lng, info) {
  const parts = [];

  /* --- ① 핀 위치 설명 --- */
  // POI 중 가장 가까운 곳을 대표 지점으로 사용
  info.pois.sort((a, b) => a.dist - b.dist);
  const mainPoi = info.pois.length > 0 && info.pois[0].dist < 100
                  ? info.pois[0] : null;

  if (mainPoi) {
    parts.push(`현재 핀 위치는 ${mainPoi.name} 앞입니다.`);
  } else if (info.address) {
    parts.push(`현재 핀 위치는 ${info.address}입니다.`);
  } else {
    parts.push('현재 핀 위치를 확인할 수 없습니다.');
  }

  /* --- ② 사용자 현재 위치와의 거리 / 도보 시간 --- */
  if (geoPos) {
    const dist    = haversine(geoPos.lat, geoPos.lng, lat, lng);
    const meters  = Math.round(dist);
    const walkMin = Math.max(1, Math.round(dist / WALK_SPEED_MPM));

    if (meters < 20) {
      parts.push('현재 위치 바로 근처입니다.');
    } else {
      parts.push(`현재 위치에서 약 ${meters}미터, 도보 ${walkMin}분 거리입니다.`);
    }
  }

  /* --- ③ 주변 시설 안내 --- */
  const usedName = mainPoi ? mainPoi.name : null;
  const nearby = info.pois
    .filter(p => p.name !== usedName && p.dist <= POI_SEARCH_RADIUS)
    .reduce((acc, p) => {
      // 이름 중복 제거
      if (!acc.find(x => x.name === p.name)) acc.push(p);
      return acc;
    }, [])
    .slice(0, 3);

  if (nearby.length === 1) {
    parts.push(`주변에 ${nearby[0].name}이(가) 있습니다.`);
  } else if (nearby.length === 2) {
    parts.push(`주변에 ${nearby[0].name}와(과) ${nearby[1].name}이(가) 있습니다.`);
  } else if (nearby.length >= 3) {
    const names = nearby.map(p => p.name);
    parts.push(`주변에 ${names[0]}, ${names[1]}, ${names[2]} 등이 있습니다.`);
  }

  /* --- ④ 승차 적합성 판단 --- */
  if (info.roadName) {
    if (info.roadName.includes('대로')) {
      parts.push('대로변이라 택시 승차 위치로 적절합니다.');
    } else if (/로$/.test(info.roadName) || /로\d/.test(info.roadName)) {
      // "~로" 또는 "~로34" 형태 → 일반 도로
      parts.push('도로변이라 택시 승차 위치로 적절합니다.');
    } else if (info.roadName.includes('길')) {
      parts.push('골목길 부근이므로 큰 도로 쪽으로 이동하면 승차가 더 편리합니다.');
    }
  }

  return parts.join(' ');
}

/* =========================================================
   하단 UI 갱신
   ========================================================= */
function updateUI(lat, lng) {
  requestGen++;
  const gen = requestGen;

  gatherLocationInfo(lat, lng, gen, (info) => {
    if (gen !== requestGen) return;

    /* 헤더 (location-name) */
    info.pois.sort((a, b) => a.dist - b.dist);
    const mainPoi = info.pois.length > 0 && info.pois[0].dist < 100
                    ? info.pois[0] : null;
    $locName.textContent = mainPoi ? mainPoi.name + ' 앞'
                                   : (info.address || '알 수 없는 위치');

    /* 안내문 */
    $announce.textContent = composeAnnouncement(lat, lng, info);
  });
}

/* =========================================================
   debounce (900ms)
   ========================================================= */
function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!map) return;
    const ctr = map.getCenter();
    updateUI(ctr.getLat(), ctr.getLng());
  }, ANNOUNCE_DELAY_MS);
}

/* =========================================================
   커스텀 드래그 (뻑뻑한 느낌)
   ========================================================= */
function setupCustomDrag() {
  map.setDraggable(false);

  $mapEl.addEventListener('pointerdown', (e) => {
    if (activePtrId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    activePtrId = e.pointerId;
    dragging = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;

    try { $mapEl.setPointerCapture(e.pointerId); } catch (_) {}

    $pin.classList.add('lifting');
    clearTimeout(timer);
    requestGen++;             // 진행 중인 비동기 결과 무효화
  });

  $mapEl.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePtrId) return;

    const dx = e.clientX - lastPtrX;
    const dy = e.clientY - lastPtrY;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    const proj   = map.getProjection();
    const center = map.getCenter();
    const cp     = proj.containerPointFromCoords(center);
    const np     = new kakao.maps.Point(
      cp.x - dx * DRAG_DAMPING,
      cp.y - dy * DRAG_DAMPING
    );
    const nc = proj.coordsFromContainerPoint(np);
    map.setCenter(nc);
  });

  function endDrag(e) {
    if (e.pointerId !== activePtrId) return;
    activePtrId = null;
    dragging = false;
    $pin.classList.remove('lifting');
    try { $mapEl.releasePointerCapture(e.pointerId); } catch (_) {}
    scheduleUpdate();
  }

  $mapEl.addEventListener('pointerup', endDrag);
  $mapEl.addEventListener('pointercancel', endDrag);

  $mapEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) e.preventDefault();
  }, { passive: false });
}

/* =========================================================
   지도 초기화
   ========================================================= */
function initMap(lat, lng) {
  const center = new kakao.maps.LatLng(lat, lng);

  map = new kakao.maps.Map($mapEl, {
    center: center,
    level: DEFAULT_LEVEL,
  });

  geocoder = new kakao.maps.services.Geocoder();
  places   = new kakao.maps.services.Places();

  setupCustomDrag();

  kakao.maps.event.addListener(map, 'zoom_changed', () => {
    clearTimeout(timer);
    scheduleUpdate();
  });

  updateUI(lat, lng);
}

/* =========================================================
   위치 획득
   ========================================================= */
function acquireLocation() {
  if (!navigator.geolocation) {
    boot(FALLBACK_LAT, FALLBACK_LNG);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      geoPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      boot(geoPos.lat, geoPos.lng);
    },
    () => boot(FALLBACK_LAT, FALLBACK_LNG),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

/* =========================================================
   부팅
   ========================================================= */
function boot(lat, lng) {
  $splash.classList.add('fade-out');
  $app.classList.remove('hidden');
  requestAnimationFrame(() => initMap(lat, lng));
  setTimeout(() => $splash.remove(), 500);
}

/* =========================================================
   이벤트 바인딩
   ========================================================= */
function bind() {
  $btnMyLoc.addEventListener('click', () => {
    if (!geoPos || !map) return;
    map.setCenter(new kakao.maps.LatLng(geoPos.lat, geoPos.lng));
    scheduleUpdate();
  });

  $btnConf.addEventListener('click', () => {
    if (!map) return;
    const ctr = map.getCenter();
    const lat = ctr.getLat();
    const lng = ctr.getLng();

    // 확정 시에도 풍부한 안내
    requestGen++;
    const gen = requestGen;
    gatherLocationInfo(lat, lng, gen, (info) => {
      if (gen !== requestGen) return;
      info.pois.sort((a, b) => a.dist - b.dist);
      const mainPoi = info.pois.length > 0 && info.pois[0].dist < 100
                      ? info.pois[0] : null;
      const name = mainPoi ? mainPoi.name + ' 앞' : (info.address || '선택한 위치');

      $announce.textContent = `출발지가 ${name}(으)로 설정되었습니다.`;
      console.log('[출발지 확정]', { lat, lng, name });
    });
  });
}

/* =========================================================
   시작
   ========================================================= */
function showKakaoLoadError() {
  const origin = window.location.origin;
  $splash.classList.add('fade-out');
  $app.classList.remove('hidden');
  $locName.textContent = '지도를 불러오지 못했습니다';
  $announce.textContent =
    `카카오맵 SDK가 로드되지 않았습니다. 현재 접속 주소는 ${origin} 입니다. 이 주소가 Kakao Developers의 JavaScript SDK 도메인에 등록되어 있는지 확인하세요.`;
  setTimeout(() => {
    if ($splash && $splash.parentNode) $splash.remove();
  }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  bind();

  if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
    window.kakao.maps.load(() => {
      acquireLocation();
    });
  } else {
    showKakaoLoadError();
  }
});