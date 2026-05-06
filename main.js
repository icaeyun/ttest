/* =========================================================
   상수
   ========================================================= */
const ANNOUNCE_DELAY_MS  = 900;
const DEFAULT_LEVEL      = 3;
const FALLBACK_LAT       = 37.5927;
const FALLBACK_LNG       = 127.0168;
const DRAG_DAMPING       = 0.45;
const POI_SEARCH_RADIUS  = 200;
const POI_NEAR_LIMIT     = 100;   // "앞입니다" 판정 거리 (미터)
const WALK_SPEED_MPM     = 67;

/* ----- 모바일 위치 정확도 관련 ----- */
const ACCURACY_GOOD_M    = 80;     // 80m 이하면 즉시 확정
const LOC_MAX_WAIT_MS    = 25000;  // 최대 25초 대기
const LOC_RETRY_WAIT_MS  = 15000;  // 현재 위치 버튼 재시도 시 최대 대기

const LOC_FALLBACK_MSG =
  '현재 위치를 정확히 확인할 수 없습니다. 브라우저 위치 권한과 정확한 위치 설정을 확인해주세요.';

/* =========================================================
   대표성 점수 테이블
   ---------------------------------------------------------
   점수가 높을수록 대표 장소로 선택될 확률이 높다.
   같은 점수면 거리가 가까운 쪽이 선택된다.
   ========================================================= */
const CHAIN_KEYWORDS = {
  // 편의점 (누구나 아는 랜드마크)
  'GS25': 5, 'CU': 5, '세븐일레븐': 5, '이마트24': 5, '미니스톱': 5,
  // 대형 카페 체인
  '스타벅스': 5, '이디야': 4, '투썸플레이스': 4, '메가커피': 4,
  '빽다방': 4, '컴포즈커피': 4, '할리스': 4, '파스쿠찌': 4,
  // 패스트푸드 / 대형 프랜차이즈
  '맥도날드': 5, '버거킹': 5, '롯데리아': 5, 'KFC': 5,
  '서브웨이': 4, '파리바게뜨': 4, '뚜레쥬르': 4, 'BHC': 3,
  '교촌치킨': 3, 'BBQ': 3,
  // 은행
  '국민은행': 5, '신한은행': 5, '우리은행': 5, '하나은행': 5,
  'NH농협': 4, '기업은행': 4,
  // 생활
  '올리브영': 4, '다이소': 4,
  // 대형마트
  '이마트': 5, '홈플러스': 5, '롯데마트': 5,
};

/** 카테고리 기본 점수 (체인 매칭 안 될 때) */
const CAT_BASE_SCORE = {
  'SW8': 6,   // 지하철역 — 최고 대표성
  'BK9': 3,   // 은행
  'CS2': 3,   // 편의점
  'CE7': 2,   // 카페
  'FD6': 1,   // 음식점
};

/**
 * POI의 대표성 점수를 반환한다.
 */
function getLandmarkScore(poi) {
  if (poi.cat === 'SW8') return 6;

  for (const [keyword, score] of Object.entries(CHAIN_KEYWORDS)) {
    if (poi.name.includes(keyword)) return score;
  }

  return CAT_BASE_SCORE[poi.cat] || 1;
}

/**
 * 100m 이내 POI 중 대표성 점수가 가장 높고,
 * 같은 점수면 가장 가까운 POI 1개를 고른다.
 */
function pickBestPoi(pois) {
  const candidates = pois.filter(p => p.dist < POI_NEAR_LIMIT);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const sa = getLandmarkScore(a);
    const sb = getLandmarkScore(b);
    if (sb !== sa) return sb - sa;   // 점수 높은 순
    return a.dist - b.dist;          // 같으면 가까운 순
  });

  return candidates[0];
}

/* =========================================================
   DOM
   ========================================================= */
const $splash    = document.getElementById('splash');
const $splashTxt = $splash ? $splash.querySelector('.splash-text') : null;
const $splashSub = document.getElementById('splash-sub');
const $app       = document.getElementById('app');
const $mapEl     = document.getElementById('map');
const $pin       = document.getElementById('center-pin');
const $locName   = document.getElementById('location-name');
const $announce  = document.getElementById('announce-region');
const $btnMyLoc  = document.getElementById('btn-my-location');
const $btnConf   = document.getElementById('btn-confirm');
const $rowDest   = document.querySelector('.sheet-row-dest');
const $btnBack   = document.querySelector('.btn-back-floating');

