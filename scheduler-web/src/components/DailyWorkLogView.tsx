import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import { useWorkLogStore, type DailyWorkLog, type WorkLogItem } from '../store/useWorkLogStore';
import {
  ClipboardCheck,
  Calendar,
  User,
  Plus,
  Save,
  Send,
  Trash2,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export const DailyWorkLogView: React.FC = () => {
  const { currentUser, users } = useAuthStore();
  const { projects, personnel } = useProjectStore();
  const {
    workLogs,
    selectedWorkLogId,
    setSelectedWorkLogId,
    saveWorkLog,
    submitApproval,
    approveByPm,
    approveByDirector,
    generateItemsFromSchedule
  } = useWorkLogStore();

  // 대상 사용자 선택 (기본: 로그인 사용자 또는 조한빈 실장)
  const [selectedUserName, setSelectedUserName] = useState<string>(() => {
    return currentUser?.name || '조한빈';
  });

  // 오늘 날짜 (2026-09-21 기준)
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-21');

  // 현재 선택된 업무일지
  const activeLog = useMemo(() => {
    if (selectedWorkLogId) {
      const found = workLogs.find((w) => w.id === selectedWorkLogId);
      if (found) return found;
    }
    // 날짜와 사용자 일치하는 일지 탐색
    const matched = workLogs.find(
      (w) => w.date === selectedDate && w.userName.includes(selectedUserName)
    );
    return matched || workLogs[0];
  }, [workLogs, selectedWorkLogId, selectedDate, selectedUserName]);

  // 편집용 로컬 상태
  const [items, setItems] = useState<WorkLogItem[]>(activeLog?.items || []);
  const [overallNotes, setOverallNotes] = useState<string>(activeLog?.overallNotes || '');

  // 활성 일지 변경 시 동기화
  useEffect(() => {
    if (activeLog) {
      setItems(activeLog.items);
      setOverallNotes(activeLog.overallNotes);
      setSelectedDate(activeLog.date);
    }
  }, [activeLog]);

  // 팀별 일정표에서 오늘 배정 업무 자동 연계/불러오기
  const handleAutoLoadFromSchedule = () => {
    const autoItems = generateItemsFromSchedule(selectedUserName, selectedDate, projects);
    setItems(autoItems);
    alert(`[팀별 일정표 자동 연계] ${selectedUserName} 님의 오늘 배정 공종(${autoItems.length}건)을 일정표에서 자동으로 불러왔습니다.`);
  };

  // 신규 업무 행 추가
  const handleAddItem = () => {
    const defaultProject = projects[0];
    const newItem: WorkLogItem = {
      id: `wli-new-${Date.now()}`,
      projectId: defaultProject?.id || 'p1',
      projectCode: defaultProject?.code || 'TK-2026087',
      projectName: defaultProject?.name || '[삼성물산(주)] P5 FAB2 신축공사 견적용역',
      department: defaultProject?.department || '마감팀',
      roleName: '조적',
      todayTask: '설계 도면 검토 및 인터페이스 수량산출 작업 진행',
      progress: defaultProject?.progress || 50,
      status: '진행중',
      tomorrowPlan: '익일 잔여 산출 및 수량 집계표 작성',
      notes: '팀별 일정표 연계'
    };
    setItems([...items, newItem]);
  };

  // 항목 필드 수정 핸들러
  const handleUpdateItem = (id: string, field: keyof WorkLogItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          // 프로젝트 변경 시 코드와 명칭, 부서 동기화
          if (field === 'projectId') {
            const p = projects.find((proj) => proj.id === value);
            if (p) {
              return {
                ...item,
                projectId: p.id,
                projectCode: p.code || p.id,
                projectName: p.name,
                department: p.department
              };
            }
          }
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  // 항목 삭제
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // 업무일지 저장
  const handleSaveLog = () => {
    const userObj = users.find((u) => u.name === selectedUserName || u.id === selectedUserName);
    const updatedLog: DailyWorkLog = {
      id: activeLog?.id || `wl-${selectedDate}-${selectedUserName}`,
      date: selectedDate,
      userId: userObj?.id || 'u1',
      userName: selectedUserName,
      userPosition: userObj?.position || '실장',
      department: (userObj?.department as any) || '마감팀',
      items,
      overallNotes,
      approvalStatus: activeLog?.approvalStatus || 'DRAFT',
      authorSignature: activeLog?.authorSignature || {
        signed: false,
        name: `${selectedUserName} (${userObj?.position || '담당'})`
      },
      pmApproval: activeLog?.pmApproval || {
        approved: false,
        name: '조한빈 실장'
      },
      directorApproval: activeLog?.directorApproval || {
        approved: false,
        name: '(주)컨코스트 기술본부장'
      },
      createdAt: activeLog?.createdAt || new Date().toLocaleString('ko-KR'),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    saveWorkLog(updatedLog);
    alert('개인별 일일 업무일지가 성공적으로 저장되었습니다.');
  };

  // 결재 상신 (제출)
  const handleSubmitLog = () => {
    handleSaveLog();
    if (activeLog) {
      submitApproval(activeLog.id);
      alert('업무일지가 상신되었습니다! 작성자 서명이 완료되었으며, 주관 PM 결재 대기 상태로 전환되었습니다.');
    }
  };

  // 신규 빈 업무일지 생성
  const handleCreateNewLog = () => {
    const userObj = users.find((u) => u.name === selectedUserName);
    const autoItems = generateItemsFromSchedule(selectedUserName, selectedDate, projects);
    const newLog: DailyWorkLog = {
      id: `wl-${selectedDate}-${selectedUserName}-${Date.now()}`,
      date: selectedDate,
      userId: userObj?.id || 'u1',
      userName: selectedUserName,
      userPosition: userObj?.position || '실장',
      department: (userObj?.department as any) || '마감팀',
      items: autoItems,
      overallNotes: `${selectedUserName} 님의 오늘 업무 일일 결재용 보고서입니다.`,
      approvalStatus: 'DRAFT',
      authorSignature: {
        signed: false,
        name: `${selectedUserName} (${userObj?.position || '담당'})`
      },
      pmApproval: {
        approved: false,
        name: '조한빈 실장'
      },
      directorApproval: {
        approved: false,
        name: '(주)컨코스트 기술본부장'
      },
      createdAt: new Date().toLocaleString('ko-KR'),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    saveWorkLog(newLog);
    setSelectedWorkLogId(newLog.id);
  };

  return (
    <div className="space-y-5 animate-fadeIn text-slate-900 dark:text-slate-100">
      
      {/* 1. 상단 컨트롤 패널 */}
      <div className="bg-slate-900 border-2 border-slate-700 p-5 rounded-2xl shadow-xl text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  개인별 일일 업무일지 & 결재 스튜디오
                </h2>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                  팀별 일정표 실시간 자동 연계
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                팀별 일정표에 배분된 공종 및 진척률이 일지에 자동 매핑되며, 작성자-주관PM-기술본부장 결재라인을 거쳐 DB에 영구 보존됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 상단 액션: 담당자 선택, 날짜, 자동연계 버튼, 상신/저장 */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          
          {/* 담당자 선택 드롭다운 */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700">
            <User size={13} className="text-slate-400" />
            <span className="text-xs text-slate-400 font-bold">담당자:</span>
            <select
              value={selectedUserName}
              onChange={(e) => setSelectedUserName(e.target.value)}
              className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer"
            >
              {personnel.map((p) => (
                <option key={p.id} value={p.name} className="bg-slate-900 text-white">
                  {p.name} ({p.team})
                </option>
              ))}
            </select>
          </div>

          {/* 일자 선택 */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700">
            <Calendar size={13} className="text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
            >
            </input>
          </div>

          {/* 팀별 일정표 배분업무 자동 연계 버튼 */}
          <button
            type="button"
            onClick={handleAutoLoadFromSchedule}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
            title="팀별 일정표에서 오늘 할당된 공종과 진척도를 자동으로 불러옵니다"
          >
            <Sparkles size={14} className="text-amber-300 animate-pulse" />
            <span>일정표 배분업무 연계</span>
          </button>

          <button
            type="button"
            onClick={handleCreateNewLog}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
          >
            + 새 일지
          </button>

          <button
            type="button"
            onClick={handleSaveLog}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
          >
            <Save size={14} />
            <span>저장</span>
          </button>

          <button
            type="button"
            onClick={handleSubmitLog}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
          >
            <Send size={14} />
            <span>결재 상신 (제출)</span>
          </button>
        </div>
      </div>

      {/* 2. 메인 2단 레이아웃 (좌측: 일지 결재함 목록 / 우측: 일일 업무일지 양식 및 결재라인) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ===================== 좌측 (3열): 업무일지 목록 & 결재함 ===================== */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-black text-blue-400">
                업무일지 결재함 ({workLogs.length}건)
              </span>
              <span className="text-[10px] text-slate-400">실시간 연동</span>
            </div>

            <div className="space-y-2 max-h-[700px] overflow-y-auto custom-scrollbar pr-1">
              {workLogs.map((log) => {
                const isSelected = activeLog?.id === log.id;
                let statusBadge = (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    작성중
                  </span>
                );
                if (log.approvalStatus === 'SUBMITTED') {
                  statusBadge = (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      PM결재 대기
                    </span>
                  );
                } else if (log.approvalStatus === 'APPROVED_PM') {
                  statusBadge = (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                      본부장 결재 대기
                    </span>
                  );
                } else if (log.approvalStatus === 'APPROVED_DIRECTOR') {
                  statusBadge = (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      ✓ 최종 결재완료
                    </span>
                  );
                }

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedWorkLogId(log.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-xs font-black text-slate-200">
                        {log.date}
                      </span>
                      {statusBadge}
                    </div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>{log.userName} ({log.userPosition})</span>
                      <span className="text-[10px] text-slate-500">{log.department}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-1 font-medium">
                      {log.items[0]?.todayTask || log.overallNotes}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===================== 우측 (9열): 정식 일일 업무일지 양식 ===================== */}
        <div className="lg:col-span-9 space-y-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-750 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
            
            {/* 문서 헤더 */}
            <div className="border-b-2 border-slate-900 dark:border-white pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400 block mb-0.5">
                  CONCOST TECHNICAL HQ · DAILY WORK REPORT
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {activeLog?.userName} {activeLog?.userPosition} 일일 업무일지
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  보고일자: {selectedDate}
                </span>
                <span className={`text-xs font-black px-3 py-1 rounded-lg border ${
                  activeLog?.approvalStatus === 'APPROVED_DIRECTOR'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    : activeLog?.approvalStatus === 'SUBMITTED'
                    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {activeLog?.approvalStatus === 'APPROVED_DIRECTOR'
                    ? '✓ 기술본부장 결재완료'
                    : activeLog?.approvalStatus === 'SUBMITTED'
                    ? '결재 상신 (검토중)'
                    : '작성중'}
                </span>
              </div>
            </div>

            {/* 1. 오늘의 프로젝트별 공종 진행 현황 테이블 (팀별 일정표 연계) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-blue-600 dark:text-blue-400" />
                  <span>1. 프로젝트별 공종 실행 실적 (팀별 일정표 자동 연계)</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-black">
                    총 {items.length}건
                  </span>
                </h4>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>임무 행 추가</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-750">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-extrabold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3 w-48">프로젝트</th>
                      <th className="p-3 w-20 text-center">공종</th>
                      <th className="p-3">오늘 진행 업무 (실적)</th>
                      <th className="p-3 w-32 text-center">진척률 (%)</th>
                      <th className="p-3 w-20 text-center">상태</th>
                      <th className="p-3 w-40">내일 예정 업무</th>
                      <th className="p-3 w-10 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                          배정된 업무가 없습니다. 상단의 [일정표 배분업무 연계] 버튼을 눌러 불러오세요.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                          
                          {/* 프로젝트 선택 */}
                          <td className="p-2.5">
                            <select
                              value={item.projectId}
                              onChange={(e) => handleUpdateItem(item.id, 'projectId', e.target.value)}
                              className="w-full text-xs font-bold p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white truncate cursor-pointer"
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{p.code || p.id}] {p.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 공종 임무 */}
                          <td className="p-2.5 text-center">
                            <select
                              value={item.roleName}
                              onChange={(e) => handleUpdateItem(item.id, 'roleName', e.target.value)}
                              className="text-[11px] font-black p-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-300 cursor-pointer"
                            >
                              <option value="PM">PM</option>
                              <option value="조적">조적</option>
                              <option value="창호">창호</option>
                              <option value="외부">외부</option>
                              <option value="내부">내부</option>
                              <option value="세대">세대</option>
                              <option value="내역">내역</option>
                              <option value="가설">가설</option>
                              <option value="보">보</option>
                              <option value="슬라브">슬라브</option>
                              <option value="기둥">기둥</option>
                              <option value="기초">기초</option>
                              <option value="토목">토목</option>
                            </select>
                          </td>

                          {/* 오늘 진행 업무 */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={item.todayTask}
                              onChange={(e) => handleUpdateItem(item.id, 'todayTask', e.target.value)}
                              placeholder="오늘 수행한 상세 업무 내용..."
                              className="w-full text-xs p-1.5 rounded-lg bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition"
                            />
                          </td>

                          {/* 진척률 슬라이더 & 인풋 */}
                          <td className="p-2.5 text-center">
                            <div className="flex items-center gap-1.5 justify-center">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={item.progress}
                                onChange={(e) => handleUpdateItem(item.id, 'progress', Number(e.target.value))}
                                className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                              />
                              <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400 w-9 text-right">
                                {item.progress}%
                              </span>
                            </div>
                          </td>

                          {/* 진행 상태 */}
                          <td className="p-2.5 text-center">
                            <select
                              value={item.status}
                              onChange={(e) => handleUpdateItem(item.id, 'status', e.target.value)}
                              className="text-[10px] font-black p-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 cursor-pointer"
                            >
                              <option value="진행중">진행중</option>
                              <option value="완료">완료</option>
                              <option value="지연">지연</option>
                              <option value="대기">대기</option>
                            </select>
                          </td>

                          {/* 내일 예정 업무 */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={item.tomorrowPlan}
                              onChange={(e) => handleUpdateItem(item.id, 'tomorrowPlan', e.target.value)}
                              placeholder="익일 예정 업무..."
                              className="w-full text-xs p-1.5 rounded-lg bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none transition text-slate-500 dark:text-slate-400"
                            />
                          </td>

                          {/* 삭제 버튼 */}
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-slate-400 hover:text-rose-500 transition cursor-pointer"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>

                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. 종합 실적 및 특이사항 (메모) */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span>2. 금일 업무 총평 및 특이사항 (보고 내용)</span>
              </h4>
              <textarea
                rows={3}
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="금일 업무에 대한 종합 보고 내용이나 애로사항, 이슈 사항을 작성하세요."
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 3. 결재라인 (사용자 첨부 스크린샷 1:1 완벽 일치!) */}
            {/* 작성자 -> 주관 PM -> 기술본부장 3단 공식 결재 박스 */}
            <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-750">
              <div className="grid grid-cols-3 gap-3 text-center">
                
                {/* 1) 작성자 */}
                <div
                  onClick={() => {
                    if (activeLog) {
                      submitApproval(activeLog.id);
                    }
                  }}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
                  title="작성자 서명"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">작성자</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    {activeLog?.userName || selectedUserName} 실장
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    activeLog?.authorSignature?.signed ? 'text-emerald-600 font-black' : 'text-slate-400'
                  }`}>
                    {activeLog?.authorSignature?.signed ? '✓ 서명완료' : '서명 대기 (상신)'}
                  </span>
                </div>

                {/* 2) 주관 PM */}
                <div
                  onClick={() => {
                    if (activeLog) {
                      approveByPm(activeLog.id, '조한빈 실장');
                      alert('주관 PM 결재 승인이 완료되었습니다.');
                    }
                  }}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
                  title="클릭하여 주관 PM 결재 승인"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">주관 PM</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    조한빈 실장
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    activeLog?.pmApproval?.approved ? 'text-emerald-600 font-black' : 'text-slate-400'
                  }`}>
                    {activeLog?.pmApproval?.approved ? '✓ 결재완료' : '결재 대기 (클릭 승인)'}
                  </span>
                </div>

                {/* 3) 기술본부장 */}
                <div
                  onClick={() => {
                    if (activeLog) {
                      approveByDirector(activeLog.id, '(주)컨코스트 기술본부장');
                      alert('기술본부장 최종 결재 날인이 완료되었습니다.');
                    }
                  }}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
                  title="클릭하여 기술본부장 최종 날인"
                >
                  <span className="block text-[11px] text-slate-400 font-bold mb-1">기술본부장</span>
                  <span className="font-black text-xs text-slate-900 dark:text-white block">
                    (주)컨코스트 기술본부
                  </span>
                  <span className={`block text-[10px] font-bold mt-1.5 ${
                    activeLog?.directorApproval?.approved ? 'text-blue-600 font-black' : 'text-slate-400'
                  }`}>
                    {activeLog?.directorApproval?.approved ? '공식 일지 날인완료' : '날인 대기 (클릭 승인)'}
                  </span>
                </div>

              </div>
            </div>

            {/* 하단 안내 및 결재 상신 버튼 */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                💡 결재가 상신되면 부서별 실장 및 팀장의 결재함에 실시간 저장되며 최종 기술본부장 날인이 완료됩니다.
              </span>
              <button
                type="button"
                onClick={handleSubmitLog}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
              >
                결재 상신 및 저장 완료
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
