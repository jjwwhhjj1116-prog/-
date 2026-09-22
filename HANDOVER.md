# 📋 CONCOST 기술본부 일정관리 & 성과물 클라우드 스튜디오
## 🚀 기술 인수인계서 (Technical Handover Specification)

> **문서 버전**: v1.0.0  
> **최종 갱신일**: 2026-09-22  
> **인계 작성자**: Antigravity Senior Engineering Team  
> **인수 대상**: Codex 및 차기 담당 엔지니어  
> **실서버 운영 URL**: [https://concost-tech-scheduler.pages.dev](https://concost-tech-scheduler.pages.dev)  
> **GitHub 레포지토리**: `https://github.com/jjwwhhjj1116-prog/-.git` (branch: `main`)

---

## 1. 프로젝트 개요 및 아키텍처

본 시스템은 **(주)컨코스트 기술본부(마감팀, 구조팀, 토목&조경팀)** 및 **베트남 지사(VIET QS, 호치민)**의 수량산출 용역 프로젝트 일정 관리, 공종별 인력 배정, 회사 공식 회의록 작성·보관, 업무일지 결재 및 성과물 산출 관리를 통합 제공하는 올인원 웹 애플리케이션입니다.

### 1.1 기술 스택
- **Frontend Core**: React 19, TypeScript, Vite 8
- **Styling**: Tailwind CSS v3, Lucide React Icons
- **State Management**: Zustand 5 (with `persist` middleware, `localStorage` 기반 영구 저장)
- **Data & Excel**: SheetJS (`xlsx`) - 회사 공식 45행 서식 및 월간 간트 타임라인 엑셀 완벽 지원
- **Build & Deploy**: `vite-plugin-singlefile`, Cloudflare Pages (`wrangler`)
- **Python Utilities**: Python 3.11+ (`fetch_suju_test.py`, `probe_gw.py` - 그룹웨어 수주 크롤링 및 데이터 전처리)

---

## 2. 디렉토리 구조 및 핵심 파일 맵

```plaintext
프로젝트일정표(마감)/
├── scheduler-web/                     # 메인 React 웹 애플리케이션
│   ├── src/
│   │   ├── components/
│   │   │   ├── ProjectModal.tsx       # ★ [핵심] 프로젝트 세부 공종 및 우측 실시간 팀원 가용성/투입 현황판 모달
│   │   │   ├── MinutesView.tsx        # ★ [핵심] 회의록 2단 뷰 (작성&서식 편집 / 목록 아카이브), 공식 엑셀/삭제 모달
│   │   │   ├── PrintScheduleModal.tsx # ★ [핵심] A4 가로 1장 완벽 핏 일정표 인쇄/PDF 저장 및 월간 간트 엑셀 내보내기
│   │   │   ├── DailyReportView.tsx    # 개인 업무일지 (오후 5시 자동상신, 부서별 2인 실장/팀장 결재선)
│   │   │   ├── IntakeListView.tsx     # 프로젝트 접수목록 (그룹웨어 크롤링 수주 연동)
│   │   │   ├── ProjectIntegratedModal.tsx # 공종별 통합 진척도 요약 모달
│   │   │   ├── PersonalScheduleView.tsx   # 개인/팀별 캘린더 및 간트 타임라인
│   │   │   ├── ProjectCalendar.tsx    # 메인 월간/간트 캘린더 컴포넌트
│   │   │   ├── VietTeamModal.tsx      # 베트남 VIET QS(호치민) 9개 팀원/라인업 모달
│   │   │   ├── LoginScreen.tsx        # 사내 로그인 화면 (사번/내선번호 인증)
│   │   │   └── QCLinkView.tsx         # 기술본부 QC 스튜디오 연동 뷰
│   │   ├── store/
│   │   │   ├── useProjectStore.ts     # ★ 프로젝트/공종/인원 상태 관리 (Zustand Persist: 'concost_projects_data_v2')
│   │   │   ├── useAuthStore.ts        # 사내 계정 및 권한 상태 관리 (유종욱 실장: 개발TF 관리자)
│   │   │   └── useWorkLogStore.ts     # 업무일지 및 결재 상태 스토어
│   │   ├── services/
│   │   │   ├── excelService.ts        # 월간 1~30일 전체 타임라인 간트 엑셀 생성 엔진
│   │   │   └── googleDriveService.ts  # 구글 드라이브 실무 폴더 자동 생성 및 파일 연동
│   │   ├── data/
│   │   │   ├── realProjects.json      # 실무 프로젝트 30건 초기 데이터셋
│   │   │   ├── concostUsers.json      # 한국 본사 기술본부 임직원 데이터
│   │   │   └── vietTeams.ts           # 베트남 VIET QS 9개 팀 유닛 데이터
│   │   ├── App.tsx                    # 메인 레이아웃 및 탭 라우팅, 글로벌 단축키/헤더
│   │   └── index.css                  # 인쇄 미디어쿼리(@media print) 및 커스텀 스크롤바
│   ├── dist/                          # Cloudflare 배포용 번들
│   └── package.json
├── fetch_suju_test.py                 # 사내 그룹웨어 수주현황 크롤러 프로토타입
├── probe_gw.py                        # 그룹웨어 세션/인증 프로브 스크립트
├── schema.sql                         # 향후 RDBMS/D1 마이그레이션용 DB 스키마
└── HANDOVER.md                        # 본 인수인계 문서
```

---

## 3. 현재 100% 구현 및 검증 완료된 기능

| 구분 | 기능 명칭 | 구현 상세 및 검증 상태 |
| :--- | :--- | :--- |
| **일정표** | **공종별 인원 원클릭 배정** | `ProjectModal.tsx`: 좌측 공종 선택 후 우측 투입현황판에서 `[+ 배정]` 클릭 시 실시간 반영 |
| **일정표** | **PM 자동 동기화 & 영구 저장** | PM 공종 변경 시 상위 `project.pmId` 즉시 동기화, `useProjectStore` persist로 F5 후 100% 보존 |
| **UI/UX** | **우측 가용성 현황판 시각화** | 인디고 테마 헤더, 좌우 분리선, 앰버 포커스 안내 배너, 선명한 컬러 뱃지 및 배정 버튼 적용 |
| **회의록** | **하위 2단 카테고리 탭** | `[📝 회의록 작성 & 서식 편집]` / `[📋 회의록 목록 (아카이브)]` 완전 분리 구현 |
| **회의록** | **공식 서식 엑셀 다운로드** | Row 1~45 실데이터(거래처명, 작성자, 실무 6대 착수회의 지시사항) 100% 채워진 엑셀 생성 |
| **회의록** | **커스텀 영구 삭제 모달** | 브라우저 `window.confirm` 차단 방지용 `z-[9999]` 모달 구현, 삭제 시 `localStorage` 즉시 동기화 |
| **회의록** | **AI 스마트 요약 엔진** | 회의 원문 텍스트 분석하여 도면 Rev, 납품일정, 주요 결정사항 자동 요약 및 서식 반영 |
| **인쇄** | **A4 가로 1장 완벽 핏 출력** | `PrintScheduleModal.tsx`: 웹 배경 UI 자동 은닉, 1일~30일 전체 타임라인 무짤림 출력 |
| **엑셀** | **월간 간트 타임라인 엑셀** | `excelService.ts`: 1~30일 전 날짜별 공종 간트 바(`■마감(66%)`)가 채워진 엑셀 시트 생성 |
| **업무일지** | **1인 격리 및 실장/팀장 2단 결재** | 로그인한 본인 일지만 조회, 마감팀(조한빈 실장, 김재헌 팀장) / 구조팀(장범선 실장, 신동헌 팀장) |

---

## 4. 미구현 항목 및 후임(Codex) 과제

다음 항목들은 현재 프로토타입/로컬스토리지 단계이며, 실운영 고도화를 위해 Codex가 이어받아 구현해야 합니다.

### 4.1 백엔드 DB 실시간 동기화 (우선순위: 높음)
- **현상태**: Zustand의 `persist` 미들웨어를 통해 각 사용자의 브라우저 `localStorage`에 데이터가 저장됨.
- **요구사항**: 여러 사용자가 동시에 일정을 수정했을 때 실시간으로 변경사항이 공유되도록 중앙 백엔드 DB 연동 필요.
- **추천 해법**:
  1. Cloudflare D1 (SQLite) 또는 Render Node.js/Express + MongoDB Atlas API 연동 (기존 스킬: `free-db-server-deployment` 참조).
  2. `useProjectStore`의 변경 액션 시 백엔드 REST API(`POST /api/projects/subtasks`)로 비동기 동기화.

### 4.2 사내 그룹웨어 수주 크롤러 자동화 데몬 (우선순위: 중간)
- **현상태**: Python 스크립트(`fetch_suju_test.py`, `probe_gw.py`)로 수기 크롤링 검증 완료.
- **요구사항**: 매일 새벽 또는 수주 등록 시 자동으로 크롤링하여 `realProjects.json` 또는 백엔드 DB로 밀어넣는 스케줄러 구축.
- **주의사항**: 사내 그룹웨어 세션 만료 및 VPN/네트워크 방화벽 정책 예외 처리 필요.

### 4.3 Google Drive OAuth2 운영 도메인 등록 (우선순위: 중간)
- **현상태**: `googleDriveService.ts`가 구현되어 있으나, 구글 클라우드 콘솔의 OAuth2 승인된 자바스크립트 원본에 `https://concost-tech-scheduler.pages.dev`가 등록되지 않아 `origin_mismatch` 팝업 발생.
- **조치방법**: Google Cloud Console -> API 및 서비스 -> 사용자 인증 정보 -> OAuth 2.0 클라이언트 ID -> 승인된 자바스크립트 원본에 `https://concost-tech-scheduler.pages.dev` 추가.

### 4.4 기술본부 QC 스튜디오 SSO / 딥링크 연동 (우선순위: 낮음)
- **현상태**: 상단 `[QC 검토]` 버튼 클릭 시 `https://concost-qc-studio.jjwwhhjj1116.workers.dev/`로 새 창 이동.
- **요구사항**: 현재 열람 중인 프로젝트 코드(`TK-2026087`)를 쿼리 파라미터(`?projectCode=TK-2026087`)로 넘겨 QC 스튜디오에서 해당 프로젝트 도면 및 검토 내역이 바로 열리도록 연동.

---

## 5. 핵심 상태 관리 및 데이터 구조 (Storage Schema)

### 5.1 로컬스토리지 키 명세
- `concost_projects_data_v2`: 프로젝트 전체 목록 및 공종별 배정 현황 (`Project[]`)
- `concost_minutes_records_v2`: 회의록 전체 아카이브 목록 (`MeetingRecord[]`)
- `concost_auth_session`: 현재 로그인 사용자 정보 (`User`)

### 5.2 프로젝트 및 세부 공종 데이터 모델 (`useProjectStore.ts`)
```typescript
export interface SubTaskSchedule {
  roleName: string;          // 공종명 (예: 'PM', '조적', '창호', '내역' 등)
  personId: string;          // 단일 배정 호환용 ID
  personIds?: string[];      // 다중 배정 인원 ID 배열 (예: ['원종수', '성대용'])
  startDate: string;         // 공종 시작일 (YYYY-MM-DD)
  endDate: string;           // 공종 종료일 (YYYY-MM-DD)
  status: '예정' | '진행중' | '완료' | '지연';
  memo: string;              // 공종별 전달 메모
  version?: string;          // 도면 Rev 버전 (기본 'v1')
  subType?: '공내역' | '설계예가' | '실행가' | string; // 내역 공종 전용 유형
}

export interface Project {
  id: string;
  code: string;              // 프로젝트 코드 (예: 'TK-2026087')
  name: string;              // 프로젝트명 (예: '[삼성물산(주)] P5 FAB2 신축공사 견적용역')
  department: Department;    // '마감팀' | '구조팀' | '토목&조경팀'
  pmId: string;              // 주관 PM ID (subTasks['PM'] 변경 시 자동 동기화됨)
  startDate: string;
  endDate: string;
  progress: number;          // 산출 공정률 (0~100)
  subTasks: Record<string, SubTaskSchedule>; // 공종별 스케줄 맵
  roles: Record<string, ProjectRole>;        // 캘린더 간트용 역할 맵
  // ... 그룹웨어 수주 세부 스펙 (area, usage, floors, contacts 등)
}
```

---

## 6. 개발 및 배포 워크플로우 (Codex 필독 규칙)

1. **로컬 개발 서버 구동**:
   ```bash
   cd scheduler-web
   npm run dev
   ```
2. **프로덕션 빌드 검증 (타입 체크 필수)**:
   ```bash
   cmd /c "npm run build"
   ```
   - TypeScript 컴파일(`tsc -b`) 및 Vite 단일 파일 패키징이 에러 없이 완료되는지 확인.
3. **클라우드플레어 실서버 즉시 배포**:
   ```bash
   cmd /c "npx wrangler pages deploy dist --project-name concost-tech-scheduler"
   ```
   > ⚠️ **사용자 필수 규칙**: 코드를 수정할 때마다 반드시 위 명령어로 클라우드플레어 실서버에 배포해야 합니다. 배포 후 `https://concost-tech-scheduler.pages.dev`에서 동작 검증 필수.
4. **브라우저 다이얼로그 차단 금지**:
   - `window.confirm`이나 `window.alert`는 브라우저의 "추가 대화상자 표시 차단" 정책에 걸려 먹통이 될 수 있습니다.
   - 알림은 컴포넌트 내 토스트(`setAssignToast`, `setAiToast`)를 사용하고, 삭제 등 확인은 `z-[9999]` 커스텀 모달을 사용하십시오.
5. **원자적 상태 저장**:
   - 서브태스크 저장 시 개별 `updateSubTask` 루프 대신 `updateProjectSubTasks(projectId, localSubTasks)`를 호출하여 `subTasks`, `roles`, `pmId`가 한 번에 저장되도록 하십시오.

---

본 인수인계서와 관련 코드는 레포지토리 최상위의 `HANDOVER.md` 및 `scheduler-web/`에 영구 보존되어 있습니다. Codex는 위의 **4. 미구현 항목 및 후임 과제**부터 순차적으로 이어받아 작업을 진행하면 됩니다.
