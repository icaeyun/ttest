/* =========================================================
   상수
   ========================================================= */
const ANNOUNCE_DELAY_MS  = 900;
const DEFAULT_LEVEL      = 3;
const FALLBACK_LAT       = 37.5927;
const FALLBACK_LNG       = 127.0168;
const DRAG_DAMPING       = 0.45;
const POI_SEARCH_RADIUS  = 130;   // 대표 지점 검색 반경: 너무 먼 대표 장소 방지
const POI_NEAR_LIMIT     = 65;    // "앞입니다" 판정 거리: 기존 100m → 더 촘촘하게
const WALK_SPEED_MPM     = 67;

/* ----- 모바일 위치 정확도 관련 ----- */
const ACCURACY_GOOD_M    = 60;     // 60m 이하면 즉시 확정
const LOC_MAX_WAIT_MS    = 30000;  // 모바일 GPS 보정 최대 30초 대기
const LOC_RETRY_WAIT_MS  = 18000;  // 현재 위치 버튼 재시도 시 최대 대기

const LOC_FALLBACK_MSG =
  '현재 위치를 정확히 확인할 수 없습니다. 브라우저 위치 권한과 정확한 위치 설정을 확인해주세요.';

const LOC_PERMISSION_MSG =
  '브라우저 위치 권한이 필요합니다. 아래 버튼을 눌러 위치 사용을 허용해주세요.';

/* =========================================================
   대표성 점수 테이블
   ---------------------------------------------------------
   너무 먼 유명 장소가 계속 잡히지 않도록
   ① 거리 구간을 먼저 나누고
   ② 같은 거리 구간 안에서 대표성 점수로 고른다.
   ========================================================= */
const DETAIL_KEYWORDS = [
  '입구', '출입구', '정문', '후문', '동문', '서문', '남문', '북문',
  '주차장', '주차장입구', '주차장 입구', '게이트', 'Gate', 'GATE',
  '1동', '2동', '3동', '4동', '5동', '본관', '별관', '상가'
];

const BIG_PLACE_KEYWORDS = [
  '대학교', '대학', '고등학교', '중학교', '초등학교', '학교',
  '병원', '청사', '구청', '시청', '도서관', '공원', '아파트', '단지'
];

const CHAIN_KEYWORDS = {
  // 편의점: 세부 위치 안내에 가장 유용함
  'GS25': 6, 'CU': 6, '세븐일레븐': 6, '이마트24': 6, '미니스톱': 6,
  // 카페/상점
  '스타벅스': 5, '이디야': 5, '투썸플레이스': 5, '메가커피': 5,
  '빽다방': 5, '컴포즈커피': 5, '할리스': 4, '파스쿠찌': 4,
  '올리브영': 5, '다이소': 5,
  // 패스트푸드 / 프랜차이즈
  '맥도날드': 5, '버거킹': 5, '롯데리아': 5, 'KFC': 5,
  '서브웨이': 4, '파리바게뜨': 4, '뚜레쥬르': 4, 'BHC': 3,
  '교촌치킨': 3, 'BBQ': 3,
  // 은행
  '국민은행': 4, '신한은행': 4, '우리은행': 4, '하나은행': 4,
  'NH농협': 4, '기업은행': 4,
  // 마트
  '이마트': 4, '홈플러스': 4, '롯데마트': 4,
};

/** 카테고리 기본 점수 (체인 매칭 안 될 때) */
const CAT_BASE_SCORE = {
  'CS2': 5,   // 편의점
  'CE7': 4,   // 카페
  'MT1': 4,   // 마트
  'PK6': 4,   // 주차장
  'BK9': 3,   // 은행
  'FD6': 3,   // 음식점
  'PM9': 3,   // 약국
  'SW8': 3,   // 지하철역: 너무 멀리 잡히지 않도록 낮춤
  'PO3': 2,   // 공공기관
  'SC4': 1,   // 학교: 세부 입구/동이 아니면 대표성 낮춤
};

function hasAnyKeyword(name, keywords) {
  return keywords.some(keyword => name.includes(keyword));
}

/**
 * POI의 대표성 점수를 반환한다.
 * 세부 지점(입구/정문/후문/주차장/동/상가)은 가산하고,
 * 큰 건물명만 있는 POI는 핀과 아주 가깝지 않으면 감점한다.
 */
