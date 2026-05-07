

붙여넣은 텍스트 (1)(94).txt
문서

붙여넣은 텍스트 (2)(21).txt
문서

붙여넣은 텍스트 (3)(10).txt
문서
이 코드에서 지도 핀 위치 기반으로 보이스 읽어주는 부분(자동) 모바일 safari에서 읽어지게 최소 수정해줘. 지금 사파리에서 안읽어져

핵심은 iOS Safari가 speechSynthesis를 “사용자 터치 제스처 안에서 한 번 깨우지 않으면” 자동 재생을 막는 문제입니다. 지도/핀/POI 로직은 건드리지 않고 음성 초기화 부분만 최소로 바꾸겠습니다.

지금 코드 구조상 updateUI()에서 핀 안내문을 만들고 speakText(text)를 호출하는 흐름은 이미 있습니다. 문제는 음성 엔진을 깨우는 부분이 공백 음성이라 iOS Safari에서 무시될 가능성이 큽니다.

Thought for 2m 3s
수정본 만들었어. HTML/CSS는 안 건드렸고, main.js의 음성 unlock 부분만 최소 수정했어.

다운로드해서 기존 main.js 내용 대신 붙여넣으면 됨:
main_safari_voice_fixed.txt

핵심 수정은 이거야:

기존 공백 음성 ' '으로 Safari 음성 엔진 깨우던 부분 제거

첫 터치/클릭 때 "음성 안내가 켜졌습니다."를 실제로 한 번 읽게 변경

touchend, pointerup에서도 음성 unlock 되게 추가

지도 드래그 시작 시 이전 핀 안내가 늦게 읽히지 않게 pendingSpeechText 비움

기존 핀/POI/지도/위치 계산 로직은 유지

주의할 점: iPhone Safari는 사용자가 화면을 한 번도 터치하지 않은 상태에서 완전 자동 음성 재생은 막힐 수 있어. 그래서 위치 허용 후 지도 한 번 드래그하거나 버튼을 누르면 그때부터 핀 위치 안내가 자동으로 읽히는 구조야. 기존 코드도 updateUI()에서 핀 안내문을 만들고 speakText(text)로 읽는 흐름은 이미 있었고, 문제는 Safari에서 첫 unlock이 약했던 부분이었어. 



첫 터치 클릭 없이 그냥 켜지게 하는 방법 없나? 음성 안내가 켜졌습니다 이런 건 말 안 하게 했으면 좋겠는데.

완전 무터치 자동 재생은 iPhone Safari 정책상 거의 불가능해. 대신 “사용자가 누른 위치 허용 버튼/지도 드래그/출발 버튼”을 첫 제스처로 써서 조용히 unlock하고, 안내 멘트는 안 나오게 바꾸면 돼.


지도 드래그를 첫 제스처로 써줘. 조용히 언락하게.

ㅇㅋ. 첫 지도 드래그에서만 조용히 음성 엔진을 깨우고, “음성 안내가 켜졌습니다” 같은 프라이밍 문장은 안 읽게 바꿀게. Safari 정책 때문에 완전 자동은 못 보장하지만, 드래그 이후 핀 안내 자동 읽기는 이 방식이 제일 현실적이야.

Thought for 1m 33s
좋아. 지도 드래그를 첫 제스처로 쓰고, 조용히 unlock하는 버전으로 다시 만들었어.

main_safari_voice_drag_silent_unlock.txt

바꾼 핵심:

"음성 안내가 켜졌습니다." 문장 완전 제거

첫 지도 드래그 pointerdown에서만 조용히 speechSynthesis 깨움

소리 나는 문장 대신 \u200B zero-width 문자 + volume = 0.0으로 조용히 prime

전역 document.addEventListener('pointerdown', unlockSpeech...) 제거

위치 허용 버튼에서는 음성 unlock 안 함

드래그 끝나고 핀 위치 안내문이 자동으로 읽히게 유지

현재 코드도 원래 updateUI()에서 안내문을 만들고 speakText(text)로 읽는 구조라, Safari에서 막히는 지점은 “첫 사용자 제스처 안에서 음성 엔진을 깨우는 부분”이었어. 이번 수정은 그 unlock 타이밍을 지도 드래그로 좁힌 거야. 



음 그리고 지금 그 핀 부분에 그 맨 아래 조그만 동그라미 부분이 지도랑 겹치는 부분을 위치로 읽어야 되는데 그 부분이 좀 잘못돼 있는 거 같아서 그 부분만 또 최소 수정해 줘. 나머지는 절대 건드리지 말고.

