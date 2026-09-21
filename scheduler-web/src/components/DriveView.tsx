import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore, type Department } from '../store/useProjectStore';
import {
  CATEGORY_COPY,
  type CaseEvidenceCategory,
  type CaseEvidenceFile,
  ACCEPT_FILE_TYPES,
  formatBytes,
  fetchEvidenceFiles,
  uploadEvidenceFile,
  downloadFile,
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
} from 'lucide-react';

export const DriveView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();

  // 고유 프로젝트 목록 (중복 제거)
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

  // 선택된 프로젝트
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>(() => uniqueProjects[0]?.code || '');
  const currentProject = uniqueProjects.find((p) => p.code === selectedProjectCode) || uniqueProjects[0];

  // 선택된 카테고리 (기본값: 산출자료 TAKEOFF_SOURCE)
  const [selectedCategory, setSelectedCategory] = useState<CaseEvidenceCategory>('TAKEOFF_SOURCE');

  // 파일 목록 상태
  const [allFiles, setAllFiles] = useState<CaseEvidenceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 업로드 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 목록 로드
  const loadFiles = async (code: string) => {
    setIsLoading(true);
    try {
      const files = await fetchEvidenceFiles(code);
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

  // 카테고리별 파일 수 계산
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(CATEGORY_COPY).forEach((k) => {
      counts[k] = 0;
    });
    allFiles.forEach((f) => {
      if (counts[f.category] !== undefined) {
        counts[f.category] += 1;
      }
    });
    return counts;
  }, [allFiles]);

  // 현재 카테고리의 필터된 파일 목록
  const currentCategoryFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const matchCat = f.category === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      return f.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
             f.uploadedBy.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [allFiles, selectedCategory, searchQuery]);

  // 파일 업로드 처리
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList);
    if (!filesToUpload.length || !selectedProjectCode) return;

    setIsUploading(true);
    setUploadNotice(null);
    setUploadError(null);

    let successCount = 0;
    const userName = currentUser?.name || '사용자';

    for (const file of filesToUpload) {
      try {
        const uploaded = await uploadEvidenceFile({
          projectCode: selectedProjectCode,
          category: selectedCategory,
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
      setUploadNotice(`${successCount}개 파일이 회사 Google Drive [${CATEGORY_COPY[selectedCategory].title}]에 안전 저장되었습니다.`);
      setTimeout(() => setUploadNotice(null), 5000);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 드래그 앤 드롭 핸들러
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

  const activeCategoryMeta = CATEGORY_COPY[selectedCategory];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. 최상단 히어로 배너 (클레임센터 스튜디오 1:1 레이아웃) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-2 max-w-3xl z-10">
          <span className="inline-block text-xs font-bold tracking-wider text-blue-400 uppercase bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">
            PROJECT EVIDENCE LIBRARY · GOOGLE DRIVE
          </span>
          <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
            의뢰부터 최종 납품까지<br />
            모든 자료를 한곳에 모읍니다.
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed pt-1">
            발주처 제공자료, 회의록·녹음, 현장사진, 산출·내역, 법원자료와 최종 납품본을 프로젝트별로 분류합니다.
            파일명·업로드 시간·사용자·무결성 확인 이력을 기록합니다.
          </p>
        </div>

        {/* 우측 클라우드 스토리지 상태 카드 */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-xl p-5 min-w-[320px] shadow-lg flex flex-col justify-between z-10">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider">
                COMPANY STORAGE · TECH STUDIO ONLY
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                연동됨
              </span>
            </div>
            <strong className="block text-base font-bold text-white mb-1">
              기술본부 전용 Google Drive
            </strong>
            <p className="text-xs text-slate-400 leading-normal">
              CONCOST 자료실 / 프로젝트명 / 자료종류(업로드_날짜) · 파일당 최대 50MB
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between">
            <span className="text-xs text-slate-400">회사 계정: concost_dt@gmail.com</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              보안 검증 완료
            </span>
          </div>
        </div>
      </div>

      {/* 2. 프로젝트 자료실 선택 카드 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          프로젝트 자료실 선택
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <select
              value={selectedProjectCode}
              onChange={(e) => setSelectedProjectCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none font-medium cursor-pointer"
            >
              {uniqueProjects.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} - [{p.name}] (팀: {p.departments.join(', ')})
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
              ▼
            </div>
          </div>

          {currentProject && (
            <div className="flex items-center gap-2">
              {currentProject.departments.map((dep) => (
                <span
                  key={dep}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap"
                >
                  {dep}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. 13개 카테고리 카드 그리드 (클레임센터 스튜디오 1:1 완벽 반영) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>프로젝트 자료 → 회사 Google Drive에 업로드하세요</span>
          </h3>
          <span className="text-xs text-slate-400">
            총 {allFiles.length}개 보관 자료
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {(Object.keys(CATEGORY_COPY) as CaseEvidenceCategory[]).map((catKey) => {
            const meta = CATEGORY_COPY[catKey];
            const isSelected = selectedCategory === catKey;
            const count = categoryCounts[catKey] || 0;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all group ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 shadow-md shadow-blue-500/10'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                {/* 아이콘 뱃지 */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                  }`}
                >
                  {meta.icon}
                </div>

                {/* 텍스트 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      {meta.phase}
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.2 rounded-full ${
                        count > 0
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <strong className={`block text-xs font-semibold truncate ${
                    isSelected ? 'text-white' : 'text-slate-200'
                  }`}>
                    {meta.title}
                  </strong>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 드래그 앤 드롭 업로드 영역 (클레임센터 1:1 방식) */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 transition-all text-center flex flex-col items-center justify-center gap-3 relative ${
          isDragging
            ? 'border-blue-400 bg-blue-500/10 scale-[1.005]'
            : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-600'
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

        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-sm">
          <UploadCloud className="w-7 h-7 animate-bounce" />
        </div>

        <div className="space-y-1">
          <strong className="block text-base font-bold text-white">
            {isUploading
              ? '파일을 Google Drive에 안전 저장 중입니다...'
              : `${activeCategoryMeta.title} → 회사 Google Drive에 업로드하세요`}
          </strong>
          <p className="text-xs text-slate-400 max-w-lg">
            파일을 끌어다 놓거나 선택하세요 · 문서·도면·사진·녹음파일 지원 · CONCOST 자료실/{currentProject?.name}/{activeCategoryMeta.title}(업로드_날짜)에 저장됩니다.
          </p>
        </div>

        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              업로드 중...
            </>
          ) : (
            <>
              <FolderOpen className="w-4 h-4" />
              파일 선택
            </>
          )}
        </button>

        {uploadNotice && (
          <div className="mt-3 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            {uploadNotice}
          </div>
        )}

        {uploadError && (
          <div className="mt-3 px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4" />
            {uploadError}
          </div>
        )}
      </div>

      {/* 5. 안내 문구 배너 바 (클레임센터 원문 1:1) */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3 flex items-center justify-between text-xs text-amber-300">
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>회사 Google Drive 저장:</strong> 회사 계정 연결 완료 · 개인 Google 계정 공유 없이 소속 부서(마감팀·구조팀), 관리자 또는 해당 프로젝트에 배정된 회원의 스튜디오 로그인으로 이행합니다.
          </span>
        </span>
      </div>

      {/* 6. 하단 파일 뷰어 및 다운로드 목록 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <span>{activeCategoryMeta.title} - 폴더별 자료</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                파일 {currentCategoryFiles.length}개
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeCategoryMeta.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="파일명 / 작성자 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400 text-sm flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-slate-400/30 border-t-blue-400 rounded-full animate-spin" />
            자료 목록을 불러오는 중입니다...
          </div>
        ) : currentCategoryFiles.length === 0 ? (
          <div className="text-center py-14 text-slate-400 text-sm">
            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-60" />
            <p className="font-medium text-slate-300">아직 저장된 자료가 없습니다.</p>
            <p className="text-xs text-slate-500 mt-1">위 영역에 첫 자료를 올려 주세요.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {currentCategoryFiles.map((file) => (
              <div
                key={file.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850/50 px-2 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-xs text-blue-400 shrink-0">
                    {activeCategoryMeta.icon}
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-sm font-semibold text-white truncate max-w-md" title={file.originalName}>
                      {file.originalName}
                    </strong>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        {file.uploadedBy}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(file.uploadedAt).toLocaleString('ko-KR')}
                      </span>
                      <span>·</span>
                      <span>{formatBytes(file.byteSize)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    GOOGLE DRIVE
                  </span>

                  {file.driveUrl && (
                    <a
                      href={file.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors border border-slate-700"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                      Drive에서 열기
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => downloadFile(file)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm"
                  >
                    <Download className="w-3 h-3" />
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