function getLandmarkScore(poi) {
  let score = CAT_BASE_SCORE[poi.cat] || 1;

  for (const [keyword, chainScore] of Object.entries(CHAIN_KEYWORDS)) {
    if (poi.name.includes(keyword)) {
      score = Math.max(score, chainScore);
    }
  }

  if (hasAnyKeyword(poi.name, DETAIL_KEYWORDS) || poi.source === 'keyword') {
    score += 4;
  }

  if (hasAnyKeyword(poi.name, BIG_PLACE_KEYWORDS) && !hasAnyKeyword(poi.name, DETAIL_KEYWORDS)) {
    score -= poi.dist <= 25 ? 1 : 4;
  }

  // 핀과 25m 이내인 장소는 실제 위치 설명에 유리하므로 보정
  if (poi.dist <= 25) score += 2;
  else if (poi.dist <= 45) score += 1;

  return score;
}

function getDistanceBucket(dist) {
  if (dist <= 25) return 0;  // 바로 앞
  if (dist <= 45) return 1;  // 가까운 세부 지점
  if (dist <= POI_NEAR_LIMIT) return 2;
  return 3;
}

/**
 * 가까운 거리 구간을 먼저 고르고, 같은 구간 안에서 대표성을 비교한다.
 * 이렇게 해야 80~100m 떨어진 대형 건물 하나가 계속 안내되는 문제를 줄일 수 있다.
 */
function pickBestPoi(pois) {
  const candidates = pois.filter(p => p.dist <= POI_NEAR_LIMIT);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ba = getDistanceBucket(a.dist);
    const bb = getDistanceBucket(b.dist);
    if (ba !== bb) return ba - bb;       // 가까운 거리 구간 우선

    const sa = getLandmarkScore(a);
    const sb = getLandmarkScore(b);
    if (sb !== sa) return sb - sa;       // 같은 구간이면 대표성 높은 순

    return a.dist - b.dist;              // 최종적으로 가까운 순
  });

  return candidates[0];
}

/* =========================================================
   DOM
   ========================================================= */
const $splash    = document.getElementById('splash');
const $splashTxt = $splash ? $splash.querySelector('.splash-text') : null;
const $splashSub = document.getElementById('splash-sub');
const $splashActions = document.getElementById('splash-actions');
const $splashSpinner = document.getElementById('splash-spinner');
const $btnGrantLoc = document.getElementById('btn-grant-location');
const $btnSkipLoc  = document.getElementById('btn-skip-location');
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
let locationRequestRunning = false;
let locationBooted = false;

/* iOS 계열 브라우저/앱: 위치 권한/지도 진입 전 1회 터치로 음성 엔진을 조용히 언락 */
let voiceGatePassed = false;
let voiceGateOpening = false;

/* boot 직후 announce-region에 표시할 경고 메시지 */
let pendingLocationWarning = null;

/* =========================================================
   음성 안내 (Web Speech API)
   ---------------------------------------------------------
   원래처럼 지도 드래그/버튼 터치 후 하단 안내문을
   앱 자체 음성으로 읽어주도록 복구한다.
   - 위치/POI/핀 로직은 건드리지 않음
   - Safari/Chrome/Google 앱에서 speechSynthesis가 멈춰 있을 때
     resume → cancel → speak 순서로 다시 실행
   ========================================================= */
let speechUnlocked    = false;
let koVoice           = null;
let pendingSpeechText = '';
let speechSeq         = 0;

function hasSpeechSupport() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function safeCancelSpeech() {
  if (!hasSpeechSupport()) return;
  try { window.speechSynthesis.cancel(); } catch (_) {}
}

function resumeSpeechEngine() {
  if (!hasSpeechSupport()) return;
  try { window.speechSynthesis.resume(); } catch (_) {}
}

function unlockSpeech() {
  if (!hasSpeechSupport()) return;

  resumeSpeechEngine();

  if (!speechUnlocked) {
    speechUnlocked = true;

    // iOS/Safari 계열은 첫 사용자 제스처 안에서 speak가 한 번 호출되어야
    // 이후 안내문 읽기가 안정적으로 동작한다.
    try {
      const empty = new SpeechSynthesisUtterance(' ');
      empty.lang = 'ko-KR';
      empty.volume = 0.01;
      empty.rate = 1.0;
      const voice = pickKoreanVoice();
      if (voice) empty.voice = voice;
      window.speechSynthesis.speak(empty);
    } catch (_) {}
  }

  if (pendingSpeechText) {
    const text = pendingSpeechText;
    pendingSpeechText = '';
    setTimeout(() => speakText(text), 120);
  }
}

