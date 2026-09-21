import React from 'react';
import {
  X,
  Calendar,
  Users,
  Sparkles,
  FileText,
  ArrowUpRight,
} from 'lucide-react';
import { useProjectStore, TEAM_ROLES, type SubTaskSchedule } from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { VIET_TEAMS_DATA } from '../data/vietTeams';

interface ProjectIntegratedModalProps {
  projectCode: string;
  onClose: () => void;
  onNavigateToTeamSchedule?: (team: '마감팀' | '구조팀' | '토목&조경팀') => void;
}

export const ProjectIntegratedModal: React.FC<ProjectIntegratedModalProps> = ({
  projectCode,
  onClose,
  onNavigateToTeamSchedule,
}) => {
  const { projects } = useProjectStore();
  const { users } = useAuthStore();

  // 해당 프로젝트 코드의 마감팀, 구조팀, 토목&조경팀 프로젝트 검색
  const relatedProjects = projects.filter((p) => (p.code || p.id) === projectCode);
  const finishProject = relatedProjects.find((p) => p.department === '마감팀') || null;
  const structProject = relatedProjects.find((p) => p.department === '구조팀') || null;
  const civilProject = relatedProjects.find((p) => p.department === '토목&조경팀') || null;
  const baseProject = finishProject || structProject || civilProject || relatedProjects[0];

  if (!baseProject) return null;

  // 담당자 이름 매핑 헬퍼 (한국 본사 인원 또는 베트남 팀 유닛)
  const getAssigneeNames = (sub?: SubTaskSchedule): string => {
    if (!sub) return '미배정';
    const ids = sub.personIds && sub.personIds.length > 0 ? sub.personIds : sub.personId ? [sub.personId] : [];
    if (ids.length === 0) return '미배정';

    return ids
      .map((id) => {
        // 1. 한국 본사 유저 확인
        const user = users.find((u) => u.id === id || u.name === id);
        if (user) return `${user.name} (${user.position || '담당'})`;

        // 2. 베트남 팀 유닛 확인
        const viet = VIET_TEAMS_DATA.find((vt) => vt.id === id || vt.code === id || vt.name === id);
        if (viet) return `🇻🇳 ${viet.displayName}`;

        // 3. 직접 입력값 (예: '원종수', '성대용', 'WIN' 등)
        if (id === 'WIN') return '🇻🇳 베트남 창호팀';
        if (id === 'EXT') return '🇻🇳 베트남 외부팀';
        if (id === 'IN1') return '🇻🇳 베트남 내부1팀';
        if (id === 'IN2') return '🇻🇳 베트남 내부2팀';
        if (id === 'VERT') return '🇻🇳 베트남 수직팀';
        if (id === 'HORIZ') return '🇻🇳 베트남 수평팀';

        return id;
      })
      .join(' · ');
  };

  // PM 이름 헬퍼
  const getPmName = (pmId?: string): string => {
    if (!pmId) return 'PM 미지정';
    const user = users.find((u) => u.id === pmId || u.name === pmId);
    if (user) return `${user.name} (${user.position || '실장'})`;
    return pmId;
  };

  // 공종별 상태 뱃지 스타일
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case '진행중':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30">진행중</span>;
      case '완료':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">완료</span>;
      case '지연':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30">지연</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-700/50 text-slate-300 border border-slate-600">예정</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* 1. 모달 상단 헤더: 프로젝트 통합 메타데이터 */}
        <div className="p-6 border-b-2 border-slate-800 bg-slate-950 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-mono font-black bg-blue-600 text-white px-2.5 py-1 rounded-md">
                  {baseProject.code || projectCode}
                </span>
                {finishProject && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                    마감팀 공정률 {finishProject.progress}%
                  </span>
                )}
                {structProject && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                    구조팀 공정률 {structProject.progress}%
                  </span>
                )}
                {civilProject && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    토목&조경팀 공정률 {civilProject.progress}%
                  </span>
                )}
                <span className="text-xs font-medium text-slate-400">
                  전체 일정: {baseProject.startDate} ~ {baseProject.endDate}
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-snug">
                {baseProject.name}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer shrink-0"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 프로젝트 스펙 요약 바 */}
          <div className={`grid grid-cols-2 ${civilProject ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2 pt-2 border-t border-slate-850 text-xs`}>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px]">발주처</span>
              <strong className="font-bold text-slate-200 truncate block">{baseProject.client || '삼성물산(주)'}</strong>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px]">연면적 / 용도</span>
              <strong className="font-bold text-slate-200 truncate block">
                {baseProject.area || '444,688평'} · {baseProject.usage || '반도체공장'}
              </strong>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px]">마감팀 PM</span>
              <strong className="font-bold text-blue-400 truncate block">
                {finishProject ? getPmName(finishProject.pmId) : '해당 없음'}
              </strong>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[11px]">구조팀 PM</span>
              <strong className="font-bold text-purple-400 truncate block">
                {structProject ? getPmName(structProject.pmId) : '해당 없음'}
              </strong>
            </div>
            {civilProject && (
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px]">토목&조경팀 PM</span>
                <strong className="font-bold text-emerald-400 truncate block">
                  {getPmName(civilProject.pmId)}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* 2. 모달 본문: 마감팀 & 구조팀 공종별 투입 인원 2단 대조 뷰어 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 text-xs text-blue-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>
                <strong>프로젝트 통합 공종 투입 현황:</strong> 마감팀, 구조팀, 토목&조경팀의 각 공종별 투입 인원과 일정이 한눈에 표시됩니다. 실제 인원 투입 및 배분은 각 팀별 일정표에서 수행합니다.
              </span>
            </span>
          </div>

          <div className={`grid grid-cols-1 ${civilProject ? 'xl:grid-cols-3 lg:grid-cols-2' : 'lg:grid-cols-2'} gap-6`}>
            
            {/* 좌측: 마감팀 공종별 투입 현황 (조적, 창호, 외부, 내부, 세대, 가설, 내역 등) */}
            <div className="bg-slate-950 border-2 border-blue-900/50 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <h3 className="text-base font-black text-white">
                      마감팀 공종 투입 현황
                    </h3>
                    <span className="text-xs font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                      총 {TEAM_ROLES.마감팀.filter((r) => r !== 'PM').length}개 공종
                    </span>
                  </div>

                  {onNavigateToTeamSchedule && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTeamSchedule('마감팀')}
                      className="text-xs font-black text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-950/80 hover:bg-blue-900 px-3 py-1.5 rounded-lg border border-blue-700 transition cursor-pointer"
                    >
                      <span>마감팀 일정표에서 배분하기</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {finishProject ? (
                  <div className="space-y-2.5">
                    {TEAM_ROLES.마감팀
                      .filter((r) => r !== 'PM')
                      .map((roleName) => {
                        const sub = finishProject.subTasks?.[roleName];
                        const assignee = getAssigneeNames(sub);
                        const isAssigned = assignee !== '미배정';
                        const isKeyRole = roleName === '조적' || roleName === '창호';

                        return (
                          <div
                            key={roleName}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isKeyRole
                                ? 'bg-blue-950/40 border-blue-700/80 shadow-md'
                                : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black px-2 py-0.5 rounded ${
                                  isKeyRole
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {roleName}
                                </span>
                                {isKeyRole && (
                                  <span className="text-[10px] font-bold text-blue-400">
                                    ★ 주요 공종
                                  </span>
                                )}
                              </div>
                              {getStatusBadge(sub?.status)}
                            </div>

                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-slate-400 text-[11px]">투입 인원:</span>
                                <strong className={`font-bold truncate ${
                                  isAssigned ? 'text-white' : 'text-slate-500'
                                }`}>
                                  {assignee}
                                </strong>
                              </div>

                              <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0 font-mono">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                <span>{sub?.startDate || finishProject.startDate} ~ {sub?.endDate || finishProject.endDate}</span>
                              </div>
                            </div>

                            {sub?.memo && (
                              <p className="text-[11px] text-slate-400 mt-1.5 bg-slate-950/60 p-1.5 rounded border border-slate-850 truncate">
                                💬 {sub.memo}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    이 프로젝트는 마감팀 업무가 포함되어 있지 않습니다.
                  </div>
                )}
              </div>

              {finishProject && onNavigateToTeamSchedule && (
                <div className="pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => onNavigateToTeamSchedule('마감팀')}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <span>마감팀 공종별 인원 배분 및 일정 수정하러 가기</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 우측: 구조팀 공종별 투입 현황 (보, 슬라브, 기둥, 기초, 옹벽 등) */}
            <div className="bg-slate-950 border-2 border-purple-900/50 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-500" />
                    <h3 className="text-base font-black text-white">
                      구조팀 공종 투입 현황
                    </h3>
                    <span className="text-xs font-bold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800">
                      총 {TEAM_ROLES.구조팀.filter((r) => r !== 'PM').length}개 공종
                    </span>
                  </div>

                  {onNavigateToTeamSchedule && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTeamSchedule('구조팀')}
                      className="text-xs font-black text-purple-400 hover:text-purple-300 flex items-center gap-1 bg-purple-950/80 hover:bg-purple-900 px-3 py-1.5 rounded-lg border border-purple-700 transition cursor-pointer"
                    >
                      <span>구조팀 일정표에서 배분하기</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {structProject ? (
                  <div className="space-y-2.5">
                    {TEAM_ROLES.구조팀
                      .filter((r) => r !== 'PM')
                      .map((roleName) => {
                        const sub = structProject.subTasks?.[roleName];
                        const assignee = getAssigneeNames(sub);
                        const isAssigned = assignee !== '미배정';
                        const isKeyRole = roleName === '보' || roleName === '슬라브';

                        return (
                          <div
                            key={roleName}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isKeyRole
                                ? 'bg-purple-950/40 border-purple-700/80 shadow-md'
                                : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black px-2 py-0.5 rounded ${
                                  isKeyRole
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {roleName}
                                </span>
                                {isKeyRole && (
                                  <span className="text-[10px] font-bold text-purple-400">
                                    ★ 주요 공종
                                  </span>
                                )}
                              </div>
                              {getStatusBadge(sub?.status)}
                            </div>

                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-slate-400 text-[11px]">투입 인원:</span>
                                <strong className={`font-bold truncate ${
                                  isAssigned ? 'text-white' : 'text-slate-500'
                                }`}>
                                  {assignee}
                                </strong>
                              </div>

                              <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0 font-mono">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                <span>{sub?.startDate || structProject.startDate} ~ {sub?.endDate || structProject.endDate}</span>
                              </div>
                            </div>

                            {sub?.memo && (
                              <p className="text-[11px] text-slate-400 mt-1.5 bg-slate-950/60 p-1.5 rounded border border-slate-850 truncate">
                                💬 {sub.memo}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    이 프로젝트는 구조팀 업무가 포함되어 있지 않습니다.
                  </div>
                )}
              </div>

              {structProject && onNavigateToTeamSchedule && (
                <div className="pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => onNavigateToTeamSchedule('구조팀')}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                  >
                    <span>구조팀 공종별 인원 배분 및 일정 수정하러 가기</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* 우측/하단: 토목&조경팀 공종별 투입 현황 (토목, 부대토목, 조경 등) */}
            {civilProject && (
              <div className="bg-slate-950 border-2 border-emerald-900/50 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-500" />
                      <h3 className="text-base font-black text-white">
                        토목&조경팀 공종 투입 현황
                      </h3>
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                        총 {TEAM_ROLES['토목&조경팀'].filter((r) => r !== 'PM').length}개 공종
                      </span>
                    </div>

                    {onNavigateToTeamSchedule && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTeamSchedule('토목&조경팀')}
                        className="text-xs font-black text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/80 hover:bg-emerald-900 px-3 py-1.5 rounded-lg border border-emerald-700 transition cursor-pointer"
                      >
                        <span>토목팀 일정표에서 배분하기</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {TEAM_ROLES['토목&조경팀']
                      .filter((r) => r !== 'PM')
                      .map((roleName) => {
                        const sub = civilProject.subTasks?.[roleName];
                        const assignee = getAssigneeNames(sub);
                        const isAssigned = assignee !== '미배정';

                        return (
                          <div
                            key={roleName}
                            className="p-3.5 rounded-xl border transition-all bg-slate-900/80 border-slate-800"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black px-2 py-0.5 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                                  {roleName}
                                </span>
                              </div>
                              {getStatusBadge(sub?.status)}
                            </div>

                            <div className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-slate-400 text-[11px]">투입 인원:</span>
                                <strong className={`font-bold truncate ${
                                  isAssigned ? 'text-white' : 'text-slate-500'
                                }`}>
                                  {assignee}
                                </strong>
                              </div>

                              <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0 font-mono">
                                <Calendar className="w-3 h-3 text-slate-500" />
                                <span>{sub?.startDate || civilProject.startDate} ~ {sub?.endDate || civilProject.endDate}</span>
                              </div>
                            </div>

                            {sub?.memo && (
                              <p className="text-[11px] text-slate-400 mt-1.5 bg-slate-950/60 p-1.5 rounded border border-slate-850 truncate">
                                💬 {sub.memo}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {civilProject && onNavigateToTeamSchedule && (
                  <div className="pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onNavigateToTeamSchedule('토목&조경팀')}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                    >
                      <span>토목&조경팀 공종별 인원 배분 및 일정 수정하러 가기</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* 3. 하단 그룹웨어 수주 상세 스펙 및 회의록 참고 섹션 */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 text-xs space-y-3">
            <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>그룹웨어 수주 특기사항 및 킥오프 회의록 요약</span>
            </h4>
            <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-850 text-slate-300 space-y-1.5 leading-relaxed">
              <p><strong>견적조건 / 특기사항:</strong> {baseProject.notes || 'RC,내화피복,데크,PC,방수,코킹,금속,외장공사 / 공내역서 / AFC 작업'}</p>
              <p><strong>수주 세부 요청사항:</strong> {baseProject.request || '평택 P5 FAB-2 물량산출 용역 킥오프 미팅 내용 참고'}</p>
            </div>
          </div>

        </div>

        {/* 4. 모달 하단 푸터 */}
        <div className="p-4 border-t-2 border-slate-800 bg-slate-950 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            팀별 일정표에서 배분된 실시간 인원 및 일정이 전체 일정표에 자동 동기화됩니다.
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs transition cursor-pointer"
          >
            확인하고 닫기
          </button>
        </div>

      </div>
    </div>
  );
};
