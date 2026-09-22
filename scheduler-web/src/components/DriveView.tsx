import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore, TEAM_ROLES, type Department } from '../store/useProjectStore';
import {
  MAIN_FOLDERS,
  FOLDER_SUBTITLES,
  SUBTITLE_METAS,
  type MainFolderType,
  type SubtitleType,
  type TechVaultFile,
  ACCEPT_FILE_TYPES,
  formatBytes,
  fetchVaultFiles,
  uploadVaultFile,
  downloadVaultFile,
} from '../services/googleDriveService';
import {
  UploadCloud,
  FileText,
  Search,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  Clock,
  User,
  HardDrive,
  Folder,
  AlertCircle,
  Building2,
} from 'lucide-react';

export const DriveView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();

  // 고유 프로젝트 목록 (마감팀·구조팀 중복 제거)
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, { code: string; name: string; departments: Department[] }>();
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

  // 1. 프로젝트 선택 상태
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>(() => uniqueProjects[0]?.code || '');
  const currentProject = uniqueProjects.find((p) => p.code === selectedProjectCode) || uniqueProjects[0];

  // 2. 3대 대분류 폴더 선택 상태 (01.접수자료, 02.마감자료, 03.구조자료)
  const [selectedMainFolder, setSelectedMainFolder] = useState<MainFolderType>('02.마감자료');

  // 3. 소속팀 선택 상태 (대분류와 연동)
  const [selectedTeam, setSelectedTeam] = useState<Department>(() => '마감팀');

  // 4. 공종 선택 상태
  const availableRoles = useMemo(() => {
    return TEAM_ROLES[selectedTeam] || ['공종'];
  }, [selectedTeam]);

  const [selectedRole, setSelectedRole] = useState<string>(() => {
    const roles = TEAM_ROLES[selectedTeam] || [];
    return roles.find((r) => r !== 'PM') || roles[0] || '조적';
  });

  // 5. 세분화 서브타이틀 선택 상태 (기본: 1.프로그램파일 (FIN))
  const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleType>('1.프로그램파일 (FIN)');

  // 파일 목록 상태
  const [allFiles, setAllFiles] = useState<TechVaultFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 업로드 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 회사 Google Drive 서버 연동 상태
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/google/status')
      .then((res) => res.json())
      .then((data: any) => {
        if (data && typeof data.connected === 'boolean') {
          setIsDriveConnected(data.connected);
        }
      })
      .catch(() => {
        // 기본값 유지
      });
  }, []);

  // 대분류 폴더 변경 시 서브타이틀 및 팀 자동 동기화
  const handleMainFolderSelect = (folder: MainFolderType) => {
    setSelectedMainFolder(folder);
    const nextSubs = FOLDER_SUBTITLES[folder] || [];
    if (nextSubs.length > 0) {
      setSelectedSubtitle(nextSubs[0]);
    }
    if (folder === '02.마감자료') {
      handleTeamSelect('마감팀');
    } else if (folder === '03.구조자료') {
      handleTeamSelect('구조팀');
    } else {
      setSelectedRole('공통');
    }
  };

  // 프로젝트 변경 시 팀 자동 맞춤
  const handleProjectSelect = (code: string) => {
    setSelectedProjectCode(code);
    const target = uniqueProjects.find((p) => p.code === code);
    if (target && target.departments.length > 0) {
      if (!target.departments.includes(selectedTeam)) {
        handleTeamSelect(target.departments[0]);
      }
    }
  };

  // 팀 변경 시 공종 자동 맞춤
  const handleTeamSelect = (team: Department) => {
    setSelectedTeam(team);
    const roles = TEAM_ROLES[team] || [];
    const firstRole = roles.find((r) => r !== 'PM') || roles[0] || '공종';
    setSelectedRole(firstRole);
  };

  // 파일 목록 로드
  const loadFiles = async (code: string) => {
    setIsLoading(true);
    try {
      const files = await fetchVaultFiles(code);
      setAllFiles(files);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProjectCode) {
      loadFiles(selectedProjectCode);
    }
  }, [selectedProjectCode]);

  // 대분류별/서브타이틀별 파일 카운트 계산
  const subtitleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const currentSubs = FOLDER_SUBTITLES[selectedMainFolder] || [];
    currentSubs.forEach((sub) => {
      counts[sub] = 0;
    });

    allFiles.forEach((f) => {
      const normalizedSub = f.subtitle === '1.프로그램파일(FIN)' ? '1.프로그램파일 (FIN)' : f.subtitle === '4.기타' ? '5.기타' : f.subtitle;
      const fileMainFolder = f.mainFolder || (f.teamName === '구조팀' ? '03.구조자료' : f.subtitle.includes('도면 및 발주처') ? '01.접수자료' : '02.마감자료');
      if (fileMainFolder === selectedMainFolder && counts[normalizedSub] !== undefined) {
        counts[normalizedSub] += 1;
      }
    });
    return counts;
  }, [allFiles, selectedMainFolder]);

  // 현재 필터된 파일 목록
  const currentSubtitleFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const normalizedSub = f.subtitle === '1.프로그램파일(FIN)' ? '1.프로그램파일 (FIN)' : f.subtitle === '4.기타' ? '5.기타' : f.subtitle;
      const fileMainFolder = f.mainFolder || (f.teamName === '구조팀' ? '03.구조자료' : f.subtitle.includes('도면 및 발주처') ? '01.접수자료' : '02.마감자료');
      if (fileMainFolder !== selectedMainFolder) return false;
      if (normalizedSub !== selectedSubtitle) return false;
      if (!searchQuery.trim()) return true;
      return f.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             f.uploadedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
             f.roleName.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [allFiles, selectedMainFolder, selectedSubtitle, searchQuery]);

  // 파일 업로드 처리
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList);
    if (!filesToUpload.length || !selectedProjectCode) return;

    setIsUploading(true);
    setUploadNotice(null);
    setUploadError(null);

    let successCount = 0;
    const userName = currentUser?.name || '사용자';
    const projectName = currentProject ? `[${currentProject.code}] ${currentProject.name}` : selectedProjectCode;

    for (const file of filesToUpload) {
      try {
        const uploaded = await uploadVaultFile({
          projectCode: selectedProjectCode,
          projectName,
          mainFolder: selectedMainFolder,
          teamName: selectedMainFolder === '03.구조자료' ? '구조팀' : selectedMainFolder === '01.접수자료' ? '발주처' : '마감팀',
          roleName: selectedMainFolder === '01.접수자료' ? '공통' : selectedRole,
          subtitle: selectedSubtitle,
          file,
          uploadedBy: userName,
        });
        setAllFiles((prev) => [uploaded, ...prev]);
        successCount++;
      } catch (err: any) {
        setUploadError(err.message || `${file.name} 업로드 실패`);
      }
    }

    setIsUploading(false);
    if (successCount > 0) {
      setUploadNotice(`${successCount}개 파일이 Google Drive [${selectedMainFolder} > ${selectedSubtitle}] 폴더에 안전 저장되었습니다.`);
      setTimeout(() => setUploadNotice(null), 5000);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  const activeMeta = SUBTITLE_METAS[selectedSubtitle] || {
    code: 'FILE',
    title: selectedSubtitle,
    description: '관련 보관 자료',
    icon: 'FILE',
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* 1. 상단 컴팩트 헤더 바 (회사 Google Drive 계정 통합 연동 상태 표시) */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-white tracking-tight">
                기술본부 Google Drive 자료실
              </h2>
              {isDriveConnected ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  회사 계정 연동됨 (Google Drive)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  회사 계정 연동 대기중 (설정에서 연동)
                </span>
              )}
              <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                · 클레임센터 스튜디오 1:1 자동 폴더 적재
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-300 mt-0.5">
              기술본부 자료실 &gt; [{currentProject?.code}] &gt; <span className="text-amber-400 font-bold">{selectedMainFolder}</span> {selectedMainFolder !== '01.접수자료' && <>&gt; <span className="text-emerald-400 font-bold">{selectedRole}</span></>} &gt; <span className="text-white font-bold underline">{selectedSubtitle}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-medium text-slate-400">
            회사 저장소: <strong className="text-slate-200">concost_dt@gmail.com</strong>
          </span>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            5단계 폴더 매핑
          </span>
        </div>
      </div>

      {/* 2. 최우선 3대 대분류 폴더 선택 바 (01.접수자료 / 02.마감자료 / 03.구조자료) */}
      <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-white flex items-center gap-2">
            <Folder className="w-4 h-4 text-amber-400" />
            <span>대분류 폴더 선택</span>
            <span className="text-[11px] font-normal text-slate-400">
              (업로드 및 조회할 자료실의 1단계 최상위 폴더를 지정합니다)
            </span>
          </label>
          <span className="text-[11px] font-bold text-amber-400 bg-amber-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/40">
            현재 폴더: {selectedMainFolder}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MAIN_FOLDERS.map((folder) => {
            const isSelected = selectedMainFolder === folder;
            const subCount = FOLDER_SUBTITLES[folder].length;
            const desc =
              folder === '01.접수자료'
                ? '도면 및 발주처 제공자료 (현장설명서/입찰안내서)'
                : folder === '02.마감자료'
                ? '마감팀 산출자료 (FIN, CAD, 질의사항, VIETQS, 기타)'
                : '구조팀 산출자료 (FIN, CAD, 질의사항, VIETQS, 기타)';

            return (
              <button
                key={folder}
                type="button"
                onClick={() => handleMainFolderSelect(folder)}
                className={`p-3.5 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/50 scale-[1.01]'
                    : 'bg-slate-950 border-slate-700 hover:border-slate-500 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="flex items-center gap-2 font-black text-sm text-white">
                    <span className={`text-base ${isSelected ? 'scale-110' : ''}`}>
                      {folder === '01.접수자료' ? '📥' : folder === '02.마감자료' ? '🏢' : '🏗️'}
                    </span>
                    {folder}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSelected
                        ? 'bg-amber-400 text-black border-amber-300'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    하위 {subCount}개 세부분류
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                  {desc}
                </p>
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-black font-black text-[10px] flex items-center justify-center border-2 border-slate-900">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 대상 프로젝트 및 공종 선택 바 */}
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-xl p-4 shadow-md space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* 1) 프로젝트 선택 (7칸) */}
          <div className="md:col-span-7">
            <label className="block text-xs font-black text-white mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>대상 프로젝트 선택</span>
            </label>
            <div className="relative">
              <select
                value={selectedProjectCode}
                onChange={(e) => handleProjectSelect(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-600 rounded-lg px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-blue-400 appearance-none cursor-pointer shadow-inner"
              >
                {uniqueProjects.map((p) => (
                  <option key={p.code} value={p.code} className="bg-slate-900 text-white font-bold">
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-blue-400 font-bold text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* 2) 담당 공종 선택 (5칸) */}
          <div className="md:col-span-5">
            <label className="block text-xs font-black text-white mb-1.5 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {selectedMainFolder === '01.접수자료'
                  ? '자료 성격'
                  : `${selectedMainFolder.replace(/^\d+\./, '')} 세부 공종`}
              </span>
            </label>
            {selectedMainFolder === '01.접수자료' ? (
              <div className="w-full bg-slate-950 border-2 border-slate-700 rounded-lg px-3.5 py-2.5 text-xs font-bold text-amber-300 flex items-center justify-between">
                <span>공통 발주처 제공자료 (도면/시방/질의)</span>
                <span className="text-[10px] bg-amber-900/60 text-amber-200 px-2 py-0.5 rounded border border-amber-600/40">
                  전체 공종 공통
                </span>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-slate-600 rounded-lg px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-blue-400 appearance-none cursor-pointer shadow-inner"
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role} className="bg-slate-900 text-white font-bold">
                      {role} {role === 'PM' ? '(총괄)' : '공종'}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-amber-400 font-bold text-xs">
                  ▼
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. 세분화 서브타이틀 폴더 카드 선택창 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>[{selectedMainFolder}] 세분화 폴더 목록</span>
            <span className="text-xs font-medium text-emerald-400">
              (업로드 및 열람할 하위 폴더를 클릭하세요)
            </span>
          </h3>
          <span className="text-xs font-bold text-white bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
            현재 폴더 보관: <strong className="text-blue-400">{allFiles.filter((f) => {
              const fileMainFolder = f.mainFolder || (f.teamName === '구조팀' ? '03.구조자료' : f.subtitle.includes('도면 및 발주처') ? '01.접수자료' : '02.마감자료');
              return fileMainFolder === selectedMainFolder;
            }).length}</strong>건 / 전체 {allFiles.length}건
          </span>
        </div>

        <div className={`grid gap-3.5 ${
          selectedMainFolder === '01.접수자료'
            ? 'grid-cols-1'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
        }`}>
          {FOLDER_SUBTITLES[selectedMainFolder].map((subKey, idx) => {
            const meta = SUBTITLE_METAS[subKey] || {
              code: 'ETC',
              title: subKey,
              description: '관련 자료',
              icon: 'FILE',
            };
            const isSelected = selectedSubtitle === subKey;
            const count = subtitleCounts[subKey] || 0;

            // 서브타이틀별 테마 설정
            const themeList = [
              {
                activeBorder: 'border-blue-500 bg-blue-950/70 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-blue-500/60',
                badgeBg: isSelected ? 'bg-blue-600 text-white' : 'bg-blue-950 text-blue-300 border border-blue-800',
                tagColor: 'text-blue-400',
              },
              {
                activeBorder: 'border-emerald-500 bg-emerald-950/70 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-emerald-500/60',
                badgeBg: isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-300 border border-emerald-800',
                tagColor: 'text-emerald-400',
              },
              {
                activeBorder: 'border-sky-500 bg-sky-950/70 shadow-lg shadow-sky-500/20 ring-2 ring-sky-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-sky-500/60',
                badgeBg: isSelected ? 'bg-sky-600 text-white' : 'bg-sky-950 text-sky-300 border border-sky-800',
                tagColor: 'text-sky-400',
              },
              {
                activeBorder: 'border-rose-500 bg-rose-950/70 shadow-lg shadow-rose-500/20 ring-2 ring-rose-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-rose-500/60',
                badgeBg: isSelected ? 'bg-rose-600 text-white' : 'bg-rose-950 text-rose-300 border border-rose-800',
                tagColor: 'text-rose-400',
              },
              {
                activeBorder: 'border-purple-500 bg-purple-950/70 shadow-lg shadow-purple-500/20 ring-2 ring-purple-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-purple-500/60',
                badgeBg: isSelected ? 'bg-purple-600 text-white' : 'bg-purple-950 text-purple-300 border border-purple-800',
                tagColor: 'text-purple-400',
              },
            ];
            const themeConfig = themeList[idx % themeList.length];

            return (
              <button
                key={subKey}
                type="button"
                onClick={() => setSelectedSubtitle(subKey)}
                className={`relative flex items-center gap-3.5 p-4 rounded-xl border-2 text-left transition-all group cursor-pointer ${
                  isSelected ? themeConfig.activeBorder : themeConfig.inactiveBorder
                }`}
              >
                {/* 왼쪽 고대비 아이콘 뱃지 */}
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-md transition-all ${
                    themeConfig.badgeBg
                  }`}
                >
                  {meta.icon}
                </div>

                {/* 오른쪽 텍스트 & 카운트 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${themeConfig.tagColor}`}>
                      {meta.code}
                    </span>
                    <span
                      className={`text-[11px] font-black px-2 py-0.2 rounded-full border ${
                        count > 0
                          ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {count}건
                    </span>
                  </div>

                  <strong className="block text-xs font-black text-white truncate leading-snug">
                    {meta.title}
                  </strong>

                  <p className="text-[10px] font-medium text-slate-300 truncate mt-0.5">
                    {meta.description}
                  </p>
                </div>

                {/* 선택 완료 체크 표시 */}
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-400 text-black flex items-center justify-center font-black text-[10px] shadow-md border-2 border-slate-950">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 드래그 앤 드롭 & 파일 선택 업로드 존 (고대비: 화이트 텍스트 & 블루/그린 액션) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-7 transition-all text-center flex flex-col items-center justify-center gap-3 relative ${
          isDragging
            ? 'border-emerald-400 bg-emerald-950/30 scale-[1.005]'
            : 'border-blue-500/50 bg-slate-900/90 hover:border-blue-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_FILE_TYPES}
          className="hidden"
          onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
        />

        <div className="w-13 h-13 rounded-2xl bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center text-blue-400 shadow-md">
          <UploadCloud className="w-7 h-7 text-blue-400 animate-bounce" />
        </div>

        <div className="space-y-1">
          <strong className="block text-base font-black text-white">
            {isUploading
              ? '파일을 Google Drive에 안전 저장 중입니다...'
              : `[${selectedSubtitle}] → 회사 Google Drive에 바로 업로드`}
          </strong>
          <p className="text-xs font-semibold text-slate-300 max-w-xl leading-relaxed">
            파일을 끌어다 놓거나 아래 버튼을 누르세요 · FIN, DWG, PDF, Excel, 압축파일 지원<br />
            저장 경로: <span className="text-emerald-400 font-bold">기술본부 자료실/{currentProject?.name}/{selectedMainFolder}/{selectedMainFolder !== '01.접수자료' ? `${selectedRole}/` : ''}{selectedSubtitle}</span>
          </p>
        </div>

        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="mt-1 px-7 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
        >
          {isUploading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              안전 저장 중...
            </>
          ) : (
            <>
              <FolderOpen className="w-4 h-4" />
              업로드 파일 선택
            </>
          )}
        </button>

        {uploadNotice && (
          <div className="mt-2 px-4 py-2 rounded-lg bg-emerald-950 border-2 border-emerald-500 text-emerald-300 text-xs font-black flex items-center gap-2 animate-fadeIn shadow-md">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {uploadNotice}
          </div>
        )}

        {uploadError && (
          <div className="mt-2 px-4 py-2 rounded-lg bg-rose-950 border-2 border-rose-500 text-rose-300 text-xs font-black flex items-center gap-2 animate-fadeIn shadow-md">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            {uploadError}
          </div>
        )}
      </div>

      {/* 5. 하단 파일 뷰어 및 다운로드 목록 (고대비: 선명한 화이트, 블루, 에메랄드) */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-slate-800">
          <div>
            <h4 className="text-base font-black text-white flex items-center gap-2">
              <span className="text-blue-400">[{selectedSubtitle}]</span>
              <span>폴더별 보관 자료</span>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-black shadow-sm">
                {currentSubtitleFiles.length}개 파일
              </span>
            </h4>
            <p className="text-xs font-medium text-slate-300 mt-0.5">
              {activeMeta.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="파일명 / 작성자 / 공종 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border-2 border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 w-56"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-300 text-sm font-bold flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-slate-400/30 border-t-blue-400 rounded-full animate-spin" />
            자료 목록을 불러오는 중입니다...
          </div>
        ) : currentSubtitleFiles.length === 0 ? (
          <div className="text-center py-12 text-slate-300 text-sm">
            <FileText className="w-10 h-10 text-slate-500 mx-auto mb-2 opacity-80" />
            <p className="font-bold text-white text-base">아직 저장된 자료가 없습니다.</p>
            <p className="text-xs font-medium text-slate-400 mt-1">위 파란색 업로드 영역에 첫 파일을 올려주세요.</p>
          </div>
        ) : (
          <div className="divide-y-2 divide-slate-800">
            {currentSubtitleFiles.map((file) => (
              <div
                key={file.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850 px-3 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center font-black text-xs text-blue-300 shrink-0">
                    {activeMeta.icon}
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-sm font-black text-white truncate max-w-lg" title={file.originalName}>
                      {file.originalName}
                    </strong>
                    <div className="flex items-center gap-2.5 text-xs text-slate-300 font-semibold mt-0.5">
                      <span className="text-emerald-400 font-bold">
                        [{file.teamName} / {file.roleName}]
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-white">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        {file.uploadedBy}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(file.uploadedAt).toLocaleString('ko-KR')}
                      </span>
                      <span>·</span>
                      <span className="text-amber-300 font-bold">{formatBytes(file.byteSize)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-black text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded border border-emerald-500/50">
                    GOOGLE DRIVE
                  </span>

                  {file.driveUrl && (
                    <a
                      href={file.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-black flex items-center gap-1 transition-colors border border-slate-600"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-300" />
                      Drive 열기
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => downloadVaultFile(file)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    다운로드
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