알겠어. 이번에는 음성/POI/위치권한 로직은 그대로 두고, “지도 중심”이 아니라 “핀 아래 동그라미가 실제로 닿는 화면 지점”의 좌표를 읽도록 좌표 계산 부분만 최소로 바꿀게.

Thought for 1m 55s
수정했어. HTML/CSS/음성/POI/위치권한 로직은 안 건드리고, 좌표 읽는 기준만 바꿨어.

main_safari_voice_drag_silent_unlock_pin_dot_fixed.txt

바꾼 부분:

기존에는 드래그 끝나면 map.getCenter() 기준 좌표를 읽었음. 


그런데 실제 핀은 .pin-dot이라는 작은 동그라미가 따로 있어서, 화면상 동그라미가 지도와 겹치는 위치와 map.getCenter()가 다를 수 있었음. 


그래서 getPinDotLatLng() 함수만 추가해서, 핀 아래 작은 동그라미의 화면 좌표 → 카카오맵 좌표로 변환하게 바꿈.

scheduleUpdate()랑 “여기서 출발” 버튼에서만 그 좌표를 쓰게 바꿈.

즉 이제 음성으로 읽는 위치는 지도 중심이 아니라 검은 동그라미가 실제로 찍힌 위치 기준이야.


/* =========================================================
상수
========================================================= */
const ANNOUNCE_DELAY_MS = 900;
const DEFAULT_LEVEL = 3;
const FALLBACK_LAT = 37.5927;
const FALLBACK_LNG = 127.0168;
const DRAG_DAMPING = 0.45;
const POI_SEARCH_RADIUS = 130; // 대표 지점 검색 반경: 너무 먼 대표 장소 방지
const POI_NEAR_LIMIT = 65; // "앞입니다" 판정 거리: 기존 100m → 더 촘촘하게
const WALK_SPEED_MPM = 67;

/* ----- 모바일 위치 정확도 관련 ----- */
const ACCURACY_GOOD_M = 60; // 60m 이하면 즉시 확정
const LOC_MAX_WAIT_MS = 30000; // 모바일 GPS 보정 최대 30초 대기
const LOC_RETRY_WAIT_MS = 18000; // 현재 위치 버튼 재시도 시 최대 대기

const LOC_FALLBACK_MSG =
'현재 위치를 정확히 확인할 수 없습니다. 브라우저 위치 권한과 정확한 위치 설정을 확인해주세요.';

const LOC_PERMISSION_MSG =
'브라우저 위치 권한이 필요합니다. 아래 버튼을 눌러 위치 사용을 허용해주세요.';

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
'CS2': 5, // 편의점
'CE7': 4, // 카페
'MT1': 4, // 마트
'PK6': 4, // 주차장
'BK9': 3, // 은행
'FD6': 3, // 음식점
'PM9': 3, // 약국
'SW8': 3, // 지하철역: 너무 멀리 잡히지 않도록 낮춤
'PO3': 2, // 공공기관
'SC4': 1, // 학교: 세부 입구/동이 아니면 대표성 낮춤
};

function hasAnyKeyword(name, keywords) {
return keywords.some(keyword => name.includes(keyword));
}

