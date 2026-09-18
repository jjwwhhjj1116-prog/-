import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import {
  Folder,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  Calendar,
  User,
  CheckCircle2,
  ExternalLink,
  Search,
  HardDrive,
  FolderPlus,
} from 'lucide-react';

interface DriveFolderItem {
  id: string;
  folderName: string; // 예: "창호_2026-09-17_조한빈"
  roleTitle: string; // 예: "창호"
  team: '마감팀' | '구조팀' | '토목&조경팀';
  date: string;
  authorName: string;
  files: { name: string; size: string; ext: string }[];
  driveUrl: string;
}

// 각 팀별 지정 타이틀(공종) 목록
export const DRIVE_ROLES: Record<'마감팀' | '구조팀' | '토목&조경팀', string[]> = {
  마감팀: ['조적', '창호', '외부', '내부', '가설', '세대'],
  구조팀: ['보', '슬라브', '기둥', '옹벽', '기초', '아파트슬라브', '아파트옹벽'],
  '토목&조경팀': ['토목공사', '부대토목', '조경공사'],
};

const initialFolders: DriveFolderItem[] = [
  {
    id: 'df-1',
    folderName: '창호_2026-09-15_조한빈',
    roleTitle: '창호',
    team: '마감팀',
    date: '2026-09-15',
    authorName: '조한빈 실장',
    files: [
      { name: '수택E구역_창호일람표_Rev2.xlsx', size: '2.4 MB', ext: 'xlsx' },
      { name: '창호프레임단면상세_v1.dwg', size: '14.8 MB', ext: 'dwg' },
    ],
    driveUrl: 'https://drive.google.com/drive/u/0/folders/concost-finish-window',
  },
  {
    id: 'df-2',
    folderName: '슬라브_2026-09-16_장범선',
    roleTitle: '슬라브',
    team: '구조팀',
    date: '2026-09-16',
    authorName: '장범선 실장',
    files: [
      { name: '과천8BL_지하주차장_슬라브배근물량.xlsx', size: '4.1 MB', ext: 'xlsx' },
      { name: '슬라브하중구조계산서_최종.pdf', size: '8.3 MB', ext: 'pdf' },
    ],
    driveUrl: 'https://drive.google.com/drive/u/0/folders/concost-structure-slab',
  },
  {
    id: 'df-3',
    folderName: '토목공사_2026-09-17_오승균',
    roleTitle: '토목공사',
    team: '토목&조경팀',
    date: '2026-09-17',
    authorName: '오승균 파트장',
    files: [
      { name: '송도바이오단지_토공절토수량산출집계표.xlsx', size: '3.6 MB', ext: 'xlsx' },
      { name: '토공토량배분도_0917.dwg', size: '22.1 MB', ext: 'dwg' },
    ],
    driveUrl: 'https://drive.google.com/drive/u/0/folders/concost-civil-earth',
  },
];