function unlockSpeechWithPrimer(text) {
  if (!hasSpeechSupport()) return;

  // Google 앱에서는 빈 음성/낮은 볼륨이 실제 언락으로 인정되지 않는 경우가 있어
  // 시작 버튼 클릭 안에서 짧은 실제 음성을 한 번 재생한다.
  speechUnlocked = true;
  pendingSpeechText = '';

  safeCancelSpeech();
  resumeSpeechEngine();

  try {
    const utt = new SpeechSynthesisUtterance(text || '출발 위치 안내를 시작합니다.');
    utt.lang = 'ko-KR';
    utt.rate = 1.05;
    utt.pitch = 1.0;
    utt.volume = 1.0;

    const voice = pickKoreanVoice();
    if (voice) utt.voice = voice;

    window.speechSynthesis.speak(utt);
  } catch (e) {
    console.warn('[speech] 시작 음성 언락 실패', e);
  }
}

function pickKoreanVoice() {
  if (!hasSpeechSupport()) return null;
  if (koVoice) return koVoice;

  const voices = window.speechSynthesis.getVoices() || [];
  koVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ko')) ||
            voices.find(v => v.name && /korean|한국|ko/i.test(v.name)) ||
            null;
  return koVoice;
}

if (hasSpeechSupport() && window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    koVoice = null;
    pickKoreanVoice();
  });
}

