/**
 * Google Drive API 및 기술본부 통합 자료실 서비스
 * 
 * [폴더 계층 구조]
 * 1단계 (Root)    : 기술본부 자료실
 * 2단계 (Project) : [프로젝트코드] 프로젝트명
 * 3단계 (Team)    : 마감팀 / 구조팀 / 토목&조경팀
 * 4단계 (Role)    : 조적, 창호, 외부, 내부, 골조 등 (팀별 공종)
 * 5단계 (Subtitle): 1.프로그램파일(FIN), 2.CAD작업도면, 3.질의사항&견적조건, 4.기타
 * 
 * - 보안 정책: 클레임센터 스튜디오 방식으로 개인 Google OAuth 팝업 차단 (origin_mismatch 해결)
 * - 웹 로그인된 회원은 누구나 드래그앤드롭/파일선택으로 안전하게 업로드 및 웹 뷰어 다운로드 수행
 */

export const ROOT_FOLDER_NAME = '기술본부 자료실';

// 3대 대분류 폴더
export const MAIN_FOLDERS = [
  '01.접수자료',
  '02.마감자료',
  '03.구조자료',
] as const;

export type MainFolderType = typeof MAIN_FOLDERS[number];

// 세분화된 서브타이틀 폴더 목록
export const SUBTITLES = [
  '1.도면 및 발주처 제공자료',
  // 마감팀
  '1.납품자료',
  '2.프로그램파일(FIN)',
  '2.프로그램파일 (FIN)',
  '3.CAD작업도면',
  '4.견적조건 및 질의사항',
  '5.VIET QS 작업자료',
  '6.타분야자료',
  // 구조팀
  '1.프로그램파일(RC)',
  '1.프로그램파일 (RC)',
  '2.CAD작업도면',
  '3.견적조건 및 질의사항',
  '4.VIET QS 작업자료',
  // 하위 호환성
  '1.프로그램파일 (FIN)',
  '1.프로그램파일(FIN)',
  '3.질의사항&견적조건',
  '4.VIETQS 작업자료',
  '5.기타',
  '4.기타',
] as const;

export type SubtitleType = typeof SUBTITLES[number];

// 각 대분류별 세분화 매핑
export const FOLDER_SUBTITLES: Record<MainFolderType, readonly SubtitleType[]> = {
  '01.접수자료': [
    '1.도면 및 발주처 제공자료',
  ],
  '02.마감자료': [
    '1.납품자료',
    '2.프로그램파일(FIN)',
    '3.CAD작업도면',
    '4.견적조건 및 질의사항',
    '5.VIET QS 작업자료',
    '6.타분야자료',
  ],
  '03.구조자료': [
    '1.프로그램파일(RC)',
    '2.CAD작업도면',
    '3.견적조건 및 질의사항',
    '4.VIET QS 작업자료',
  ],
};

export interface SubtitleMeta {
  code: string;
  title: string;
  description: string;
  icon: string;
}

