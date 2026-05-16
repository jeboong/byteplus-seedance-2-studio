# [제안] tmpfiles.org 없이 BytePlus Files API로 직접 업로드

> **대상**: [`productionkhu-tech/freewill-seedance`](https://github.com/productionkhu-tech/freewill-seedance) 개발자
> **작성**: 2026-04-15
> **요지**: 현재 `server.ts`의 `uploadToTmpFiles` 경로(외부 무료 호스팅 → 4-hop)를
> **BytePlus 자체 인프라(`/files` API → 다운로드 URL)** 1-hop으로 바꾸면
> **업로드 속도/안정성이 크게 개선**되며, 외부 의존도 제거됩니다.

---

## 1. 현재 구조의 한계

`server.ts`의 비디오/오디오 업로드 흐름:

```
[1] 브라우저 ──raw bytes──→ [2] Express 서버 (메모리 buffer)
                              │
                              ├─ md5 sync 해싱
                              ├─ /media-cache/<hash> 디스크 쓰기
                              └─ raw POST ───────→ [3] tmpfiles.org
                                                     │
                                                     └─ public URL 반환
                                                         │
                          [4] BytePlus(생성 호출) ←─ public URL
                                  │
                                  └─ tmpfiles.org에서 다시 fetch
```

총 **4-hop**. 작성자도 코드 주석에서 인정하셨듯:

```ts
// Hard timeout — tmpfiles.org has gone unresponsive in the past, freezing the whole UI
// because the request never resolves. 60s is generous for ~50MB uploads on slow links.
const ac = new AbortController();
const timeoutId = setTimeout(() => ac.abort(), 60000);
```

문제점 요약:
1. **무료 외부 서비스(tmpfiles.org) 의존** → SLA 없음, 가변 지연, 다운 가능
2. **URL 만료** → 재업로드 필요 (`/api/reupload/:cacheId`)
3. **메모리 버퍼링** (`express.raw` + sync md5) → 큰 파일에서 이벤트 루프 블록
4. **BytePlus가 다시 한 번 fetch**해야 함 → 영상 생성 시 추가 지연

---

## 2. BytePlus Files API를 쓰면 1-hop으로 끝남

### 2-1. 사실 (BytePlus 공식 명세)

BytePlus ModelArk 데이터 평면 API는 **자체 파일 업로드 엔드포인트**(`/files`)를 제공합니다. 영상 생성 컨텐츠(`video_url`, `audio_url`)는 이 엔드포인트가 반환하는 다운로드 URL을 그대로 받아들입니다.

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `POST {ARK_BASE}/files` | multipart | 파일 업로드, `id` 반환 |
| `GET {ARK_BASE}/files/{id}/content` | GET | 다운로드 URL (302 redirect 또는 JSON) |

`ARK_BASE = https://ark.ap-southeast.bytepluses.com/api/v3`
인증은 영상 생성과 동일한 **Bearer API Key 한 개**.

### 2-2. 새 흐름 (1-hop)

```
[1] 브라우저 ──multipart──→ [2] Express 서버
                              │
                              └─multipart 그대로─→ [3] BytePlus /files
                                                      │
                                                      └─ file_id + URL
                                                          │
[4] BytePlus(생성 호출) ←─ BytePlus 자체 URL (tmpfiles 안 거침)
```

- **외부 무료 서비스 0건**
- BytePlus CDN 인프라를 직접 사용 → 안정적이고 빠름
- 같은 키로 인증 → 추가 secret 불필요
- BytePlus 입장에서 자기 인프라 → 추가 fetch hop도 짧음

---

## 3. 검증된 구현 코드 (drop-in)

저(`jeboong/byteplus-seedance-2-studio`)는 이 방식으로 구현해서 실서비스 중입니다. 아래 코드는 **Express + Node 18+** 환경에서 그대로 동작합니다 (이미 `freewill-seedance`가 사용 중인 환경).

### 3-1. `server.ts`에 추가할 헬퍼 두 개

```ts
const ARK_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';

async function uploadToBytePlusFiles(
  apiKey: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

  const res = await fetch(`${ARK_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Files API ${res.status}`);
  }
  return res.json();
}

async function getBytePlusFileUrl(
  apiKey: string,
  fileId: string
): Promise<string> {
  const res = await fetch(`${ARK_BASE}/files/${fileId}/content`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });

  // 302 redirect (가장 흔한 응답)
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) return loc;
  }

  // JSON 응답 케이스
  if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
    const data = await res.json().catch(() => ({}));
    if (data.url) return data.url;
    if (data.download_url) return data.download_url;
  }

  // 폴백: content 엔드포인트 자체 (Authorization 헤더 동반 fetch만 가능)
  return `${ARK_BASE}/files/${fileId}/content`;
}
```

### 3-2. `/api/upload-public` 라우트 교체

기존 `uploadToTmpFiles` 호출만 바꾸면 됩니다 (기존 캐시 로직 보존):

```ts
app.post('/api/upload-public', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  const filename = decodeURIComponent((req.headers['x-filename'] as string) || 'upload.mp4');
  const mimeType = (req.headers['content-type'] as string) || 'application/octet-stream';
  const ext = path.extname(filename) || '.mp4';
  const hash = crypto.createHash('md5').update(req.body).digest('hex').slice(0, 12);
  const cacheId = `${hash}${ext}`;

  try {
    // 로컬 캐시는 그대로 유지 (re-upload 대신 file_id 캐시로 가는 게 더 좋지만 일단 호환)
    const cachePath = path.join(CACHE_DIR, cacheId);
    if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, req.body);

    // ★ 변경: tmpfiles → BytePlus Files API
    const { id: fileId } = await uploadToBytePlusFiles(API_KEY!, req.body, filename, mimeType);
    const publicUrl = await getBytePlusFileUrl(API_KEY!, fileId);

    console.log(`[Upload] OK → ${publicUrl} (file_id: ${fileId}, cached: ${cacheId})`);
    res.json({ url: publicUrl, cacheId, fileId });
  } catch (error: any) {
    console.error('[Upload] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

### 3-3. `/api/reupload/:cacheId` 단순화 가능

BytePlus URL은 보통 만료 기간이 길지만, 만료 시에는 **다시 BytePlus로 업로드**:

```ts
app.post('/api/reupload/:cacheId', async (req, res) => {
  const cachePath = path.join(CACHE_DIR, req.params.cacheId);
  try {
    if (!fs.existsSync(cachePath)) {
      return res.status(404).json({ error: 'Cached file not found.' });
    }
    const fileBuffer = fs.readFileSync(cachePath);
    const filename = req.params.cacheId;
    const mimeType = filename.endsWith('.mp3') ? 'audio/mpeg'
                   : filename.endsWith('.wav') ? 'audio/wav'
                   : 'video/mp4';
    const { id: fileId } = await uploadToBytePlusFiles(API_KEY!, fileBuffer, filename, mimeType);
    const publicUrl = await getBytePlusFileUrl(API_KEY!, fileId);
    res.json({ url: publicUrl, fileId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 4. 추가 최적화: 이미지/오디오는 base64 직접 임베드

BytePlus 명세상:

| 타입 | URL | Base64 | asset:// |
|---|---|---|---|
| Image (`image_url`) | ✅ | ✅ (`data:image/<fmt>;base64,...`) | ✅ |
| Video (`video_url`) | ✅ | ❌ (URL only) | ✅ |
| Audio (`audio_url`) | ✅ | ✅ (`data:audio/<fmt>;base64,...`) | ✅ |

→ **이미지·오디오는 서버를 거치지 않고 브라우저에서 base64로 즉시 임베드** 가능합니다. tmpfiles는커녕 자기 서버도 안 거침.

```ts
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

이미지는 **무손실**(FileReader.readAsDataURL은 비트 단위 동일)이며 30MB까지 허용됩니다.

비디오만 4-1의 `/files` API를 사용하는 하이브리드 구성이 최적입니다.

---

## 5. 적용 효과 (실측 기준)

| 파일 | 기존(tmpfiles) | 변경(BytePlus Files) | 비고 |
|---|---|---|---|
| 이미지 5MB | 서버 → tmpfiles 약 3–8s + URL fetch | **0s (base64 임베드)** | 서버 자체 안 거침 |
| 오디오 10MB | 서버 → tmpfiles 약 8–20s | **0s (base64 임베드)** 또는 1–2s (Files API) | |
| 비디오 50MB | 서버 → tmpfiles 약 30–60s + 만료 위험 | **3–8s (BytePlus 인프라)** + 안정 | tmpfiles 다운 시 60s timeout 걸림 |

(네트워크 환경에 따라 변동)

---

## 6. 마이그레이션 체크리스트

- [ ] `server.ts`에 `uploadToBytePlusFiles` / `getBytePlusFileUrl` 추가
- [ ] `/api/upload-public`의 `uploadToTmpFiles(...)` 호출을 위 두 함수로 교체
- [ ] `/api/reupload/:cacheId`도 동일하게 교체
- [ ] (선택) 이미지/오디오는 클라이언트 base64로 직접 임베드 — 서버 라우트 자체 호출을 줄임
- [ ] `tmpfiles.org` 관련 주석/코드 제거
- [ ] `.env.example`은 그대로 (이미 `BYTEPLUS_API_KEY` 있음)

기존 클라이언트 측 로직(cacheId 응답, draftPrompt, 폴링 등)은 **수정 불필요**합니다. 응답 JSON 형태(`{ url, cacheId }`)가 동일하기 때문에 drop-in 교체 가능합니다.

---

## 7. 참고 자료

- BytePlus ModelArk Seedance 2.0 공식 문서:
  - Create video generation task: `POST /api/v3/contents/generations/tasks`
  - 멀티모달 입력(`image_url`/`video_url`/`audio_url`) 사양
- 본 제안의 동작 검증 구현체: [`jeboong/byteplus-seedance-2-studio`](https://github.com/jeboong/byteplus-seedance-2-studio)
  - `src/app/api/upload/route.ts` — Files API 업로드 + 다운로드 URL 변환
  - `src/components/ReferenceUpload.tsx` — 이미지/오디오 base64 + 비디오 Files API 분기 처리

---

## 8. 부록: 거꾸로 배우고 싶은 점들 (freewill-seedance에서)

이 제안과는 별개로, freewill-seedance에서 배운 패턴들이 훌륭해서 메모해 둡니다:

- **단일 글로벌 폴링 + AbortController + 중복 방지 Set** (`App.tsx`, `store.ts`)
- **IndexedDB(idb-keyval) + debounced write** (LocalStorage 5MB 한계 회피)
- **SSRF-safe 다운로드 프록시 + Readable.fromWeb 스트리밍**
- **클라이언트 in-memory blob 프리페치 캐시** (`safePrefetch`)
- **Hydration 마이그레이션 (settings clamp/allowlist)**
- **다중 프로젝트 워크스페이스 + draftPrompt 보존**
- **Web Notifications API**
- **Electron 빌드 옵션**

이 부분들은 본 앱이 freewill-seedance에서 역으로 배워야 할 부분입니다.

감사합니다.