/* =========================================================
   상태
   ========================================================= */
let map         = null;
let geocoder    = null;
let places      = null;
let geoPos      = null;       // { lat, lng, accuracy } | null
let timer       = null;
let dragging    = false;
let lastPtrX    = 0;
let lastPtrY    = 0;
let activePtrId = null;
let requestGen  = 0;

/* boot 직후 announce-region에 표시할 경고 메시지 */
let pendingLocationWarning = null;

/* =========================================================
   음성 안내 (Web Speech API)
   ========================================================= */
let speechUnlocked = false;
let koVoice        = null;

function unlockSpeech() {
  if (speechUnlocked) return;
  speechUnlocked = true;
  const empty = new SpeechSynthesisUtterance('');
  empty.lang   = 'ko-KR';
  empty.volume = 0;
  speechSynthesis.speak(empty);
}

function pickKoreanVoice() {
  if (koVoice) return koVoice;
  const voices = speechSynthesis.getVoices();
  koVoice = voices.find(v => v.lang.startsWith('ko')) || null;
  return koVoice;
}

if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.addEventListener('voiceschanged', () => {
    koVoice = null;
    pickKoreanVoice();
  });
}

function speakText(text) {
  if (!speechUnlocked || !text) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang  = 'ko-KR';
  utt.rate  = 1.05;
  utt.pitch = 1.0;
  const voice = pickKoreanVoice();
  if (voice) utt.voice = voice;
  speechSynthesis.speak(utt);
}

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
   ---------------------------------------------------------
   역지오코딩 1건 + 카테고리 5종 = 총 6건 병렬
   CE7 카페 · CS2 편의점 · FD6 음식점 · SW8 지하철역 · BK9 은행
   ========================================================= */
const SEARCH_CATS = ['CE7', 'CS2', 'FD6', 'SW8', 'BK9'];

