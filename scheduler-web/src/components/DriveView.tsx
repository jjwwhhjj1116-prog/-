import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore, TEAM_ROLES, type Department } from '../store/useProjectStore';
import {
  SUBTITLES,
  SUBTITLE_METAS,
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
  ShieldCheck,
  FolderOpen,
  Clock,
  User,
  AlertCircle,
  Building2,
  Users,
  HardDrive,
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

  // 2. 소속팀 선택 상태
  const availableTeams: Department[] = currentProject?.departments?.length ? currentProject.departments : ['마감팀', '구조팀'];
  const [selectedTeam, setSelectedTeam] = useState<Department>(() => availableTeams[0] || '마감팀');

  // 3. 공종 선택 상태
  const availableRoles = useMemo(() => {
    return TEAM_ROLES[selectedTeam] || ['공종'];
  }, [selectedTeam]);

  const [selectedRole, setSelectedRole] = useState<string>(() => {
    const roles = TEAM_ROLES[selectedTeam] || [];
    return roles.find((r) => r !== 'PM') || roles[0] || '조적';
  });

  // 4. 서브타이틀 선택 상태 (기본: 1.프로그램파일(FIN))
  const [selectedSubtitle, setSelectedSubtitle] = useState<SubtitleType>('1.프로그램파일(FIN)');

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

  // 서브타이틀별 파일 카운트 계산
  const subtitleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      '1.프로그램파일(FIN)': 0,
      '2.CAD작업도면': 0,
      '3.질의사항&견적조건': 0,
      '4.기타': 0,
    };
    allFiles.forEach((f) => {
      if (counts[f.subtitle] !== undefined) {
        counts[f.subtitle] += 1;
      }
    });
    return counts;
  }, [allFiles]);

  // 현재 필터된 파일 목록
  const currentSubtitleFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const matchSub = f.subtitle === selectedSubtitle;
      if (!matchSub) return false;
      if (!searchQuery.trim()) return true;
      return f.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             f.uploadedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
             f.roleName.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [allFiles, selectedSubtitle, searchQuery]);

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
          teamName: selectedTeam,
          roleName: selectedRole,
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
      setUploadNotice(`${successCount}개 파일이 Google Drive [${selectedSubtitle}] 폴더에 안전 저장되었습니다.`);
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

  const activeMeta = SUBTITLE_METAS[selectedSubtitle];

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* 1. 상단 컴팩트 헤더 바 (쓸모없는 거대 배너 완전 삭제, 핵심 정보만 고대비로 표시) */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">
                기술본부 Google Drive 자료실
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                회사 계정 연동됨
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-300">
              기술본부 자료실 &gt; [{currentProject?.code}] &gt; <span className="text-blue-400 font-bold">{selectedTeam}</span> &gt; <span className="text-emerald-400 font-bold">{selectedRole}</span> &gt; <span className="text-white font-bold underline">{selectedSubtitle}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-xs font-medium text-slate-400">
            회사 저장소: <strong className="text-slate-200">concost_dt@gmail.com</strong>
          </span>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            보안 인증
          </span>
        </div>
      </div>

      {/* 2. 대상 프로젝트 및 팀/공종 선택 바 (고대비: 화이트/블루/에메랄드/블랙) */}
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-xl p-4 shadow-md space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* 1) 프로젝트 선택 (5칸) */}
          <div className="md:col-span-5">
            <label className="block text-xs font-black text-white mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              1. 대상 프로젝트 선택
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

          {/* 2) 소속팀 선택 (4칸) */}
          <div className="md:col-span-4">
            <label className="block text-xs font-black text-white mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              2. 소속 부서(팀) 선택
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['마감팀', '구조팀', '토목&조경팀'] as Department[]).map((team) => {
                const isSelected = selectedTeam === team;
                return (
                  <button
                    key={team}
                    type="button"
                    onClick={() => handleTeamSelect(team)}
                    className={`py-2 px-1 text-xs font-black rounded-lg border-2 transition-all text-center ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-500/20 scale-[1.02]'
                        : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {team}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3) 공종 선택 (3칸) */}
          <div className="md:col-span-3">
            <label className="block text-xs font-black text-white mb-1.5 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              3. 담당 공종 선택
            </label>
            <div className="relative">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-600 rounded-lg px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-blue-400 appearance-none cursor-pointer shadow-inner"
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
          </div>
        </div>
      </div>

      {/* 3. 4대 서브타이틀 카드에셋 선택창 (★흰색, 초록, 검은색, 파랑색 초고대비 명품 UI★) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>4대 필수 서브타이틀 폴더 선택</span>
            <span className="text-xs font-medium text-emerald-400">
              (선택한 폴더로 자동 분류 저장됩니다)
            </span>
          </h3>
          <span className="text-xs font-bold text-white bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
            총 <strong className="text-blue-400">{allFiles.length}</strong>개 파일 보관 중
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {SUBTITLES.map((subKey, idx) => {
            const meta = SUBTITLE_METAS[subKey];
            const isSelected = selectedSubtitle === subKey;
            const count = subtitleCounts[subKey] || 0;

            // 각 서브타이틀 고유 테마 (초록, 파랑, 화이트, 블랙 기준)
            const themeConfig = [
              // 1. FIN: 블루 & 화이트
              {
                activeBorder: 'border-blue-500 bg-blue-950/70 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-blue-500/60',
                badgeBg: isSelected ? 'bg-blue-600 text-white' : 'bg-blue-950 text-blue-300 border border-blue-800',
                tagColor: 'text-blue-400',
              },
              // 2. CAD: 에메랄드 초록 & 화이트
              {
                activeBorder: 'border-emerald-500 bg-emerald-950/70 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-emerald-500/60',
                badgeBg: isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-950 text-emerald-300 border border-emerald-800',
                tagColor: 'text-emerald-400',
              },
              // 3. Q&A: 사이언/스카이블루 & 화이트
              {
                activeBorder: 'border-sky-500 bg-sky-950/70 shadow-lg shadow-sky-500/20 ring-2 ring-sky-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-sky-500/60',
                badgeBg: isSelected ? 'bg-sky-600 text-white' : 'bg-sky-950 text-sky-300 border border-sky-800',
                tagColor: 'text-sky-400',
              },
              // 4. 기타: 화이트 & 다크블랙
              {
                activeBorder: 'border-purple-500 bg-purple-950/70 shadow-lg shadow-purple-500/20 ring-2 ring-purple-400',
                inactiveBorder: 'border-slate-700 bg-slate-900 hover:border-purple-500/60',
                badgeBg: isSelected ? 'bg-purple-600 text-white' : 'bg-purple-950 text-purple-300 border border-purple-800',
                tagColor: 'text-purple-400',
              },
            ][idx];

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
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-md transition-all ${
                    themeConfig.badgeBg
                  }`}
                >
                  {meta.icon}
                </div>

                {/* 오른쪽 텍스트 & 카운트 (선명한 화이트 & 고대비) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-[11px] font-black uppercase tracking-wider ${themeConfig.tagColor}`}>
                      SUBTITLE {meta.code}
                    </span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-full border ${
                        count > 0
                          ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {count}건
                    </span>
                  </div>

                  <strong className="block text-sm font-black text-white truncate leading-snug">
                    {meta.title}
                  </strong>

                  <p className="text-[11px] font-medium text-slate-300 truncate mt-0.5">
                    {meta.description}
                  </p>
                </div>

                {/* 선택 완료 체크 표시 */}
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center font-black text-xs shadow-md border-2 border-slate-950">
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
            저장 경로: <span className="text-emerald-400 font-bold">기술본부 자료실/{currentProject?.name}/{selectedTeam}/{selectedRole}/{selectedSubtitle}</span>
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
