/**
 * Google Drive API v3 연동 서비스 (CONCOST 기술본부 자료실 전용)
 * 
 * [폴더 계층 구조]
 * 1단계 (Root)    : 기술본부 자료실
 * 2단계 (Project) : [프로젝트코드] 프로젝트명
 * 3단계 (Team)    : 마감팀 / 구조팀 / 토목&조경팀
 * 4단계 (Role)    : 조적, 창호, 외부, 내부 등 (팀별 공종)
 * 5단계 (Subtitle): 1.프로그램파일(FIN), 2.CAD작업도면, 3.질의사항&견적조건, 4.기타
 */

export const ROOT_FOLDER_NAME = '기술본부 자료실';

export const SUBTITLES = [
  '1.프로그램파일(FIN)',
  '2.CAD작업도면',
  '3.질의사항&견적조건',
  '4.기타'
] as const;

export type SubtitleType = typeof SUBTITLES[number];

const TOKEN_STORAGE_KEY = 'concost_gdrive_access_token';
const TOKEN_EXPIRY_KEY = 'concost_gdrive_token_expiry';
const USER_EMAIL_KEY = 'concost_gdrive_user_email';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink: string;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  subtitle?: string;
  roleName?: string;
  teamName?: string;
  projectName?: string;
}

export interface DriveFolderNode {
  id: string;
  name: string;
  path: string;
  childrenFolders: DriveFolderNode[];
  files: DriveFileInfo[];
}

// Access Token 반환 (만료 체크)
export function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

// Google Identity Services (GIS) 토큰 클라이언트 기반 로그인
export function requestGoogleDriveAuth(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      reject(new Error('Google Identity Services SDK가 로드되지 않았습니다. 페이지를 새로고침 해주세요.'));
      return;
    }

    try {
      // @ts-ignore
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file',
        prompt: 'consent',
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (response.access_token) {
            const expiresInMs = (Number(response.expires_in) || 3599) * 1000;
            localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
            localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresInMs));
            localStorage.setItem(USER_EMAIL_KEY, 'concost_dt@gmail.com');
            resolve(response.access_token);
          } else {
            reject(new Error('액세스 토큰을 수신하지 못했습니다.'));
          }
        },
      });

      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

// 로그아웃 / 연동 해제
export function clearGoogleDriveAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

// Google Drive API 호출 헬퍼
async function driveApiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Google Drive 연동이 필요합니다. 먼저 [Google Drive 연동]을 진행해주세요.');
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Google Drive API 오류 (${res.status})`);
  }

  return res.json();
}

/**
 * 특정 부모 폴더 내에서 이름으로 폴더를 찾거나 없으면 생성
 */
export async function getOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  // 1. 기존 폴더 검색
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchRes = await driveApiFetch(`files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
  if (searchRes.files && searchRes.files.length > 0) {
    return searchRes.files[0].id;
  }

  // 2. 폴더 생성
  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await driveApiFetch('files?fields=id,name', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  return createRes.id;
}

/**
 * 5단계 계층 폴더를 순차적으로 보장(생성/조회)
 * [기술본부 자료실] -> [프로젝트명] -> [팀명] -> [공종명] -> [서브타이틀]
 */
export async function ensureFullDriveHierarchy(params: {
  projectName: string;
  teamName: string;
  roleName: string;
  subtitle: SubtitleType;
}): Promise<{
  rootId: string;
  projectId: string;
  teamId: string;
  roleId: string;
  subtitleFolderId: string;
}> {
  // 1단계: 최상위 "기술본부 자료실"
  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME);

  // 2단계: 프로젝트 폴더 (예: "[TK-2026087] 삼성물산 P5 FAB2")
  const projectId = await getOrCreateFolder(params.projectName, rootId);

  // 3단계: 팀별 폴더 ("마감팀", "구조팀", "토목&조경팀")
  const teamId = await getOrCreateFolder(params.teamName, projectId);

  // 4단계: 각 팀별 공종 폴더 ("조적", "창호", "외부", "내부" 등)
  const roleId = await getOrCreateFolder(params.roleName, teamId);

  // 5단계: 서브타이틀 폴더 (1.프로그램파일(FIN), 2.CAD작업도면, 3.질의사항&견적조건, 4.기타)
  const subtitleFolderId = await getOrCreateFolder(params.subtitle, roleId);

  return {
    rootId,
    projectId,
    teamId,
    roleId,
    subtitleFolderId,
  };
}

