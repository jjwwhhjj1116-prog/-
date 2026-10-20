# 📋 CONCOST 기술본부 일정관리 & 성과물 클라우드 스튜디오
## 🚀 기술 인수인계서 (Technical Handover Specification)

## CF242 공동 통합 배포·운영 재열기 확인 — 2026-10-20

- CF241 이후 다른 기술본부 배포 e3f1aed7/f36dda7a에서 클레임센터 업무일지 메뉴와 binding이 빠진 것을 두 번 확인했다. 단순 복구 재배포를 반복하지 않고 사용자의 명시 승인을 받아 '기술본부 스튜디오' 채팅에 배포 충돌과 통합본을 전달했다.
- 이 격리 브랜치의 fa7c8cd는 최신 97f171f(접수목록 기반 일정 생성·가져오기 검사)를 포함한다. 목록 관련35/35, 실제 Tech proxy→Claim 함수+SQLite5/5(SKIP0), 기존협업41/41, 타입·빌드 PASS. 실제 배포한 원본054ccbda의 Panel lint 보완2줄도 격리본에 맞췄다.
- 이후 기술본부 채팅이 원본 통합054ccbda6d85bbc15d0a31666ba541634f6d8942를 96abf371-2fd2-4459-a495-f2949ac28099로 배포했다. root는 E 원본을 직접 수정하지 않았다. 운영7파일/E dist 해시 일치·정상 private binding·비인증401을 별도로 대조했다.
- 기존 유종욱 Tech 세션에서 최영배 합성 QA 프로젝트/2026-10-20을 선택하고 서버 저장본 다시 열기 후 수행 업무·다음 계획 exact/v1/저장버튼0을 실제 Chrome에서 확인했다. 기존 업무자료·계정·암호·권한·키는 보존했다. 실제 Tech 직원 계정 UI 작성·저장은 정상 자격증명 원본이 미확인이라 미검증이다.
- Claim 승인 이메일은 담당자 실제 받은함 수신과 두 링크→정확한 보고서·결재 버전, 로그인 후 사건/단계 복귀까지 PASS다. Claim 제품95d6895/안내54f30f2/기록c8d178e, 메일97d5065. 세종류 출력 버튼 활성화는 확인했으나 이번에 파일3개를 다시 다운로드하거나 HWP 전수검수한 것은 아니다.
- 후속 운영 배포는 원본을 담당하는 기술본부 채팅과 단일 통합 소스로 조정한다. 이 격리본만 보고 원본의 후속 변경을 덮지 않는다. CLAIM_WORKLOGS→concost-claim-center-preview#ClaimWorklogs·정상 세션 신원 검증과 기존 일정/업무일지/결재/자동보고를 보존한다.
- 증거·최신 상세 기록은 Claim repo의 docs/CF148_END_TO_END_SELF_AUDIT_20260914.md CF242와 private tmp/cf242-qa/{live-tech-final-artifacts,tech-shared-final,after}.json 및 해당 png다. 아래 CF241 '받은함 미확인'과 당시 배포 ID는 과거 이력이다. 이전 문서는 byte exact 보존한다.

## CF241 프로젝트 업무일지 연동·실서버 검수 / 승인메일 받은함 미확인 — 2026-10-20