/**

POI의 대표성 점수를 반환한다.

세부 지점(입구/정문/후문/주차장/동/상가)은 가산하고,

큰 건물명만 있는 POI는 핀과 아주 가깝지 않으면 감점한다.
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
if (dist <= 25) return 0; // 바로 앞
if (dist <= 45) return 1; // 가까운 세부 지점
if (dist <= POI_NEAR_LIMIT) return 2;
return 3;
}

/**

가까운 거리 구간을 먼저 고르고, 같은 구간 안에서 대표성을 비교한다.

이렇게 해야 80~100m 떨어진 대형 건물 하나가 계속 안내되는 문제를 줄일 수 있다.
*/
function pickBestPoi(pois) {
const candidates = pois.filter(p => p.dist <= POI_NEAR_LIMIT);
if (candidates.length === 0) return null;

candidates.sort((a, b) => {
const ba = getDistanceBucket(a.dist);
const bb = getDistanceBucket(b.dist);
if (ba !== bb) return ba - bb; // 가까운 거리 구간 우선

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
const $splash = document.getElementById('splash');
const $splashTxt = $splash ? $splash.querySelector('.splash-text') : null;
const $splashSub = document.getElementById('splash-sub');
const $splashActions = document.getElementById('splash-actions');
const $splashSpinner = document.getElementById('splash-spinner');
const $btnGrantLoc = document.getElementById('btn-grant-location');
const $btnSkipLoc = document.getElementById('btn-skip-location');
const $app = document.getElementById('app');
const $mapEl = document.getElementById('map');
const $pin = document.getElementById('center-pin');
const $locName = document.getElementById('location-name');
const $announce = document.getElementById('announce-region');
const $btnMyLoc = document.getElementById('btn-my-location');
const $btnConf = document.getElementById('btn-confirm');
const $rowDest = document.querySelector('.sheet-row-dest');
const $btnBack = document.querySelector('.btn-back-floating');

/* =========================================================
상태
========================================================= */
let map = null;
let geocoder = null;
let places = null;
let geoPos = null; // { lat, lng, accuracy } | null
let timer = null;
let dragging = false;
let lastPtrX = 0;
let lastPtrY = 0;
let activePtrId = null;
let requestGen = 0;
let locationRequestRunning = false;
let locationBooted = false;

/* boot 직후 announce-region에 표시할 경고 메시지 */
let pendingLocationWarning = null;

원래처럼 지도 드래그/버튼 터치 후 하단 안내문을
앱 자체 음성으로 읽어주도록 복구한다.

위치/POI/핀 로직은 건드리지 않음

Safari/Chrome/Google 앱에서 speechSynthesis가 멈춰 있을 때
resume → cancel → speak 순서로 다시 실행
========================================================= */
let speechUnlocked = false;
let koVoice = null;
let pendingSpeechText = '';
let speechSeq = 0;

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

역지오코딩 + 카테고리 검색 + 세부 키워드 검색.
기존 흐름은 유지하되, 입구/정문/후문/주차장/상점 같은
더 촘촘한 대표 지점이 후보에 들어오도록 보강한다.
========================================================= */
const SEARCH_CATS = ['CS2', 'CE7', 'FD6', 'PK6', 'MT1', 'PM9', 'BK9', 'SW8', 'PO3', 'SC4'];
const DETAIL_SEARCH_KEYWORDS = ['입구', '출입구', '정문', '후문', '주차장 입구', '주차장', '편의점', '카페'];

function gatherLocationInfo(lat, lng, gen, callback) {
const pinPos = new kakao.maps.LatLng(lat, lng);
const info = { address: null, roadName: null, pois: [] };
const seen = new Set();
let pending = 1 + SEARCH_CATS.length + DETAIL_SEARCH_KEYWORDS.length;

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
info.address = r.road_address ? r.road_address.address_name
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
parts.push(현재 핀 위치는 ${mainPoi.name} 앞입니다.);
} else if (info.address) {
parts.push(현재 핀 위치는 ${info.address}입니다.);
} else {
parts.push('현재 핀 위치를 확인할 수 없습니다.');
}

/* ② 거리 · 도보 시간 */
if (geoPos) {
const dist = haversine(geoPos.lat, geoPos.lng, lat, lng);
const meters = Math.round(dist);
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
safeCancelSpeech();

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
places = new kakao.maps.services.Places();

setupCustomDrag();

kakao.maps.event.addListener(map, 'zoom_changed', () => {
clearTimeout(timer);
safeCancelSpeech();
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

페이지 진입 시 1차 자동 요청

브라우저가 자동 요청을 막거나 권한이 애매하면
splash 버튼을 통해 사용자 제스처 안에서 재요청

watchPosition으로 가장 정확한 좌표를 누적 사용
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

let watchId = null;
let timeoutId = null;
let bestPos = null;
let settled = false;
let refining = false;

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

let watchId = null;
let timeoutId = null;
let bestPos = null;
let done = false;

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
========================================================= /
function bind() {
/ splash 위치 권한 버튼 */
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

document.addEventListener('pointerdown', unlockSpeech, { once: true, passive: true });
document.addEventListener('touchstart', unlockSpeech, { once: true, passive: true });
document.addEventListener('click', unlockSpeech, { once: true });
document.addEventListener('keydown', unlockSpeech, { once: true });
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
카카오맵 SDK가 로드되지 않았습니다. 현재 접속 주소는 ${origin} 입니다. 이 주소가 Kakao Developers의 JavaScript SDK 도메인에 등록되어 있는지 확인하세요.;
setTimeout(() => {
if ($splash && $splash.parentNode) $splash.remove();
}, 500);
}

document.addEventListener('DOMContentLoaded', () => {
bind();

if (window.kakao && window.kakao.maps && window.kakao.maps.load) {
window.kakao.maps.load(() => {
startLocationFlow();
});
} else {
showKakaoLoadError();
}
});


닫기