function gatherLocationInfo(lat, lng, gen, callback) {
  const pinPos = new kakao.maps.LatLng(lat, lng);
  const info   = { address: null, roadName: null, pois: [] };
  let pending  = 1 + SEARCH_CATS.length;

  function done() {
    if (--pending > 0) return;
    if (gen !== requestGen) return;
    callback(info);
  }

  geocoder.coord2Address(lng, lat, (res, status) => {
    if (status === kakao.maps.services.Status.OK && res.length > 0) {
      const r = res[0];
      info.address  = r.road_address ? r.road_address.address_name
                                     : r.address.address_name;
      info.roadName = r.road_address ? r.road_address.road_name : null;
    }
    done();
  });

  SEARCH_CATS.forEach(cat => {
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
   ---------------------------------------------------------
   ① 대표성 점수 기반 POI 1개 → "○○ 앞입니다."
   ② 대표 POI 없으면 도로명주소 fallback
   ③ 주변 장소 나열 금지
   ④ 거리 + 도보 시간 1문장
   ⑤ 승차 적합성 1문장
   ========================================================= */
function composeAnnouncement(lat, lng, info) {
  const parts = [];
  const mainPoi = pickBestPoi(info.pois);

  /* ① 핀 위치 */
  if (mainPoi) {
    parts.push(`현재 핀 위치는 ${mainPoi.name} 앞입니다.`);
  } else if (info.address) {
    parts.push(`현재 핀 위치는 ${info.address}입니다.`);
  } else {
    parts.push('현재 핀 위치를 확인할 수 없습니다.');
  }

  /* ② 거리 · 도보 시간 */
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

  /* ③ 승차 적합성 */
  if (mainPoi && mainPoi.cat === 'SW8') {
    parts.push('지하철역 앞이라 택시 승차 위치로 적절합니다.');
  } else if (mainPoi) {
    if (info.roadName && info.roadName.includes('대로')) {
      parts.push('대로변이라 택시 승차 위치로 적절합니다.');
    } else if (info.roadName && (/로$/.test(info.roadName) || /로\d/.test(info.roadName))) {
      parts.push('도로변이라 택시 승차 위치로 적절합니다.');
    } else {
      parts.push('주변에서 찾기 쉬운 상점 앞이라 승차 위치로 적절합니다.');
    }
  } else if (info.roadName) {
    if (info.roadName.includes('대로')) {
      parts.push('대로변이라 택시 승차 위치로 적절합니다.');
    } else if (/로$/.test(info.roadName) || /로\d/.test(info.roadName)) {
      parts.push('도로변이라 택시 승차 위치로 적절합니다.');
    } else if (info.roadName.includes('길')) {
      parts.push('골목길 부근이므로 큰 도로 쪽으로 이동하면 승차가 더 편리합니다.');
    }
  }

  return parts.join(' ');
}

/* =========================================================
   하단 UI 갱신 + 음성 안내
   ========================================================= */
function updateUI(lat, lng) {
  requestGen++;
  const gen = requestGen;

  gatherLocationInfo(lat, lng, gen, (info) => {
    if (gen !== requestGen) return;

    const mainPoi = pickBestPoi(info.pois);

    $locName.textContent = mainPoi ? mainPoi.name + ' 앞'
                                   : (info.address || '알 수 없는 위치');

    const text = composeAnnouncement(lat, lng, info);

    /* fallback 경고는 첫 갱신에서 우선 노출하고 큐를 비운다 */
    if (pendingLocationWarning) {
      $announce.classList.add('is-warning');
      $announce.textContent = pendingLocationWarning;
      speakText(pendingLocationWarning);
      pendingLocationWarning = null;
    } else {
      $announce.classList.remove('is-warning');
      $announce.textContent = text;
      speakText(text);
    }
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
   커스텀 드래그
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
    requestGen++;
    speechSynthesis.cancel();

    unlockSpeech();
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
    speechSynthesis.cancel();
    scheduleUpdate();
  });

  updateUI(lat, lng);
}

/* =========================================================
   스플래시 텍스트 갱신 헬퍼
   ========================================================= */
function setSplashText(main, sub) {
  if ($splashTxt) $splashTxt.textContent = main;
  if ($splashSub) {
    if (sub) {
      $splashSub.textContent = sub;
      $splashSub.hidden = false;
    } else {
      $splashSub.hidden = true;
    }
  }
}

/* =========================================================
   위치 획득 (모바일 정확도 개선판)
   ---------------------------------------------------------
   - watchPosition 사용
   - accuracy ≤ 80m 즉시 확정
   - accuracy > 80m 면 splash 메시지를 "정확한 위치를
     다시 잡는 중입니다" 로 갱신, 최대 25초까지 대기
   - 25초 안에 한 번이라도 위치를 받았으면 그 중 가장
     accuracy 가 좋은 좌표를 사용
   - 위치를 단 한 번도 못 받았을 때만 fallback
   - fallback 시 사용자에게 명확히 경고
   ========================================================= */
function acquireLocation() {
  if (!navigator.geolocation) {
    console.warn('[geolocation] navigator.geolocation 사용 불가');
    pendingLocationWarning = LOC_FALLBACK_MSG;
    boot(FALLBACK_LAT, FALLBACK_LNG);
    return;
  }

  let watchId    = null;
  let timeoutId  = null;
  let bestPos    = null;        // 누적된 가장 좋은 위치
  let settled    = false;
  let refining   = false;

  function cleanup() {
    if (watchId !== null) {
      try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
      watchId = null;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function settleWith(pos) {
    if (settled) return;
    settled = true;
    cleanup();

    const lat       = pos.coords.latitude;
    const lng       = pos.coords.longitude;
    const accuracy  = pos.coords.accuracy;

    console.log('[geolocation] 위치 확정', { lat, lng, accuracy });
    geoPos = { lat, lng, accuracy };
    boot(lat, lng);
  }

  function settleFail() {
    if (settled) return;
    settled = true;
    cleanup();

    console.warn('[geolocation] 위치를 한 번도 받지 못함 → fallback 좌표 사용');
    pendingLocationWarning = LOC_FALLBACK_MSG;
    boot(FALLBACK_LAT, FALLBACK_LNG);
  }

  function showRefining() {
    if (refining) return;
    refining = true;
    setSplashText('정확한 위치를 다시 잡는 중입니다',
                  'GPS 신호 보정에 약간의 시간이 걸릴 수 있습니다.');
  }

  function onPos(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    console.log('[geolocation] 위치 수신', {
      lat: latitude, lng: longitude, accuracy
    });

    /* 누적 best 갱신 */
    if (!bestPos || accuracy < bestPos.coords.accuracy) {
      bestPos = pos;
    }

    /* ≤ 80m 면 즉시 확정 */
    if (accuracy <= ACCURACY_GOOD_M) {
      settleWith(bestPos);
      return;
    }

    /* 80m 초과 → 보정 메시지 노출 후 계속 대기 */
    showRefining();
  }

  function onErr(err) {
    /* 권한/사용불가/타임아웃을 명확히 분기해서 console.warn 출력 */
    if (err && err.code === err.PERMISSION_DENIED) {
      console.warn('[geolocation] 위치 권한 거부됨', err.message || '');
      /* 권한 거부는 회복 불가 → 즉시 실패 처리 */
      settleFail();
      return;
    }
    if (err && err.code === err.POSITION_UNAVAILABLE) {
      console.warn('[geolocation] 위치 사용 불가', err.message || '');
    } else if (err && err.code === err.TIMEOUT) {
      console.warn('[geolocation] 위치 timeout', err.message || '');
    } else {
      console.warn('[geolocation] 알 수 없는 위치 오류', err);
    }

    /* 그 외 일시 오류는 그동안 받은 best 가 있으면 그것으로,
       없으면 timeoutId 가 처리하도록 둠 */
    if (bestPos) {
      settleWith(bestPos);
    }
  }

  /* watchPosition 시작 */
  try {
    watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      timeout: LOC_MAX_WAIT_MS,
      maximumAge: 0,
    });
  } catch (e) {
    console.warn('[geolocation] watchPosition 호출 실패', e);
    settleFail();
    return;
  }

  /* 25초 상한 */
  timeoutId = setTimeout(() => {
    if (settled) return;
    if (bestPos) {
      console.log('[geolocation] 시간 초과 → 그동안 수신된 가장 좋은 좌표 사용', {
        accuracy: bestPos.coords.accuracy,
      });
      settleWith(bestPos);
    } else {
      console.warn('[geolocation] 시간 초과 → 위치 한 번도 못 받음');
      settleFail();
    }
  }, LOC_MAX_WAIT_MS);
}

/* =========================================================
   현재 위치 버튼 재시도 로직
   ---------------------------------------------------------
   geoPos 가 없을 때 조용히 return 하지 않고
   짧은 watchPosition 재시도 → 성공하면 지도 중심 이동,
   실패하면 사용자에게 권한 안내 메시지를 표시
   ========================================================= */
function retryLocationOnce() {
  if (!navigator.geolocation) {
    $announce.classList.add('is-warning');
    $announce.textContent = '이 브라우저에서는 위치 기능을 사용할 수 없습니다.';
    return;
  }

  $announce.classList.remove('is-warning');
  $announce.textContent = '현재 위치를 다시 확인하고 있습니다…';

  let watchId   = null;
  let timeoutId = null;
  let bestPos   = null;
  let done      = false;

  function cleanup() {
    if (watchId !== null) {
      try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
      watchId = null;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function succeed(pos) {
    if (done) return;
    done = true;
    cleanup();

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    console.log('[my-location 재시도] 성공', { lat, lng, accuracy });

    geoPos = { lat, lng, accuracy };
    if (map) {
      map.setCenter(new kakao.maps.LatLng(lat, lng));
      scheduleUpdate();
    }
  }

  function fail(message) {
    if (done) return;
    done = true;
    cleanup();
    const msg = message || LOC_FALLBACK_MSG;
    $announce.classList.add('is-warning');
    $announce.textContent = msg;
    speakText(msg);
  }

  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        console.log('[my-location 재시도] 위치 수신', {
          lat: latitude, lng: longitude, accuracy
        });
        if (!bestPos || accuracy < bestPos.coords.accuracy) bestPos = pos;
        if (accuracy <= ACCURACY_GOOD_M) succeed(bestPos);
      },
      (err) => {
        if (err && err.code === err.PERMISSION_DENIED) {
          console.warn('[my-location 재시도] 권한 거부됨');
          fail('위치 권한이 거부되어 현재 위치를 사용할 수 없습니다. 브라우저 위치 권한을 허용해주세요.');
          return;
        }
        if (err && err.code === err.POSITION_UNAVAILABLE) {
          console.warn('[my-location 재시도] 위치 사용 불가');
        } else if (err && err.code === err.TIMEOUT) {
          console.warn('[my-location 재시도] timeout');
        } else {
          console.warn('[my-location 재시도] 알 수 없는 오류', err);
        }
        if (bestPos) succeed(bestPos);
      },
      {
        enableHighAccuracy: true,
        timeout: LOC_RETRY_WAIT_MS,
        maximumAge: 0,
      }
    );
  } catch (e) {
    console.warn('[my-location 재시도] watchPosition 호출 실패', e);
    fail();
    return;
  }

  timeoutId = setTimeout(() => {
    if (done) return;
    if (bestPos) succeed(bestPos);
    else fail();
  }, LOC_RETRY_WAIT_MS);
}

/* =========================================================
   부팅
   ========================================================= */
function boot(lat, lng) {
  $splash.classList.add('fade-out');
  $app.classList.remove('hidden');
  requestAnimationFrame(() => initMap(lat, lng));
  setTimeout(() => {
    if ($splash && $splash.parentNode) $splash.remove();
  }, 500);
}

/* =========================================================
   이벤트 바인딩
   ========================================================= */
function bind() {
  /* 현재 위치 버튼 */
  $btnMyLoc.addEventListener('click', () => {
    unlockSpeech();
    if (!map) return;

    if (!geoPos) {
      /* 조용히 return 하지 말고 재시도 */
      console.log('[my-location] geoPos 없음 → 재시도 시작');
      retryLocationOnce();
      return;
    }
    speechSynthesis.cancel();
    map.setCenter(new kakao.maps.LatLng(geoPos.lat, geoPos.lng));
    scheduleUpdate();
  });

  /* 여기서 출발 */
  $btnConf.addEventListener('click', () => {
    unlockSpeech();
    if (!map) return;
    const ctr = map.getCenter();
    const lat = ctr.getLat();
    const lng = ctr.getLng();

    requestGen++;
    const gen = requestGen;
    gatherLocationInfo(lat, lng, gen, (info) => {
      if (gen !== requestGen) return;
      const mainPoi = pickBestPoi(info.pois);
      const name = mainPoi ? mainPoi.name + ' 앞' : (info.address || '선택한 위치');

      const msg = `출발지가 ${name}(으)로 설정되었습니다.`;
      $announce.classList.remove('is-warning');
      $announce.textContent = msg;
      speakText(msg);
      console.log('[출발지 확정]', { lat, lng, name });
    });
  });

  /* 어디로 갈까요? 행 (현재는 placeholder 동작) */
  if ($rowDest) {
    const onDestActivate = () => {
      unlockSpeech();
      const msg = '목적지 입력 화면은 곧 제공됩니다.';
      $announce.classList.remove('is-warning');
      $announce.textContent = msg;
      speakText(msg);
    };
    $rowDest.addEventListener('click', onDestActivate);
    $rowDest.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onDestActivate();
      }
    });
  }

  /* 뒤로가기 (history back; 없으면 무동작) */
  if ($btnBack) {
    $btnBack.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back();
    });
  }

  document.addEventListener('click', unlockSpeech, { once: true });
  document.addEventListener('touchstart', unlockSpeech, { once: true });
}

/* =========================================================
   시작
   ========================================================= */
function showKakaoLoadError() {
  const origin = window.location.origin;
  $splash.classList.add('fade-out');
  $app.classList.remove('hidden');
  $locName.textContent = '지도를 불러오지 못했습니다';
  $announce.classList.add('is-warning');
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