/**
 * 실제 바이너리 파일 업로드 (Multipart/Related)
 */
export async function uploadFileToDrive(
  folderId: string,
  file: File,
  metadataExtra: {
    projectName: string;
    teamName: string;
    roleName: string;
    subtitle: SubtitleType;
    authorName: string;
  }
): Promise<DriveFileInfo> {
  const token = getStoredToken();
  if (!token) {
    throw new Error('Google Drive 인증 토큰이 없습니다.');
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: file.name,
    parents: [folderId],
    description: `CONCOST 기술본부 자료실 | 담당: ${metadataExtra.authorName} | ${metadataExtra.projectName} > ${metadataExtra.teamName} > ${metadataExtra.roleName} > ${metadataExtra.subtitle}`,
    properties: {
      projectName: metadataExtra.projectName,
      teamName: metadataExtra.teamName,
      roleName: metadataExtra.roleName,
      subtitle: metadataExtra.subtitle,
      author: metadataExtra.authorName,
    },
  };

  const fileData = await file.arrayBuffer();

  const multipartRequestBody = new Blob([
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    fileData,
    closeDelimiter,
  ]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,createdTime,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `파일 업로드 실패 (${res.status})`);
  }

  const data = await res.json();
  const bytes = Number(data.size) || file.size;
  const sizeStr =
    bytes > 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;

  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: sizeStr,
    webViewLink: data.webViewLink,
    createdTime: data.createdTime,
    modifiedTime: data.modifiedTime,
    subtitle: metadataExtra.subtitle,
    roleName: metadataExtra.roleName,
    teamName: metadataExtra.teamName,
    projectName: metadataExtra.projectName,
  };
}

/**
 * "기술본부 자료실" 하위의 모든 업로드된 실제 파일 목록 조회
 */
export async function listAllTechVaultFiles(): Promise<DriveFileInfo[]> {
  const token = getStoredToken();
  if (!token) return [];

  try {
    // 기술본부 자료실 루트 폴더 ID 조회
    const rootFolderQuery = `mimeType='application/vnd.google-apps.folder' and name='${ROOT_FOLDER_NAME}' and trashed=false`;
    const rootRes = await driveApiFetch(`files?q=${encodeURIComponent(rootFolderQuery)}&fields=files(id)`);
    if (!rootRes.files || rootRes.files.length === 0) {
      return [];
    }

    // 기술본부 자료실에 속한 파일들 검색 (폴더가 아닌 일반 파일들)
    const fileQuery = `mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
    const res = await driveApiFetch(
      `files?q=${encodeURIComponent(fileQuery)}&pageSize=100&orderBy=createdTime desc&fields=files(id,name,mimeType,size,webViewLink,createdTime,modifiedTime,parents,properties)`
    );

    if (!res.files) return [];

    return res.files.map((f: any) => {
      const bytes = Number(f.size) || 0;
      const sizeStr =
        bytes > 1024 * 1024
          ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
          : bytes > 0
          ? `${(bytes / 1024).toFixed(1)} KB`
          : '0 KB';

      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: sizeStr,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        createdTime: f.createdTime?.slice(0, 10) || '',
        modifiedTime: f.modifiedTime?.slice(0, 10) || '',
        parents: f.parents,
        subtitle: f.properties?.subtitle,
        roleName: f.properties?.roleName,
        teamName: f.properties?.teamName,
        projectName: f.properties?.projectName,
      };
    });
  } catch (err) {
    console.error('Failed to list tech vault files from Google Drive:', err);
    return [];
  }
}
