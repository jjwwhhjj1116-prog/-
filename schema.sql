-- =========================================================
-- CONCOST 기술본부 프로젝트 일정표 Cloudflare D1 스키마 DDL
-- Database: concost-tech-scheduler-db (ID: 28a9c32b-647d-47de-a916-d966327b35ca)
-- =========================================================

-- 1. 메인 물량산출 프로젝트 테이블
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    pm_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 세부 공종별 일정 및 배정 테이블 (마감/구조/토목 공종)
CREATE TABLE IF NOT EXISTS sub_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    role_name TEXT NOT NULL,
    person_id TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT '예정',
    memo TEXT,
    version TEXT DEFAULT 'v1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 3. 그룹웨어 수주소식 접수 프로젝트 목록
CREATE TABLE IF NOT EXISTS intake_projects (
    id TEXT PRIMARY KEY,
    no INTEGER UNIQUE NOT NULL,
    code TEXT NOT NULL,
    client TEXT NOT NULL,
    name TEXT NOT NULL,
    raw_title TEXT,
    author TEXT,
    received_date TEXT,
    start_date TEXT,
    end_date TEXT,
    scope_text TEXT,
    target_departments TEXT,
    status TEXT DEFAULT '접수완료',
    is_scheduled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 기술본부 회의록 테이블
CREATE TABLE IF NOT EXISTS meeting_minutes (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    project_name TEXT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    department TEXT NOT NULL,
    attendees TEXT,
    summary TEXT,
    action_items TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Google Drive 및 시스템 연동 설정
CREATE TABLE IF NOT EXISTS gdrive_configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_projects_dept ON projects(department);
CREATE INDEX IF NOT EXISTS idx_sub_tasks_project ON sub_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_intake_no ON intake_projects(no);
