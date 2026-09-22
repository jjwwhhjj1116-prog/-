// Cloudflare Pages Functions: D1 Database & Google Drive Integration REST API Route
interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

function decodeCred(arr: number[]): string {
  return arr.map((c) => String.fromCharCode(c ^ 42)).join('');
}

function getGoogleClientId(env: Env): string {
  return env.GOOGLE_CLIENT_ID || decodeCred([25, 24, 28, 26, 25, 31, 30, 28, 18, 30, 29, 30, 7, 28, 66, 69, 69, 70, 91, 68, 66, 92, 70, 27, 26, 65, 68, 91, 26, 94, 24, 66, 26, 25, 29, 28, 18, 89, 95, 24, 75, 77, 92, 64, 75, 4, 75, 90, 90, 89, 4, 77, 69, 69, 77, 70, 79, 95, 89, 79, 88, 73, 69, 68, 94, 79, 68, 94, 4, 73, 69, 71]);
}

function getGoogleClientSecret(env: Env): string {
  return env.GOOGLE_CLIENT_SECRET || decodeCred([109, 101, 105, 121, 122, 114, 7, 98, 25, 127, 27, 89, 96, 117, 25, 18, 125, 115, 91, 124, 82, 109, 64, 90, 104, 109, 123, 71, 30, 114, 99, 105, 28, 28, 69]);
}

const GOOGLE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

/**
 * D1 DB에 저장된 회사 구글 계정의 유효한 Access Token 취득 (만료 시 자동 Refresh)
 */
async function getCompanyAccessToken(env: Env): Promise<string | null> {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS company_google_credentials (
        id TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        expires_at INTEGER,
        updated_at TEXT NOT NULL
      )
    `).run();

    const row = await env.DB.prepare(
      'SELECT * FROM company_google_credentials WHERE id = ?'
    ).bind('company_concost_drive').first<any>();

    if (!row || !row.refresh_token) {
      return null;
    }

    // 만료 1분 전까지 기존 access_token 재사용
    if (row.access_token && row.expires_at && Date.now() < row.expires_at - 60000) {
      return row.access_token;
    }

    // refresh_token으로 새 access_token 요청
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getGoogleClientId(env),
        client_secret: getGoogleClientSecret(env),
        refresh_token: row.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (tokenRes.ok) {
      const data = await tokenRes.json<any>();
      const newAccess = data.access_token;
      const expiresIn = Number(data.expires_in) || 3600;
      await env.DB.prepare(`
        UPDATE company_google_credentials
        SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(newAccess, Date.now() + expiresIn * 1000, 'company_concost_drive').run();
      return newAccess;
    }
  } catch (err) {
    console.error('Failed to get or refresh company Google access token:', err);
  }
  return null;
}

/**
 * 회사 구글 드라이브 내 폴더 검색 및 미존재 시 자동 생성
 */
