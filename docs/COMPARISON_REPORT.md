# 비교 보고서: `byteplus-seedance-2-studio` vs `freewill-seedance`

> **대상**
> - 본 앱: [`jeboong/byteplus-seedance-2-studio`](https://github.com/jeboong/byteplus-seedance-2-studio) (Next.js 14, BytePlus 직접 통합)
> - 비교 앱: [`productionkhu-tech/freewill-seedance`](https://github.com/productionkhu-tech/freewill-seedance) (Express + Vite + Electron, AI Studio 출처)
>
> **분석 일자**: 2026-04-15

---

## 1. 한눈에 보는 차이

| 항목 | 본 앱 (BytePlus Studio) | freewill-seedance |
|---|---|---|
| **프레임워크** | Next.js 14 (App Router, SSR + API routes) | Express + Vite + React 19 (SPA) |
| **실행 형태** | 웹 (`localhost:3030`) | 웹 + **Electron 데스크톱 빌드** (`build:exe`) |
| **API 키 보관** | 클라이언트 LocalStorage (사용자 입력) → 서버 프록시로 헤더 전달 | 서버 환경변수 `SEEDANCE_API_KEY` 고정 (단일 사용자) |
| **상태 영속성** | Zustand + LocalStorage (단일 워크스페이스) | Zustand + **IndexedDB** (`idb-keyval`) + **debounced write** + **다중 프로젝트** |
| **UI 구조** | 단일 화면 (프롬프트 + 결과 + 파라미터) | **사이드바 + 채팅형 + 멀티 프로젝트** |
| **파일 업로드 경로** | **BytePlus Files API 직접** (또는 base64) | **tmpfiles.org 외부 호스팅** + 로컬 캐시 |
| **이미지/오디오** | **base64 직접 임베드** (무손실, 서버 안 거침) | tmpfiles 업로드 필요 |
| **Asset Library** | ✅ 통합 (`asset://`, AK/SK HMAC 서명) | ❌ |
| **다운로드 프록시** | ❌ | ✅ SSRF allowlist + streaming + in-memory blob cache |
| **폴링 구조** | **task당 setInterval** (10s) | **글로벌 1개 setInterval** (10s, 8s timeout, 중복 방지 Set) |
| **취소/삭제** | ✅ DELETE API + 로컬 제거 | ✅ DELETE API |
| **모드 수** | 2개 (Reference / First-Last) | 6개 (text/image_first/image_first_last/multimodal/edit/extend) |
| **Gemini API** | ❌ | ✅ (프롬프트 강화 추정) |
| **알림** | ❌ | ✅ Web Notifications API |
| **시작 스크립트** | `start.bat` (3030 포트, auto-kill, 브라우저 자동) | `start.bat` (3000 포트, 브라우저 자동) |

---

## 2. **왜 freewill-seedance의 파일 첨부가 느린가** (핵심)

### 2-1. 4-hop 업로드 경로 (구조적 병목)

freewill-seedance의 비디오/오디오 업로드 흐름은 다음과 같습니다:

```
[1] 브라우저 ─raw bytes──→ [2] Express 서버 (메모리 buffer)
                              │
                              ├─ md5 해싱 (sync, CPU 블록)
                              ├─ /media-cache/<hash> 디스크 쓰기
                              │
                              └─raw POST──→ [3] tmpfiles.org
                                              │
                                              └─ public URL 반환
                                                  │
[4] BytePlus(영상 생성 호출)  ←─ public URL 전달
        │
        └─ tmpfiles.org에서 파일 fetch
```

총 **4번의 네트워크 hop**:
1. 클라이언트 → 자기 서버 (LAN, 빠름)
2. 자기 서버 → tmpfiles.org (느림, 가변, **60초 timeout**)
3. 클라이언트 ← URL 응답
4. BytePlus → tmpfiles.org에서 다시 파일 다운로드 (영상 생성 시)

`server.ts`의 [실제 코드](https://github.com/productionkhu-tech/freewill-seedance/blob/main/server.ts):

```ts
// Hard timeout — tmpfiles.org has gone unresponsive in the past, freezing the whole UI
// because the request never resolves. 60s is generous for ~50MB uploads on slow links.
const ac = new AbortController();
const timeoutId = setTimeout(() => ac.abort(), 60000);
```

작성자도 주석에서 **"tmpfiles.org가 무응답이 되면 UI 전체가 멈춘다"**고 인정합니다. 이는 외부 무료 서비스 의존의 본질적 한계입니다.

### 2-2. 로컬 캐시 + 재업로드 메커니즘

tmpfiles.org URL은 만료되므로:
- 파일을 **로컬 캐시 디렉터리**(`/media-cache/<md5hash><ext>`)에 디스크 쓰기
- URL 만료 시 `/api/reupload/:cacheId`로 **다시 tmpfiles로 재업로드**
- 30일 후 자동 cleanup

→ 즉, **같은 파일이 여러 번 tmpfiles로 보내질 수 있음** = 추가 지연

### 2-3. 메모리 버퍼 사용

```ts
app.post('/api/upload-public', express.raw({ type: '*/*', limit: '100mb' }), ...)
const hash = crypto.createHash('md5').update(req.body).digest('hex')
```

- `express.raw()`는 **요청 전체를 메모리 Buffer로 적재**
- 100MB 한도지만 동시 다수 사용자/태스크 시 메모리 압박
- `crypto.createHash('md5').update(req.body)` — **동기 해싱**으로 큰 파일에서 이벤트 루프 블록

### 2-4. 본 앱의 비교 흐름 (1-hop)

```
[1] 브라우저 ─multipart──→ [2] Next.js /api/upload
                              │
                              └──→ [3] BytePlus /files API
                                      │
                                      └─ file_id + download URL 반환
```

이미지/오디오는 더 빠릅니다 — **서버를 안 거침**:

```
[1] 브라우저 (FileReader.readAsDataURL = base64)
       │
       └─embedded in JSON───→ [2] BytePlus /contents/generations/tasks
```

**결론**: freewill-seedance의 느림은 본질적으로 **무료 외부 호스팅(tmpfiles.org) 의존 + 메모리 버퍼링 + 동기 해싱**의 합산 결과이며, 본 앱처럼 BytePlus Files API를 1-hop으로 쓰면 자동 해소됩니다.

---

## 3. 본 앱이 우위인 영역

### 3-1. 업로드 성능
- 비디오: BytePlus Files API 직접 (CDN 인프라 사용 → tmpfiles 대비 안정/고속)
- 이미지/오디오: **base64 무손실 직접 임베드**, 서버 자체를 우회
- 외부 무료 서비스 의존 0건

### 3-2. Asset Library 통합 (전무한 기능)
- BytePlus 콘솔에서 등록한 **실사 인물** `asset://` URI 입력으로 얼굴 감지 우회
- AK/SK 기반 **HMAC-SHA256 서명** 구현 (`src/lib/byteplus-sign.ts`)
- General Asset Group 생성/조회/삭제 UI 통합
- freewill-seedance에는 이 영역 자체가 없음

### 3-3. 멀티 사용자 안전성
- API 키가 클라이언트 LocalStorage에 저장 → 서버는 stateless
- freewill-seedance는 `process.env.SEEDANCE_API_KEY`로 **단일 키 고정** (혼자 쓰는 데스크톱 앱 모델)

### 3-4. 명세 준수
- `first_last_frame` 모드에서 `last_frame`만 첨부 시 **버튼 비활성화** (BytePlus는 first_frame이 필수)
- `ratio: "adaptive"` 자동 종횡비 지원
- `execution_expires_after`, `return_last_frame`, `seed`, 1080p BETA 옵션 노출
- 태스크 목록 조회 (`/api/tasks`) 구현

---

## 4. freewill-seedance가 우위인 영역 (개선 후보)

### 4-1. 다운로드 프록시 + 인메모리 블롭 캐시 ⭐
[`server.ts`](https://github.com/productionkhu-tech/freewill-seedance/blob/main/server.ts)의 SSRF-safe 다운로드 프록시:

```ts
const ALLOWED_DOWNLOAD_HOSTS = ['bytepluses.com', 'byteplus.com', 'bytedance.com',
                                'volccdn.com', 'volces.com', 'ibytedtos.com'];

// Node Readable.fromWeb + pipe → handles backpressure, no memory copy
const nodeStream = Readable.fromWeb(response.body as any);
nodeStream.pipe(res);

// Cancel upstream when client disconnects
res.on('close', () => { nodeStream.destroy(); upstreamController.abort(); });
```

추가로 클라이언트에서 **생성된 영상의 blob을 메모리에 미리 캐싱**:

```ts
// Full pre-fetch into memory cache → subsequent download saves from RAM
// (zero CDN round-trip)
fetch(url).then(r => r.blob()).then(b => setCachedBlob(url, b));
```

→ **본 앱에 이식 가치 매우 높음** (BytePlus 영상 URL 만료 대응 + 빠른 재생/다운로드)

### 4-2. 단일 글로벌 폴링 (현재 본 앱은 task당 setInterval)
freewill-seedance의 [`App.tsx`](https://github.com/productionkhu-tech/freewill-seedance/blob/main/src/App.tsx):

```ts
// Single interval polls ALL active tasks every 10 seconds — no setTimeout chains
useEffect(() => {
  const poll = () => {
    const active = state.projects.flatMap(p =>
      p.messages.filter(m => (m.status === 'running' || m.status === 'queued') && m.taskId)
    );
    if (active.length === 0) return;
    active.forEach(t => state.pollTask(t.pid, t.mid, t.tid));
  };
  poll();
  const interval = setInterval(poll, 10000);
  return () => clearInterval(interval);
}, [_hasHydrated]);
```

추가 안전장치:
- **8초 폴링 timeout + AbortController** — 행 걸리는 fetch 차단
- **`_pollingSet` (Set)** — 같은 taskId 중복 fetch 방지
- 5xx 응답 시 status 안 바꿈 (다음 cycle에서 자동 재시도)

→ 본 앱은 task별 timer를 만들어 메모리 누수 가능. 이 패턴 채택 권장.

### 4-3. IndexedDB + Debounced Persistence
```ts
const idbStorage: StateStorage = {
  setItem: async (name, value) => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => set(name, value), 1500); // debounce 1.5s
  },
};
```

- **LocalStorage 5MB 한계 회피** (영상 메타데이터 누적 시 본 앱 깨질 수 있음)
- 1.5초 debounce로 잦은 쓰기 부하 감소

### 4-4. 다중 프로젝트 워크스페이스
- 사이드바 + 프로젝트별 격리된 settings/assets/messages
- 프로젝트 전환 시 `draftPrompt` 보존
- 채팅형 메시지 히스토리 (시간순, taskId 연결, startTime/endTime)

### 4-5. Hydration 시 마이그레이션
```ts
onRehydrateStorage: () => () => {
  const validResolutions = ['480p', '720p', '1080p'];
  // duration clamp 4-15, resolution allowlist, draftPrompt 초기화
}
```

→ 사양 변경 시 기존 사용자 데이터를 안전하게 정리. 본 앱에 도입하면 좋음.

### 4-6. 브라우저 알림
```ts
showNotification('영상 생성 완료', { body: '영상이 성공적으로 생성되었습니다.' });
```

긴 생성 시간 동안 백그라운드 탭 사용 시 유용.

### 4-7. Electron 데스크톱 빌드
`package.json`의 `build:exe` 스크립트로 Windows .exe 패키징 가능.

### 4-8. 모드 다양성
6가지 모드(`text_to_video`, `image_to_video_first`, `image_to_video_first_last`, `multimodal_reference`, `edit_video`, `extend_video`) — 본 앱의 2모드 대비 풍부.

---

## 5. 양쪽 모두 약점인 부분

| 약점 | 영향 |
|---|---|
| 동시 task 진행률 표시 미흡 | 양쪽 다 polling 결과 표시만, 실시간 progress bar 없음 |
| 비용 추정 정확도 (1080p) | 1080p는 공식 미문서, token rate 추정값 사용 |
| 에러 카테고리화 부족 | API 에러 메시지 그대로 노출, retry/backoff 정책 없음 |
| 영상 미리보기 썸네일 | 양쪽 다 `<video>` 태그만, 그리드 썸네일 자동 생성 없음 |

---

## 6. 본 앱에 이식할 권장 개선점 (우선순위)

| 우선 | 항목 | 출처 | 예상 효과 |
|---|---|---|---|
| **★★★** | 단일 글로벌 폴링 + AbortController + 중복 방지 Set | freewill `App.tsx`, `store.ts` | task별 setInterval 누수 제거, UI 응답성 ↑ |
| **★★★** | Zustand persist를 IndexedDB로 + debounced write | freewill `store.ts` | LocalStorage 5MB 한계 해소 |
| **★★** | 영상 다운로드 프록시 (SSRF allowlist + streaming) | freewill `server.ts` | 만료된 BytePlus URL 우회 다운로드 |
| **★★** | 인메모리 blob 프리페치 캐시 | freewill `store.ts` | 영상 재생/다운로드 즉시 |
| **★★** | Hydration 마이그레이션 (settings clamp/allowlist) | freewill `store.ts` | 사양 변경 시 기존 데이터 안전 |
| **★** | 다중 프로젝트 워크스페이스 (사이드바) | freewill 전반 | 작업 분리, 히스토리 |
| **★** | 브라우저 알림 (`Notification` API) | freewill `lib/utils.ts` | 백그라운드 탭 사용성 |
| **★** | 채팅형 히스토리 UI | freewill `ChatArea.tsx` | 컨텍스트 유지 |
| **♢** | Electron 빌드 옵션 | freewill `electron/` | 데스크톱 배포 (선택) |

---

## 7. freewill-seedance에 이식할 권장 개선점

| 항목 | 이유 |
|---|---|
| **BytePlus Files API 직접 업로드** | tmpfiles.org 의존 제거 → **체감 5–10배 업로드 가속** |
| **이미지/오디오 base64 직접 임베드** | 서버 round-trip 자체 제거 |
| **Asset Library / `asset://` 지원** | 실사 인물 사용 가능 |
| **HMAC-SHA256 control-plane 서명** | Asset CRUD 가능해짐 |
| **multi-user 모델** | API 키를 env에서 빼고 사용자 입력으로 전환하면 협업/배포 가능 |
| **명세 준수: last_frame-only 차단** | 잘못된 요청 사전 차단 |

---

## 8. 결론

### 8-1. 본 앱의 정체성
**“BytePlus 명세에 가장 충실한 데이터 경로 + Asset Library 풀 통합 + 멀티유저 가능한 웹앱”**

- 외부 호스팅 0건, 1-hop 업로드 → 빠르고 손실 없음
- BytePlus 콘솔 기능(특히 실사 인물 `asset://`)을 코드에서 직접 활용
- Next.js App Router의 서버 라우트로 키 안전 보관

### 8-2. freewill-seedance의 정체성
**“데스크톱-앱스러운 단일 사용자 워크스페이스, 풍부한 UX, 외부 호스팅 우회”**

- AI Studio에서 자동 생성된 흔적 (Gemini key, AppURL)
- Electron 빌드 + 다중 프로젝트 + 채팅형 + 알림 → 개인 사용자 워크플로 잘 짜여짐
- 그러나 tmpfiles.org 의존이 핵심 병목

### 8-3. 최종 권고
본 앱은 **데이터 평면(업로드/생성/Asset)에서 명백한 우위**, freewill은 **상태/UI 레이어와 인프라 패턴**에서 배울 점이 많습니다.

위 6장의 ★★★ 항목 3개(글로벌 폴링, IndexedDB persist, 다운로드 프록시)만 이식해도 본 앱은 안정성과 운영성 측면에서 한 단계 도약합니다.

---

## 부록: 주요 파일 매핑

| 기능 | 본 앱 | freewill-seedance |
|---|---|---|
| 영상 생성 라우트 | `src/app/api/generate/route.ts` | `server.ts` (POST `/api/byteplus/tasks`) |
| 태스크 조회 | `src/app/api/task/[id]/route.ts` | `server.ts` (GET `/api/byteplus/tasks/:id`) |
| 파일 업로드 | `src/app/api/upload/route.ts` | `server.ts` (POST `/api/upload-public`) |
| Asset Library | `src/app/api/assets/route.ts` + `src/lib/byteplus-sign.ts` | (없음) |
| 클라이언트 API | `src/lib/api.ts` | (인라인) |
| 글로벌 상태 | `src/lib/store.ts` (LocalStorage) | `src/store.ts` (IndexedDB + debounce) |
| 메인 UI | `src/components/GenerateView.tsx` | `src/components/ChatArea.tsx` (65KB) |
| 파라미터 패널 | `src/components/ModelParams.tsx` | `src/components/SettingsPanel.tsx` |
| 첨부 UI | `src/components/ReferenceUpload.tsx` | (ChatArea에 통합) |
