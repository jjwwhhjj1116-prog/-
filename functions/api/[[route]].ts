import { handleCollaboration, sessionUser, tokenHash } from '../lib/collaboration';
import { resumableUpload } from '../lib/driveResumable';
import { archiveMeeting } from '../lib/meetingArchive';
import { handleTranslation } from '../lib/translation';
import { businessCardsRoute } from '../lib/businessCards';
import {intakeProjectStatements} from '../lib/intakeSchedule';
// Cloudflare Pages Functions: D1 Database & Google Drive Integration REST API Route
interface Env {
  DB: D1Database;
  CIVIL_APPROVER_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  INTAKE_SYNC_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

function getGoogleClientId(env: Env): string {
  return env.GOOGLE_CLIENT_ID || "";
}

function getGoogleClientSecret(env: Env): string {
  return env.GOOGLE_CLIENT_SECRET || "";
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
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const sRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!sRes.ok) throw new Error('Drive 폴더 조회 실패');
  if (sRes.ok) {
    const sData = await sRes.json<any>();
    if (sData.files && sData.files.length > 0) {
      const id = sData.files[0].id;
      if (!/^[A-Za-z0-9_-]+$/.test(id || '')) throw new Error('Drive 폴더 ID 확인 실패');
      return id;
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

  if (!cRes.ok) throw new Error('Drive 폴더 생성 실패');
  const cData = await cRes.json<any>();
  if (!/^[A-Za-z0-9_-]+$/.test(cData.id || '')) throw new Error('Drive 폴더 ID 확인 실패');
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
  uploadedBy?: string;
  uploadedAt?: string;
}): Promise<{ folderId: string; folderPath: string }> {
  const { projectCode, projectName, mainFolder, subtitle, accessToken } = params;

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

  // 선택한 분류 아래 작성자·한국 날짜로 보관한다. 공종은 자료실 메타정보로 구분한다.
  // 기존 공종 우선 폴더와 원본은 이동하지 않으며 등록 파일 ID로 계속 다운로드한다.
  const categoryId = await serverFindOrCreateFolder(subtitle, mainId, accessToken);
  const uploadDay = new Date(Date.parse(params.uploadedAt || new Date().toISOString()) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll('-', '.');
  const authorFolder = `${params.uploadedBy || '사용자'}_${uploadDay}`;
  const finalFolderId = await serverFindOrCreateFolder(authorFolder, categoryId, accessToken);
  const pathStr = `기술본부 자료실 > ${cleanProjectName} > ${normalizedMain} > ${subtitle} > ${authorFolder}`;

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

async function syncIntake(request: Request, env: Env): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return reply({ error: 'POST only' }, 405);
  if (!env.INTAKE_SYNC_TOKEN || env.INTAKE_SYNC_TOKEN.length < 32) return reply({ error: 'Collector not configured' }, 503);
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] || '';
  if (await tokenHash(supplied) !== await tokenHash(env.INTAKE_SYNC_TOKEN)) return reply({ error: 'Unauthorized' }, 401);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) return reply({ error: 'Payload too large' }, 413);
  let body: any;
  try { body = JSON.parse(text); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  if (typeof body?.lastError === 'string' && body.lastError.trim() && body.lastError.length <= 180 && !('items' in body)) {
    await env.DB.prepare("INSERT INTO studio_intake_sync(id,last_error) VALUES ('groupware',?) ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error").bind(body.lastError).run();
    return reply({ success: true });
  }
  const items = body?.items;
  const departments = ['마감팀', '구조팀', '토목&조경팀'];
  if (!Array.isArray(items) || !items.length || items.length > 100 ||
      new Set(items.map(item => item?.id)).size !== items.length || items.some(item =>
        !item || !Number.isSafeInteger(item.no) || item.no <= 0 || item.id !== `intake_${item.no}` ||
        typeof item.code !== 'string' || !/^TK-20\d{5}$/.test(item.code) ||
        typeof item.name !== 'string' || !item.name.trim() || item.scopeVerified !== true ||
        !Array.isArray(item.targetDepartments) || item.targetDepartments.some((team: unknown) => !departments.includes(team as string)) ||
        new Set(item.targetDepartments).size !== item.targetDepartments.length)) return reply({ error: 'Invalid intake' }, 400);
  const stamp = new Date().toISOString();
  await env.DB.batch([
    ...items.map(item => env.DB.prepare('INSERT INTO studio_intake_documents(id,document_no,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET document_no=excluded.document_no,data=excluded.data,updated_at=excluded.updated_at').bind(item.id, item.no, JSON.stringify(item), stamp)),
    ...intakeProjectStatements(env.DB,items,stamp),
    env.DB.prepare("INSERT INTO studio_intake_sync(id,last_success,item_count,last_error) VALUES ('groupware',?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_success=excluded.last_success,item_count=excluded.item_count,last_error=NULL").bind(stamp, items.length),
  ]);
  return reply({ success: true, count: items.length });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  if(path.startsWith('collaboration/')) return handleCollaboration(request, env, async (meeting, revision) => archiveMeeting(env, meeting, revision, await getCompanyAccessToken(env), serverFindOrCreateFolder));

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
    if (path === 'intake/sync') return await syncIntake(request, env);
    const actor=await sessionUser(request,env);
    if(!actor)return new Response(JSON.stringify({error:'서버 로그인이 필요합니다.'}),{status:401,headers});
    if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return new Response(JSON.stringify({error:'잘못된 요청 출처'}),{status:403,headers});
    if(path==='translation')return handleTranslation(request);
    const profile=JSON.parse(actor.profile);
    const administrator=['yjw@con-cost.com','yjpark@con-cost.com'].includes(String(profile.email).toLowerCase());
    if(path.startsWith('business-cards'))return (await businessCardsRoute(request,env,actor,path,{
      accessToken:()=>getCompanyAccessToken(env),
      folder:serverFindOrCreateFolder,
      upload:serverUploadToDrive,
    }))!;
    if(path.startsWith('google/oauth/')&&!administrator)return new Response(JSON.stringify({error:'관리자만 회사 Google 연결을 변경할 수 있습니다.'}),{status:403,headers});
    // 0. Google OAuth 서버 엔드포인트
    if (path.startsWith('google/')) {
      // 0-1. GET /api/google/status (회사 구글 계정 연동 상태 확인)
      if (path === 'google/status') {
        const token = await getCompanyAccessToken(env);
        let about: any = null;
        if (token) {
          try {
            const result = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)', {
              headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
            });
            if (result.ok) about = await result.json();
          } catch { /* An unavailable provider must not be reported as connected. */ }
        }
        return new Response(JSON.stringify({
          connected: !!about,
          companyEmail: about?.user?.emailAddress || 'concost.dt@gmail.com',
          status: about ? 'CONNECTED' : token ? 'UNAVAILABLE' : 'DISCONNECTED',
          storageQuota: about?.storageQuota || null,
        }), { headers: {...headers, 'Cache-Control': 'no-store'} });
      }

      // 0-2. GET /api/google/oauth/start (관리자 1회 회사 구글 드라이브 승인 시작)
      if (path === 'google/oauth/start') {
        const redirectUri = url.origin;
        const state=crypto.randomUUID();
        await env.DB.prepare('INSERT INTO studio_oauth_states VALUES (?,?,?)').bind(await tokenHash(state),actor.id,Date.now()+600000).run();
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(getGoogleClientId(env))}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(GOOGLE_DRIVE_SCOPES)}&` +
          `access_type=offline&` +
          `prompt=consent&state=${encodeURIComponent(state)}`;

        return Response.redirect(authUrl, 302);
      }

      // 0-3. POST & GET /api/google/oauth/callback (구글 인증 완료 콜백 -> refresh_token 저장)
      if (path === 'google/oauth/callback') {
        let state = url.searchParams.get('state');
        let code = url.searchParams.get('code');
        let error = url.searchParams.get('error');
        let redirectUri = url.origin;

        if (request.method === 'POST') {
          const postBody = await request.json().catch(() => ({})) as any;
          if (postBody.state) state = postBody.state;
          if (postBody.code) code = postBody.code;
          if (postBody.error) error = postBody.error;
          // Redirect URI is fixed to this app origin.
        }

        if (error || !code) {
          return new Response(JSON.stringify({ error: `Google OAuth 인증 실패: ${error || '인증 코드가 없습니다.'}` }), { status: 400, headers });
        }

        if(!state)return new Response(JSON.stringify({error:'OAuth 승인 요청을 다시 시작해 주세요.'}),{status:403,headers});
        const consumed=await env.DB.prepare('DELETE FROM studio_oauth_states WHERE id=? AND user_id=? AND expires_at>?').bind(await tokenHash(state),actor.id,Date.now()).run();
        if(!consumed.meta.changes)return new Response(JSON.stringify({error:'OAuth 승인 요청이 만료되었거나 계정이 일치하지 않습니다.'}),{status:403,headers});
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
          return new Response(JSON.stringify({ error: 'Google 토큰 교환 실패. 관리자 연결 설정을 확인하세요.' }), { status: 500, headers });
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

    // The collector alone writes D1; browser accounts can only read collected intake.
    if (path === 'intake') {
      if (request.method !== 'GET') return new Response(JSON.stringify({error:'수주 수집 전용 경로입니다.'}),{status:405,headers});
      const {results}=await env.DB.prepare('SELECT data FROM studio_intake_documents ORDER BY document_no DESC').all<any>();
      const sync=await env.DB.prepare("SELECT last_success,item_count,last_error FROM studio_intake_sync WHERE id='groupware'").first<any>();
      return new Response(JSON.stringify({success:true,intakeList:results.map((row:any)=>JSON.parse(row.data)),sync:sync||null}),{headers:{...headers,'Cache-Control':'no-store'}});
    }

    if (path === 'drive/files' || path.startsWith('drive/files/') || path === 'drive/folders/ensure' || path.startsWith('drive/uploads')) {
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

      if(path.startsWith('drive/uploads')) return await resumableUpload(request,env.DB,actor,{
        token:()=>getCompanyAccessToken(env),folder:async(m)=>serverEnsureDriveHierarchy({...m,subtitle:m.category,accessToken:(await getCompanyAccessToken(env))!})
      });
      // 3-1. 개별 파일 다운로드 (GET /api/drive/files/download?id=xxx)
      if (path === 'drive/files/download') {
        const fileId = url.searchParams.get('id');
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'File ID is required' }), { status: 400, headers });
        }
        const file = await env.DB.prepare("SELECT e.*, json_extract(u.metadata,'$.driveFolderId') AS folder_id FROM drive_evidence e LEFT JOIN studio_drive_uploads u ON u.id=e.id WHERE e.id = ?").bind(fileId).first<any>();
        if (!file) {
          return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers });
        }

        if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
        const googleId=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(file.drive_url||'')?.[1];
        if(!googleId)return new Response(JSON.stringify({error:'기존 파일의 Drive 원본 연결을 확인하세요.'}),{status:409,headers});
        const token=await getCompanyAccessToken(env);if(!token)return new Response(JSON.stringify({error:'회사 Drive 연결을 확인하세요.'}),{status:503,headers});
        const base=`https://www.googleapis.com/drive/v3/files/${googleId}`;
        const metadata=await fetch(`${base}?fields=size,sha256Checksum,trashed,parents`,{headers:{Authorization:`Bearer ${token}`}});
        if(!metadata.ok)return new Response(JSON.stringify({error:'Drive 원본 또는 접근 권한을 확인하세요.'}),{status:metadata.status===404?404:502,headers});
        const info=await metadata.json<any>();
        if(info.trashed||Number(info.size)!==Number(file.byte_size)||(file.folder_id&&!info.parents?.includes(file.folder_id))||(/^[a-f0-9]{64}$/i.test(file.sha256||'')&&info.sha256Checksum?.toLowerCase()!==file.sha256.toLowerCase()))return new Response(JSON.stringify({error:'Drive 파일이 업로드 당시 원본 또는 보관 위치와 다릅니다.'}),{status:409,headers});
        const downloadHeaders:Record<string,string>={
          'Content-Type':file.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.original_name||'download').replace(/'/g,'%27')}`,
          'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox','X-Storage-Source':'GOOGLE_DRIVE','Accept-Ranges':'bytes'
        };
        if(request.method==='HEAD')return new Response(null,{headers:{...downloadHeaders,'Content-Length':String(file.byte_size)}});
        const range=request.headers.get('Range');
        if(range&&!/^bytes=\d*-\d*$/.test(range))return new Response(null,{status:416});
        const original=await fetch(`${base}?alt=media`,{headers:{Authorization:`Bearer ${token}`,...(range?{Range:range}:{})}});
        if(!original.ok)return new Response(JSON.stringify({error:'Drive 다운로드 실패'}),{status:original.status===416?416:502,headers});
        for(const name of ['Content-Length','Content-Range']){const value=original.headers.get(name);if(value)downloadHeaders[name]=value;}
        return new Response(original.body,{status:original.status,headers:downloadHeaders});
      }

      // 3-2. 파일 목록 조회 (GET /api/drive/files)
      if (request.method === 'GET') {
        const projectCode = url.searchParams.get('projectCode') || '';
        let query = "SELECT e.id, e.project_code, e.category, e.original_name, e.mime_type, e.byte_size, e.sha256, e.uploaded_by, e.uploaded_at, e.storage_provider, m.project_name, m.team_name, m.role_name, m.main_folder, json_extract(u.metadata,'$.driveFolderPath') AS storage_path FROM drive_evidence e LEFT JOIN studio_vault_metadata m ON m.file_id=e.id LEFT JOIN studio_drive_uploads u ON u.id=e.id";
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
          googleDriveConnected: Boolean(await getCompanyAccessToken(env)),
          storagePolicy: 'GOOGLE_DRIVE_REQUIRED',
          accessMode: 'STUDIO_SESSION_PROXY',
        }), { headers });
      }

      if (path === 'drive/files' && request.method === 'POST') {
        const body = await request.json() as {
          id?: string;
          projectCode: string;
          projectName?: string;
          mainFolder?: string;
          roleName?: string;
          teamName?: string;
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

        if(!body.projectCode||!body.originalName||!body.category||typeof body.fileData!=='string'||!Number.isInteger(body.byteSize)||body.byteSize<0||body.byteSize>15*1024*1024)return new Response(JSON.stringify({error:'파일 이름·분류·크기·내용을 확인하세요.'}),{status:400,headers});
        let bytes:Uint8Array<ArrayBuffer>;try{bytes=Uint8Array.from(atob(body.fileData),c=>c.charCodeAt(0));}catch{return new Response(JSON.stringify({error:'파일 내용이 손상되었습니다.'}),{status:400,headers});}
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
        if(bytes.length!==body.byteSize||digest!==body.sha256)return new Response(JSON.stringify({error:'파일 크기 또는 무결성 값이 일치하지 않습니다.'}),{status:400,headers});
        const fileId = body.id || `file_${crypto.randomUUID()}`;
        if(await env.DB.prepare('SELECT id FROM drive_evidence WHERE id=?').bind(fileId).first())return new Response(JSON.stringify({error:'이미 등록된 파일 ID입니다. 기존 원본은 유지됩니다.'}),{status:409,headers});
        const uploadedAt = new Date().toISOString();
        body.uploadedBy=actor.name;
        let driveUrl = '';

        // 회사 Google 계정으로 실제 Google Drive v3 업로드 실행
        const companyToken = await getCompanyAccessToken(env);
        if (!companyToken) {
          return new Response(JSON.stringify({
            error: 'GOOGLE_DRIVE_NOT_CONNECTED',
            message: '회사 Google Drive 계정이 아직 연동되지 않았습니다. [설정] 메뉴에서 관리자 1회 승인(concost.dt@gmail.com)을 완료해주세요.',
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
            uploadedBy: actor.name,
            uploadedAt,
          });

          // Base64 -> 바이너리
          // 위에서 검증한 원본 바이트를 업로드한다.

          const mime = body.mimeType || (body.originalName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
          const driveRes = await serverUploadToDrive({
            fileName: body.originalName,
            mimeType: mime,
            fileBytes: bytes,
            folderId: hierarchy.folderId,
            accessToken: companyToken,
          });

          if (!/^[A-Za-z0-9_-]+$/.test(driveRes.id || '')) throw new Error('Google 파일 ID를 받지 못했습니다.');
          driveUrl = `https://drive.google.com/file/d/${driveRes.id}/view`;
          console.log(`[Server Google Drive] 업로드 완료: ${hierarchy.folderPath} > ${body.originalName}`);
        } catch (gErr: any) {
          console.error('Server Google Drive direct upload failed:', gErr);
          return new Response(JSON.stringify({
            error: 'GOOGLE_DRIVE_UPLOAD_FAILED',
            message: `Google Drive 업로드 실패: ${gErr.message || String(gErr)}`,
          }), { status: 502, headers });
        }

        await env.DB.batch([env.DB.prepare(`
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
          '' // 원본은 Drive에 보관한다. 기존 DB 보관본은 임의로 삭제하지 않는다.
        ), env.DB.prepare('INSERT INTO studio_vault_metadata VALUES (?,?,?,?,?) ON CONFLICT(file_id) DO UPDATE SET project_name=excluded.project_name,team_name=excluded.team_name,role_name=excluded.role_name,main_folder=excluded.main_folder').bind(fileId,body.projectName||body.projectCode,body.teamName||'',body.roleName||'',body.mainFolder||'')]);

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
          },
        }), { headers });
      }

      // 4-3. DELETE /api/drive/files?id=... (회사 Drive 원본과 목록 함께 삭제)
      if (path === 'drive/files' && request.method === 'DELETE') {
        if(!administrator)return new Response(JSON.stringify({error:'자료실 원본 삭제는 관리자만 가능합니다.'}),{status:403,headers});
        const fileId = url.searchParams.get('id');
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'File id is required' }), { status: 400, headers });
        }
        const file=await env.DB.prepare('SELECT drive_url FROM drive_evidence WHERE id=?').bind(fileId).first<any>();
        if(!file)return new Response(JSON.stringify({error:'파일을 찾을 수 없습니다.'}),{status:404,headers});
        const googleId=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(file.drive_url||'')?.[1];
        if(!googleId)return new Response(JSON.stringify({error:'Drive 원본 연결을 확인하세요.'}),{status:409,headers});
        const token=await getCompanyAccessToken(env);
        if(!token)return new Response(JSON.stringify({error:'회사 Drive 연결을 확인하세요.'}),{status:503,headers});
        let removed:Response;
        try{removed=await fetch(`https://www.googleapis.com/drive/v3/files/${googleId}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});}
        catch{return new Response(JSON.stringify({error:'Drive 원본 삭제 응답을 확인하지 못했습니다.'}),{status:502,headers});}
        if(!removed.ok)return new Response(JSON.stringify({error:'Drive 원본 삭제에 실패했습니다. 목록을 유지합니다.'}),{status:502,headers});
        await env.DB.batch([
          env.DB.prepare('DELETE FROM drive_evidence WHERE id=?').bind(fileId),
          env.DB.prepare('DELETE FROM studio_vault_metadata WHERE file_id=?').bind(fileId),
          env.DB.prepare('DELETE FROM studio_drive_uploads WHERE id=?').bind(fileId),
        ]);
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

        const hierarchy = await serverEnsureDriveHierarchy({
          projectCode, projectName: projectName || `[${projectCode}] 프로젝트`,
          mainFolder: typeof body.mainFolder === 'string' ? body.mainFolder : '02.마감자료',
          roleName: '공통', subtitle: typeof body.subtitle === 'string' ? body.subtitle : '1.납품자료',
          accessToken: companyToken, uploadedBy: actor.name,
        });

        return new Response(JSON.stringify({
          success: true,
          folderPath: hierarchy.folderPath,
          accessMode: 'STUDIO_SESSION_PROXY',
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