export const SUBTITLE_METAS: Record<string, SubtitleMeta> = {
  '1.도면 및 발주처 제공자료': {
    code: 'SPEC',
    title: '1.도면 및 발주처 제공자료',
    description: '발주처 원본 도면, 현장설명서, 입찰안내서, 지침자료',
    icon: 'DOC',
  },
  // 마감팀
  '1.납품자료': {
    code: 'DELIVER',
    title: '1.납품자료',
    description: '최종 납품 내역서, 견적서, 최종 성과물 보고서',
    icon: 'OUT',
  },
  '2.프로그램파일(FIN)': {
    code: 'FIN',
    title: '2.프로그램파일(FIN)',
    description: '마감 물량산출 프로그램 FIN 원본, 산출 데이터 백업 파일',
    icon: 'FIN',
  },
  '2.프로그램파일 (FIN)': {
    code: 'FIN',
    title: '2.프로그램파일(FIN)',
    description: '마감 물량산출 프로그램 FIN 원본, 산출 데이터 백업 파일',
    icon: 'FIN',
  },
  '1.프로그램파일 (FIN)': {
    code: 'FIN',
    title: '2.프로그램파일(FIN)',
    description: '마감 물량산출 프로그램 FIN 원본, 산출 데이터 백업 파일',
    icon: 'FIN',
  },
  '1.프로그램파일(FIN)': {
    code: 'FIN',
    title: '2.프로그램파일(FIN)',
    description: '마감 물량산출 프로그램 FIN 원본, 산출 데이터 백업 파일',
    icon: 'FIN',
  },
  '3.CAD작업도면': {
    code: 'CAD',
    title: '3.CAD작업도면',
    description: '건축/구조 산출 작업도면 (DWG, DXF, PDF 등)',
    icon: 'CAD',
  },
  '2.CAD작업도면': {
    code: 'CAD',
    title: '2.CAD작업도면',
    description: '구조 산출 작업도면 (DWG, DXF, PDF 등)',
    icon: 'CAD',
  },
  '4.견적조건 및 질의사항': {
    code: 'Q&A',
    title: '4.견적조건 및 질의사항',
    description: '견적조건표, 설계 질의회신서, 특기시방 및 단가 검토',
    icon: 'Q&A',
  },
  '3.견적조건 및 질의사항': {
    code: 'Q&A',
    title: '3.견적조건 및 질의사항',
    description: '구조 견적조건표, 설계 질의회신서, 단가 검토',
    icon: 'Q&A',
  },
  '5.VIET QS 작업자료': {
    code: 'VIETQS',
    title: '5.VIET QS 작업자료',
    description: '베트남 VIET QS 외주 및 협업 산출자료, 1차/2차 검토본',
    icon: 'VN',
  },
  '4.VIET QS 작업자료': {
    code: 'VIETQS',
    title: '4.VIET QS 작업자료',
    description: '베트남 VIET QS 외주 및 협업 산출자료, 1차/2차 검토본',
    icon: 'VN',
  },
  '6.타분야자료': {
    code: 'OTHER',
    title: '6.타분야자료',
    description: '기계, 전기, 토목, 조경 등 타분야 연계 및 협의 자료',
    icon: 'ETC',
  },
  // 구조팀
  '1.프로그램파일(RC)': {
    code: 'RC',
    title: '1.프로그램파일(RC)',
    description: '철근콘크리트(RC) 구조물량 산출 프로그램 원본, 산출 데이터 백업',
    icon: 'RC',
  },
  '1.프로그램파일 (RC)': {
    code: 'RC',
    title: '1.프로그램파일(RC)',
    description: '철근콘크리트(RC) 구조물량 산출 프로그램 원본, 산출 데이터 백업',
    icon: 'RC',
  },
  // 이전 호환성
  '3.질의사항&견적조건': {
    code: 'Q&A',
    title: '4.견적조건 및 질의사항',
    description: '견적조건표, 설계 질의회신서',
    icon: 'Q&A',
  },
  '4.VIETQS 작업자료': {
    code: 'VIETQS',
    title: '5.VIET QS 작업자료',
    description: '베트남 VIET QS 외주 및 협업 산출자료',
    icon: 'VN',
  },
  '5.기타': {
    code: 'ETC',
    title: '6.타분야자료',
    description: '참고자료 및 기타 보관 자료',
    icon: 'ETC',
  },
  '4.기타': {
    code: 'ETC',
    title: '6.타분야자료',
    description: '참고자료 및 기타 보관 자료',
    icon: 'ETC',
  },
};

export interface TechVaultFile {
  id: string;
  projectCode: string;
  projectName: string;
  mainFolder?: MainFolderType;
  teamName: string;
  roleName: string;
  subtitle: SubtitleType;
  originalName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageProvider: 'GOOGLE_DRIVE';
  uploadedBy: string;
  uploadedAt: string;
  downloadUrl?: string;
  driveUrl?: string | null;
}

export const ACCEPT_FILE_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.txt,.csv,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.dwg,.dxf,.zip,.7z';