- **요구·구현:** 사용자가 이승훈이 아닌 기존 **이경훈 센터장** 계정임을 확인했다. 이경훈·최영배·장범선만 본인에게 배정된 클레임 프로젝트의 수행 업무·다음 계획·특이사항·선택 시간을 작성한다. 대표·부사장·관리자의 기존 조회/결재 권한을 유지하며 새 작성권한은 부여하지 않았다. 이름/직급만으로 접근을 허용하지 않는다. Claim 제품 커밋 **ae5aa70**, Tech 제품 **ce5d1db**(당시 최신 원본 **ab21bfd**의 회의록/명함 변경 포함).
- **경로·저장:** Claim 프로젝트 워크→업무일지, Tech→클레임센터 업무일지. 기존 각 사이트 로그인→실제 세션의 고정 ID/login/email→비공개 CLAIM_WORKLOGS→ClaimWorklogs→기존 case assignment를 확인한다. 비밀번호/쿠키/키를 사이트끼리 복사하지 않는다. 기존 불변 workflow history에 일지 수정 이력을 추가하며 새 DDL/마이그레이션은 없다. 작성자·프로젝트·날짜별 CAS 버전 조건 INSERT로 충돌/권한변경 시 덮어쓰기를 막고 입력을 유지한다. 기존 Tech 업무일지/자동보고/결재는 변경하지 않았다. 양쪽 업데이트·사용 안내도 갱신했다.
- **발견·수정:** 개발과 가오픈 직원 ID가 서로 다름을 실제 읽기 전용 D1 조회로 확인했다. 검증된 환경별 ID+login 쌍만 허용하고 해당 DB의 실제 작성자 ID를 반환하도록 수정했다. 새 회귀의 Tech→개발 403 실패를 보존하고 고친 뒤 통과했다. 조회 실패를 빈 일지로 잘못 안내하는 문구와 프로젝트 문맥/로그아웃 미저장 보호도 보완했다. CF15의 추가 WL-01 경로 기대값 및 이전부터 실패하던 옛 큰 단계 안내 문구 검사를 현재 접근성 단계 표시에 맞췄으며 다른 가드는 유지했다.
- **자동·로컬 검수 PASS:** Claim 관련 19/19(업무일지 6건 포함), Tech proxy 실제 Claim 함수+SQLite 5/5, 기존 Tech collaboration 41/41·공통 회귀79/79·worker-route exit0. 양쪽 web 타입/빌드, Claim Worker 타입/컴파일, Tech 전체 Functions 컴파일 PASS. 로컬 실제 HTTP 로그인→일지 v1/v2 저장·재조회, 세 작성자 UI·두 탭 409 입력 보존·대표 읽기전용을 확인했다. 전체 제품 A–Z나 이전 모든 HWP 출력 재검수로 확대하지 않는다.
- **실서버 검수 PASS:** 기존 계정 원장의 3직원 암호를 값 출력/변경 없이 정상 로그인에 사용했다. 개발·가오픈 각 직원 3명 로그인/프로젝트 범위/작성자 ID 확인. 고객 자료와 구분된 새 합성 검수 프로젝트만 생성했다(개발 CC00009~11, 가오픈 CC00020~22). 개발 최영배 및 가오픈 **세 직원 모두 실제 UI 작성→서버 저장 v1→서버 저장본 다시 열기**에서 원문 일치를 확인했다. 기존 Tech 유종욱 정상 세션으로 최영배 가오픈 저장본 v1이 같은 프로젝트/날짜/작성자로 조회되며 쓰기 버튼이 없음을 확인했다. Tech 직원 암호의 정상 출처는 미확인이므로 실제 직원 Tech 작성은 **미검증**이고 로컬 proxy PUT과 실제 binding GET 범위로 구분한다. 다른 서비스의 암호를 추측해 재사용하지 않았다.
- **실제 화면:** 가오픈 390×844, scrollWidth375, 프로젝트·작성일·작성자 세로배치와 하단 재열기/저장 버튼·저장본 표시를 확인했다. 초기 캡처는 비동기로 열린 기존 업무알림·첫 사용 가이드에 가려졌으므로 제외했다. 안내를 닫은 최종 유효 증거는 browser/gaopen-mobile-final.png, gaopen-mobile-footer.png, gaopen-center-worklog.png, tech-live-shared.png. 사용자 Chrome의 기존 PM 세션은 보존했고 직원 UI 검수는 별도 IAB에서 했다. 임시 viewport는 원복했다.
- **배포·설정 보존:** 개발 Worker **16baf250-b5c5-49de-9adc-99eaa91cfc81**, 가오픈 **4b85de38-dfe8-44a9-8a45-411e4cd4f4d4**, Tech Pages **3a7614a1-eb13-4d88-9ad4-31b33d5e774d**. Claim 두 서버 동일46파일 SHA/canonical **129580dc1fa46d9738039a159720188c3d3ed21e1ebdc7cb1476d32fa5d28918**, entry index-r6KmrgWH.js, 기존 native runtime28파일/bcc40a79 불변, health/readiness200·비인증 auth/worklogs401. --keep-vars로 기존9개 binding/키 이름을 전후 비교해 보존했다. Tech 기존 env6개·D1·호환설정 해시 보존, 새 private binding 하나만 추가했다. secret 원문을 내려받아 동일성을 확인한 것은 아니다. 메일 Worker **5df44f56**/14bindings 불변, 이번 메일 재발송0·계정/비밀번호/역할/키 변경0·기존 업무자료 쓰기0.
- **승인 이메일 경계:** CF239의 Resend Delivered/SMTP250 및 outbox SENT는 그대로다. 이번에는 기존 동일 대상 그룹웨어 설정을 찾아 yjw 회사 계정 정상 로그인에 성공했다. 그러나 공식 전자메일/최근메일 경로가 메일 목록 대신 logout 스크립트·로그인 복귀를 반환한다. 실제 받은함 도착은 **미확인**이다. 새 OAuth grant/메일 계정 연결·권한변경·암호변경·다른 서비스 자격증명 재사용·중복 재발송을 하지 않았다. 사용자의 수동 파일/로그인 조작을 요청하지 않았다.
- **원본 저장소 경계·다음 시작:** Claim은 기존 cf166-recovery/feat/CF123-es-v2. Tech 작업은 chat work/cf241-tech-integration/codex/claim-worklogs 격리 저장소다. 공유 E 원본의 main을 fast-forward하는 시도는 **자동 승인 검토가 공유 작업트리 변경의 명시 승인 부족을 이유로 거절**해 실행하지 않았다. 원본 HEAD ab21bfd 및 기존 HANDOVER.md/gw_crawler.py 사용자 수정은 그대로다. 우회하지 않고 격리 브랜치로 전달한다. 원본 동기화 전에는 명시 승인과 최신 HEAD/미커밋 겹침 재확인이 필요하다. 담당자 받은함과 Tech 직원 실제 작성은 남은 별도 검증이다. 사용자의 기존 Claim 22삭제/package.json M/apps/web/tmp, Tech 원본 dirty/untracked를 보존한다.
- **증거:** private tmp/cf241-qa/{before,after,reviewed-release,live-development,live-gaopen,dev-staff-directory,tech-canonical-directory-retry,live-projects-development,live-projects-gaopen}.json, final-guidance-worklogs.log, regression/dev-identities-fixed-*.log, browser/gaopen-three-staff-ui-proof.json, code-map/mail-route-probe.json. 아래 기존 본문은 byte exact 보존한다.

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
