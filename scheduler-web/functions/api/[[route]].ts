// Cloudflare Pages Functions: D1 Database REST API Route
interface Env {
  DB: D1Database;
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
    // 1. /api/projects
    if (path === 'projects' || path.startsWith('projects/')) {
      if (request.method === 'GET') {
        const { results: projects } = await env.DB.prepare(
          'SELECT * FROM projects ORDER BY start_date ASC'
        ).all();

        const { results: subTasks } = await env.DB.prepare(
          'SELECT * FROM sub_tasks'
        ).all();

        // subTasks를 프로젝트에 묶어 반환
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

        return new Response(JSON.stringify({ success: true, projects: fullProjects }), {
          headers,
        });
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

        // subTasks 업데이트
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

    // 3. /api/drive/files (클레임센터 스튜디오 1:1 드라이브 자료실 API)
    if (path === 'drive/files' || path.startsWith('drive/files/')) {
      // 테이블 자동 초기화
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

        await env.DB.prepare(`
          INSERT INTO drive_evidence (
            id, project_code, category, original_name, mime_type, byte_size, sha256, uploaded_by, uploaded_at, storage_provider, drive_url, file_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GOOGLE_DRIVE', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            original_name = excluded.original_name,
            byte_size = excluded.byte_size,
            uploaded_at = excluded.uploaded_at
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
          body.driveUrl || '',
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
            driveUrl: body.driveUrl || '',
          },
        }), { headers });
      }

      // 개별 파일 다운로드 (GET /api/drive/files/download?id=xxx)
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
