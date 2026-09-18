import { useState, useEffect } from 'react';
import { X, Save, Printer, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  useProjectStore,
  TEAM_ROLES,
  type SubTaskSchedule,
  type SubTaskStatus
} from '../store/useProjectStore';

interface ProjectModalProps {
  projectId: string;
  onClose: () => void;
}

export default function ProjectModal({ projectId, onClose }: ProjectModalProps) {
  const {
    projects,
    personnel,
    updateSubTask
  } = useProjectStore();

  const project = projects.find((p) => p.id === projectId);

  // 로컬 편집 상태
  const [localSubTasks, setLocalSubTasks] = useState<Record<string, SubTaskSchedule>>({});
  const [savedSuccessKey, setSavedSuccessKey] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setLocalSubTasks(project.subTasks || {});
    }
  }, [project]);

  if (!project) return null;

  // 프로젝트 팀에 해당하는 공종 목록
  const rolesForTeam = TEAM_ROLES[project.department] || TEAM_ROLES.마감팀;

  // 개별 공종 필드 업데이트
  const handleFieldChange = (
    roleName: string,
    field: keyof SubTaskSchedule,
    value: any
  ) => {
    setLocalSubTasks((prev) => {
      const current = prev[roleName] || {
        roleName,
        personId: '',
        startDate: project.startDate,
        endDate: project.endDate,
        status: '예정' as SubTaskStatus,
        memo: '',
        version: 'v1'
      };
      return {
        ...prev,
        [roleName]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  // 단일 공종 카드 저장
  const handleSaveCard = (roleName: string) => {
    const item = localSubTasks[roleName];
    if (item) {
      updateSubTask(project.id, roleName, item);
      setSavedSuccessKey(roleName);
      setTimeout(() => setSavedSuccessKey(null), 2000);
    }
  };

  // 전체 공종 일괄 저장
  const handleSaveAll = () => {
    Object.entries(localSubTasks).forEach(([roleName, item]) => {
      updateSubTask(project.id, roleName, item);
    });
    alert('전체 공종 일정이 성공적으로 저장되었습니다.');
    onClose();
  };

  // 색상 팔레트
  const getBadgeColor = (idx: number) => {
    const colors = [
      'bg-amber-500 text-white',
      'bg-rose-500 text-white',
      'bg-blue-600 text-white',
      'bg-emerald-600 text-white',
      'bg-purple-600 text-white',
      'bg-sky-600 text-white',
      'bg-orange-600 text-white',
      'bg-indigo-600 text-white',
    ];
    return colors[idx % colors.length];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-modal border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 1. 모달 헤더 (스크린샷 2 반영) */}
        <div className="p-5 border-b border-slate-200 bg-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-black tracking-wider text-[#00338d] uppercase">
                SELECTED PROJECT · {project.department} 공종별 성과물일정
              </span>
              <span className="bg-blue-50 text-[#00338d] border border-blue-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {project.department}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <span className="font-mono text-[#00338d]">{project.code}</span>
              <span>·</span>
              <span>{project.name}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              현재 선택한 프로젝트의 일정, 단계별 담당자, 투입 팀을 확인하고 공종별 일정을 저장합니다.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-bold text-slate-700">
                공정률 <span className="text-[#00338d] font-extrabold">{project.progress}%</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {project.startDate} ~ {project.endDate}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* 2. 공종별 카드 그리드 (스크린샷 2 완전 구현) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rolesForTeam.map((roleName, idx) => {
              const subTask = localSubTasks[roleName] || {
                roleName,
                personId: project.roles[roleName]?.personId || '',
                startDate: project.startDate,
                endDate: project.endDate,
                status: '예정',
                memo: '',
                version: 'v1'
              };

              const isSaved = savedSuccessKey === roleName;

              return (
                <div
                  key={roleName}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-[#00338d]/40 transition-all flex flex-col justify-between gap-3"
                >
                  {/* 카드 헤더 */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm ${getBadgeColor(
                          idx
                        )}`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{roleName}</h4>
                        <span className="text-[11px] text-slate-400 font-medium">
                          기준 일정 · {subTask.version || 'v1'}
                        </span>
                      </div>
                    </div>

                    {/* 담당자 선택 */}
                    <div>
                      <select
                        value={subTask.personId}
                        onChange={(e) => handleFieldChange(roleName, 'personId', e.target.value)}
                        className="text-xs font-semibold px-2 py-1 rounded-md border border-slate-300 bg-slate-50 text-slate-800 focus:border-[#00338d] focus:outline-none"
                      >
                        <option value="">담당자 미지정</option>
                        {personnel.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.team})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 일정 및 상태 인풋 행 */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">시작일</label>
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={subTask.startDate}
                          onChange={(e) => handleFieldChange(roleName, 'startDate', e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:border-[#00338d] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">종료일</label>
                      <div className="relative flex items-center">
                        <input
                          type="date"
                          value={subTask.endDate}
                          onChange={(e) => handleFieldChange(roleName, 'endDate', e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:border-[#00338d] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">상태</label>
                      <select
                        value={subTask.status}
                        onChange={(e) => handleFieldChange(roleName, 'status', e.target.value as SubTaskStatus)}
                        className={`w-full text-xs font-bold px-2 py-1.5 rounded-lg border focus:outline-none ${
                          subTask.status === '완료'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : subTask.status === '진행중'
                            ? 'bg-blue-50 border-blue-300 text-[#00338d]'
                            : subTask.status === '지연'
                            ? 'bg-rose-50 border-rose-300 text-rose-700'
                            : 'bg-slate-50 border-slate-300 text-slate-700'
                        }`}
                      >
                        <option value="예정">예정</option>
                        <option value="진행중">진행중</option>
                        <option value="완료">완료</option>
                        <option value="지연">지연</option>
                      </select>
                    </div>
                  </div>

                  {/* 일정 메모 입력창 */}
                  <div>
                    <input
                      type="text"
                      value={subTask.memo}
                      onChange={(e) => handleFieldChange(roleName, 'memo', e.target.value)}
                      placeholder="현장·팀·마감 특이사항 입력"
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:border-[#00338d] focus:outline-none"
                    />
                  </div>

                  {/* 카드 개별 저장 버튼 */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveCard(roleName)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        isSaved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#00338d] hover:bg-[#002366] text-white shadow-sm active:scale-95'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <CheckCircle2 size={13} /> 저장 완료!
                        </>
                      ) : (
                        <>
                          <Save size={13} /> 수정 내용 저장
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 모달 하단 컨트롤 액션 바 (스크린샷 2 반영) */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-stitch-secondary text-xs"
            >
              <Printer size={14} /> 이 프로젝트 상세 일정 출력
            </button>
            <button
              type="button"
              onClick={() => {
                if (project) setLocalSubTasks(project.subTasks || {});
              }}
              className="btn-stitch-secondary text-xs"
            >
              <RefreshCw size={14} /> 최신 일정 다시 불러오기
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              className="btn-stitch-accent text-xs"
            >
              <Save size={14} /> 전체 일정 저장 완료
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-stitch-secondary text-xs"
            >
              확인하고 닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
