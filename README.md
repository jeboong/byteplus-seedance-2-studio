# BytePlus Seedance 2.0 Studio

> ⚠ **개발용 비공식 클라이언트입니다.** BytePlus ModelArk의 Seedance 2.0 영상 생성 API를 직접 호출하는 Next.js 웹 앱이며, 프로덕션 환경 사용을 권장하지 않습니다.

원본 [`jeboong/seedance-2-studio`](https://github.com/jeboong/seedance-2-studio) (Volcengine Ark)를 BytePlus ModelArk API로 포팅한 버전입니다. 모델 ID, 엔드포인트, 인증 체계, Asset Library API를 BytePlus 사양에 맞게 모두 재구성했습니다.

---

## 주요 기능

### 영상 생성
- **모델**: Seedance 2.0 (`dreamina-seedance-2-0-260128`) / Seedance 2.0 Fast
- **모드**: Reference 모드 / First & Last Frame 모드
- **해상도**: 480p · 720p (공식) · **1080p (BETA, 실험)**
- **종횡비**: 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16 / Auto(adaptive)
- **길이**: 4–15초 또는 Smart Length(`-1`)
- **추가 옵션**: Audio 동시 생성 / 워터마크 토글 / Last Frame 반환(연속 영상 체이닝) / Seed 고정 / 생성 타임아웃

### 첨부 파일 (멀티모달 입력)
| 타입 | 로컬 파일 | URL | `asset://` |
|---|---|---|---|
| **Image** | ✅ Base64 (≤30MB, 무손실) | ✅ | ✅ |
| **Video** | ✅ Files API 업로드 후 URL 자동 변환 (≤50MB) | ✅ | ✅ |
| **Audio** | ✅ Base64 (≤15MB) | ✅ | ✅ |

> **참고**: 비디오는 BytePlus 명세상 URL만 허용되므로, 로컬 파일은 `/api/upload`가 BytePlus Files API(`/files`)로 업로드하고 다운로드 URL을 받아와 자동으로 사용합니다.

### Asset Library 연동
- **Authorization Asset Group** (실사 인물): 콘솔 QR 코드 인증 후 `asset://` URI 입력 → 얼굴 감지 우회
- **General Asset Group**: 콘솔에서 Asset Service 활성화 후 그룹 생성/관리/업로드 가능 (UI 통합)
- AK/SK 기반 HMAC-SHA256 서명 (control-plane API: `open.byteplusapi.com`)

### 태스크 관리
- 생성 태스크 자동 폴링(10s) · 로컬스토리지 영속성
- 태스크 목록/상세 조회 · 진행 중 태스크 취소 · 완료 태스크 삭제
- `usage` (token 사용량), `seed`, 실제 출력 ratio/resolution/duration 표시
- 실시간 비용 추정 (USD)

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| UI | React 18 + Tailwind CSS |
| 상태관리 | Zustand (persist) |
| 아이콘 | Lucide React |
| 인증 | API Key (data-plane) + AK/SK HMAC-SHA256 (control-plane) |

---

## 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정 (`.env.local`)
```bash
# BytePlus Asset Library API용 (control-plane)
# https://console.byteplus.com/iam/keymanage/ 에서 발급
BYTEPLUS_AK=your_access_key_here
BYTEPLUS_SK=your_secret_key_here
```

> Asset Library 기능을 쓰지 않으면 위 두 값은 생략 가능합니다.

### 3. 개발 서버 실행

**Windows (원클릭)**:
```bat
start.bat
```
- Node.js 체크 → `npm install`(필요시) → 3030 포트 점유 프로세스 자동 종료 → 브라우저 자동 오픈 → `npx next dev --port 3030` 실행

**수동 실행**:
```bash
npm run dev -- --port 3030
```

브라우저에서 [`http://localhost:3030`](http://localhost:3030) 접속.

### 4. ModelArk API 키 입력
앱 첫 진입 시 온보딩 화면에서 BytePlus ModelArk API 키를 입력합니다.
- 발급: [BytePlus ModelArk 콘솔](https://console.byteplus.com/ark) → API Key 관리
- 키는 브라우저 LocalStorage에만 저장되며, API 호출 시 서버 사이드 프록시(`/api/*`)를 거쳐 BytePlus로 전달됩니다.
- 소스 코드에 하드코딩된 키는 **없습니다**.

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts      # 영상 생성 요청 (data-plane)
│   │   ├── task/[id]/route.ts     # 태스크 조회/삭제
│   │   ├── tasks/route.ts         # 태스크 목록
│   │   ├── upload/route.ts        # Files API 업로드 (+ 다운로드 URL)
│   │   └── assets/route.ts        # Asset Library (AK/SK HMAC 서명)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── GenerateView.tsx           # 메인 뷰 (프롬프트, 모드, 비용 계산)
│   ├── Header.tsx
│   ├── ModelParams.tsx            # 모델 파라미터 설정 패널
│   ├── Onboarding.tsx             # API 키 입력
│   ├── ReferenceUpload.tsx        # 레퍼런스 첨부 + Asset Manager
│   └── VideoResult.tsx            # 결과 카드 (그리드/리스트, 취소/삭제)
└── lib/
    ├── api.ts                     # 클라이언트 fetch wrapper
    ├── byteplus-sign.ts           # HMAC-SHA256 서명 유틸 (control-plane)
    ├── store.ts                   # Zustand 전역 상태
    └── types.ts                   # 타입, 모델 카탈로그, 비용 계산
```

---

## API 엔드포인트 매핑

| 기능 | BytePlus 엔드포인트 | 인증 |
|------|---------------------|------|
| 영상 생성 | `POST ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` | Bearer (API Key) |
| 태스크 조회 | `GET .../tasks/{id}` | Bearer |
| 태스크 목록 | `GET .../tasks` | Bearer |
| 태스크 취소/삭제 | `DELETE .../tasks/{id}` | Bearer |
| 파일 업로드 | `POST .../files` | Bearer |
| Asset 그룹 관리 | `open.byteplusapi.com/?Action=*AssetGroup` | AK/SK HMAC |
| Asset 생성/조회/삭제 | `open.byteplusapi.com/?Action=*Asset` | AK/SK HMAC |

---

## 알려진 제한사항 / 사양 메모

### First / Last Frame 모드
- `last_frame`만 단독으로는 영상 생성 불가 → Generate 버튼 비활성화 (UI에서 차단)
- 출력 해상도는 사용자가 지정한 `resolution × ratio` 조합으로 결정되며, 입력 이미지가 자동 크롭됨
- `ratio: "adaptive"` 권장 (첫 프레임 비율 자동 채택)

### Asset Library
- **General Asset Group** 생성은 BytePlus 콘솔에서 "Asset Service" 활성화가 선행되어야 합니다 (`NotFound.ServiceNotOpen` 응답 시).
- **실사 인물** 자산은 콘솔의 모바일 QR 코드 인증 절차로만 등록 가능 (보안 정책상 프로그래밍 업로드 차단).
- `arkbff-ap-southeast1.console.byteplus.com` 콘솔 BFF는 브라우저 세션에 종속 → AK/SK로 접근 불가.

### 1080p
- 공식 문서에 명시되지 않은 실험 옵션입니다. API가 거부하면 720p로 전환하세요.

---

## 라이선스

MIT