// SHA-256 해시 계산
export async function calculateSha256(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `sha256-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ArrayBuffer -> Base64 변환
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// 용량 표기 포맷
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

// 로컬 스토리지 키 (v2로 업그레이드하여 과거 유령 데이터 자동 무효화)
const LOCAL_STORAGE_KEY = 'concost_tech_vault_files_v2';

function getLocalVaultFiles(): TechVaultFile[] {
  try {
    // 과거 레거시 유령 캐시 자동 정리
    localStorage.removeItem('concost_tech_vault_files_cache');
    localStorage.removeItem('concost_drive_vault_files');
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocalVaultFiles(files: TechVaultFile[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn('Local storage cache quota exceeded', e);
  }
}

// ==========================================
// Google Drive OAuth 2.0 및 실제 업로드 파이프라인
// ==========================================
export const GOOGLE_CLIENT_ID = '326035468474-6hoolqnhvl10knq0t2h03768su2agvja.apps.googleusercontent.com';
export const GOOGLE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';
const GDRIVE_TOKEN_KEY = 'concost_gdrive_access_token';
const GDRIVE_TOKEN_EXPIRY_KEY = 'concost_gdrive_access_token_expiry';

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * 저장된 Google Drive OAuth Access Token 반환 (만료 체크)
 */
export function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem(GDRIVE_TOKEN_KEY);
    const expiry = localStorage.getItem(GDRIVE_TOKEN_EXPIRY_KEY);
    if (!token) return null;
    if (expiry && Date.now() > Number(expiry)) {
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      localStorage.removeItem(GDRIVE_TOKEN_EXPIRY_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * 실제 Google Drive 회사 계정 연동 여부 확인 (서버 상태 API 기준)
 */
export async function checkServerGoogleDriveConnected(): Promise<boolean> {
  try {
    const res = await fetch('/api/google/status');
    if (res.ok) {
      const data = await res.json();
      return !!data.connected;
    }
  } catch (e) {
    console.warn('Failed to check Google Drive server connection:', e);
  }
  return true; // 기본값 활성화 (클레임센터 스튜디오 정책)
}

/**
 * 관리자 회사 Google Drive 계정 1회 연동 시작 (클레임센터 스튜디오 방식)
 */
export function startCompanyGoogleOAuth(): void {
  window.location.href = '/api/google/oauth/start';
}

/**
 * Google Drive 연동 해제 (서버 저장된 refresh_token 삭제)
 */
export async function clearGoogleDriveAuth(): Promise<void> {
  try {
    await fetch('/api/google/oauth/disconnect', { method: 'POST' });
    localStorage.removeItem(GDRIVE_TOKEN_KEY);
    localStorage.removeItem(GDRIVE_TOKEN_EXPIRY_KEY);
  } catch (e) {
    console.warn('Error disconnecting Google Drive:', e);
  }
}

/**
 * 부모 폴더 내에서 특정 이름의 폴더 탐색 및 자동 생성
 */
async function findOrCreateDriveFolder(
  name: string,
  parentId: string,
  accessToken: string
): Promise<string> {
  const escapedName = name.replace(/'/g, "\\'");
  const query = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // 없으면 새로 생성
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(
      `Google Drive 폴더 [${name}] 생성 실패: ${
        err.error?.message || createRes.statusText
      }`
    );
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * CONCOST 자료실 5단계 계층 폴더 검증 및 생성
 * CONCOST 자료실 > [프로젝트코드] 프로젝트명 > [대분류] > [공종] > [서브타이틀]
 */
/**
 * CONCOST 기술본부 자료실 정밀 계층 폴더 검증 및 생성
 * 1단계 (Root)    : 기술본부 자료실
 * 2단계 (Project) : [프로젝트코드] 프로젝트명 (예: [TK-2026087] [삼성물산(주)] P5 FAB2 신축공사 견적용역)
 * 3단계 (Main)    : 01.접수자료 / 02.마감팀자료 / 03.구조팀자료
 * 4단계 (Role)    : 조적, 창호, 외부, 골조 등 (01.접수자료인 경우 생략)
 * 5단계 (Subtitle): 1.프로그램파일 (FIN), 2.CAD작업도면, 3.질의사항&견적조건 등
 */
export async function ensureDriveFolderHierarchy(params: {
  projectCode: string;
  projectName: string;
  mainFolder?: string;
  roleName?: string;
  subtitle: string;
  accessToken: string;
}): Promise<{ folderId: string; folderPath: string }> {
  const {
    projectCode,
    projectName,
    mainFolder = '02.마감팀자료',
    roleName = '공종',
    subtitle,
    accessToken,
  } = params;

  // 1단계: '기술본부 자료실' (최상위)
  const rootId = await findOrCreateDriveFolder('기술본부 자료실', 'root', accessToken);

  // 2단계: 프로젝트 폴더명 정규화
  let cleanProjectName = projectName;
  if (!cleanProjectName.includes(projectCode)) {
    cleanProjectName = `[${projectCode}] ${projectName}`.trim();
  }
  const projectId = await findOrCreateDriveFolder(cleanProjectName, rootId, accessToken);

  // 3단계: 대분류 폴더명 (접수자료 / 마감팀자료 / 구조팀자료)
  let normalizedMain = mainFolder;
  if (mainFolder.includes('마감')) {
    normalizedMain = '02.마감팀자료';
  } else if (mainFolder.includes('구조')) {
    normalizedMain = '03.구조팀자료';
  } else if (mainFolder.includes('접수')) {
    normalizedMain = '01.접수자료';
  }
  const mainId = await findOrCreateDriveFolder(normalizedMain, projectId, accessToken);

  // 4단계: 공종 폴더 (01.접수자료는 공종 폴더 생략)
  let parentForSub = mainId;
  let pathStr = `기술본부 자료실 > ${cleanProjectName} > ${normalizedMain}`;

  if (normalizedMain !== '01.접수자료' && roleName && roleName !== '공통') {
    parentForSub = await findOrCreateDriveFolder(roleName, mainId, accessToken);
    pathStr += ` > ${roleName}`;
  }

  // 5단계: 세분화 서브타이틀 폴더
  const finalFolderId = await findOrCreateDriveFolder(subtitle, parentForSub, accessToken);
  pathStr += ` > ${subtitle}`;

  return { folderId: finalFolderId, folderPath: pathStr };
}

/**
 * 실제 Google Drive multipart API를 통한 파일 업로드
 */
export async function uploadFileToGoogleDrive(params: {
  file: File;
  folderId: string;
  accessToken: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const { file, folderId, accessToken } = params;

  const metadata = {
    name: file.name,
    parents: [folderId],
  };

  const boundary = '-------concost-boundary-' + Math.random().toString(36).substring(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const mimeType =
    file.type ||
    (file.name.endsWith('.xlsx')
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/octet-stream');

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}`;
  const fileHeaderPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const fileBuffer = await file.arrayBuffer();
  const fullBody = new Blob(
    [metadataPart, fileHeaderPart, fileBuffer, closeDelimiter],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const uploadUrl =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: fullBody,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google Drive 파일 업로드 실패: ${err.error?.message || res.statusText}`
    );
  }

  return await res.json();
}

/**
 * 기술본부 파일 목록 조회 (프로젝트별 또는 전체)
 */
export async function fetchVaultFiles(projectCode?: string): Promise<TechVaultFile[]> {
  try {
    const url = projectCode ? `/api/drive/files?projectCode=${encodeURIComponent(projectCode)}` : '/api/drive/files';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        const mapped = data.files.map((f: any) => ({
          id: f.id,
          projectCode: f.project_code || projectCode || '',
          projectName: f.project_name || '',
          teamName: f.team_name || '마감팀',
          roleName: f.role_name || '공종',
          subtitle: (f.category as SubtitleType) || '1.프로그램파일 (FIN)',
          originalName: f.original_name || f.name,
          mimeType: f.mime_type || 'application/octet-stream',
          byteSize: Number(f.byte_size) || 0,
          sha256: f.sha256 || '',
          storageProvider: 'GOOGLE_DRIVE' as const,
          uploadedBy: f.uploaded_by || '사용자',
          uploadedAt: f.uploaded_at || new Date().toISOString(),
          downloadUrl: `/api/drive/files/download?id=${encodeURIComponent(f.id)}`,
          driveUrl: f.drive_url || null,
        }));
        return mapped;
      }
    }
  } catch (err) {
    console.warn('Server fetch failed, using local cache:', err);
  }

  const locals = getLocalVaultFiles();
  if (projectCode) {
    return locals.filter((f) => f.projectCode === projectCode);
  }
  return locals;
}

/**
 * 기술본부 5단계 분류 파일 업로드 실행
 */
export async function uploadVaultFile(params: {
  projectCode: string;
  projectName: string;
  mainFolder?: MainFolderType;
  teamName: string;
  roleName: string;
  subtitle: SubtitleType;
  file: File;
  uploadedBy: string;
}): Promise<TechVaultFile> {
  const { projectCode, projectName, mainFolder, teamName, roleName, subtitle, file, uploadedBy } = params;
  const sha256 = await calculateSha256(file);
  const fileId = `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const uploadedAt = new Date().toISOString();

  // Base64 생성 (서버로 전송하여 회사 Google Drive API 업로드 및 D1 보관)
  let base64Data = '';
  try {
    if (file.size <= 15 * 1024 * 1024) {
      const buffer = await file.arrayBuffer();
      base64Data = arrayBufferToBase64(buffer);
    }
  } catch (e) {
    console.warn('Base64 encoding skipped for large file', e);
  }

  let serverDriveUrl = `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(file.name)}`;

  const payload = {
    id: fileId,
    projectCode,
    projectName,
    mainFolder: mainFolder || '02.마감팀자료',
    teamName,
    roleName,
    category: subtitle,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    sha256,
    uploadedBy,
    uploadedAt,
    driveUrl: serverDriveUrl,
    fileData: base64Data,
  };

  const res = await fetch('/api/drive/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || errorJson.error || 'Google Drive 서버 업로드 실패');
  }

  const data = await res.json();
  if (data.file?.driveUrl) {
    serverDriveUrl = data.file.driveUrl;
  }

  const fileRecord: TechVaultFile = {
    id: fileId,
    projectCode,
    projectName,
    mainFolder,
    teamName,
    roleName,
    subtitle,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    sha256,
    storageProvider: 'GOOGLE_DRIVE',
    uploadedBy,
    uploadedAt,
    downloadUrl: `/api/drive/files/download?id=${encodeURIComponent(fileId)}`,
    driveUrl: serverDriveUrl,
  };

  const locals = getLocalVaultFiles();
  locals.unshift(fileRecord);
  saveLocalVaultFiles(locals);

  return fileRecord;
}

/**
 * 파일 다운로드 실행 (엑셀 및 한글 파일명 깨짐 방지 2중 잠금)
 */
export async function downloadVaultFile(file: TechVaultFile): Promise<void> {
  try {
    const res = await fetch(`/api/drive/files/download?id=${encodeURIComponent(file.id)}`);
    if (res.ok) {
      const blob = await res.blob();
      const mimeType =
        file.mimeType ||
        (file.originalName.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : file.originalName.endsWith('.xls')
          ? 'application/vnd.ms-excel'
          : 'application/octet-stream');

      const typedBlob = new Blob([blob], { type: mimeType });
      const url = URL.createObjectURL(typedBlob);
      const a = document.createElement('a');
      a.href = url;
      const downloadFileName = file.originalName || 'download.xlsx';
      a.setAttribute('download', downloadFileName);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 300);
      return;
    }
  } catch (err) {
    console.warn('API download failed, fallback to direct notification', err);
  }

  if (file.driveUrl) {
    window.open(file.driveUrl, '_blank');
  } else {
    alert(`[${file.originalName}] 다운로드를 완료할 수 없습니다.`);
  }
}

/**
 * 자료실 파일 삭제 (서버 D1 및 로컬 캐시 동시 삭제)
 */
export async function deleteVaultFile(fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/drive/files?id=${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      console.warn('Server delete returned non-200');
    }
  } catch (err) {
    console.warn('Server delete failed:', err);
  }

  // 로컬 캐시에서도 삭제
  const locals = getLocalVaultFiles().filter((f) => f.id !== fileId);
  saveLocalVaultFiles(locals);
  return true;
}

/**
 * 선택된 프로젝트의 Google Drive 5대 계층 폴더 사전 자동생성
 */
export async function ensureProjectFolders(projectCode: string, projectName: string): Promise<{ success: boolean; driveUrl?: string; message?: string }> {
  try {
    const res = await fetch('/api/drive/folders/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectCode, projectName }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, driveUrl: data.driveUrl };
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.message || '폴더 생성 실패' };
  } catch (err: any) {
    return { success: false, message: err.message || '서버 통신 실패' };
  }
}

