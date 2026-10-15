import React, { useState, useEffect } from 'react';
import {
  Settings,
  HardDrive,
  Users,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Lock,
  RefreshCw,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
} from 'lucide-react';
import { useAuthStore, isUserAdmin } from '../store/useAuthStore';
import { VIET_ASSIGNMENT_GROUPS } from '../utils/vietPersonnel';

type SettingsTab = 'GDRIVE' | 'MEMBERS' | 'MY_PROFILE';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    loginError,
    clearError,
    users,
    googleDriveConfig,
    testGoogleDriveConnection,
    changePassword,
    adminResetPassword,
    adminAddUser,
    adminUpdateUser,
    adminDeleteUser,
  } = useAuthStore();

  // 관리자 권한 여부 판별 (오직 yjw@con-cost.com, yjpark@con-cost.com 2개 계정만 관리자)
  const isAdmin = isUserAdmin(currentUser);

  const [activeTab, setActiveTab] = useState<SettingsTab>(isAdmin ? 'GDRIVE' : 'MY_PROFILE');

  // 비관리자 접근 시 개인 설정 탭으로 안전 리다이렉트
  useEffect(() => {
    if (!isAdmin) {
      setActiveTab('MY_PROFILE');
    }
  }, [isAdmin]);

  // 1. Google Drive 설정 폼 상태 (사용자 실제 OAuth 2.0 Credentials 연동)
  const [showConsoleGuide, setShowConsoleGuide] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveToast, setDriveToast] = useState<string | null>(null);

  // 2. 개인 비밀번호 변경 폼 상태
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ success: boolean; text: string } | null>(null);

  // 3. 관리자 회원 관리 상태
  const [searchMember, setSearchMember] = useState('');
  const [memberDeptFilter, setMemberDeptFilter] = useState('전체');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);

  // 신규 회원 등록 폼 상태
  const [newUserName, setNewUserName] = useState('');
  const [newUserDept, setNewUserDept] = useState('마감팀');
  const [newUserPos, setNewUserPos] = useState('사원');
  const [newUserId, setNewUserId] = useState('');
  const [newUserPw, setNewUserPw] = useState('');
  const [accountAction, setAccountAction] = useState<{id:string;name:string;company?:string;extension?:string;action:'reset'|'deactivate'}|null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMode, setResetMode] = useState<'extension'|'temporary'>('extension');
  const [resetExtension, setResetExtension] = useState('');
  const [resetIssued, setResetIssued] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [newUserCompany, setNewUserCompany] = useState('컨코스트');
  const [newUserVietTeamId, setNewUserVietTeamId] = useState('');
  const [vietTeamBusy, setVietTeamBusy] = useState('');

  const handleTestConnection = async () => {
    setIsTestingDrive(true);
    try {
      const connected = await testGoogleDriveConnection();
      setDriveToast(connected ? '회사 Google Drive 연결을 서버에서 확인했습니다.' : 'Google Drive 연결을 확인하지 못했습니다. 서버 설정과 회사 계정 연동을 확인하세요.');
    } finally { setIsTestingDrive(false); }
  };
  useEffect(() => { if (isAdmin) void testGoogleDriveConnection(); }, [isAdmin, testGoogleDriveConnection]);

  // 관리자 회사 Google Drive OAuth 1회 연동 시작
  const handleStartCompanyOAuth = () => {
    window.location.href = '/api/google/oauth/start';
  };

  // Google OAuth 콜백 복귀 알림 감지
  useEffect(() => {
    if (window.location.search.includes('gdrive=connected') || window.location.hash.includes('gdrive=connected')) {
      setDriveToast('Google 승인에서 돌아왔습니다. 서버 연결 상태를 확인하고 있습니다.');
      setTimeout(() => setDriveToast(null), 6000);
    }
  }, []);

  // 개인 비밀번호 변경 처리
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ success: false, text: '새 비밀번호와 확인 입력이 일치하지 않습니다.' });
      return;
    }
    const res = await changePassword(currentPw, newPw);
    setPwMsg({ success: res.success, text: res.message });
    if (res.success) {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    }
  };

  // 신규 회원 등록
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserId.trim()) return;

    const saved=await adminAddUser({
      no: users.length + 1,
      name: newUserName.trim(),
      engName: newUserName.trim(),
      company: newUserCompany,
      department: newUserDept,
      originalDept: newUserDept,
      position: newUserPos,
      phone: '010-0000-0000',
      email: `${newUserId.trim()}@con-cost.com`,
      idPrefix: newUserId.trim().toLowerCase(),
      password: newUserPw.trim(),
      role: newUserPos.includes('실장') || newUserPos.includes('본부장') ? 'ADMIN' : 'MEMBER',
      ...(newUserCompany === 'VIETQS' ? {vietTeamId: newUserVietTeamId} : {}),
    });

    if(!saved)return;
    setIsAddUserOpen(false);
    setNewUserName('');
    setNewUserId('');
    setNewUserPw('');
    setNewUserVietTeamId('');
  };

  const filteredMembers = users.filter((u) => {
    if(u.active===false)return false;
    const matchDept = memberDeptFilter === '전체' || u.department.includes(memberDeptFilter);
    const matchSearch =
      u.name.includes(searchMember) ||
      u.idPrefix.includes(searchMember) ||
      u.position.includes(searchMember);
    return matchDept && matchSearch;
  });

  return (
    <div data-no-field-translate className="space-y-6 animate-fadeIn">
      {loginError&&<p role="alert" className="p-3 rounded bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100">{loginError}</p>}
      {driveToast&&<p role="status" className="p-3 rounded bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100">{driveToast}</p>}
      {/* 타이틀 및 헤더 */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                기술본부 시스템 환경설정
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800">
                  {isAdmin ? 'ADMIN CONSOLE' : 'MY SETTINGS'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAdmin
                  ? 'Google Workspace 클라우드 연동, 기술본부 회원 관리 및 보안 설정을 통합 관리합니다.'
                  : '개인 계정 정보 및 비밀번호 보안 설정을 관리합니다.'}
              </p>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 버튼 (관리자만 GDRIVE, MEMBERS 노출) */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('GDRIVE')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                  activeTab === 'GDRIVE'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <HardDrive className="w-4 h-4 text-orange-500" />
                Google Drive 연동 설정
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('MEMBERS')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                  activeTab === 'MEMBERS'
                    ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 text-blue-600" />
                관리자 회원 관리 ({users.length}명)
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('MY_PROFILE')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'MY_PROFILE'
                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4 text-purple-600" />
            개인 설정 · 비밀번호
          </button>
        </div>
      </div>

      {/* 1. Google Drive 연동 설정 탭 (오직 관리자 계정만 접근 및 표시) */}
      {isAdmin && activeTab === 'GDRIVE' && (
        <div className="space-y-6">
          {driveToast && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{driveToast}</span>
            </div>
          )}

          {/* 클레임센터 스튜디오 3단계 프로토콜 안내 카드 */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-700/70 pb-3">
              <div>
                <span className="text-[10px] font-extrabold text-orange-400 tracking-widest uppercase block mb-0.5">
                  GOOGLE WORKSPACE · SECURE CONNECTION
                </span>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  Google Drive 클라우드 중앙 저장소 연결
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold border flex items-center gap-1 ${googleDriveConfig.connected ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border-amber-400/30'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${googleDriveConfig.connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {googleDriveConfig.connected ? '연결 확인됨' : '연결 미확인'}
                  </span>
                </h3>
                <p className="mt-2 text-xs text-slate-300">실제 저장 계정: <strong className="text-white">{googleDriveConfig.connected && googleDriveConfig.companyEmail ? googleDriveConfig.companyEmail : '연결 상태 테스트로 확인하세요'}</strong></p>
                <p className="mt-1 text-xs text-slate-300">지원 이메일은 Drive 저장 계정과 별개입니다. 회원은 개인 Google 계정 없이 스튜디오 권한으로 자료를 이용합니다.</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                최종 확인: {googleDriveConfig.lastCheckedAt || '아직 확인하지 않음'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                <span className="text-orange-400 font-mono font-bold block mb-1">STEP 01</span>
                <strong className="text-white block mb-1">D1 및 로컬 업무 저장 활성</strong>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  기술본부 세션과 산출 프로젝트 초안이 안전하게 저장되며 권한 검증이 수행됩니다.
                </p>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                <span className="text-orange-400 font-mono font-bold block mb-1">STEP 02</span>
                <strong className="text-white block mb-1">Google OAuth 2.0 Client 등록</strong>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  승인된 Redirect URI와 Client ID / Secret을 암호화 비밀값으로 안전하게 바인딩합니다.
                </p>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700">
                <span className="text-orange-400 font-mono font-bold block mb-1">STEP 03</span>
                <strong className="text-white block mb-1">Drive 자동 폴더 매핑</strong>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  프로젝트·자료 분류 아래 <code className="text-orange-300 bg-slate-900 px-1 py-0.5 rounded">업로더_YYYY.MM.DD</code> 폴더가 생성됩니다. 공종은 스튜디오의 파일 분류로 보관합니다.
                </p>
              </div>
            </div>
          </div>

          {/* Google Cloud Console 등록 가이드 (기본 접힘/숨김, 필요시 클릭하여 확인) */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowConsoleGuide(!showConsoleGuide)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Google Cloud Console 등록 파라미터 가이드 (필요시 클릭하여 펼침)
              </span>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span className="text-[11px] font-mono">{showConsoleGuide ? '접기' : '상세보기'}</span>
                {showConsoleGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {showConsoleGuide && (
              <div className="p-5 border-t border-slate-200 dark:border-slate-700 space-y-3 bg-blue-50/40 dark:bg-blue-950/20">
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  Google Cloud Console의 [OAuth 동의 화면] 및 [사용자 인증 정보 &gt; OAuth 2.0 클라이언트 ID] 생성 시 각 항목을 복사하여 붙여넣으실 수 있습니다.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 font-mono text-[11px]">
                  {/* 1. 브랜딩: 앱 이름 */}
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans font-bold">1. 앱 이름 (App Name)</span>
                      <span className="font-bold text-slate-800 dark:text-white">CONCOST TECH SCHEDULER</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('CONCOST TECH SCHEDULER');
                        setDriveToast('앱 이름이 복사되었습니다.');
                        setTimeout(() => setDriveToast(null), 2500);
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                      title="복사"
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  {/* 2. 브랜딩: 사용자 지원 / 개발자 이메일 */}
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans font-bold">2. 사용자 지원 및 개발자 이메일</span>
                      <span className="font-bold text-slate-800 dark:text-white">concost.dt@gmail.com</span>
                      <span className="text-[10px] text-slate-500 block font-sans mt-1">앱 지원 연락처이며 실제 Drive 저장 계정은 위 연결 상태에서 확인합니다.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('concost.dt@gmail.com');
                        setDriveToast('이메일 주소가 복사되었습니다.');
                        setTimeout(() => setDriveToast(null), 2500);
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                      title="복사"
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  {/* 3. 승인된 도메인 */}
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans font-bold">3. 승인된 도메인 (Authorized Domain)</span>
                      <span className="font-bold text-[#00338d] dark:text-blue-300">concost-tech-scheduler.pages.dev</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('concost-tech-scheduler.pages.dev');
                        setDriveToast('승인된 도메인이 복사되었습니다.');
                        setTimeout(() => setDriveToast(null), 2500);
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                      title="복사"
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  {/* 4. 앱 도메인 (홈페이지, 개인정보처리방침, 약관) */}
                  <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <span className="text-[10px] text-slate-400 block font-sans font-bold uppercase tracking-wider">
                      4. 앱 도메인 (Google OAuth 앱 게시 심사 링크)
                    </span>
                    
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="truncate mr-2">
                        <span className="text-[10px] text-slate-500 font-bold block">홈페이지</span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                          https://concost-tech-scheduler.pages.dev
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('https://concost-tech-scheduler.pages.dev');
                          setDriveToast('홈페이지 링크가 복사되었습니다.');
                          setTimeout(() => setDriveToast(null), 2500);
                        }}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700"
                      >
                        <Copy size={12} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="truncate mr-2">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">개인정보처리방침</span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                          https://concost-tech-scheduler.pages.dev/privacy.html
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('https://concost-tech-scheduler.pages.dev/privacy.html');
                          setDriveToast('개인정보처리방침 링크가 복사되었습니다.');
                          setTimeout(() => setDriveToast(null), 2500);
                        }}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700"
                      >
                        <Copy size={12} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="truncate mr-2">
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold block">서비스 약관</span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                          https://concost-tech-scheduler.pages.dev/terms.html
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('https://concost-tech-scheduler.pages.dev/terms.html');
                          setDriveToast('서비스 약관 링크가 복사되었습니다.');
                          setTimeout(() => setDriveToast(null), 2500);
                        }}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-slate-700"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>

                  {/* 5. 승인된 자바스크립트 원본 */}
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between md:col-span-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans font-bold">5. 승인된 자바스크립트 원본 (Authorized JavaScript origins)</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">https://concost-tech-scheduler.pages.dev</span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className="text-slate-600 dark:text-slate-400">http://localhost:5173</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://concost-tech-scheduler.pages.dev');
                        setDriveToast('승인된 자바스크립트 원본 URL이 복사되었습니다.');
                        setTimeout(() => setDriveToast(null), 2500);
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                    >
                      <Copy size={13} />
                    </button>
                  </div>

                  {/* 6. 승인된 리디렉션 URI */}
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between md:col-span-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans font-bold">6. 승인된 리디렉션 URI (Authorized redirect URIs)</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">https://concost-tech-scheduler.pages.dev</span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className="text-slate-600 dark:text-slate-400">http://localhost:5173</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('https://concost-tech-scheduler.pages.dev');
                        setDriveToast('승인된 리디렉션 URI가 복사되었습니다.');
                        setTimeout(() => setDriveToast(null), 2500);
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Google Drive 상세 설정 폼 (필수 OAuth 키 3개만 깔끔하게 표시) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Google Cloud API OAuth 2.0 Credentials
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">
                클라우드 저장소: <strong className="text-blue-700">기술본부 자료실 (자동 매핑)</strong>
              </span>
            </div>

            <p className="text-sm text-slate-700">Google 연결 설정은 서버에서 관리합니다. 관리자는 연결 상태를 확인하고 회사 계정 연동을 진행할 수 있습니다.</p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>※ 루트 폴더는 Google Drive 내 최상위 <strong className="text-slate-800 font-semibold">'기술본부 자료실'</strong>로 자동 생성 및 관리됩니다. (수동 ID 입력 불필요)</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                자동 폴더 트리 매핑 활성
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingDrive}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingDrive ? 'animate-spin' : ''}`} />
                  {isTestingDrive ? 'OAuth 연결 점검 중...' : 'Google Drive 연결 상태 테스트'}
                </button>

                <button
                  type="button"
                  onClick={handleStartCompanyOAuth}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5"
                  title="관리자 1회 승인으로 회사 구글 드라이브 영구 연동"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  회사 Google Drive 1회 연동
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 2. 관리자 회원 관리 탭 (오직 관리자 계정만 접근 및 표시) */}
      {isAdmin && activeTab === 'MEMBERS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                기술본부 회원 및 권한 통합 관리
              </h3>
              <p className="text-xs text-slate-500">
                총 {users.length}명의 기술본부 등록 회원을 조회, 수정, 비밀번호 초기화 및 신규 등록합니다.
              </p>
            </div>

            <button
              onClick={() => setIsAddUserOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 self-start md:self-auto"
            >
              <Plus className="w-4 h-4" />
              신규 회원 등록
            </button>
          </div>

          {/* 검색 및 부서 필터 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {['전체', '마감팀', '구조팀', '토목&조경팀', '개발 TF', '기술본부 총괄'].map((dept) => (
                <button
                  key={dept}
                  onClick={() => setMemberDeptFilter(dept)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    memberDeptFilter === dept
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                placeholder="이름, 사번, ID 검색..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 text-slate-900 placeholder:text-slate-500 border border-slate-200 rounded-lg outline-none focus:bg-white w-56"
              />
            </div>
          </div>

          {/* 회원 테이블 */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">NO</th>
                  <th className="py-2.5 px-3">이름 (영문)</th>
                  <th className="py-2.5 px-3">소속 회사</th>
                  <th className="py-2.5 px-3">부서</th>
                  <th className="py-2.5 px-3">직급</th>
                  <th className="py-2.5 px-3">로그인 ID</th>
                  <th className="py-2.5 px-3">권한</th>
                  <th className="py-2.5 px-3 text-right">관리 작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{member.no}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {member.name}
                      {member.engName && (
                        <span className="text-[10px] text-slate-500 block font-normal font-mono">
                          {member.engName}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          member.company === '컨코스트'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {member.company}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{member.department}
                      {member.company === 'VIETQS' && <select aria-label={`${member.name} 베트남 소속 그룹`} value={member.vietTeamId || ''} disabled={!!vietTeamBusy} onChange={async event=>{
                        const groupId=event.target.value;
                        if(groupId&&!VIET_ASSIGNMENT_GROUPS.some(group=>group.id===groupId&&group.department===member.department)){setDriveToast('같은 부서의 소속 그룹을 선택하세요.');return;}
                        setVietTeamBusy(member.id);clearError();
                        try{if(await adminUpdateUser(member.id,{vietTeamId:groupId}))setDriveToast(`${member.name} 소속 그룹을 변경했습니다.`);}finally{setVietTeamBusy('');}
                      }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 disabled:bg-slate-100"><option value="">그룹 미지정</option>{VIET_ASSIGNMENT_GROUPS.filter(group=>group.department===member.department).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{member.position}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{member.idPrefix}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          member.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => {clearError();setResetPassword('');setResetMode(member.company==='VIETQS'?'temporary':'extension');setResetExtension(member.extension||'');setResetIssued(false);setShowResetPassword(false);setAccountAction({id:member.id,name:member.name,company:member.company,extension:member.extension,action:'reset'});}}
                          title="비밀번호 초기화"
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
                        >
                          비번리셋
                        </button>
                        <button
                          onClick={() => {clearError();setAccountAction({id:member.id,name:member.name,action:'deactivate'});}}
                          title="계정 비활성화"
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. 개인 설정 · 본인 비밀번호 변경 탭 */}
      {activeTab === 'MY_PROFILE' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* 내 프로필 카드 */}
          <div className="md:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3">
              현재 로그인 사용자 프로필
            </h3>

            {currentUser ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#00338d] text-white flex items-center justify-center font-bold text-base shadow-sm">
                    {currentUser.name.slice(0, 1)}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{currentUser.name}</h4>
                    <p className="text-xs text-slate-500 font-mono">{currentUser.email}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">소속 부서</span>
                    <strong className="text-slate-800">{currentUser.department}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">직급 / 직책</span>
                    <strong className="text-slate-800">{currentUser.position}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">사원 ID</span>
                    <strong className="font-mono text-blue-700">{currentUser.idPrefix}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">계정 권한</span>
                    <span className="px-2 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                      {currentUser.role}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">로그인된 사용자가 없습니다.</div>
            )}
          </div>

          {/* 비밀번호 변경 폼 */}
          <div className="md:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-orange-500" />
              개인 비밀번호 변경
            </h3>

            {pwMsg && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  pwMsg.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {pwMsg.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{pwMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="현재 설정된 비밀번호를 입력하세요"
                  className="w-full text-xs p-2.5 bg-slate-50 text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg outline-none focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="새로운 비밀번호 (4자리 이상)"
                  className="w-full text-xs p-2.5 bg-slate-50 text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg outline-none focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  className="w-full text-xs p-2.5 bg-slate-50 text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg outline-none focus:bg-white"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  비밀번호 변경 확정
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 신규 회원 등록 모달 (관리자 전용) */}
      {isAdmin && isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="relative bg-white text-slate-900 [color-scheme:light] rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <button type="button" onClick={() => setIsAddUserOpen(false)} aria-label="신규 회원 등록 닫기" className="absolute top-3 right-3 !m-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={20}/></button>
            <h3 className="!mt-0 pr-10 text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              신규 기술본부 회원 등록
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">이름</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">부서</label>
                  <select
                    value={newUserDept}
                    onChange={(e) => {setNewUserDept(e.target.value);setNewUserVietTeamId('');}}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="마감팀">마감팀</option>
                    <option value="구조팀">구조팀</option>
                    <option value="토목&조경팀">토목&조경팀</option>
                    <option value="개발 TF">개발 TF</option>
                    <option value="기술본부 총괄">기술본부 총괄</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">직급</label>
                  <input
                    type="text"
                    value={newUserPos}
                    onChange={(e) => setNewUserPos(e.target.value)}
                    placeholder="선임 / 책임 등"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    로그인 ID
                  </label>
                  <input
                    type="text"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="예: gd_hong"
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    초기 비밀번호
                  </label>
                  <input
                    type="password"
                    value={newUserPw}
                    minLength={newUserCompany==='VIETQS'?4:8}
                    pattern={newUserCompany==='VIETQS'?'(?:[0-9]{4}|.{8,256})':undefined}
                    maxLength={256}
                    autoComplete="new-password"
                    onChange={(e) => setNewUserPw(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">소속 회사</label>
                <select
                  value={newUserCompany}
                  onChange={(e) => {setNewUserCompany(e.target.value);setNewUserVietTeamId('');}}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="컨코스트">컨코스트 (한국 본사)</option>
                  <option value="VIETQS">VIETQS (베트남 법인)</option>
                </select>
              </div>
              {newUserCompany === 'VIETQS' && <label className="block text-xs font-semibold text-slate-700">베트남 소속 그룹<select aria-label="신규 베트남 소속 그룹" value={newUserVietTeamId} onChange={event=>setNewUserVietTeamId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900"><option value="">그룹 미지정</option>{VIET_ASSIGNMENT_GROUPS.filter(group=>group.department===newUserDept).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs text-white bg-blue-600 hover:bg-blue-700 font-bold rounded-lg"
                >
                  회원 등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {accountAction && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="account-action-title" className="relative bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 rounded-xl w-full max-w-md space-y-4" onSubmit={async e=>{
            e.preventDefault();if(accountBusy||resetIssued)return;setAccountBusy(true);
            try{const ok=accountAction.action==='reset'?await adminResetPassword(accountAction.id,resetMode==='extension'?resetExtension:resetPassword,{resetMode,extension:resetMode==='extension'?resetExtension:undefined}):await adminDeleteUser(accountAction.id);
              if(ok){setDriveToast(`${accountAction.name} 계정 ${accountAction.action==='reset'?(resetMode==='extension'?'내선번호로 초기화':'임시 비밀번호 발급'):'비활성화'} 완료`);if(accountAction.action==='reset'&&resetMode==='temporary'){setResetIssued(true);}else{setAccountAction(null);setResetPassword('');}}
            }finally{setAccountBusy(false);}
          }}>
            <button type="button" disabled={accountBusy} onClick={()=>{setAccountAction(null);setResetPassword('');setResetIssued(false);setShowResetPassword(false);}} aria-label="회원 계정 관리 닫기" className="absolute top-3 right-3 !m-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white disabled:opacity-50"><X size={20}/></button>
            <h3 id="account-action-title" className="!mt-0 pr-10 font-bold">{accountAction.name} · {accountAction.action==='reset'?'비밀번호 리셋':'계정 비활성화'}</h3>
            {accountAction.action==='reset'?<>
              {!resetIssued&&<label className="block text-sm">리셋 방식<select disabled={accountBusy} value={resetMode} onChange={e=>{setResetMode(e.target.value as 'extension'|'temporary');setResetPassword('');setShowResetPassword(false);}} className="mt-2 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-2"><option value="extension">내선번호 4자리로 초기화</option><option value="temporary">임시 비밀번호 발급</option></select></label>}
              {resetMode==='extension'?<label className="block text-sm">내선번호 (4자리)<input autoFocus type="text" inputMode="numeric" autoComplete="off" required pattern="[0-9]{4}" minLength={4} maxLength={4} disabled={accountBusy} value={resetExtension} onChange={e=>setResetExtension(e.target.value)} className="mt-2 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-2"/><span className="block mt-2 text-xs text-slate-600 dark:text-slate-300">확인한 본인 내선번호를 입력하세요. 초기화한 비밀번호는 이 4자리 숫자입니다.</span></label>:<>
                {resetIssued&&<p role="status" className="rounded bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100 p-3 text-sm">임시 비밀번호 발급이 완료되었습니다. 회원에게 전달해 주세요. 창을 닫으면 발급한 값을 다시 표시하지 않습니다.</p>}
                <label className="block text-sm">임시 비밀번호 ({accountAction.company==='VIETQS'?'숫자 4자리 또는 8~256자':'8~256자'})<input autoFocus type={showResetPassword?'text':'password'} autoComplete="new-password" required={!resetIssued} readOnly={resetIssued} disabled={accountBusy} minLength={accountAction.company==='VIETQS'?4:8} pattern={accountAction.company==='VIETQS'?'(?:[0-9]{4}|.{8,256})':undefined} maxLength={256} value={resetPassword} onChange={e=>setResetPassword(e.target.value)} className="mt-2 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-2"/></label>
                <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={showResetPassword} onChange={e=>setShowResetPassword(e.target.checked)}/>임시 비밀번호 표시</label>{!resetIssued&&<button type="button" disabled={accountBusy} className="underline" onClick={()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';setResetPassword(Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>alphabet[b&31]).join(''));}}>임시 비밀번호 생성</button>}{resetIssued&&<button type="button" className="underline" onClick={()=>void navigator.clipboard.writeText(resetPassword).then(()=>setDriveToast('임시 비밀번호를 복사했습니다.')).catch(()=>setDriveToast('복사하지 못했습니다. 임시 비밀번호 표시를 선택해 확인하세요.'))}>임시 비밀번호 복사</button>}</div>
              </>}
              <p className="text-xs text-slate-600 dark:text-slate-300">리셋하면 해당 회원의 기존 로그인은 종료됩니다. 로그인 후 개인 설정에서 비밀번호를 변경하도록 안내해 주세요.</p>
            </>:<p className="text-sm">로그인 권한을 중지합니다. 기존 일정·회의록과 작성 기록은 유지됩니다.</p>}
            {loginError&&<p role="alert" className="text-red-600 dark:text-red-400 text-sm">{loginError}</p>}
            <div className="flex justify-end gap-2"><button type="button" disabled={accountBusy} onClick={()=>{setAccountAction(null);setResetPassword('');setResetIssued(false);setShowResetPassword(false);}} className="px-4 py-2 rounded bg-slate-100 dark:bg-slate-700">{resetIssued?'닫기':'취소'}</button>{!resetIssued&&<button disabled={accountBusy} type="submit" className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">{accountBusy?'처리 중…':accountAction.action==='reset'?(resetMode==='extension'?'내선번호로 초기화':'임시 비밀번호 발급'):'확인'}</button>}</div>
          </form>
        </div>
      )}
    </div>
  );
};
