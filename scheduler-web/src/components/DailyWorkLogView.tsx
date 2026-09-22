import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  useWorkLogStore,
  type DailyWorkLog,
  type WorkLogItem,
  TEAM_APPROVAL_LINES
} from '../store/useWorkLogStore';
import {
  ClipboardCheck,
  Calendar,
  User,
  Plus,
  Save,
  Send,
  Trash2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Clock
} from 'lucide-react';

export const DailyWorkLogView: React.FC = () => {
  const { currentUser, users } = useAuthStore();
  const { projects, personnel } = useProjectStore();
  const {
    workLogs,
    selectedWorkLogId,
    setSelectedWorkLogId,
    saveWorkLog,
    submitApprovalToLeader,
    approveFinalByChief,
    generateItemsFromSchedule
  } = useWorkLogStore();

  // 대상 작성자 선택 (로그인 사용자로 기본 고정, 드롭다운으로 변경 가능)
  const [selectedUserName, setSelectedUserName] = useState<string>(() => {
    return currentUser?.name || '성대용';
  });

  // 1. 개인별 격리: 로그인한 각자 개인 계정의 업무일지만 필터링
  const userWorkLogs = useMemo(() => {
    if (!currentUser) return workLogs;
    const cClean = currentUser.name.split(' ')[0];
    const cId = currentUser.id;
    const filtered = workLogs.filter((w) => {
      const wClean = w.userName.split(' ')[0];
      return (
        w.userId === cId ||
        w.userName.includes(cClean) ||
        cClean.includes(wClean) ||
        w.userName === currentUser.name
      );
    });
    return filtered.length > 0 ? filtered : workLogs.slice(0, 1);
  }, [workLogs, currentUser]);

  // 오늘 날짜 (실제 시스템 오늘 날짜 실시간 연동)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // 현재 선택된 업무일지
  const activeLog = useMemo(() => {
    if (selectedWorkLogId) {
      const found = userWorkLogs.find((w) => w.id === selectedWorkLogId);
      if (found) return found;
    }
    const matched = userWorkLogs.find(
      (w) => w.date === selectedDate && w.userName.includes(selectedUserName.split(' ')[0])
    );
    return matched || userWorkLogs[0];
  }, [userWorkLogs, selectedWorkLogId, selectedDate, selectedUserName]);

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

  // 팀별 일정표에서 오늘 배정 업무 정밀 자동 연계
  const handleAutoLoadFromSchedule = () => {
    const autoItems = generateItemsFromSchedule(selectedUserName, selectedDate, projects);
    setItems(autoItems);
    alert(
      `[프로젝트 일정표 정밀 연동] ${selectedUserName} 님의 ${selectedDate} 배정 공종(${autoItems.length}건)이 일정표에서 정확히 불러와졌습니다.`
    );
  };

  // 신규 업무 행 추가
  const handleAddItem = () => {
    const defaultProject = projects.find((p) => p.status === '진행중') || projects[0];
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

  // 항목 필드 수정
  const handleUpdateItem = (id: string, field: keyof WorkLogItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
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
    const dept: '마감팀' | '구조팀' | '토목&조경팀' = userObj?.department?.includes('구조') ? '구조팀' : '마감팀';
    const approvalLine = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;

    const updatedLog: DailyWorkLog = {
      id: activeLog?.id || `wl-${selectedDate}-${selectedUserName}`,
      date: selectedDate,
      userId: userObj?.id || currentUser?.id || 'u3',
      userName: selectedUserName,
      userPosition: userObj?.position || currentUser?.position || '수석',
      department: dept,
      items,
      overallNotes,
      approvalStatus: activeLog?.approvalStatus || 'DRAFT',
      authorSignature: activeLog?.authorSignature || {
        signed: false,
        name: `${selectedUserName} (${userObj?.position || currentUser?.position || '담당'})`
      },
      leaderReview: activeLog?.leaderReview || {
        approved: false,
        name: approvalLine.leader.name
      },
      chiefApproval: activeLog?.chiefApproval || {
        approved: false,
        name: approvalLine.chief.name
      },
      createdAt: activeLog?.createdAt || new Date().toLocaleString('ko-KR'),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    saveWorkLog(updatedLog);
    return updatedLog;
  };

  // 1단계: 작성자가 [결재 상신] 누르면 각 팀 팀장(마감팀: 김재헌 팀장, 구조팀: 신동헌 팀장)에게 전달
  const handleSubmitToLeader = () => {
    handleSaveLog();
    if (activeLog) {
      submitApprovalToLeader(activeLog.id);
      const dept = (activeLog.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
      const leaderName = TEAM_APPROVAL_LINES[dept]?.leader.name || '팀장';
      alert(`작성자 서명 완료 및 ${leaderName}에게 1차 결재가 상신되었습니다. (${leaderName} 검토 대기)`);
    }
  };

  // 1차 팀장 검토 승인
  const handleApproveByLeader = () => {
    if (!activeLog) return;
    const dept = (activeLog.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
    const leaderName = TEAM_APPROVAL_LINES[dept]?.leader.name || '팀장';
    const chiefName = TEAM_APPROVAL_LINES[dept]?.chief.name || '실장';
    useWorkLogStore.getState().approveByPm(activeLog.id, leaderName);
    alert(`1차 팀장(${leaderName}) 검토 완료! ${chiefName}에게 최종 결재가 상신되었습니다.`);
  };

  // 2단계: 각 팀 실장 최종 결재 승인 (마감팀: 조한빈 실장, 구조팀: 장범선 실장)
  // 최종 결재 시 프로젝트 전체 및 팀별 일정표에 실시간 정리 및 확정 저장!
  const handleApproveFinalByChief = () => {
    if (!activeLog) return;
    const dept = (activeLog.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
    const chiefName = TEAM_APPROVAL_LINES[dept]?.chief.name || '실장';
    approveFinalByChief(activeLog.id, chiefName);
    alert(
      `[최종 결재 완료] ${chiefName}의 최종 결재가 승인되었습니다!\n당일 프로젝트 공정률과 실행 임무가 프로젝트 전체 일정표 및 팀별 일정표에 그대로 정리되어 영구 저장되었습니다.`
    );
  };

  // 2. 당일 17:00 자동 저장 & 자동 상신 엔진 (오후 5시에 자동 저장 및 팀장 상신)
  const autoSubmittedDateRef = useRef<string>('');

  useEffect(() => {
    const checkAndAutoSubmit = () => {
      const now = new Date();
      const curY = now.getFullYear();
      const curM = String(now.getMonth() + 1).padStart(2, '0');
      const curD = String(now.getDate()).padStart(2, '0');
      const todayStr = `${curY}-${curM}-${curD}`;

      const hours = now.getHours();
      // 당일 오후 5시(17시) 이상이고 아직 오늘 자동상신이 수행되지 않은 경우
      if (hours >= 17 && autoSubmittedDateRef.current !== todayStr) {
        if (activeLog && activeLog.date === todayStr && activeLog.approvalStatus === 'DRAFT') {
          handleSaveLog();
          submitApprovalToLeader(activeLog.id);
          autoSubmittedDateRef.current = todayStr;
          console.log(`[Auto-Submit 17:00] 당일(${todayStr}) 업무일지가 오후 5시에 자동 저장 및 팀장 결재 상신되었습니다.`);
        }
      }
    };

    checkAndAutoSubmit();
    const interval = setInterval(checkAndAutoSubmit, 30000);
    return () => clearInterval(interval);
  }, [activeLog, submitApprovalToLeader]);

  // 신규 일지 생성
  const handleCreateNewLog = () => {
    const userObj = users.find((u) => u.name === selectedUserName);
    const dept: '마감팀' | '구조팀' | '토목&조경팀' = userObj?.department?.includes('구조') ? '구조팀' : '마감팀';
    const approvalLine = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;
    const autoItems = generateItemsFromSchedule(selectedUserName, selectedDate, projects);

    const newLog: DailyWorkLog = {
      id: `wl-${selectedDate}-${selectedUserName}-${Date.now()}`,
      date: selectedDate,
      userId: userObj?.id || currentUser?.id || 'u3',
      userName: selectedUserName,
      userPosition: userObj?.position || currentUser?.position || '수석',
      department: dept,
      items: autoItems,
      overallNotes: `${selectedUserName} 님의 오늘 업무 일일 결재 보고서입니다.`,
      approvalStatus: 'DRAFT',
      authorSignature: {
        signed: false,
        name: `${selectedUserName} (${userObj?.position || currentUser?.position || '담당'})`
      },
      leaderReview: {
        approved: false,
        name: approvalLine.leader.name
      },
      chiefApproval: {
        approved: false,
        name: approvalLine.chief.name
      },
      createdAt: new Date().toLocaleString('ko-KR'),
      updatedAt: new Date().toLocaleString('ko-KR')
    };

    saveWorkLog(newLog);
    setSelectedWorkLogId(newLog.id);
  };

  return (
    <div className="space-y-5 animate-fadeIn text-slate-900 dark:text-slate-100">
      
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-slate-900 border-2 border-slate-700 p-4 sm:p-5 rounded-2xl shadow-xl text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  개인별 일일 업무일지 & 2단 결재 스튜디오
                </h2>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                  작성자 → 팀장(1차 검토) → 실장(2차 최종결재)
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                  <Clock size={11} />
                  <span>17:00 자동 상신</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                로그인 계정 본인 일지만 격리 조회되며, 당일 오후 5시 수정 미발생 시 자동 저장 및 팀장 상신됩니다. 실장 최종 결재 시 일정표에 실시간 정리·저장됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* 상단 액션 바 */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          
          {/* 담당자 선택 (로그인 사용자 기준 기본 고정) */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700">
            <User size={13} className="text-slate-400" />
            <span className="text-xs text-slate-400 font-bold">작성자:</span>
            <select
              value={selectedUserName}
              onChange={(e) => setSelectedUserName(e.target.value)}
              className="bg-transparent text-blue-400 text-xs font-black focus:outline-none cursor-pointer"
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
            />
          </div>

          {/* 팀별 일정표 자동 연계 버튼 */}
          <button
            type="button"
            onClick={handleAutoLoadFromSchedule}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
            title="프로젝트 일정표에서 당일 할당된 공종과 진척도를 정밀하게 불러옵니다"
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
            onClick={() => {
              handleSaveLog();
              alert('개인별 일일 업무일지가 성공적으로 저장되었습니다.');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-600 transition cursor-pointer"
          >
            <Save size={14} />
            <span>저장</span>
          </button>

          <button
            type="button"
            onClick={handleSubmitToLeader}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
          >
            <Send size={14} />
            <span>결재 상신 (팀장에게)</span>
          </button>
        </div>
      </div>

      {/* 2. 결재 파이프라인 단계 안내 바 */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-blue-400">결재 승인 흐름:</span>
          <span className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
            <strong>1. 작성자</strong> (결재 상신 / 17:00 자동상신)
          </span>
          <ArrowRight size={12} className="text-slate-500" />
          <span className="flex items-center gap-1 bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded text-[11px] font-bold">
            <strong>2. 1차 팀장 검토</strong> (마감: 김재헌 팀장 / 구조: 신동헌 팀장)
          </span>
          <ArrowRight size={12} className="text-slate-500" />
          <span className="flex items-center gap-1 bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
            <strong>3. 2차 실장 최종결재</strong> (마감: 조한빈 실장 / 구조: 장범선 실장 → 일정표 실시간 정리·저장)
          </span>
        </div>
        <span className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
          <Clock size={12} />
          <span>오후 5시(17:00) 별도 수정 없을 시 당일 일지 자동 저장 및 팀장 자동 상신 가동 중</span>
        </span>
      </div>

      {/* 3. 2단 메인 레이아웃 (좌측: 일지 결재함 / 우측: 일일 업무일지 양식 및 결재 박스) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ===================== 좌측 (3열): 업무일지 결재함 목록 (개인별 격리) ===================== */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-black text-blue-400">
                개인 업무일지 결재함 ({userWorkLogs.length}건)
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">본인 전용</span>
            </div>

            <div className="space-y-2 max-h-[720px] overflow-y-auto custom-scrollbar pr-1">
              {userWorkLogs.map((log) => {
                const isSelected = activeLog?.id === log.id;
                let statusBadge = (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    작성중
                  </span>
                );
                if (log.approvalStatus === 'SUBMITTED_LEADER' || log.approvalStatus === 'SUBMITTED_PM') {
                  statusBadge = (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      1차 팀장 검토 대기
                    </span>
                  );
                } else if (log.approvalStatus === 'APPROVED_FINAL') {
                  statusBadge = (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      ✓ 실장 최종 결재완료
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

        {/* ===================== 우측 (9열): 업무일지 서식 & 2단 결재라인 ===================== */}
        <div className="lg:col-span-9 space-y-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-750 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
            
            {/* 일지 헤더 */}
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
                  activeLog?.approvalStatus === 'APPROVED_FINAL'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    : activeLog?.approvalStatus === 'SUBMITTED_LEADER' || activeLog?.approvalStatus === 'SUBMITTED_PM'
                    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {activeLog?.approvalStatus === 'APPROVED_FINAL'
                    ? '✓ 실장 최종 결재완료 (일정표 동기화)'
                    : activeLog?.approvalStatus === 'SUBMITTED_LEADER' || activeLog?.approvalStatus === 'SUBMITTED_PM'
                    ? '1차 팀장 검토 대기'
                    : '작성중'}
                </span>
              </div>
            </div>

            {/* 1. 오늘의 프로젝트별 공종 진행 현황 테이블 (팀별 일정표 연계) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-blue-600 dark:text-blue-400" />
                  <span>1. 프로젝트별 공종 실행 실적 (프로젝트 일정표 정밀 연계)</span>
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
                  <span>업무 행 추가</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-black border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5 w-10 text-center">No</th>
                      <th className="p-2.5 min-w-[200px]">프로젝트명</th>
                      <th className="p-2.5 w-24">담당공종</th>
                      <th className="p-2.5 min-w-[240px]">금일 진행업무 (실행 실적)</th>
                      <th className="p-2.5 w-20 text-center">진척도</th>
                      <th className="p-2.5 w-24 text-center">상태</th>
                      <th className="p-2.5 min-w-[180px]">익일 예정업무</th>
                      <th className="p-2.5 min-w-[140px]">특이사항/이슈</th>
                      <th className="p-2.5 w-12 text-center">삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-slate-400">
                          오늘 배정된 업무가 없습니다. [일정표 배분업무 연계] 버튼을 누르거나 행을 추가하세요.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                          <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                          
                          {/* 프로젝트 선택 */}
                          <td className="p-2">
                            <select
                              value={item.projectId}
                              onChange={(e) => handleUpdateItem(item.id, 'projectId', e.target.value)}
                              className="w-full text-xs font-bold p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{p.code || p.id}] {p.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 공종 */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.roleName}
                              onChange={(e) => handleUpdateItem(item.id, 'roleName', e.target.value)}
                              placeholder="공종"
                              className="w-full text-xs font-black p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 focus:outline-none"
                            />
                          </td>

                          {/* 오늘 업무 */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.todayTask}
                              onChange={(e) => handleUpdateItem(item.id, 'todayTask', e.target.value)}
                              placeholder="오늘 수행한 상세 업무 내용"
                              className="w-full text-xs p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                            />
                          </td>

                          {/* 진척도 (%) */}
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={item.progress}
                                onChange={(e) => handleUpdateItem(item.id, 'progress', Number(e.target.value))}
                                className="w-12 text-center text-xs font-mono font-black p-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">%</span>
                            </div>
                          </td>

                          {/* 상태 */}
                          <td className="p-2 text-center">
                            <select
                              value={item.status}
                              onChange={(e) => handleUpdateItem(item.id, 'status', e.target.value)}
                              className="text-[11px] font-bold p-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                            >
                              <option value="진행중">진행중</option>
                              <option value="완료">완료</option>
                              <option value="지연">지연</option>
                              <option value="대기">대기</option>
                            </select>
                          </td>

                          {/* 내일 예정 업무 */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.tomorrowPlan}
                              onChange={(e) => handleUpdateItem(item.id, 'tomorrowPlan', e.target.value)}
                              placeholder="내일 예정 업무"
                              className="w-full text-xs p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                            />
                          </td>

                          {/* 특이사항 */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => handleUpdateItem(item.id, 'notes', e.target.value)}
                              placeholder="이슈/비고"
                              className="w-full text-xs p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 focus:outline-none"
                            />
                          </td>

                          {/* 삭제 */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
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

            {/* 2. 종합 실적 및 특이사항 */}
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

            {/* 3. 2단 결재라인: 작성자 → 팀장(1차 검토) → 실장(2차 최종결재) */}
            <div className="pt-4 border-t-2 border-slate-200 dark:border-slate-750">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-blue-600" />
                  <span>2단 결재 승인 라인 (작성자 서명/상신 → 팀장 1차 검토 → 실장 2차 최종결재)</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  각 결재 단계를 클릭하여 서명 및 승인을 진행할 수 있습니다.
                </span>
              </div>

              {(() => {
                const dept = (activeLog?.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
                const line = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;

                return (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    
                    {/* 1) 작성자 */}
                    <div
                      onClick={handleSubmitToLeader}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50 dark:hover:bg-slate-750 transition cursor-pointer shadow-xs"
                      title="클릭하여 작성자 서명 및 팀장에게 1차 상신"
                    >
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">작성자</span>
                      <span className="font-black text-xs text-slate-900 dark:text-white block">
                        {activeLog?.userName || selectedUserName} ({activeLog?.userPosition || '수석'})
                      </span>
                      <span className={`block text-[10px] font-bold mt-1.5 ${
                        activeLog?.authorSignature?.signed ? 'text-emerald-600 font-black' : 'text-slate-400'
                      }`}>
                        {activeLog?.authorSignature?.signed ? '✓ 서명 / 상신완료' : '서명 대기 (클릭 상신)'}
                      </span>
                    </div>

                    {/* 2) 1차 팀장 검토 (마감: 김재헌 팀장, 구조: 신동헌 팀장) */}
                    <div
                      onClick={handleApproveByLeader}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
                        activeLog?.leaderReview?.approved || activeLog?.pmApproval?.approved
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/50'
                      }`}
                      title={`클릭하여 1차 팀장(${line.leader.name}) 검토 승인`}
                    >
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">
                        1차 팀장 검토 ({dept})
                      </span>
                      <span className="font-black text-xs text-slate-900 dark:text-white block">
                        {line.leader.name}
                      </span>
                      <span className={`block text-[10px] font-bold mt-1.5 ${
                        activeLog?.leaderReview?.approved || activeLog?.pmApproval?.approved
                          ? 'text-emerald-600 font-black'
                          : 'text-slate-400'
                      }`}>
                        {activeLog?.leaderReview?.approved || activeLog?.pmApproval?.approved
                          ? '✓ 1차 검토완료 (실장 전달)'
                          : '팀장 검토 대기 (클릭 승인)'}
                      </span>
                    </div>

                    {/* 3) 2차 실장 최종결재 (마감: 조한빈 실장, 구조: 장범선 실장 - 최종 결재 시 일정표 실시간 정리·저장!) */}
                    <div
                      onClick={handleApproveFinalByChief}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
                        activeLog?.chiefApproval?.approved || activeLog?.approvalStatus === 'APPROVED_FINAL'
                          ? 'border-blue-400 dark:border-blue-600 bg-blue-50/60 dark:bg-blue-950/40'
                          : 'border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-800/80 hover:bg-purple-50/50'
                      }`}
                      title={`클릭하여 2차 실장(${line.chief.name}) 최종 결재 승인 (일정표 영구 반영)`}
                    >
                      <span className="block text-[11px] text-slate-400 font-bold mb-1">
                        2차 실장 최종결재 ({dept})
                      </span>
                      <span className="font-black text-xs text-slate-900 dark:text-white block">
                        {line.chief.name}
                      </span>
                      <span className={`block text-[10px] font-bold mt-1.5 ${
                        activeLog?.chiefApproval?.approved || activeLog?.approvalStatus === 'APPROVED_FINAL'
                          ? 'text-blue-600 font-black'
                          : 'text-slate-400'
                      }`}>
                        {activeLog?.chiefApproval?.approved || activeLog?.approvalStatus === 'APPROVED_FINAL'
                          ? '✓ 최종 결재완료 (일정표 정리·저장)'
                          : '실장 결재 대기 (클릭 최종승인)'}
                      </span>
                    </div>

                  </div>
                );
              })()}
            </div>

            {/* 하단 안내 및 결재 상신 버튼 */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock size={13} className="text-amber-500 shrink-0" />
                <span>
                  오후 5시(17:00)까지 별도 수정이 없으면 자동 저장 및 팀장 결재 상신되며, 실장 최종 결재 시 당일 공정이 전체 일정표에 자동 정리·저장됩니다.
                </span>
              </span>
              <button
                type="button"
                onClick={handleSubmitToLeader}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
              >
                결재 상신 (팀장에게)
              </button>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