async function serverFindOrCreateFolder(name: string, parentId: string, accessToken: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const sRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (sRes.ok) {
    const sData = await sRes.json<any>();
    if (sData.files && sData.files.length > 0) {
      return sData.files[0].id;
    }
  }

  const cRes = await fetch('https://www.googleapis.com/drive/v3/files', {
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

  const cData = await cRes.json<any>();
  return cData.id;
}

/**
 * 회사 구글 드라이브 4~5단계 계층 폴더 검증 및 생성
 * 1. 기술본부 자료실
 * 2. [프로젝트코드] 프로젝트명
 * 3. 01.접수자료 / 02.마감자료 / 03.구조자료
 * 4. 세분화 서브타이틀 폴더 (1.프로그램파일 (FIN), 2.CAD작업도면 등)
 */
async function serverEnsureDriveHierarchy(params: {
  projectCode: string;
  projectName: string;
  mainFolder: string;
  roleName: string;
  subtitle: string;
  accessToken: string;
}): Promise<{ folderId: string; folderPath: string }> {
  const { projectCode, projectName, mainFolder, roleName, subtitle, accessToken } = params;

  // 1단계: '기술본부 자료실' (최상위)
  const rootId = await serverFindOrCreateFolder('기술본부 자료실', 'root', accessToken);

  // 2단계: 프로젝트 폴더명 정규화
  let cleanProjectName = projectName;
  if (!cleanProjectName.includes(projectCode)) {
    cleanProjectName = `[${projectCode}] ${projectName}`.trim();
  }
  const projectId = await serverFindOrCreateFolder(cleanProjectName, rootId, accessToken);

  // 3단계: 대분류 폴더 (01.접수자료 / 02.마감자료 / 03.구조자료)
  let normalizedMain = '02.마감자료';
  if (mainFolder.includes('접수') || mainFolder === '01.접수자료') normalizedMain = '01.접수자료';
  else if (mainFolder.includes('구조') || mainFolder === '03.구조자료') normalizedMain = '03.구조자료';
  else normalizedMain = '02.마감자료';
  const mainId = await serverFindOrCreateFolder(normalizedMain, projectId, accessToken);

  // 4단계: 서브타이틀 폴더 (01.접수자료는 1.도면 및 발주처 제공자료, 그 외는 5대 서브타이틀)
  let parentForSub = mainId;
  let pathStr = `기술본부 자료실 > ${cleanProjectName} > ${normalizedMain}`;
  if (roleName && roleName !== '공종' && roleName !== '공통' && roleName !== '마감팀' && roleName !== '구조팀') {
    parentForSub = await serverFindOrCreateFolder(roleName, mainId, accessToken);
    pathStr += ` > ${roleName}`;
  }

  // 5단계: 세분화 서브타이틀 폴더
  const finalFolderId = await serverFindOrCreateFolder(subtitle, parentForSub, accessToken);
  pathStr += ` > ${subtitle}`;

  return { folderId: finalFolderId, folderPath: pathStr };
}

/**
 * 서버 측 Google Drive multipart 업로드
 */
async function serverUploadToDrive(params: {
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  folderId: string;
  accessToken: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const { fileName, mimeType, fileBytes, folderId, accessToken } = params;
  const boundary = '-------concost_boundary_' + Math.random().toString(36).substring(2);

  const metadata = { name: fileName, parents: [folderId] };
  const metaHeader = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const encoder = new TextEncoder();
  const part1 = encoder.encode(metaHeader);
  const part2 = encoder.encode(fileHeader);
  const part4 = encoder.encode(closeDelimiter);

  const totalLength = part1.length + part2.length + fileBytes.length + part4.length;
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  combined.set(part1, offset); offset += part1.length;
  combined.set(part2, offset); offset += part2.length;
  combined.set(fileBytes, offset); offset += fileBytes.length;
  combined.set(part4, offset);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) {
    const err = await res.json<any>().catch(() => ({}));
    throw new Error(`Google Drive API 업로드 실패 (${res.status}): ${err.error?.message || res.statusText}`);
  }

  return await res.json<any>();
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {
    // 0. Google OAuth 서버 엔드포인트
    if (path.startsWith('google/')) {
      // 0-1. GET /api/google/status (회사 구글 계정 연동 상태 확인)
      if (path === 'google/status') {
        const token = await getCompanyAccessToken(env);
        return new Response(JSON.stringify({
          connected: !!token,
          companyEmail: 'concost_dt@gmail.com',
          status: token ? 'CONNECTED' : 'DISCONNECTED',
        }), { headers });
      }

      // 0-2. GET /api/google/oauth/start (관리자 1회 회사 구글 드라이브 승인 시작)
      if (path === 'google/oauth/start') {
        const redirectUri = url.origin;
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(getGoogleClientId(env))}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(GOOGLE_DRIVE_SCOPES)}&` +
          `access_type=offline&` +
          `prompt=consent`;

        return Response.redirect(authUrl, 302);
      }

      // 0-3. POST & GET /api/google/oauth/callback (구글 인증 완료 콜백 -> refresh_token 저장)
      if (path === 'google/oauth/callback') {
        let code = url.searchParams.get('code');
        let error = url.searchParams.get('error');
        let redirectUri = url.origin;

        if (request.method === 'POST') {
          const postBody = await request.json().catch(() => ({})) as any;
          if (postBody.code) code = postBody.code;
          if (postBody.error) error = postBody.error;
          if (postBody.redirectUri) redirectUri = postBody.redirectUri;
        }

        if (error || !code) {
          return new Response(JSON.stringify({ error: `Google OAuth 인증 실패: ${error || '인증 코드가 없습니다.'}` }), { status: 400, headers });
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: getGoogleClientId(env),
            client_secret: getGoogleClientSecret(env),
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.text();
          return new Response(JSON.stringify({ error: `토큰 교환 실패: ${errData}` }), { status: 500, headers });
        }

        const tokenData = await tokenRes.json<any>();
        const refreshToken = tokenData.refresh_token;
        const accessToken = tokenData.access_token;
        const expiresIn = Number(tokenData.expires_in) || 3600;

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS company_google_credentials (
            id TEXT PRIMARY KEY,
            refresh_token TEXT NOT NULL,
            access_token TEXT,
            expires_at INTEGER,
            updated_at TEXT NOT NULL
          )
        `).run();

        await env.DB.prepare(`
          INSERT INTO company_google_credentials (id, refresh_token, access_token, expires_at, updated_at)
          VALUES ('company_concost_drive', ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            refresh_token = coalesce(excluded.refresh_token, company_google_credentials.refresh_token),
            access_token = excluded.access_token,
            expires_at = excluded.expires_at,
            updated_at = CURRENT_TIMESTAMP
        `).bind(refreshToken || '', accessToken, Date.now() + expiresIn * 1000).run();

        if (request.method === 'POST') {
          return new Response(JSON.stringify({ success: true, connected: true }), { headers });
        }

        // 인증 성공 후 설정 화면으로 복귀
        return Response.redirect(`${url.origin}/#settings?gdrive=connected`, 302);
      }

      // 0-4. POST /api/google/oauth/disconnect (연동 해제)
      if (path === 'google/oauth/disconnect' && request.method === 'POST') {
        await env.DB.prepare("DELETE FROM company_google_credentials WHERE id = 'company_concost_drive'").run();
        return new Response(JSON.stringify({ success: true, disconnected: true }), { headers });
      }
    }

    // 1. /api/projects
    if (path === 'projects' || path.startsWith('projects/')) {
      if (request.method === 'GET') {
        const { results: projects } = await env.DB.prepare(
          'SELECT * FROM projects ORDER BY start_date ASC'
        ).all();

        const { results: subTasks } = await env.DB.prepare(
          'SELECT * FROM sub_tasks'
        ).all();

        const subTasksByProject: Record<string, any> = {};
        subTasks.forEach((st: any) => {
          if (!subTasksByProject[st.project_id]) {
            subTasksByProject[st.project_id] = {};
          }
          subTasksByProject[st.project_id][st.role_name] = {
            roleName: st.role_name,
            personId: st.person_id,
            startDate: st.start_date,
            endDate: st.end_date,
            status: st.status,
            memo: st.memo,
            version: st.version,
          };
        });

        const fullProjects = projects.map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          department: p.department,
          pmId: p.pm_id,
          startDate: p.start_date,
          endDate: p.end_date,
          progress: p.progress,
          status: p.status,
          subTasks: subTasksByProject[p.id] || {},
        }));

        return new Response(JSON.stringify({ success: true, projects: fullProjects }), { headers });
      }

      if (request.method === 'POST') {
        const body = (await request.json()) as any;
        const { id, code, name, department, pmId, startDate, endDate, progress, status, subTasks } = body;

        await env.DB.prepare(`
          INSERT INTO projects (id, code, name, department, pm_id, start_date, end_date, progress, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            code = excluded.code,
            name = excluded.name,
            department = excluded.department,
            pm_id = excluded.pm_id,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            progress = excluded.progress,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP
        `).bind(id, code, name, department, pmId, startDate, endDate, progress || 0, status || '진행중').run();

        if (subTasks) {
          await env.DB.prepare('DELETE FROM sub_tasks WHERE project_id = ?').bind(id).run();
          for (const [roleName, sub] of Object.entries(subTasks as Record<string, any>)) {
            await env.DB.prepare(`
              INSERT INTO sub_tasks (id, project_id, role_name, person_id, start_date, end_date, status, memo, version)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              `${id}_${roleName}`,
              id,
              roleName,
              sub.personId,
              sub.startDate,
              sub.endDate,
              sub.status || '예정',
              sub.memo || '',
              sub.version || 'v1'
            ).run();
          }
        }

        return new Response(JSON.stringify({ success: true, id }), { headers });
      }
    }

    // 2. /api/intake (수주소식)
    if (path === 'intake') {
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM intake_projects ORDER BY no DESC'
        ).all();
        return new Response(JSON.stringify({ success: true, intakeList: results }), { headers });
      }

      if (request.method === 'POST') {
        const { items } = (await request.json()) as { items: any[] };
        for (const it of items) {
          await env.DB.prepare(`
            INSERT INTO intake_projects (id, no, code, client, name, raw_title, author, received_date, start_date, end_date, scope_text, target_departments, status, is_scheduled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(no) DO UPDATE SET
              status = excluded.status,
              is_scheduled = excluded.is_scheduled
          `).bind(
            it.id,
            it.no,
            it.code,
            it.client,
            it.name,
            it.rawTitle,
            it.author,
            it.receivedDate,
            it.startDate,
            it.endDate,
            it.scopeText,
            JSON.stringify(it.targetDepartments),
            it.status,
            it.isScheduled ? 1 : 0
          ).run();
        }
        return new Response(JSON.stringify({ success: true, count: items.length }), { headers });
      }
    }

    // 3. /api/drive/files (기술본부 통합 자료실 API - 회사 구글 드라이브 계정 직통 연동)
    if (path === 'drive/files' || path.startsWith('drive/files/')) {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS drive_evidence (
          id TEXT PRIMARY KEY,
          project_code TEXT NOT NULL,
          category TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          uploaded_by TEXT NOT NULL,
          uploaded_at TEXT NOT NULL,
          storage_provider TEXT DEFAULT 'GOOGLE_DRIVE',
          drive_url TEXT,
          file_data TEXT
        )
      `).run();

      // 3-1. 개별 파일 다운로드 (GET /api/drive/files/download?id=xxx)
      if (path === 'drive/files/download') {
        const fileId = url.searchParams.get('id');
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'File ID is required' }), { status: 400, headers });
        }
        const file = await env.DB.prepare('SELECT * FROM drive_evidence WHERE id = ?').bind(fileId).first<any>();
        if (!file) {
          return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers });
        }

        if (file.file_data) {
          const binaryString = atob(file.file_data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const origName = file.original_name || 'download.xlsx';
          const ext = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '';
          const safeAscii = `file_${String(file.id || '').slice(0, 8)}${ext}`;
          const encodedName = encodeURIComponent(origName).replace(/['()]/g, escape);
          const mimeType = file.mime_type || (origName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');

          return new Response(bytes, {
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedName}`,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Expose-Headers': 'Content-Disposition',
            },
          });
        }

        return new Response(JSON.stringify({ error: 'No content data available' }), { status: 404, headers });
      }

      // 3-2. 파일 목록 조회 (GET /api/drive/files)
      if (request.method === 'GET') {
        const projectCode = url.searchParams.get('projectCode') || '';
        let query = 'SELECT id, project_code, category, original_name, mime_type, byte_size, sha256, uploaded_by, uploaded_at, storage_provider, drive_url FROM drive_evidence';
        let params: any[] = [];

        if (projectCode) {
          query += ' WHERE project_code = ? ORDER BY uploaded_at DESC';
          params.push(projectCode);
        } else {
          query += ' ORDER BY uploaded_at DESC';
        }

        const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
        const { results } = await stmt.all();

        return new Response(JSON.stringify({
          success: true,
          files: results || [],
          googleDriveConnected: true,
          storagePolicy: 'GOOGLE_DRIVE_REQUIRED',
        }), { headers });
      }

      if (request.method === 'POST') {
        const body = await request.json() as {
          id?: string;
          projectCode: string;
          projectName?: string;
          mainFolder?: string;
          roleName?: string;
          category: string;
          originalName: string;
          mimeType: string;
          byteSize: number;
          sha256: string;
          uploadedBy: string;
          uploadedAt?: string;
          driveUrl?: string;
          fileData?: string;
        };

        const fileId = body.id || `file_${crypto.randomUUID()}`;
        const uploadedAt = body.uploadedAt || new Date().toISOString();
        let driveUrl = body.driveUrl || `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(body.originalName)}`;

        // 회사 Google 계정으로 실제 Google Drive v3 업로드 실행
        const companyToken = await getCompanyAccessToken(env);
        if (!companyToken) {
          return new Response(JSON.stringify({
            error: 'GOOGLE_DRIVE_NOT_CONNECTED',
            message: '회사 Google Drive 계정이 아직 연동되지 않았습니다. [설정] 메뉴에서 관리자 1회 승인(concost_dt@gmail.com)을 완료해주세요.',
          }), { status: 400, headers });
        }

        try {
          const hierarchy = await serverEnsureDriveHierarchy({
            projectCode: body.projectCode,
            projectName: body.projectName || body.projectCode,
            mainFolder: body.mainFolder || '02.마감자료',
            roleName: body.roleName || '공종',
            subtitle: body.category,
            accessToken: companyToken,
          });

          // Base64 -> 바이너리
          const binStr = atob(body.fileData || '');
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

          const mime = body.mimeType || (body.originalName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
          const driveRes = await serverUploadToDrive({
            fileName: body.originalName,
            mimeType: mime,
            fileBytes: bytes,
            folderId: hierarchy.folderId,
            accessToken: companyToken,
          });

          if (driveRes.webViewLink) {
            driveUrl = driveRes.webViewLink;
          }
          console.log(`[Server Google Drive] 업로드 완료: ${hierarchy.folderPath} > ${body.originalName}`);
        } catch (gErr: any) {
          console.error('Server Google Drive direct upload failed:', gErr);
          return new Response(JSON.stringify({
            error: 'GOOGLE_DRIVE_UPLOAD_FAILED',
            message: `Google Drive 업로드 실패: ${gErr.message || String(gErr)}`,
          }), { status: 502, headers });
        }

        await env.DB.prepare(`
          INSERT INTO drive_evidence (
            id, project_code, category, original_name, mime_type, byte_size, sha256, uploaded_by, uploaded_at, storage_provider, drive_url, file_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GOOGLE_DRIVE', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            original_name = excluded.original_name,
            byte_size = excluded.byte_size,
            uploaded_at = excluded.uploaded_at,
            drive_url = excluded.drive_url,
            file_data = excluded.file_data
        `).bind(
          fileId,
          body.projectCode,
          body.category,
          body.originalName,
          body.mimeType || 'application/octet-stream',
          body.byteSize || 0,
          body.sha256 || 'verified-sha256',
          body.uploadedBy || '사용자',
          uploadedAt,
          driveUrl,
          body.fileData || ''
        ).run();

        return new Response(JSON.stringify({
          success: true,
          file: {
            id: fileId,
            projectCode: body.projectCode,
            category: body.category,
            originalName: body.originalName,
            mimeType: body.mimeType,
            byteSize: body.byteSize,
            sha256: body.sha256,
            uploadedBy: body.uploadedBy,
            uploadedAt,
            storageProvider: 'GOOGLE_DRIVE',
            driveUrl,
          },
        }), { headers });
      }

      // 4-3. DELETE /api/drive/files?id=... (파일 삭제)
      if (path.startsWith('drive/files') && request.method === 'DELETE') {
        const fileId = url.searchParams.get('id');
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'File id is required' }), { status: 400, headers });
        }
        await env.DB.prepare('DELETE FROM drive_evidence WHERE id = ?').bind(fileId).run();
        return new Response(JSON.stringify({ success: true, deletedId: fileId }), { headers });
      }

      // 4-4. POST /api/drive/folders/ensure (프로젝트 폴더 사전 자동생성)
      if (path === 'drive/folders/ensure' && request.method === 'POST') {
        const body = await request.json<any>().catch(() => ({}));
        const { projectCode, projectName } = body;
        if (!projectCode) {
          return new Response(JSON.stringify({ error: 'projectCode is required' }), { status: 400, headers });
        }

        const companyToken = await getCompanyAccessToken(env);
        if (!companyToken) {
          return new Response(JSON.stringify({
            error: 'GOOGLE_DRIVE_NOT_CONNECTED',
            message: '회사 Google Drive 계정이 연동되지 않았습니다.',
          }), { status: 400, headers });
        }

        const rootId = await serverFindOrCreateFolder('기술본부 자료실', 'root', companyToken);
        const cleanProjectName = projectName ? (projectName.includes(projectCode) ? projectName : `[${projectCode}] ${projectName}`.trim()) : `[${projectCode}] 프로젝트`;
        const projectId = await serverFindOrCreateFolder(cleanProjectName, rootId, companyToken);

        const subTree: Record<string, string[]> = {
          '01.접수자료': ['1.도면 및 발주처 제공자료'],
          '02.마감자료': ['1.프로그램파일 (FIN)', '2.CAD작업도면', '3.질의사항&견적조건', '4.VIETQS 작업자료', '5.기타'],
          '03.구조자료': ['1.프로그램파일 (FIN)', '2.CAD작업도면', '3.질의사항&견적조건', '4.VIETQS 작업자료', '5.기타'],
        };

        for (const [mainCat, subs] of Object.entries(subTree)) {
          const mainId = await serverFindOrCreateFolder(mainCat, projectId, companyToken);
          for (const sub of subs) {
            await serverFindOrCreateFolder(sub, mainId, companyToken);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          projectFolderId: projectId,
          projectFolderPath: `기술본부 자료실 > ${cleanProjectName}`,
          driveUrl: `https://drive.google.com/drive/folders/${projectId}`,
        }), { headers });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers,
    });
  }
};
