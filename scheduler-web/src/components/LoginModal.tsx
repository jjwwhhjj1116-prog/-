import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { X, Lock, Mail, CheckCircle, Shield, Building2, UserCheck } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { login, quickLogin, loginError, clearError, users } = useAuthStore();
  const [idInput, setIdInput] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<'전체' | '마감팀' | '구조팀' | '토목&조경팀' | '개발 TF' | '기술본부 총괄'>('전체');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(idInput, pwInput)) {
      onClose();
    }
  };

  const filteredUsers = users.filter((u) => {
    if (selectedDeptFilter === '전체') return true;
    return u.department.includes(selectedDeptFilter);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 상단 헤더 */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                CONCOST 기술본부 통합 로그인
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium border border-blue-400/30">
                  사내 보안인증
                </span>
              </h2>
              <p className="text-xs text-slate-400">물량산출 프로젝트 일정표 및 도면 관리 시스템</p>
            </div>
          </div>
          <button
            onClick={() => {
              clearError();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 관리자 빠른 로그인 배너 */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#00338d] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                시스템 최고 관리자 계정 (Admin)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                유종욱 실장 (yjw@con-cost.com) · 박용진 수석 (yjpark@con-cost.com)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  login('yjw@con-cost.com', '1147');
                  onClose();
                }}
                className="px-2.5 py-1 text-xs font-bold bg-[#00338d] text-white rounded-lg hover:bg-[#002266] transition shadow-2xs"
              >
                유종욱(실장) 로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  login('yjpark@con-cost.com', '1706');
                  onClose();
                }}
                className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-black transition shadow-2xs"
              >
                박용진(수석) 로그인
              </button>
            </div>
          </div>

          {/* 수동 ID / PW 입력 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-orange-500" />
              계정 직접 입력
            </h3>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {loginError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  사원 ID 또는 이메일
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={idInput}
                    onChange={(e) => {
                      clearError();
                      setIdInput(e.target.value);
                    }}
                    placeholder="예: ybchoi 또는 hbjo"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">@con-cost.com 생략 가능</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">비밀번호</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={pwInput}
                    onChange={(e) => {
                      clearError();
                      setPwInput(e.target.value);
                    }}
                    placeholder="내선번호 또는 등록 비밀번호"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">엑셀 등록 비밀번호(초기: 사번/내선번호)</p>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition shadow-sm hover:shadow flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              로그인
            </button>
          </form>

          {/* 원클릭 빠른 로그인 (부서별 간편 전환) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                부서별 기술본부 인원 원클릭 간편 로그인
              </h3>
              <div className="flex items-center gap-1">
                {(['전체', '마감팀', '구조팀', '토목&조경팀', '개발 TF', '기술본부 총괄'] as const).map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setSelectedDeptFilter(dept)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition ${
                      selectedDeptFilter === dept
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    quickLogin(u.id);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2.5 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 rounded-xl text-left transition group shadow-2xs"
                >
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600">
                        {u.name}
                      </span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                        {u.position}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {u.department} · ID: <span className="font-mono text-slate-600">{u.idPrefix}</span>
                    </div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 text-right">
              총 {users.length}명 기술본부 사내 계정 연동 완료 (한국 본사 25명 + VIETQS 56명)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
