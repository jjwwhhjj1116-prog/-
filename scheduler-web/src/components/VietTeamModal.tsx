import React, { useState } from 'react';
import { X, Users, UserPlus, CheckCircle2, Briefcase, ChevronRight } from 'lucide-react';
import { type VietTeam, type VietMember } from '../data/vietTeams';

interface VietTeamModalProps {
  team: VietTeam | null;
  isOpen: boolean;
  onClose: () => void;
  onAssignMember?: (memberId: string, roleName: string) => void;
}

export const VietTeamModal: React.FC<VietTeamModalProps> = ({
  team,
  isOpen,
  onClose,
  onAssignMember,
}) => {
  const [selectedMember, setSelectedMember] = useState<VietMember | null>(null);
  const [assignRole, setAssignRole] = useState('산출 실무');
  const [assignedSuccess, setAssignedSuccess] = useState(false);

  if (!isOpen || !team) return null;

  const handleAssign = () => {
    if (!selectedMember) return;
    if (onAssignMember) {
      onAssignMember(selectedMember.id, assignRole);
    }
    setAssignedSuccess(true);
    setTimeout(() => setAssignedSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 모달 헤더 */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center font-bold text-sm">
              🇻🇳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {team.displayName}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-400/30">
                  {team.department}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                팀장: {team.leaderName} ({team.leaderPosition}) · 소속 인원 {team.members.length}명
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 바디 콘텐츠 */}
        <div className="p-6 overflow-y-auto space-y-5">
          {assignedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>{selectedMember?.name}</strong> 인원이 <strong>[{assignRole}]</strong> 업무에 성공적으로 배치되었습니다.
              </span>
            </div>
          )}

          {/* 소속 팀원 명단 목록 */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                소속 팀원 명단 및 역할 ({team.members.length}명)
              </h4>
              <span className="text-[11px] text-slate-400">클릭하여 개별 인원 선택</span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              {team.members.map((member) => {
                const isSelected = selectedMember?.id === member.id;
                return (
                  <div
                    key={member.id}
                    onClick={() => setSelectedMember(member)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-l-blue-600'
                        : 'hover:bg-white bg-white/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300 shrink-0">
                        {member.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">{member.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 font-semibold text-slate-600">
                            {member.position}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {member.engName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {member.role}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 프로젝트별 개별 인원 배치 설정 영역 */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-orange-500" />
              프로젝트 세부 산출 인원 배치 (개별 지정)
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              베트남은 기본적으로 팀 단위(유닛)로 투입되나, 특정 프로젝트의 정밀 산출을 위해 팀 내 개별 인원을 지정하여 배치할 수 있습니다.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  선택된 팀원
                </label>
                <div className="p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
                  {selectedMember ? `${selectedMember.name} (${selectedMember.position})` : '팀원을 위 목록에서 선택하세요'}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  배치할 세부 역할
                </label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg outline-none"
                >
                  <option value="도면 정밀 산출">도면 정밀 산출</option>
                  <option value="집계표 검토 및 크로스체크">집계표 검토 및 크로스체크</option>
                  <option value="변경도면 Revision 반영">변경도면 Revision 반영</option>
                  <option value="수량 산출서 작성">수량 산출서 작성</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!selectedMember}
                onClick={handleAssign}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5"
              >
                <Briefcase className="w-3.5 h-3.5" />
                선택 인원 프로젝트 배치 확정
              </button>
            </div>
          </div>
        </div>

        {/* 닫기 푸터 */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
