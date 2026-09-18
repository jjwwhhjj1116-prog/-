import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  ArrowRight,
  AlertCircle,
  Building2,
  Users
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { login, quickLogin, loginError, clearError, users } = useAuthStore();
  const [idInput, setIdInput] = useState('yjw@con-cost.com');
  const [pwInput, setPwInput] = useState('dbwhddnr1!');
  const [showPw, setShowPw] = useState(false);
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<string>('전체');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (login(idInput, pwInput)) {
      if (onLoginSuccess) onLoginSuccess();
    }
  };

  const handleQuickPick = (userId: string) => {
    quickLogin(userId);
    if (onLoginSuccess) onLoginSuccess();
  };

  const filteredUsers = users.filter((u) => {
    if (selectedDept === '전체') return true;
    return u.department.includes(selectedDept);
  });

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-900 font-sans select-none animate-fadeIn">
      {/* ========================================================================= */}
      {/* 1. 좌측 브랜드 비주얼 패널 (클레임센터 스튜디오 1:1 완벽 구현) */}
      {/* ========================================================================= */}
      <div className="relative lg:w-1/2 min-h-[420px] lg:min-h-screen flex flex-col justify-between p-8 sm:p-14 overflow-hidden bg-slate-950">
        {/* 건설/엔지니어링 마천루 고화질 배경 이미지 + 어두운 듀얼 그라데이션 오버레이 */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity scale-105 transition-transform duration-1000"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1541888946425-d0fbb1861593?q=80&w=2070&auto=format&fit=crop')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-transparent to-slate-950" />

        {/* 좌측 상단 로고 */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shadow-sm backdrop-blur-md">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="text-xs font-black tracking-widest text-white uppercase font-mono">
            CONCOST · TECH INTELLIGENCE
          </span>
        </div>

        {/* 좌측 중앙 메인 타이틀 & 가치 제안 (클레임센터 스타일 카피) */}
        <div className="relative z-10 max-w-xl my-auto py-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[11px] font-extrabold tracking-wider uppercase mb-5 backdrop-blur-md">
            <span>SCHEDULE · TAKEOFF · CLOUD VAULT</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.18] mb-5">
            복잡한 물량산출과<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300">
              공종별 일정을
            </span><br />
            하나의 흐름으로.
          </h1>

          <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed mb-8 max-w-lg">
            프로젝트 수주 접수부터 마감·구조·토목 공종별 일정 관리, 인력 배분과 Google Workspace 클라우드 납품까지 연결하는 기술본부 전문 워크스페이스입니다.
          </p>

          {/* 프로세스 태그 버튼들 (클레임센터 Evidence, Workflow 스타일) */}
          <div className="flex flex-wrap gap-2">
            {['Reception', 'Schedule', 'Multi-Lane Takeoff', 'Cloud Vault'].map((tag) => (
              <span
                key={tag}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-slate-300 text-xs font-bold tracking-wide backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 좌측 최하단 푸터 브랜딩 */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-4 font-mono">
          <span className="font-bold text-slate-400 tracking-wider">CONCOST TECH STUDIO</span>
          <span>CONCOST GROUP · PROFESSIONAL WORKSPACE</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. 우측 시스템 로그인 폼 패널 (스크린샷 클레임센터 스튜디오 100% 동일) */}
      {/* ========================================================================= */}
      <div className="lg:w-1/2 bg-white flex flex-col justify-between p-8 sm:p-16 lg:p-20 overflow-y-auto">
        <div className="max-w-md w-full mx-auto my-auto py-6">
          {/* 상단 스튜디오 로고 엠블럼 */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#00338d] shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight leading-none">
                기술본부 스튜디오
              </h3>
              <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                TECH HQ STUDIO
              </span>
            </div>
          </div>

          {/* 시스템 로그인 타이틀 & 뱃지 */}
          <div className="mb-6">
            <span className="text-[11px] font-extrabold tracking-widest text-blue-700 uppercase block mb-1">
              SECURE MEMBER ACCESS
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight mb-1.5">
              시스템 로그인
            </h2>
            <p className="text-xs text-slate-500">
              승인된 기술본부 계정으로 로그인해 주세요.
            </p>
          </div>

          {/* 보안 레벨 안내 뱃지 (스크린샷 Organization & role protected) */}
          <div className="mb-6 px-3.5 py-2 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center gap-2 text-xs font-bold text-blue-800">
            <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Organization &amp; role protected</span>
          </div>

          {/* 로그인 실패 에러 메시지 */}
          {loginError && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 아이디 입력 필드 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                아이디
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  placeholder="yjw@con-cost.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
                  required
                />
              </div>
            </div>

            {/* 비밀번호 입력 필드 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition shadow-2xs font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 로그인 전송 버튼 (클레임센터 블루 라운드 버튼) */}
            <button
              type="submit"
              className="w-full py-3 bg-[#00338d] hover:bg-[#002266] text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 mt-2 cursor-pointer"
            >
              <span>로그인</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* 하단 관리자 및 전체 사내 계정 퀵 선택 */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500 mb-2">
              최고 관리자 또는 본인 사내 계정으로 바로 로그인하시겠습니까?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIdInput('yjw@con-cost.com');
                  setPwInput('dbwhddnr1!');
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition"
              >
                🔑 유종욱 실장 (관리자)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdInput('yjpark@con-cost.com');
                  setPwInput('1706');
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition"
              >
                🔑 박용진 수석 (관리자)
              </button>
              <button
                type="button"
                onClick={() => setIsQuickSelectOpen(!isQuickSelectOpen)}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1"
              >
                <Users size={12} />
                임직원(51명) 목록 ▾
              </button>
            </div>

            {/* 51명 임직원 선택 팝오버 */}
            {isQuickSelectOpen && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-left max-h-48 overflow-y-auto custom-scrollbar animate-fadeIn">
                <div className="flex items-center gap-1 mb-2 border-b border-slate-200 pb-1.5">
                  {['전체', '개발 TF', '마감팀', '구조팀', '토목&조경팀'].map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDept(dept)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        selectedDept === dept
                          ? 'bg-[#00338d] text-white'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        handleQuickPick(u.id);
                        setIsQuickSelectOpen(false);
                      }}
                      className="p-1.5 text-left rounded hover:bg-white hover:shadow-2xs text-[11px] flex items-center justify-between border border-transparent hover:border-slate-200"
                    >
                      <span className="font-bold text-slate-800">{u.name} {u.position}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{u.department}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
              AUTHORIZED USERS ONLY
            </div>
          </div>
        </div>

        {/* 우측 최하단 필수 약관 링크 */}
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-6 border-t border-slate-100">
          <a
            href="https://concost-tech-scheduler.pages.dev"
            className="hover:text-slate-700 transition"
          >
            서비스 소개
          </a>
          <span>·</span>
          <a
            href="https://concost-tech-scheduler.pages.dev/privacy.html"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-700 transition font-medium text-emerald-600"
          >
            개인정보처리방침
          </a>
          <span>·</span>
          <a
            href="https://concost-tech-scheduler.pages.dev/terms.html"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-700 transition font-medium text-blue-600"
          >
            서비스 약관
          </a>
        </div>
      </div>
    </div>
  );
};
