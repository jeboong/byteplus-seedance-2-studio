# BytePlus Seedance 2.0 Studio

개발용 비공식 영상 생성 클라이언트입니다. Next.js App Router 기반으로 BytePlus ModelArk Seedance 2.0 API와 Alibaba ModelStudio HappyHorse API를 같은 UI에서 호출합니다.

원본 [`jeboong/seedance-2-studio`](https://github.com/jeboong/seedance-2-studio)를 BytePlus ModelArk 중심으로 포팅한 뒤, HappyHorse 모델과 현재 컴포저 UX를 추가한 버전입니다. 프로덕션 서비스로 바로 쓰기보다는 API 테스트, 데모, 내부 운영 도구 용도로 사용하는 것을 권장합니다.

---

## 주요 기능

### 영상 생성

- **BytePlus ModelArk**
  - Seedance 2.0: `dreamina-seedance-2-0-260128`
  - Seedance 2.0 Fast: `dreamina-seedance-2-0-fast-260128`
- **Alibaba ModelStudio**
  - HappyHorse 1.0 Text-to-video: `happyhorse-1.0-t2v`
  - HappyHorse 1.0 Image-to-video: `happyhorse-1.0-i2v`
  - HappyHorse 1.0 Reference-to-video: `happyhorse-1.0-r2v`
- **BytePlus 모드**: Text / Reference / First & Last Frame
- **HappyHorse 모드**: T2V / I2V / R2V 모델별 전용 입력 흐름
- **해상도**: 480p / 720p / 1080p
  - Seedance 2.0 Fast는 1080p 미지원
  - HappyHorse는 720P / 1080P만 사용
- **종횡비**
  - BytePlus: Adaptive / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16
  - HappyHorse: 16:9 / 9:16 / 1:1 / 4:3 / 3:4
- **길이**
  - BytePlus: 4-15초 또는 Smart Length
  - HappyHorse: 3-15초
- **추가 옵션**: 출력 개수, 사운드 생성(BytePlus), 워터마크, Last Frame 반환(BytePlus), Seed 고정, 생성 타임아웃

### 입력과 첨부

| 제공자 | 지원 입력 | 로컬 파일 처리 | URL/Asset 입력 |
|---|---|---|---|
| BytePlus | 이미지 / 비디오 / 오디오 | 이미지는 Base64, 오디오는 Base64, 비디오는 Files API 업로드 후 URL 사용 | HTTP(S), `asset://`, `oss://` 형식 입력 가능 |
| HappyHorse T2V | 프롬프트 | 첨부 없음 | 첨부 없음 |
| HappyHorse I2V | 이미지 1개 + 프롬프트 | 이미지를 ModelStudio 임시 OSS로 업로드 | HTTP(S) 또는 `oss://` |
| HappyHorse R2V | 이미지 1-9개 + 프롬프트 | 이미지를 ModelStudio 임시 OSS로 업로드 | HTTP(S) 또는 `oss://` |

파일 제한:

- BytePlus 이미지: 30MB 이하
- BytePlus 비디오: 50MB 이하
- BytePlus 오디오: 15MB 이하
- HappyHorse 이미지: JPEG/JPG/PNG/BMP/WEBP, 10MB 이하
- HappyHorse I2V 이미지는 가로/세로 300px 이상, 종횡비 1:2.5-2.5:1
- HappyHorse R2V 이미지는 짧은 변 400px 이상

### 작업 관리

- 생성 작업 자동 폴링
- 작업 상태: pending / queued / running / succeeded / failed / cancelled / expired
- 작업 카드 그리드/리스트 보기
- 상세 모달에서 프롬프트, 레퍼런스, 실제 출력 메타데이터 확인
- BytePlus 작업 취소/삭제
- 완료 작업의 영상 URL, Last Frame URL, seed, usage 표시
- LocalStorage 기반 작업/설정 보존

### 토큰 리포팅

- 실제 BytePlus 생성이 `succeeded` 상태가 되고 `usage.total_tokens`가 있을 때만 `/api/usage-report`로 보고합니다.
- 서버 라우트는 아래 운영 Apps Script URL 한 곳으로만 POST합니다.

```text
https://script.google.com/macros/s/AKfycbyC53V4K-CHJnP86qIbBP0WmXZ4cDD9D3CFVmd8otL4ZThzpQ7RKhnCeIXgDu4y7CFrnQ/exec
```

- 테스트 트래커 URL 경로는 제거되어 있습니다.
- 데모 모드와 HappyHorse 작업은 토큰 리포팅을 보내지 않습니다.
- API 키는 리포팅 payload에 포함하지 않습니다. 기본 payload는 `team`, `task_id`, `total_tokens`, `completion_tokens`, `source`, `timestamp`입니다.

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 App Router |
| 언어 | TypeScript |
| UI | React 18 + Tailwind CSS |
| 상태관리 | Zustand |
| 아이콘 | Lucide React |
| BytePlus 인증 | ModelArk API Key, AK/SK HMAC 서명 |
| Alibaba 인증 | ModelStudio API Key |

---

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local`은 Asset Library와 서버 측 보조 API에만 필요합니다. 영상 생성용 API Key는 앱 온보딩에서 입력하며 브라우저 LocalStorage에 저장됩니다.

```env
# BytePlus Asset Library control-plane API용
BYTEPLUS_AK=your_access_key_here
BYTEPLUS_SK=your_secret_key_here

# 선택: usage tracker payload 라벨
USAGE_TRACKER_TEAM=6팀
USAGE_TRACKER_SOURCE=external
```

### 3. 개발 서버 실행

Windows 원클릭 실행:

```bat
start.bat
```

`start.bat`은 Node.js 확인, 필요 시 `npm install`, 3030 포트 정리, 브라우저 오픈, `npx next dev --port 3030` 실행을 처리합니다.

수동 실행:

```bash
npm run dev -- --port 3030
```

접속 주소:

```text
http://localhost:3030
```

### 4. API 키 입력

앱 첫 진입 시 온보딩에서 사용할 제공자를 선택하고 키를 입력합니다.

- BytePlus ModelArk: Seedance 2.0 생성, BytePlus 파일 업로드, 작업 조회/삭제
- Alibaba ModelStudio: HappyHorse 생성, HappyHorse 임시 OSS 이미지 업로드
- Browse/Demo 모드: 키 없이 UI를 둘러보거나 데모 결과를 생성

키는 브라우저 LocalStorage에 저장되고, 실제 API 호출은 `/api/*` 서버 라우트를 통해 프록시됩니다. 생성 API 키는 소스 코드에 하드코딩하지 않습니다.

---

## 프로젝트 구조

```text
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts        # BytePlus / Alibaba 생성 프록시
│   │   ├── task/[id]/route.ts       # 작업 조회, BytePlus 작업 삭제
│   │   ├── tasks/route.ts           # BytePlus 작업 목록
│   │   ├── upload/route.ts          # BytePlus Files API 업로드
│   │   ├── alibaba-upload/route.ts  # HappyHorse 임시 OSS 업로드
│   │   ├── assets/route.ts          # BytePlus Asset Library
│   │   └── usage-report/route.ts    # BytePlus usage tracker POST
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── GenerateView.tsx             # 메인 생성 UI와 작업 폴링
│   ├── Header.tsx                   # 앱 메뉴, 데모 모드, 설정
│   ├── ModelParams.tsx              # 모델/파라미터 설정
│   ├── Onboarding.tsx               # API 키 입력과 시작 흐름
│   ├── ReferenceUpload.tsx          # 레퍼런스 첨부와 Asset Manager
│   ├── TaskDetailModal.tsx          # 작업 상세 보기
│   └── VideoResult.tsx              # 결과 카드
└── lib/
    ├── api.ts                       # 클라이언트 fetch wrapper와 payload 생성
    ├── byteplus-sign.ts             # BytePlus AK/SK HMAC 서명
    ├── generationConfirm.ts         # 생성 확인 설정
    ├── refTags.ts                   # @img1/@vid1/@aud1 태그 확장
    ├── store.ts                     # Zustand 상태와 LocalStorage 복원
    ├── types.ts                     # 모델 카탈로그, 타입, 비용 계산
    └── useFileUpload.ts             # BytePlus/HappyHorse 첨부 처리
```

---

## API 엔드포인트 매핑

| 앱 라우트 | 외부 API | 인증 |
|---|---|---|
| `POST /api/generate` | BytePlus `POST /api/v3/contents/generations/tasks` | Bearer ModelArk API Key |
| `POST /api/generate` | Alibaba ModelStudio HappyHorse 영상 생성 API | Bearer ModelStudio API Key |
| `GET /api/task/[id]` | BytePlus 작업 조회 또는 Alibaba ModelStudio 작업 조회 | Bearer API Key |
| `DELETE /api/task/[id]` | BytePlus `DELETE /contents/generations/tasks/{id}` | Bearer ModelArk API Key |
| `GET /api/tasks` | BytePlus `GET /contents/generations/tasks` | Bearer ModelArk API Key |
| `POST /api/upload` | BytePlus `POST /files` + file content URL 조회 | Bearer ModelArk API Key |
| `POST /api/alibaba-upload` | Alibaba ModelStudio 임시 업로드 policy + OSS 업로드 | Bearer ModelStudio API Key |
| `POST /api/assets` | BytePlus Asset Library control-plane actions | AK/SK HMAC |
| `POST /api/usage-report` | Google Apps Script usage tracker | 앱 서버에서 고정 URL로 POST |

---

## 제한사항과 운영 메모

- 이 앱은 개발용 클라이언트입니다. 서버 라우트가 사용자 입력 API 키를 외부 제공자에 전달하므로 배포 시 접근 통제와 로그 정책을 별도로 점검해야 합니다.
- HappyHorse 작업 삭제는 현재 앱에서 외부 삭제 API를 호출하지 않고 204로 처리합니다.
- BytePlus Files API가 공개 다운로드 URL을 반환하지 않으면 로컬 비디오 첨부가 실패할 수 있습니다. 이 경우 공개 HTTP(S) URL 또는 `asset://` 입력을 사용하세요.
- BytePlus Asset Library의 General Asset Group은 콘솔에서 Asset Service 활성화가 필요합니다.
- 실사 인물 자산은 BytePlus 콘솔의 모바일 QR 인증 플로우가 필요하며, 일반 프로그래밍 업로드로 대체할 수 없습니다.
- 1080p와 일부 모델 옵션은 제공자 응답 정책에 따라 거부될 수 있습니다.

---

## 라이선스

MIT
