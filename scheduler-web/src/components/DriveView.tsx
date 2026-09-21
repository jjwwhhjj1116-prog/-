import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore, TEAM_ROLES, type Department } from '../store/useProjectStore';
import {
  Folder,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  FileText,
  User,
  CheckCircle2,
  ExternalLink,
  Search,
  HardDrive,
  FolderPlus,
  RefreshCw,
  AlertCircle,
  FolderTree,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  SUBTITLES,
  type SubtitleType,
  ROOT_FOLDER_NAME,
  getStoredToken,
  requestGoogleDriveAuth,
  clearGoogleDriveAuth,
  ensureFullDriveHierarchy,
  uploadFileToDrive,
  listAllTechVaultFiles,
  type DriveFileInfo,
} from '../services/googleDriveService';

export const DriveView: React.FC = () => {
  const { currentUser, googleDriveConfig } = useAuthStore();
  const { projects } = useProjectStore();

  // 구글 드라이브 인증 상태 (회사 계정 concost_dt@gmail.com 기본 연동 영구 유지)
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken());
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // 파일 목록 상태 (가짜 샘플 폴더 완전 배제, 오직 실제 연동 데이터만 로드)
  const [vaultFiles, setVaultFiles] = useState<DriveFileInfo[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedSubtitleFilter, setSelectedSubtitleFilter] = useState<string>('전체');

  // 고유 프로젝트 목록 (마감팀·구조팀 합동 프로젝트 중복 제거)
  const uniqueProjects = React.useMemo(() => {
    const map = new Map<string, {
      code: string;
      name: string;
      departments: Department[];
    }>();

    projects.forEach((p) => {
      const code = p.code || p.id;
      if (!map.has(code)) {
        map.set(code, {
          code: p.code,
          name: p.name,
          departments: [p.department],
        });
      } else {
        const item = map.get(code)!;
        if (!item.departments.includes(p.department)) {
          item.departments.push(p.department);
        }
      }
    });

    return Array.from(map.values());
  }, [projects]);

  // 업로드 폼 상태 (고유 프로젝트 코드 기준 선택)
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>(() => uniqueProjects[0]?.code || projects[0]?.code || '');
  const [selectedTeam, setSelectedTeam] = useState<Department>('마감팀');
  const [selectedRole, setSelectedRole] = useState<string>(TEAM_ROLES.마감팀[1] || '조적');
  const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleType>('1.프로그램파일(FIN)');
  const [authorNameInput, setAuthorNameInput] = useState(currentUser?.name || '조한빈');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // 현재 선택된 고유 프로젝트 및 수행 부서
  const currentUniqueProject = uniqueProjects.find((p) => p.code === selectedProjectCode) || uniqueProjects[0];
  const availableTeams: Department[] = currentUniqueProject?.departments || ['마감팀', '구조팀'];

  // 프로젝트 변경 시 해당 프로젝트의 소속팀 자동 맞춤
  const handleProjectSelect = (code: string) => {
    setSelectedProjectCode(code);
    const target = uniqueProjects.find((p) => p.code === code);
    if (target && target.departments.length > 0) {
      if (!target.departments.includes(selectedTeam)) {
        handleTeamChange(target.departments[0]);
      }
    }
  };

  // 업로드 진행 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [uploadSuccessInfo, setUploadSuccessInfo] = useState<DriveFileInfo | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 초기 로드: 회사 계정 연결 상태 자동 유지 및 파일 목록 동기화
  useEffect(() => {
    // 기본적으로 회사 계정 연동 상태 보장
    localStorage.setItem('concost_gdrive_connected', 'true');
    setIsConnected(true);
    const token = getStoredToken();
    setAuthToken(token);
    if (token) {
      loadRealFiles();
    }
  }, []);

  // 팀 변경 시 공종 목록 업데이트
  const handleTeamChange = (team: Department) => {
    setSelectedTeam(team);
    const roles = TEAM_ROLES[team] || [];
    // PM 제외 첫 번째 실무 공종 선택 (예: 조적, 보, 토목)
    const firstRole = roles.find((r) => r !== 'PM') || roles[0] || '공종';
    setSelectedRole(firstRole);
  };

  // Google OAuth 연동 실행 (concost_dt@gmail.com 승인 및 영구 상태 유지)
  const handleConnectGoogle = async (silent = false) => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const clientId = googleDriveConfig.clientId;
      const token = await requestGoogleDriveAuth(clientId, silent ? '' : 'consent');
      setAuthToken(token);
      setIsConnected(true);
      await loadRealFiles();
      return token;
    } catch (err: any) {
      if (!silent) {
        setAuthError(err.message || 'Google Drive 연동 중 오류가 발생했습니다.');
      }
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Google 연동 해제
  const handleDisconnectGoogle = () => {
    clearGoogleDriveAuth();
    setAuthToken(null);
    setIsConnected(false);
    setVaultFiles([]);
  };

  // 실제 Google Drive 파일 목록 조회
  const loadRealFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const files = await listAllTechVaultFiles();
      setVaultFiles(files);
    } catch (err) {
      console.error('Failed to load drive files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // 파일 선택 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadSuccessInfo(null);
      setUploadError(null);
    }
  };

  // 실제 Google Drive 업로드 및 5단계 계층 자동 폴더 생성 실행
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('업로드할 파일을 먼저 선택해주세요.');
      return;
    }

    let currentToken = authToken;
    if (!currentToken) {
      currentToken = await handleConnectGoogle(false);
      if (!currentToken) {
        alert('Google Drive 회사 계정(concost_dt@gmail.com) 승인이 필요합니다.');
        return;
      }
    }

    const projectFolderName = currentUniqueProject
      ? `[${currentUniqueProject.code}] ${currentUniqueProject.name}`
      : `[${projects[0]?.code || 'TK'}] ${projects[0]?.name || ''}`;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccessInfo(null);

    try {
      // 1~4단계: 폴더 계층 순차 확인 및 자동 생성
      setUploadStep(`1/5단계: '${ROOT_FOLDER_NAME}' 최상위 폴더 확인 중...`);
      await new Promise((r) => setTimeout(r, 200));

      setUploadStep(`2/5단계: 프로젝트 폴더 '${projectFolderName}' 확인/생성 중...`);
      await new Promise((r) => setTimeout(r, 200));

      setUploadStep(`3/5단계: '${selectedTeam}' 소속팀 폴더 확인/생성 중...`);
      await new Promise((r) => setTimeout(r, 200));

      setUploadStep(`4/5단계: '${selectedRole}' 공종 및 서브타이틀 '${selectedSubtitle}' 폴더 확인/생성 중...`);

      const hierarchy = await ensureFullDriveHierarchy({
        projectName: projectFolderName,
        teamName: selectedTeam,
        roleName: selectedRole,
        subtitle: selectedSubtitle,
      });

      // 5단계: 최종 서브타이틀 폴더에 파일 바이너리 업로드
      setUploadStep(`5/5단계: Google Drive '${selectedSubtitle}' 폴더에 파일 전송 중...`);

      const uploaded = await uploadFileToDrive(hierarchy.subtitleFolderId, selectedFile, {
        projectName: projectFolderName,
        teamName: selectedTeam,
        roleName: selectedRole,
        subtitle: selectedSubtitle,
        authorName: authorNameInput.trim(),
      });

      setUploadSuccessInfo(uploaded);
      setSelectedFile(null);

      // 파일 입력창 리셋
      const fileInput = document.getElementById('drive-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // 목록 갱신
      await loadRealFiles();
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || '파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      setUploadStep('');
    }
  };

  // 선택된 프로젝트 정보
  const selectedProject = projects.find((p) => p.code === selectedProjectCode) || projects[0];

  // 필터링된 파일 목록
  const filteredFiles = vaultFiles.filter((f) => {
    const matchSubtitle =
      selectedSubtitleFilter === '전체' || f.subtitle === selectedSubtitleFilter;
    const matchSearch =
      searchKeyword.trim() === '' ||
      f.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (f.projectName && f.projectName.toLowerCase().includes(searchKeyword.toLowerCase())) ||
      (f.roleName && f.roleName.toLowerCase().includes(searchKeyword.toLowerCase()));
    return matchSubtitle && matchSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. 상단 타이틀 및 Google Drive 연결 상태 배너 */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Google 드라이브 기술본부 자료실
                {isConnected ? (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    concost_dt@gmail.com 연동됨
                  </span>
                ) : (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
                    연동 대기 중
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                최상위 <strong className="text-slate-800 dark:text-slate-200">[기술본부 자료실]</strong> 아래 
                프로젝트 &gt; 소속팀 &gt; 공종 &gt; <strong className="text-orange-600 dark:text-orange-400">4대 서브타이틀</strong> 계층으로 실시간 클라우드 동기화됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 우측 연동 액션 버튼 */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck size={14} className="text-emerald-500" />
                회사 공용 드라이브 연동됨
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!authToken) handleConnectGoogle(false);
                  else loadRealFiles();
                }}
                disabled={isLoadingFiles}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition"
                title="Google Drive 실시간 파일 동기화"
              >
                <RefreshCw size={13} className={isLoadingFiles ? 'animate-spin' : ''} />
                새로고침
              </button>
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                className="px-2.5 py-2 text-xs text-rose-500 hover:text-rose-700 font-medium"
              >
                연결 해제
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleConnectGoogle(false)}
              disabled={isAuthenticating}
              className="flex items-center gap-2 px-4 py-2 bg-[#00338d] hover:bg-[#002366] text-white text-xs font-black rounded-xl shadow-md transition active:scale-95"
            >
              <ShieldCheck size={15} />
              {isAuthenticating ? 'Google 로그인 진행 중...' : 'Google Drive 연동 (concost_dt@gmail.com)'}
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{authError}</span>
        </div>
      )}

      {/* 2. Google Drive 실제 업로더 및 5단계 계층 폴더 자동 생성 폼 */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-bold tracking-tight text-white">
              실제 Google Drive 업로드 &amp; 5단계 자동 계층 폴더 생성기
            </h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <FolderTree size={14} className="text-orange-400" />
            <span>기술본부 자료실 &gt; 프로젝트 &gt; 팀 &gt; 공종 &gt; 4대 서브타이틀</span>
          </div>
        </div>

        {/* 업로드 진행/성공/오류 알림 */}
        {isUploading && (
          <div className="mb-4 p-3 bg-blue-950/80 border border-blue-500/50 text-blue-200 text-xs rounded-xl flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            <span className="font-mono font-bold">{uploadStep}</span>
          </div>
        )}

        {uploadSuccessInfo && (
          <div className="mb-4 p-3.5 bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 truncate">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">
                Google Drive에 안전하게 업로드되었습니다: <strong className="text-white">{uploadSuccessInfo.name}</strong> ({uploadSuccessInfo.size})
              </span>
            </div>
            <a
              href={uploadSuccessInfo.webViewLink}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold shrink-0 flex items-center gap-1"
            >
              <ExternalLink size={12} /> 구글 드라이브에서 확인
            </a>
          </div>
        )}

        {uploadError && (
          <div className="mb-4 p-3 bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        <form onSubmit={handleUploadFile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. 대상 프로젝트 선택 (마감·구조 통합 단일 프로젝트) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                1. 대상 프로젝트
              </label>
              <select
                value={selectedProjectCode}
                onChange={(e) => handleProjectSelect(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500 font-medium"
              >
                {uniqueProjects.map((p) => (
                  <option key={p.code} value={p.code}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. 소속 팀 선택 (해당 프로젝트의 실제 수행 부서만 노출) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                2. 소속 팀
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => handleTeamChange(e.target.value as Department)}
                className="w-full text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500 font-medium"
              >
                {availableTeams.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. 팀별 세부 공종(조직) 선택 */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                3. 공종 (조직)
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-orange-300 font-bold outline-none focus:border-orange-500"
              >
                {(TEAM_ROLES[selectedTeam] || []).map((role) => (
                  <option key={role} value={role}>
                    {role} 공종
                  </option>
                ))}
              </select>
            </div>

            {/* 4. 등록 담당자 이름 */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                담당자 이름
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={authorNameInput}
                  onChange={(e) => setAuthorNameInput(e.target.value)}
                  placeholder="담당자 이름"
                  className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* 4대 서브타이틀 필수 선택 섹션 (사용자 핵심 요구사항) */}
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80">
            <label className="block text-xs font-bold text-orange-400 mb-2 flex items-center gap-1.5">
              <Sparkles size={13} />
              4. 업로드 서브타이틀 (필수 분류 선택)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SUBTITLES.map((sub) => {
                const isSelected = selectedSubtitle === sub;
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSelectedSubtitle(sub)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-between border ${
                      isSelected
                        ? 'bg-orange-500 text-white border-orange-400 shadow-md ring-2 ring-orange-500/30'
                        : 'bg-slate-850 hover:bg-slate-750 text-slate-300 border-slate-700'
                    }`}
                  >
                    <span className="truncate">{sub}</span>
                    {isSelected && <Check size={14} className="shrink-0 ml-1 text-white" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              * 선택한 서브타이틀 명칭으로 Google Drive에 하위 폴더가 자동 생성되고 그 안에 파일이 보관됩니다.
            </p>
          </div>

          {/* 파일 첨부 및 전송 버튼 */}
          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-auto flex-1">
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                5. 실제 업로드 파일 선택 (Excel, DWG, PDF, 압축파일 등)
              </label>
              <input
                id="drive-file-input"
                type="file"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-orange-600 file:text-white hover:file:bg-orange-700 file:cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-black rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              {isUploading ? '계층 폴더 생성 및 전송 중...' : 'Google Drive에 안전 업로드'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. 실제 Google Drive 연동 파일 탐색기 (가짜 샘플 폴더 배제) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4">
        {/* 상단 탐색기 헤더 및 검색/필터 바 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Folder className="w-5 h-5 text-amber-500" />
              실제 Google Drive 연동 파일 보관함
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                {vaultFiles.length}개 파일
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              기술본부 자료실의 4대 서브타이틀 폴더에 보관된 실제 Google Drive 클라우드 자산입니다.
            </p>
          </div>

          {/* 검색창 & 서브타이틀 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="파일명 / 공종 검색..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedSubtitleFilter('전체')}
                className={`px-2 py-1 rounded transition ${
                  selectedSubtitleFilter === '전체'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                전체
              </button>
              {SUBTITLES.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubtitleFilter(sub)}
                  className={`px-2 py-1 rounded transition ${
                    selectedSubtitleFilter === sub
                      ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {sub.split('.')[1] || sub}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 파일 목록 렌더링 */}
        {!isConnected ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-850 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <HardDrive className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
              Google Drive에 연결되지 않았습니다
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
              기술본부 자료실의 실제 Google Drive 클라우드 폴더와 파일을 확인하고 업로드하려면 계정 연동을 진행해주세요.
            </p>
            <button
              type="button"
              onClick={() => handleConnectGoogle(false)}
              disabled={isAuthenticating}
              className="px-5 py-2.5 bg-[#00338d] hover:bg-[#002366] text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95"
            >
              concost_dt@gmail.com 계정으로 Google Drive 연동하기
            </button>
          </div>
        ) : isLoadingFiles ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Google Drive에서 실제 기술본부 자료실 파일 목록을 동기화하고 있습니다...
            </p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-850 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <Folder className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
              등록된 실제 Google Drive 파일이 없습니다
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              상단의 <strong className="text-orange-600">[Google Drive 업로드 &amp; 5단계 자동 계층 폴더 생성기]</strong>에서
              대상 프로젝트와 4대 서브타이틀을 선택하여 첫 파일을 Google Drive에 보관해 보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredFiles.map((file) => {
              const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
              const isDwg = file.name.endsWith('.dwg');
              const isPdf = file.name.endsWith('.pdf');

              return (
                <div
                  key={file.id}
                  className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition flex flex-col justify-between gap-3 group"
                >
                  <div>
                    {/* 상단: 계층 경로 태그 */}
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-2 truncate">
                      <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                        {file.projectName || selectedProject.name}
                      </span>
                      <ChevronRight size={11} className="shrink-0" />
                      <span className="text-blue-600 dark:text-blue-400 font-bold shrink-0">
                        {file.teamName || '마감팀'}
                      </span>
                      <ChevronRight size={11} className="shrink-0" />
                      <span className="text-purple-600 dark:text-purple-400 font-bold shrink-0">
                        {file.roleName || '조적'}
                      </span>
                    </div>

                    {/* 서브타이틀 뱃지 */}
                    <div className="mb-2">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                        {file.subtitle || '1.프로그램파일(FIN)'}
                      </span>
                    </div>

                    {/* 파일명 및 아이콘 */}
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                        {isExcel ? (
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        ) : isDwg ? (
                          <FileCode className="w-5 h-5 text-blue-600" />
                        ) : isPdf ? (
                          <FileText className="w-5 h-5 text-rose-600" />
                        ) : (
                          <FileText className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white truncate group-hover:text-orange-600 transition" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                          <span>{file.size}</span>
                          <span>·</span>
                          <span>{file.createdTime || '오늘'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 하단 바로가기 버튼 */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-emerald-500" />
                      Google Drive 보관됨
                    </span>
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-orange-600 hover:text-white text-slate-700 dark:text-slate-200 rounded text-[11px] font-bold transition flex items-center gap-1"
                    >
                      <span>열기</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
