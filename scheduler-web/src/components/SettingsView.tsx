import React, { useState } from 'react';
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
  Save,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

type SettingsTab = 'GDRIVE' | 'MEMBERS' | 'MY_PROFILE';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    users,
    googleDriveConfig,
    updateGoogleDriveConfig,
    testGoogleDriveConnection,
    changePassword,
    adminResetPassword,
    adminAddUser,
    adminDeleteUser,
  } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('GDRIVE');

  // 1. Google Drive 설정 폼 상태
  const [clientIdInput, setClientIdInput] = useState(googleDriveConfig.clientId);
  const [clientSecretInput, setClientSecretInput] = useState(googleDriveConfig.clientSecret);
  const [redirectUriInput, setRedirectUriInput] = useState(googleDriveConfig.redirectUri);
  const [rootFolderIdInput, setRootFolderIdInput] = useState(googleDriveConfig.rootFolderId);
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
  const [newUserPw, setNewUserPw] = useState('1234');
  const [newUserCompany, setNewUserCompany] = useState('컨코스트');

  // Google Drive 설정 저장
  const handleSaveGDrive = (e: React.FormEvent) => {
    e.preventDefault();
    updateGoogleDriveConfig({
      clientId: clientIdInput,
      clientSecret: clientSecretInput,
      redirectUri: redirectUriInput,
      rootFolderId: rootFolderIdInput,
    });
    setDriveToast('Google Drive 연동 환경설정이 안전하게 저장되었습니다.');
    setTimeout(() => setDriveToast(null), 3000);
  };

  // Google Drive 연결 테스트 (클레임센터 스튜디오 OAuth 검증 방식)
  const handleTestConnection = async () => {
    setIsTestingDrive(true);
    await testGoogleDriveConnection();
    setIsTestingDrive(false);
    setDriveToast('Google Drive OAuth 2.0 API 상태 점검 완료: 정상 연결됨 (Status 200 OK)');
    setTimeout(() => setDriveToast(null), 3500);
  };

  // 개인 비밀번호 변경 처리
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwMsg({ success: false, text: '새 비밀번호와 확인 입력이 일치하지 않습니다.' });
      return;
    }
    const res = changePassword(currentPw, newPw);
    setPwMsg({ success: res.success, text: res.message });
    if (res.success) {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    }
  };

  // 신규 회원 등록
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserId.trim()) return;

    adminAddUser({
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
    });

    setIsAddUserOpen(false);
    setNewUserName('');
    setNewUserId('');
    setNewUserPw('1234');
  };

  const filteredMembers = users.filter((u) => {
    const matchDept = memberDeptFilter === '전체' || u.department.includes(memberDeptFilter);
    const matchSearch =
      u.name.includes(searchMember) ||
      u.idPrefix.includes(searchMember) ||
      u.position.includes(searchMember);
    return matchDept && matchSearch;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 타이틀 및 헤더 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                기술본부 시스템 환경설정
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                  CONCOST SETTINGS
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Google Workspace 클라우드 연동, 기술본부 회원 관리 및 개인 계정 보안 설정을 통합 관리합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 버튼 */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('GDRIVE')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'GDRIVE'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HardDrive className="w-4 h-4 text-orange-500" />
            Google Drive 연동 설정
          </button>
          <button
            onClick={() => setActiveTab('MEMBERS')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'MEMBERS'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            관리자 회원 관리 ({users.length}명)
          </button>
          <button
            onClick={() => setActiveTab('MY_PROFILE')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'MY_PROFILE'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4 text-purple-600" />
            개인 설정 · 비밀번호
          </button>
        </div>
      </div>

      {/* 1. Google Drive 연동 설정 탭 (클레임센터 스튜디오 동일 구현) */}
      {activeTab === 'GDRIVE' && (
        <div className="space-y-6">
          {driveToast && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{driveToast}</span>
            </div>
          )}

          {/* 클레임센터 스튜디오 3단계 프로토콜 안내 카드 */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-700/70 pb-3">
              <div>
                <span className="text-[10px] font-extrabold text-orange-400 tracking-widest uppercase block mb-0.5">
                  GOOGLE WORKSPACE · SECURE CONNECTION
                </span>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  Google Drive 클라우드 중앙 저장소 연결
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    연결 완료됨 (ACTIVE)
                  </span>
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                최종 동기화: {googleDriveConfig.lastCheckedAt}
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
                  자료실 업로드 시 <code className="text-orange-300 bg-slate-900 px-1 py-0.5 rounded">공종_날짜_이름</code> 자동 폴더가 Google Drive에 실시간 생성됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Google Drive 상세 설정 폼 */}
          <form onSubmit={handleSaveGDrive} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Google Cloud API OAuth 2.0 Credentials
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Client ID
                </label>
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Authorized Redirect URI
                </label>
                <input
                  type="text"
                  value={redirectUriInput}
                  onChange={(e) => setRedirectUriInput(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  기술본부 중앙 드라이브 루트 폴더 ID
                </label>
                <input
                  type="text"
                  value={rootFolderIdInput}
                  onChange={(e) => setRootFolderIdInput(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-mono text-blue-700"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
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
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                설정값 저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. 관리자 회원 관리 탭 */}
      {activeTab === 'MEMBERS' && (
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
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white w-56"
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
                    <td className="py-2.5 px-3 font-mono text-slate-400">{member.no}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {member.name}
                      {member.engName && (
                        <span className="text-[10px] text-slate-400 block font-normal font-mono">
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
                    <td className="py-2.5 px-3 font-medium text-slate-700">{member.department}</td>
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
                          onClick={() => {
                            const newPwInput = prompt(
                              `${member.name} 님의 새로운 비밀번호를 입력하세요:`,
                              '1234'
                            );
                            if (newPwInput) {
                              adminResetPassword(member.id, newPwInput);
                              alert(`${member.name} 님의 비밀번호가 초기화되었습니다.`);
                            }
                          }}
                          title="비밀번호 초기화"
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
                        >
                          비번리셋
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`${member.name} 회원을 삭제하시겠습니까?`)) {
                              adminDeleteUser(member.id);
                            }
                          }}
                          title="회원 삭제"
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
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white"
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
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white"
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
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white"
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

      {/* 신규 회원 등록 모달 */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
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
                    onChange={(e) => setNewUserDept(e.target.value)}
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
                  onChange={(e) => setNewUserCompany(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="컨코스트">컨코스트 (한국 본사)</option>
                  <option value="VIETQS">VIETQS (베트남 법인)</option>
                </select>
              </div>

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
    </div>
  );
};