export const DriveView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [folders, setFolders] = useState<DriveFolderItem[]>(initialFolders);
  const [activeTab, setActiveTab] = useState<'전체' | '마감팀' | '구조팀' | '토목&조경팀'>('전체');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 업로드 폼 상태
  const [selectedTeam, setSelectedTeam] = useState<'마감팀' | '구조팀' | '토목&조경팀'>('마감팀');
  const [selectedRoleTitle, setSelectedRoleTitle] = useState(DRIVE_ROLES.마감팀[0]);
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
  const [authorNameInput, setAuthorNameInput] = useState(currentUser?.name || '담당자');
  const [fileInputName, setFileInputName] = useState('');
  const [isSuccessToast, setIsSuccessToast] = useState(false);

  // 팀 변경 시 기본 공종 타이틀 갱신
  const handleTeamChange = (team: '마감팀' | '구조팀' | '토목&조경팀') => {
    setSelectedTeam(team);
    setSelectedRoleTitle(DRIVE_ROLES[team][0]);
  };

  // 규칙: 타이틀 + 날짜 + 회원이름
  const generatedFolderName = `${selectedRoleTitle}_${uploadDate}_${authorNameInput.trim()}`;

  const handleUploadAndCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const newFolder: DriveFolderItem = {
      id: `df-${Date.now()}`,
      folderName: generatedFolderName,
      roleTitle: selectedRoleTitle,
      team: selectedTeam,
      date: uploadDate,
      authorName: authorNameInput,
      files: [
        {
          name: fileInputName.trim() || `${generatedFolderName}_물량산출서.xlsx`,
          size: '3.8 MB',
          ext: 'xlsx',
        },
      ],
      driveUrl: `https://drive.google.com/drive/u/0/folders/auto-gen-${Date.now()}`,
    };

    setFolders([newFolder, ...folders]);
    setFileInputName('');
    setIsSuccessToast(true);
    setTimeout(() => setIsSuccessToast(false), 3500);
  };

  const filteredFolders = folders.filter((f) => {
    const matchTeam = activeTab === '전체' || f.team === activeTab;
    const matchSearch =
      f.folderName.includes(searchKeyword) ||
      f.authorName.includes(searchKeyword) ||
      f.roleTitle.includes(searchKeyword);
    return matchTeam && matchSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 타이틀 및 헤더 액션 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Google 드라이브 자료실 (자동 폴더 생성기)
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  클레임센터 스토리지 연계됨
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                업로드 시 타이틀(공종) + 날짜 + 회원이름 기반으로 Google 드라이브 경로가 자동 생성됩니다.
              </p>
            </div>
          </div>
        </div>

        <a
          href="https://drive.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
        >
          <ExternalLink className="w-4 h-4" />
          Google Drive 루트 열기
        </a>
      </div>

      {/* 업로드 시 자동 폴더 생성 카드 (핵심 기능) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div className="flex items-center justify-between mb-4 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-orange-400" />
            <h3 className="text-sm font-bold tracking-tight text-white">
              자료 업로드 및 자동 폴더 생성 (규칙: 타이틀 + 날짜 + 회원이름)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            현재 로그인: {currentUser?.name} ({currentUser?.department})
          </span>
        </div>

        {isSuccessToast && (
          <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Google 드라이브에 <strong className="text-white">[{generatedFolderName}]</strong> 폴더가
              자동 생성되고 파일이 등록되었습니다!
            </span>
          </div>
        )}

        <form onSubmit={handleUploadAndCreateFolder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. 소속 팀 선택 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">소속 팀</label>
              <select
                value={selectedTeam}
                onChange={(e) =>
                  handleTeamChange(e.target.value as '마감팀' | '구조팀' | '토목&조경팀')
                }
                className="w-full text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500"
              >
                <option value="마감팀">마감팀</option>
                <option value="구조팀">구조팀</option>
                <option value="토목&조경팀">토목&조경팀</option>
              </select>
            </div>

            {/* 2. 공종 타이틀 선택 (지정된 공종 목록) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                공종 타이틀 ({DRIVE_ROLES[selectedTeam].length}개 항목)
              </label>
              <select
                value={selectedRoleTitle}
                onChange={(e) => setSelectedRoleTitle(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500 font-semibold text-orange-300"
              >
                {DRIVE_ROLES[selectedTeam].map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. 날짜 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">등록 일자</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500"
                  required
                />
              </div>
            </div>

            {/* 4. 회원이름 */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">회원 이름</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={authorNameInput}
                  onChange={(e) => setAuthorNameInput(e.target.value)}
                  placeholder="예: 조한빈"
                  className="w-full pl-8 pr-2.5 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* 자동 생성될 폴더명 실시간 미리보기 바 */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">
                자동 생성 폴더 경로 :
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                📁 /{generatedFolderName}/
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              ※ Google Drive API 자동 폴더 매핑 준비완료
            </span>
          </div>

          {/* 파일명 입력 및 업로드 실행 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={fileInputName}
              onChange={(e) => setFileInputName(e.target.value)}
              placeholder="업로드할 산출자료 파일명 (예: 수택E구역_조적산출집계표_Rev1.xlsx)"
              className="flex-1 text-xs p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg transition shadow-md shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              폴더 자동 생성 및 자료 등록
            </button>
          </div>
        </form>
      </div>

      {/* 폴더 및 자료실 탐색기 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* 상단 필터 탭 */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            {(['전체', '마감팀', '구조팀', '토목&조경팀'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="폴더명, 공종, 작성자 검색..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {/* 폴더 리스트 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">자동 생성 폴더명</th>
                <th className="py-3 px-4">소속 팀</th>
                <th className="py-3 px-4">공종 타이틀</th>
                <th className="py-3 px-4">등록 회원</th>
                <th className="py-3 px-4">생성 일자</th>
                <th className="py-3 px-4">포함 파일</th>
                <th className="py-3 px-4 text-right">드라이브 바로가기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredFolders.map((folder) => (
                <tr key={folder.id} className="hover:bg-slate-50/80 transition group">
                  <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                    <span className="font-mono text-blue-700">{folder.folderName}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {folder.team}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200/50">
                      {folder.roleTitle}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-700">{folder.authorName}</td>
                  <td className="py-3.5 px-4 text-slate-500">{folder.date}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex flex-col gap-0.5">
                      {folder.files.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          {file.ext === 'xlsx' ? (
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <FileCode className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          )}
                          <span className="truncate max-w-[200px]">{file.name}</span>
                          <span className="text-[10px] text-slate-400">({file.size})</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <a
                      href={folder.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      폴더 열기
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