function speakText(text) {
  if (!text || !hasSpeechSupport()) return;

  // 아직 사용자 터치/클릭이 없으면 마지막 안내문만 보관한다.
  // 지도 드래그 시작, 버튼 클릭, 터치 이벤트에서 unlockSpeech가 호출되면 읽는다.
  if (!speechUnlocked) {
    pendingSpeechText = text;
    return;
  }

  const seq = ++speechSeq;

  safeCancelSpeech();
  resumeSpeechEngine();

  // cancel 직후 바로 speak하면 Safari/Google 앱에서 씹히는 경우가 있어
  // 아주 짧게 지연시킨다.
  setTimeout(() => {
    if (seq !== speechSeq) return;

    try {
      resumeSpeechEngine();

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang  = 'ko-KR';
      utt.rate  = 1.05;
      utt.pitch = 1.0;
      utt.volume = 1.0;

      const voice = pickKoreanVoice();
      if (voice) utt.voice = voice;

      window.speechSynthesis.speak(utt);
    } catch (e) {
      console.warn('[speech] 음성 안내 실패', e);
    }
  }, 80);
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

/**
 * 화면에 보이는 핀의 맨 아래 동그라미(.pin-dot)가 실제로 찍고 있는 지도 좌표를 반환한다.
 * 기존 map.getCenter()는 지도 화면의 정중앙 좌표라서,
 * CSS 핀 위치가 정중앙과 어긋나 있으면 안내 위치도 같이 어긋난다.
 */
function getPinnedLatLng() {
  if (!map) return null;

  try {
    const dot = $pin ? $pin.querySelector('.pin-dot') : null;
    const targetEl = dot || $pin;
    if (!targetEl || !$mapEl) return map.getCenter();

    const mapRect = $mapEl.getBoundingClientRect();
    const dotRect = targetEl.getBoundingClientRect();

    const x = dotRect.left + dotRect.width / 2 - mapRect.left;
    const y = dotRect.top + dotRect.height / 2 - mapRect.top;

    const proj = map.getProjection();
    if (!proj) return map.getCenter();

    return proj.coordsFromContainerPoint(new kakao.maps.Point(x, y));
  } catch (_) {
    return map.getCenter();
  }
}

/* =========================================================
   주변 정보 수집
   ---------------------------------------------------------
   역지오코딩 + 카테고리 검색 + 세부 키워드 검색.
   기존 흐름은 유지하되, 입구/정문/후문/주차장/상점 같은
   더 촘촘한 대표 지점이 후보에 들어오도록 보강한다.
   ========================================================= */
const SEARCH_CATS = ['CS2', 'CE7', 'FD6', 'PK6', 'MT1', 'PM9', 'BK9', 'SW8', 'PO3', 'SC4'];
const DETAIL_SEARCH_KEYWORDS = ['입구', '출입구', '정문', '후문', '주차장 입구', '주차장', '편의점', '카페'];

function gatherLocationInfo(lat, lng, gen, callback) {
  const pinPos = new kakao.maps.LatLng(lat, lng);
  const info   = { address: null, roadName: null, pois: [] };
  const seen   = new Set();
  let pending  = 1 + SEARCH_CATS.length + DETAIL_SEARCH_KEYWORDS.length;

  function pushPoi(p, cat, source) {
    const py = parseFloat(p.y);
    const px = parseFloat(p.x);
    if (!Number.isFinite(py) || !Number.isFinite(px)) return;

    const dist = haversine(lat, lng, py, px);
    if (dist > POI_SEARCH_RADIUS) return;

    const key = `${p.place_name}|${Math.round(py * 100000)}|${Math.round(px * 100000)}`;
    if (seen.has(key)) return;
    seen.add(key);

    info.pois.push({
      name: p.place_name,
      dist: dist,
      cat: cat || p.category_group_code || '',
      source: source || 'category',
    });
  }

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
        data.slice(0, 7).forEach(p => pushPoi(p, cat, 'category'));
      }
      done();
    }, {
      location: pinPos,
      radius: POI_SEARCH_RADIUS,
      sort: kakao.maps.services.SortBy.DISTANCE,
    });
  });

  DETAIL_SEARCH_KEYWORDS.forEach(keyword => {
    places.keywordSearch(keyword, (data, status) => {
      if (status === kakao.maps.services.Status.OK && data) {
        data.slice(0, 4).forEach(p => pushPoi(p, p.category_group_code || '', 'keyword'));
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
const NON_ROADSIDE_KEYWORDS = [
  '놀이터', '어린이공원', '공원', '운동장', '광장', '산책로', '보행로',
  '아파트', '단지', '학교', '대학교', '캠퍼스', '유치원',
  '건물내', '건물 내', '내부', '지하', '주차장', '주차장입구', '주차장 입구'
];

const ROAD_FACING_CATS = ['CS2', 'CE7', 'FD6', 'MT1', 'BK9', 'PM9', 'SW8'];

function isNonRoadsidePoi(poi) {
  if (!poi || !poi.name) return true;
  return NON_ROADSIDE_KEYWORDS.some(keyword => poi.name.includes(keyword));
}

const HARD_INTERNAL_KEYWORDS = [
  '놀이터', '어린이공원', '공원', '운동장', '산책로', '보행로',
  '아파트', '단지', '학교', '대학교', '캠퍼스',
  '건물내', '건물 내', '내부', '지하'
];

function isHardInternalPoi(poi) {
  if (!poi || !poi.name) return false;
  return HARD_INTERNAL_KEYWORDS.some(keyword => poi.name.includes(keyword));
}

function isRoadNameCarRoad(roadName) {
  if (!roadName) return false;
  return roadName.includes('대로') ||
         /로$/.test(roadName) ||
         /로\d/.test(roadName);
}

function isLikelyCarRoadsidePoi(poi, roadName) {
  if (!poi) return false;
  if (isNonRoadsidePoi(poi)) return false;
  if (!isRoadNameCarRoad(roadName)) return false;
  if (!ROAD_FACING_CATS.includes(poi.cat)) return false;

  // 허들을 높인다:
  // 핀과 대표 지점이 아주 가까운 경우에만 도로변으로 본다.
  // 도로명주소만으로는 절대 도로변이라고 단정하지 않는다.
  return poi.dist <= 20;
}

function composeAnnouncement(lat, lng, info) {
  const parts = [];
  const mainPoi = pickBestPoi(info.pois);
  const isCarRoadside = isLikelyCarRoadsidePoi(mainPoi, info.roadName);

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

  /* ③ 승차 적합성
     - info.roadName만 보고 도로변이라고 말하지 않는다.
     - 차가 다니는 도로에 면한 가능성이 높은 POI일 때만 도로변이라고 말한다.
     - 놀이터/공원/단지/학교/내부 공간은 도로변으로 단정하지 않는다. */
  if (mainPoi && isCarRoadside) {
    if (info.roadName && info.roadName.includes('대로')) {
      parts.push('대로변과 가까워 택시 승차 위치로 적절합니다.');
    } else {
      parts.push('도로변과 가까워 택시 승차 위치로 적절합니다.');
    }
  } else if (mainPoi && isHardInternalPoi(mainPoi)) {
    parts.push('승차하기 어려운 내부 위치일 수 있습니다. 큰길 쪽에서 승차 위치를 다시 확인해주세요.');
  } else if (mainPoi && mainPoi.cat === 'SW8' && !isNonRoadsidePoi(mainPoi)) {
    parts.push('지하철역 출입구 주변입니다. 실제 승차 가능한 위치인지 확인해주세요.');
  } else if (mainPoi) {
    parts.push('주변 상황을 확인한 뒤 안전한 승차 위치를 선택해주세요.');
  } else if (info.roadName) {
    if (info.roadName.includes('길')) {
      parts.push('골목길 부근일 수 있으므로 승차 위치를 다시 확인해주세요.');
    } else {
      parts.push('정확한 승차 가능 여부를 확인하기 어려우므로 위치를 다시 확인해주세요.');
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
    const pos = getPinnedLatLng();
    if (!pos) return;
    updateUI(pos.getLat(), pos.getLng());
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
    safeCancelSpeech();

    unlockSpeech();
  }, { passive: true, capture: true });

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

    // 드래그가 끝나는 순간도 사용자 제스처이므로,
    // 이 타이밍에서 음성 엔진을 한 번 더 깨운다.
    unlockSpeech();

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
    safeCancelSpeech();
    scheduleUpdate();
  });

  requestAnimationFrame(() => {
    const pos = getPinnedLatLng();
    if (pos) updateUI(pos.getLat(), pos.getLng());
    else updateUI(lat, lng);
  });
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

function setSplashActionsVisible(visible) {
  if ($splashActions) $splashActions.hidden = !visible;
  if ($splashSpinner) $splashSpinner.classList.toggle('is-hidden', visible);
}

function showLocationPermissionActions(message) {
  locationRequestRunning = false;
  setSplashText('위치 권한이 필요합니다', message || LOC_PERMISSION_MSG);
  setSplashActionsVisible(true);
}

function canRequestGeolocationHere() {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  return window.isSecureContext || isLocal;
}

async function startLocationFlow() {
  setSplashActionsVisible(false);

  if (!navigator.geolocation) {
    showLocationPermissionActions('이 브라우저에서는 위치 기능을 사용할 수 없습니다. Safari 또는 Chrome에서 다시 열어주세요.');
    return;
  }

  if (!canRequestGeolocationHere()) {
    showLocationPermissionActions('위치 권한은 HTTPS 주소 또는 localhost에서만 안정적으로 동작합니다. GitHub Pages 주소로 접속했는지 확인해주세요.');
    return;
  }

  // Chrome 계열에서는 이미 차단된 상태를 먼저 감지할 수 있다. Safari는 이 API가 없을 수 있다.
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status && status.state === 'denied') {
        showLocationPermissionActions('위치 권한이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용해주세요.');
        return;
      }
    } catch (_) {}
  }

  acquireLocation(false);
}

/* =========================================================
   위치 획득 (모바일 정확도 개선판)
   ---------------------------------------------------------
   - 페이지 진입 시 1차 자동 요청
   - 브라우저가 자동 요청을 막거나 권한이 애매하면
     splash 버튼을 통해 사용자 제스처 안에서 재요청
   - watchPosition으로 가장 정확한 좌표를 누적 사용
   ========================================================= */
function acquireLocation(fromUserGesture = false) {
  if (locationBooted || locationRequestRunning) return;

  if (!navigator.geolocation) {
    showLocationPermissionActions('이 브라우저에서는 위치 기능을 사용할 수 없습니다. Safari 또는 Chrome에서 다시 열어주세요.');
    return;
  }

  locationRequestRunning = true;
  setSplashActionsVisible(false);
  setSplashText('브라우저 위치 권한을 확인하고 있습니다',
                fromUserGesture ? '권한 팝업이 뜨면 허용을 눌러주세요.' : '권한 팝업이 뜨면 허용을 눌러주세요.');

  let watchId    = null;
  let timeoutId  = null;
  let bestPos    = null;
  let settled    = false;
  let refining   = false;

  function cleanup() {
    locationRequestRunning = false;
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
    if (settled || locationBooted) return;
    settled = true;
    cleanup();

    const lat       = pos.coords.latitude;
    const lng       = pos.coords.longitude;
    const accuracy  = pos.coords.accuracy;

    console.log('[geolocation] 위치 확정', { lat, lng, accuracy });
    geoPos = { lat, lng, accuracy };
    boot(lat, lng);
  }

  function settleFail(message, showButton = true) {
    if (settled || locationBooted) return;
    settled = true;
    cleanup();

    console.warn('[geolocation] 위치 획득 실패');

    if (showButton) {
      showLocationPermissionActions(message || LOC_PERMISSION_MSG);
      return;
    }

    pendingLocationWarning = message || LOC_FALLBACK_MSG;
    boot(FALLBACK_LAT, FALLBACK_LNG);
  }

  function showRefining() {
    if (refining) return;
    refining = true;
    setSplashText('정확한 위치를 다시 잡는 중입니다',
                  'GPS 신호 보정 중입니다. 실외나 창가에서는 더 정확하게 잡힙니다.');
  }

  function onPos(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    console.log('[geolocation] 위치 수신', {
      lat: latitude, lng: longitude, accuracy
    });

    if (!bestPos || accuracy < bestPos.coords.accuracy) {
      bestPos = pos;
    }

    if (accuracy <= ACCURACY_GOOD_M) {
      settleWith(bestPos);
      return;
    }

    showRefining();
  }

  function onErr(err) {
    if (err && err.code === err.PERMISSION_DENIED) {
      console.warn('[geolocation] 위치 권한 거부/차단', err.message || '');
      settleFail('위치 권한이 차단되었거나 거부되었습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용한 뒤 다시 시도해주세요.', true);
      return;
    }

    if (err && err.code === err.POSITION_UNAVAILABLE) {
      console.warn('[geolocation] 위치 사용 불가', err.message || '');
    } else if (err && err.code === err.TIMEOUT) {
      console.warn('[geolocation] 위치 timeout', err.message || '');
    } else {
      console.warn('[geolocation] 알 수 없는 위치 오류', err);
    }

    if (bestPos) settleWith(bestPos);
  }

  try {
    watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      timeout: LOC_MAX_WAIT_MS,
      maximumAge: 0,
    });
  } catch (e) {
    console.warn('[geolocation] watchPosition 호출 실패', e);
    settleFail('위치 권한 요청을 시작하지 못했습니다. Safari 또는 Chrome에서 다시 열어주세요.', true);
    return;
  }

  timeoutId = setTimeout(() => {
    if (settled) return;
    if (bestPos) {
      console.log('[geolocation] 시간 초과 → 그동안 수신된 가장 좋은 좌표 사용', {
        accuracy: bestPos.coords.accuracy,
      });
      settleWith(bestPos);
    } else {
      console.warn('[geolocation] 시간 초과 → 위치 한 번도 못 받음');
      settleFail(LOC_FALLBACK_MSG, false);
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
function needsSafariVoiceGate() {
  if (!hasSpeechSupport()) return false;

  const ua = navigator.userAgent || '';

  // iOS의 Safari/Chrome/Google 앱은 모두 WebKit 기반이라
  // 음성 언락이 비슷하게 막힐 수 있다. Safari만 보지 말고 iOS 전체에 게이트를 적용한다.
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return isIOS;
}

function showVoiceStartGate(next) {
  if (voiceGateOpening) return;
  voiceGateOpening = true;

  if (!$splash || !$app) {
    voiceGatePassed = true;
    next();
    return;
  }

  setSplashText(
    '출발 위치 안내를 시작할게요',
    '아래 버튼을 누르면 음성 안내를 준비한 뒤 위치 권한을 확인합니다.'
  );

  if ($splashSpinner) $splashSpinner.classList.add('is-hidden');

  let startBtn = null;

  if ($splashActions) {
    $splashActions.hidden = false;

    // 기존 위치 권한 버튼은 지우지 않는다.
    // 지워버리면 위치 권한 실패 시 "위치 사용 허용하기" 버튼을 다시 쓸 수 없다.
    if ($btnGrantLoc) $btnGrantLoc.style.display = 'none';
    if ($btnSkipLoc) $btnSkipLoc.style.display = 'none';

    startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'splash-btn splash-btn-primary';
    startBtn.textContent = '출발 위치 안내 시작';
    $splashActions.appendChild(startBtn);

    // 실제 기능 버튼이 아니라, 앱 진입 전에 음성만 풀어주는 전용 시작 버튼이다.
    startBtn.addEventListener('click', proceedFromVoiceStartGate, { once: true });
  }

  function proceedFromVoiceStartGate(e) {
    if (voiceGatePassed) return;
    voiceGatePassed = true;

    if (e) e.preventDefault();

    // 모바일 Google/Safari에서 빈 음성이 언락으로 인정되지 않을 수 있으므로
    // 사용자가 누른 click 안에서 짧은 실제 음성을 한 번 재생한다.
    unlockSpeechWithPrimer('출발 위치 안내를 시작합니다.');

    if (startBtn && startBtn.parentNode) startBtn.remove();
    if ($btnGrantLoc) $btnGrantLoc.style.display = '';
    if ($btnSkipLoc) $btnSkipLoc.style.display = '';

    if ($splashActions) $splashActions.hidden = true;
    if ($splashSpinner) $splashSpinner.classList.remove('is-hidden');

    setSplashText('위치 권한을 확인하고 있습니다', '권한 팝업이 뜨면 허용을 눌러주세요.');

    // 시작 음성이 씹히지 않도록 스플래시를 잠깐 유지한 뒤 위치 권한 흐름으로 들어간다.
    setTimeout(() => {
      next();
    }, 700);
  }
}

function boot(lat, lng) {
  locationBooted = true;
  if (!$splash || !$app) return;
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
  /* splash 위치 권한 버튼 */
  if ($btnGrantLoc) {
    $btnGrantLoc.addEventListener('click', () => {
      unlockSpeech();
      acquireLocation(true);
    });
  }

  if ($btnSkipLoc) {
    $btnSkipLoc.addEventListener('click', () => {
      unlockSpeech();
      pendingLocationWarning = LOC_FALLBACK_MSG;
      boot(FALLBACK_LAT, FALLBACK_LNG);
    });
  }

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
    safeCancelSpeech();
    map.setCenter(new kakao.maps.LatLng(geoPos.lat, geoPos.lng));
    scheduleUpdate();
  });

  /* 여기서 출발 */
  $btnConf.addEventListener('click', () => {
    unlockSpeech();
    if (!map) return;
    const pos = getPinnedLatLng();
    if (!pos) return;
    const lat = pos.getLat();
    const lng = pos.getLng();

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

  /*
   * Safari 음성 언락 허들 낮추기
   * - 지도/Kakao Map 내부에서 이벤트가 먹혀도 capture 단계에서 먼저 unlockSpeech 실행
   * - 별도 안내 멘트 없이 기존 빈 음성으로 조용히 언락
   * - 지도 클릭, 지도 드래그 시작, 하단 컴포넌트 클릭, 키보드 입력 전부 대응
   */
  const unlockOptions = { once: true, passive: true, capture: true };

  window.addEventListener('pointerdown', unlockSpeech, unlockOptions);
  window.addEventListener('touchstart', unlockSpeech, unlockOptions);
  window.addEventListener('mousedown', unlockSpeech, unlockOptions);
  window.addEventListener('click', unlockSpeech, unlockOptions);
  window.addEventListener('keydown', unlockSpeech, { once: true, capture: true });

  document.addEventListener('pointerdown', unlockSpeech, unlockOptions);
  document.addEventListener('touchstart', unlockSpeech, unlockOptions);
  document.addEventListener('mousedown', unlockSpeech, unlockOptions);
  document.addEventListener('click', unlockSpeech, unlockOptions);
  document.addEventListener('keydown', unlockSpeech, { once: true, capture: true });

  if ($mapEl) {
    $mapEl.addEventListener('pointerdown', unlockSpeech, unlockOptions);
    $mapEl.addEventListener('touchstart', unlockSpeech, unlockOptions);
    $mapEl.addEventListener('mousedown', unlockSpeech, unlockOptions);
    $mapEl.addEventListener('click', unlockSpeech, unlockOptions);
  }
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
      if (needsSafariVoiceGate() && !voiceGatePassed) {
        showVoiceStartGate(() => startLocationFlow());
      } else {
        startLocationFlow();
      }
    });
  } else {
    showKakaoLoadError();
  }
});
