import {translatedAlert} from '../services/translationService';
import {LegacyWorkLogArchive} from './RetainedRecords';
import {usePersonalStore} from '../store/usePersonalStore';
import {automaticWorkLogItems,sameWorkProject,workProjectOptions,assignedItems,assignedTasks,assignmentAliases,reconcileWorkLogItems,leavesFor,reportsActualProgress,legacyAllocationTask,approvedTaskProgress,nextDay,validDay} from '../utils/personalWork';

import {WorkLogHistory,TaskReportFields,WorkLogProjectSummary,DailyPlanFields,ScheduleExtensionRequests,WorkLogTaskInfo,WorkLogSteps} from './WorkLogReporting';

import { canManageSchedule } from '../utils/schedulePermissions';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Plus,
  Save,
  Send,
  Trash2,
  Sparkles,
  CalendarDays, History, Hourglass, Sun, Clock, CheckCircle2, FileText,
} from 'lucide-react';

const describeDraft=(items:WorkLogItem[],notes:string)=>items.map((item,index)=>
  `${index+1}. ${item.projectName} / ${item.roleName}\n`+[
    ['보고 방식',item.reportBasis==='TASK'?'Task':'일자'],['주요 목표',item.dailyGoal],['세부 작업 내용',item.plannedDetails],['계획 메모',item.planMemo],
    ['금일 업무',item.todayTask],['진척률',`${item.progress}%`],['상태',item.status],['익일 업무',item.tomorrowPlan],
    ['미완료 업무',item.remainingTask],['지연 사유',item.delayReason],['업무 장애요인',item.blockers],['업무 시간',item.workHours],['비고',item.notes],
    ['첨부',item.attachments?.map(file=>`${file.name} (${file.url})`).join(', ')]
  ].filter(([,value])=>value!==undefined&&value!=='').map(([label,value])=>`${label}: ${value}`).join('\n')
).join('\n\n')+`\n\n종합 보고: ${notes}`;

export const DailyWorkLogView: React.FC<{visible?:boolean}> = ({visible=true}={}) => {
  const { currentUser, users } = useAuthStore();
  const { projects } = useProjectStore();
  const {leaves,openDate,openTaskId,loaded,openExtension,openWorkLogId}=usePersonalStore();
  const {
    workLogs,
    selectedWorkLogId,
    setSelectedWorkLogId,
    saveWorkLog,
    readWorkLog,
    submitApprovalToLeader,
    approveFinalByChief,
    generateItemsFromSchedule
  } = useWorkLogStore();

  // 작성자 옵션 목록 (로그인 사용자가 personnel에 없으면 최상단에 추가)
  // 대상 작성자 선택 (로그인 사용자로 기본 고정)
  const [selectedUserName] = useState<string>(() => {
    return currentUser?.name || '조한빈';
  });

  // 관리자 전체 보기 토글 (ADMIN 계정인 경우 다른 팀원 일지 검토 가능)
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.name === '유종욱' || currentUser?.name === '박용진';
  const [viewAllAsAdmin, setViewAllAsAdmin] = useState<boolean>(false);

  // 1. 개인별 격리: 로그인한 각자 개인 계정의 업무일지만 필터링 (타인 일지 강제 fallback 완전 제거)
  const userWorkLogs = useMemo(() => {
    if (!currentUser) return [];
    if (isAdmin && viewAllAsAdmin) return workLogs;
    return workLogs.filter(w => w.userId === currentUser.id || canManageSchedule(currentUser, w.department, false) || (w.department === '토목&조경팀' && currentUser.id === 'u_8'));
  }, [workLogs, currentUser, isAdmin, viewAllAsAdmin]);

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
      const found = userWorkLogs.find((w) => w.id === selectedWorkLogId && w.date === selectedDate);
      if (found) return found;
    }
    const matched = userWorkLogs.find(
      (w) => w.date === selectedDate && w.userId === currentUser?.id
    );
    return matched || null;
  }, [userWorkLogs, selectedWorkLogId, selectedDate, currentUser?.id]);

  // 편집용 로컬 상태
  const approvalDepartment=activeLog?.department||currentUser?.department;
  const hasApprovalLine=['마감팀','구조팀','토목&조경팀'].includes(approvalDepartment||'');
  const canEdit=hasApprovalLine&&loaded&&!!currentUser&&(!activeLog||(activeLog.userId===currentUser.id&&activeLog.approvalStatus==='DRAFT'));
  const [viewTab,setViewTab]=useState<'REPORT'|'HISTORY'|'EXTENSIONS'|'OVERTIME'>('REPORT');
  const [reportMode,setReportMode]=useState<'DAILY'|'TASK'>('DAILY');
  const [projectFilter,setProjectFilter]=useState('ALL');
  const [roleFilter,setRoleFilter]=useState('');
  const [selectedTaskId,setSelectedTaskId]=useState('');
  const [busy,setBusy]=useState(false);
  const [items, setItems] = useState<WorkLogItem[]>(activeLog?.items || []);
  const [formRevision,setFormRevision]=useState<number|undefined>(activeLog?.serverRevision);
  const [overallNotes, setOverallNotes] = useState<string>(activeLog?.overallNotes || '');
  const [preservedDraft, setPreservedDraft] = useState<string | null>(null);
  const previousLogId = useRef(activeLog?.id);
  const localDrafts=useRef(new Map<string,{items:WorkLogItem[];notes:string;revision?:number}>());
  const draftKey=`${currentUser?.id}|${selectedDate}|${activeLog&&activeLog.userId!==currentUser?.id?activeLog.id:'own'}`;
  const editorSource=useRef<{key:string;logId?:string;items:WorkLogItem[];notes:string}|undefined>(undefined);
  const rememberDraft=useCallback(()=>{if(canEdit)localDrafts.current.set(draftKey,{items:structuredClone(items),notes:overallNotes,revision:formRevision});},[canEdit,draftKey,items,overallNotes,formRevision]);
  const reportUserId=activeLog?.userId||currentUser?.id||'';
  const reportAliases=useMemo(()=>assignmentAliases({id:reportUserId},users),[reportUserId,users]);
  const ownAliases=useMemo(()=>assignmentAliases(currentUser,users),[currentUser,users]);
  const allTasks=useMemo(()=>assignedTasks(reportUserId,projects,reportAliases),[reportUserId,projects,reportAliases]);
  const dayTasks=useMemo(()=>assignedItems(reportUserId,selectedDate,projects,reportAliases),[reportUserId,selectedDate,projects,reportAliases]);
  const tomorrowTasks=useMemo(()=>validDay(selectedDate)?assignedItems(reportUserId,nextDay(selectedDate),projects,reportAliases):[],[reportUserId,selectedDate,projects,reportAliases]);
  const selectedProject=projects.find(project=>project.id===projectFilter);
  const selectedItem=items.find(item=>item.id===selectedTaskId);

  useEffect(()=>{if(selectedItem)setReportMode(selectedItem.reportBasis||'DAILY');},[selectedItem]);
  // 활성 일지 변경 시 동기화
  useEffect(() => {
    setPreservedDraft(null);
    const previous=editorSource.current;
    const firstRemoteSave=previous?.key===draftKey&&!previous.logId&&activeLog&&activeLog.userId===currentUser?.id;
    if(firstRemoteSave&&(JSON.stringify(items)!==JSON.stringify(previous.items)||overallNotes!==previous.notes)){
      editorSource.current={...previous,logId:activeLog.id};
      localDrafts.current.set(draftKey,{items:structuredClone(items),notes:overallNotes,revision:formRevision});
      if(activeLog.approvalStatus==='DRAFT')return;
      setPreservedDraft(describeDraft(items,overallNotes));
    }
    const loadEditor=(nextItems:WorkLogItem[],notes:string,revision?:number)=>{
      editorSource.current={key:draftKey,logId:activeLog?.id,items:structuredClone(nextItems),notes};
      setItems(nextItems);setOverallNotes(notes);setFormRevision(revision);
    };
    const draft=localDrafts.current.get(draftKey);
    if(draft&&(!activeLog||activeLog.approvalStatus==='DRAFT')&&(!activeLog||activeLog.userId===currentUser?.id)){
      loadEditor(reconcileWorkLogItems(draft.items,reportUserId,selectedDate,projects,reportAliases),draft.notes,draft.revision);return;
    }
    if (activeLog) {
      loadEditor(activeLog.items,activeLog.overallNotes,activeLog.serverRevision);
      setSelectedDate(activeLog.date);
      setReportMode(activeLog.items.find(item=>item.id===selectedTaskId)?.reportBasis||activeLog.reportMode||'DAILY');
    } else { loadEditor(generateItemsFromSchedule(currentUser?.id||'',selectedDate,projects),''); }
    // Same-record polling must not replace unsaved typing; revision conflicts are shown explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLog?.id,selectedDate,currentUser?.id]);
  useEffect(()=>{
    if(!loaded||selectedTaskId||!allTasks.length||(activeLog&&activeLog.approvalStatus!=='DRAFT'))return;
    if(allTasks.every(task=>task.reportingMode==='TASK'))setReportMode('TASK');
    else if(allTasks.every(task=>task.reportingMode==='DAILY'))setReportMode('DAILY');
  },[loaded,activeLog,selectedTaskId,allTasks]);
  useEffect(() => {
    const sameLog = previousLogId.current === activeLog?.id;
    previousLogId.current = activeLog?.id;
    if (!activeLog || canEdit) return;
    // Reviewers must see the exact body whose revision they approve.
    // Keep an author's unsaved text available if another screen submitted it.
    if (sameLog && activeLog.userId === currentUser?.id && formRevision !== activeLog.serverRevision &&
        (JSON.stringify(items) !== JSON.stringify(activeLog.items) || overallNotes !== activeLog.overallNotes)) {
      setPreservedDraft(describeDraft(items,overallNotes));
    }
    setItems(activeLog.items);
    setOverallNotes(activeLog.overallNotes);
    setFormRevision(activeLog.serverRevision);
    // Editable drafts deliberately retain local typing and revision conflicts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLog, canEdit, currentUser?.id]);
  useEffect(()=>{
    if(!openWorkLogId||!loaded)return;
    const log=userWorkLogs.find(record=>record.id===openWorkLogId);
    usePersonalStore.setState({openWorkLogId:null});
    if(!log){setNotice('알림의 업무일지를 찾을 수 없거나 현재 열람 권한이 없습니다.');return;}
    setNotice('');
    rememberDraft();const item=log.items[0];setSelectedDate(log.date);setSelectedWorkLogId(log.id);setSelectedTaskId(item?.id||'');setProjectFilter(item?.projectId||'ALL');setRoleFilter(item?.roleName||'');setViewTab('REPORT');
  },[openWorkLogId,loaded,userWorkLogs,rememberDraft,setSelectedWorkLogId]);
  useEffect(()=>{if(openExtension){rememberDraft();setViewTab('EXTENSIONS');setProjectFilter(openExtension);setSelectedTaskId('');setRoleFilter('');usePersonalStore.setState({openExtension:null});}},[openExtension,rememberDraft]);
  useEffect(()=>{if(openDate&&loaded){const target=openTaskId?assignedItems(currentUser?.id||'',openDate,projects,ownAliases).find(task=>task.id===openTaskId):undefined;rememberDraft();setSelectedDate(openDate);setSelectedWorkLogId(null);setSelectedTaskId(target?.id||openTaskId||'');setProjectFilter(target?.projectId||'ALL');setRoleFilter(target?.roleName||'');initialProjectChosen.current=!!openTaskId;setNotice(openTaskId&&!target?'선택한 업무의 배정이 변경되었습니다. 현재 배정 목록을 확인하세요.':'');setViewTab('REPORT');usePersonalStore.setState({openDate:null,openTaskId:null});}},[openDate,openTaskId,loaded,currentUser?.id,projects,ownAliases,setSelectedWorkLogId,rememberDraft]);
  useEffect(()=>{
    if(activeLog?.approvalStatus&&activeLog.approvalStatus!=='DRAFT')return;
    if(activeLog?.userId&&activeLog.userId!==currentUser?.id)return;
    setItems(previous=>{
      const reconciled=reconcileWorkLogItems(previous,reportUserId,selectedDate,projects,reportAliases);const next=canEdit?automaticWorkLogItems(reconciled,selectedDate):reconciled;
      const source=editorSource.current;
      if(source?.key===draftKey&&JSON.stringify(previous)===JSON.stringify(source.items))editorSource.current={...source,items:structuredClone(next)};
      return next;
    });
  },[projects,selectedDate,currentUser?.id,activeLog?.approvalStatus,activeLog?.userId,generateItemsFromSchedule,draftKey,reportUserId,reportAliases,canEdit]);

  // 팀별 일정표에서 오늘 배정 업무 정밀 자동 연계
  const handleAutoLoadFromSchedule = () => {
    if(!canEdit)return;
    const autoItems = generateItemsFromSchedule(currentUser?.id||'', selectedDate, projects);
    setItems(previous=>reconcileWorkLogItems(previous,reportUserId,selectedDate,projects,reportAliases));
    void translatedAlert(
      `[프로젝트 일정표 정밀 연동] ${selectedUserName} 님의 ${selectedDate} 배정 공종(${autoItems.length}건)이 일정표에서 정확히 불러와졌습니다.`
    );
  };

  // 신규 업무 행 추가
  const handleAddItem = () => {
    if(!canEdit)return;
    const defaultProject = selectedProject;
    if(!defaultProject){setNotice('보고 프로젝트를 먼저 선택하세요. 예시 프로젝트를 자동으로 넣지 않습니다.');return;}
    const newItem: WorkLogItem = {
      id: `wli-new-${Date.now()}`,
      projectId: defaultProject.id,
      projectCode: defaultProject.code,
      projectName: defaultProject.name,
      department: defaultProject.department,
      roleName: '',
      todayTask: '',
      progress: 0,
      status: '진행중',
      tomorrowPlan: '',
      notes: '팀별 일정표 연계'
    };
    setItems([...items, newItem]);
  };

  // 항목 필드 수정
  const handleUpdateItem = (id: string, field: keyof WorkLogItem, value: any) => {
    if(!canEdit)return;
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
          const complete=field==='status'&&value==='완료';return { ...item, [field]: value,...(complete?{progress:100}:{}),...(field==='progress'&&value<100&&item.status==='완료'?{status:'진행중' as const}:{}),manualFields:[...new Set([...(item.manualFields||[]),field,...(complete?['progress']:[])])] };
        }
        return item;
      })
    );
  };

  // 항목 삭제
  const handleDeleteItem = (id: string) => {
    if(!canEdit)return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // 업무일지 저장
  const handleSaveLog = useCallback(async (overrideItems?:WorkLogItem[]) => {
    if(!loaded||!currentUser)throw Error('중앙 업무일지 연결을 기다려 주세요.');
    if(activeLog&&(activeLog.userId!==currentUser?.id||activeLog.approvalStatus!=='DRAFT'))throw Error('본인의 작성 중 일지만 저장할 수 있습니다. 기존 결재 기록은 유지됩니다.');
    const userObj = users.find((u) => u.id === currentUser.id) || currentUser;
    const dept: '마감팀' | '구조팀' | '토목&조경팀' = userObj?.department?.includes('구조') ? '구조팀' : userObj?.department?.includes('토목') || userObj?.department?.includes('조경') ? '토목&조경팀' : '마감팀';
    const approvalLine = TEAM_APPROVAL_LINES[dept] || TEAM_APPROVAL_LINES.마감팀;

    const updatedLog: DailyWorkLog = {
      reportMode,
      id: activeLog?.id || `wl-${selectedDate}-${currentUser?.id}`,
      serverRevision:formRevision,
      date: selectedDate,
      userId: userObj?.id || currentUser?.id || 'u3',
      userName: selectedUserName,
      userPosition: userObj?.position || currentUser?.position || '수석',
      department: dept,
      items:overrideItems||items,
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

    await saveWorkLog(updatedLog);
    const savedRevision=useWorkLogStore.getState().workLogs.find(w=>w.id===updatedLog.id)?.serverRevision;
    const remembered=localDrafts.current.get(draftKey);
    if(remembered&&(JSON.stringify(remembered.items)!==JSON.stringify(items)||remembered.notes!==overallNotes)){
      const started=overrideItems?.find(next=>next.planStartedAt&&next.planStartedAt!==items.find(item=>item.id===next.id)?.planStartedAt);
      const preservedItems=started?remembered.items.map(item=>item.id===started.id?{...item,...(item.status===items.find(original=>original.id===item.id)?.status?{status:started.status}:{}),planStartedAt:started.planStartedAt,manualFields:[...new Set([...(item.manualFields||[]),'planStartedAt',...(item.status===items.find(original=>original.id===item.id)?.status?['status']:[])])]}:item):remembered.items;
      localDrafts.current.set(draftKey,{...remembered,items:preservedItems,revision:savedRevision});
    }else localDrafts.current.delete(draftKey);
    if(editorSource.current?.key===draftKey){editorSource.current={...editorSource.current,items:structuredClone(updatedLog.items),notes:updatedLog.overallNotes};setFormRevision(savedRevision);}
    return updatedLog;
  }, [users, selectedUserName, currentUser, activeLog, selectedDate, items, overallNotes, saveWorkLog,formRevision,reportMode,draftKey,loaded]);

  useEffect(()=>{
    if(!visible||!canEdit||!loaded||busy||!selectedItem||typeof window==='undefined'||typeof window.setTimeout!=='function'||activeLog?.serverRevision!==formRevision)return;
    const source=editorSource.current;if(!source||source.key!==draftKey||JSON.stringify(items)===JSON.stringify(source.items)&&overallNotes===source.notes)return;
    const timer=window.setTimeout(()=>{void run(async()=>{await handleSaveLog();setNotice('변경 사항이 자동 저장되었습니다.');});},1000);
    return()=>window.clearTimeout(timer);
  },[visible,canEdit,loaded,busy,selectedItem,items,overallNotes,draftKey,activeLog?.serverRevision,formRevision,handleSaveLog]);

  // 1단계: 작성자가 [결재 상신] 누르면 각 팀 팀장(마감팀: 김재헌 팀장, 구조팀: 신동헌 팀장)에게 전달
  const handleSubmitToLeader = async () => {
    if(!items.some(item=>item.todayTask.trim()&&(item.manualFields===undefined||item.manualFields.includes('todayTask'))))throw Error('실제 수행한 업무를 한 건 이상 입력하세요. 배정 메모만으로 보고를 상신하지 않습니다.');
    if(items.some(item=>reportsActualProgress(item)&&!item.todayTask.trim()))throw Error('진척률을 보고하는 업무의 실제 수행 내용을 입력하세요.');
    const saved = await handleSaveLog();
    if (saved) {
      await submitApprovalToLeader(saved.id);
      const dept = saved.department;
      const leaderName = TEAM_APPROVAL_LINES[dept]?.leader.name || '팀장';
      void translatedAlert(`작성자 서명 완료 및 ${leaderName}에게 1차 결재가 상신되었습니다. (${leaderName} 검토 대기)`);
    }
  };

  // 1차 팀장 검토 승인
  const handleApproveByLeader = async () => {
    if (!activeLog) return;
    const dept = (activeLog?.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
    const leaderName = TEAM_APPROVAL_LINES[dept]?.leader.name || '팀장';
    const chiefName = TEAM_APPROVAL_LINES[dept]?.chief.name || '실장';
    await useWorkLogStore.getState().approveByPm(activeLog.id, leaderName);
    void translatedAlert(`1차 ${TEAM_APPROVAL_LINES[dept]?.leader.title||'팀장'}(${leaderName}) 검토 완료! ${chiefName}에게 최종 결재가 상신되었습니다.`);
  };

  // 2단계: 각 팀 실장 최종 결재 승인 (마감팀: 조한빈 실장, 구조팀: 장범선 실장)
  // 최종 결재 시 프로젝트 전체 및 팀별 일정표에 실시간 정리 및 확정 저장!
  const handleApproveFinalByChief = async () => {
    if (!activeLog) return;
    const dept = (activeLog?.department || '마감팀') as keyof typeof TEAM_APPROVAL_LINES;
    const chiefName = TEAM_APPROVAL_LINES[dept]?.chief.name || '실장';
    await approveFinalByChief(activeLog.id, chiefName);
    void translatedAlert(
      `[최종 결재 완료] ${chiefName}의 최종 결재가 승인되었습니다.\n현재 배정과 날짜가 유효한 공종의 실제 진척률에 반영했습니다. 계획 공정률과 일정 메모는 유지됩니다.`
    );
  };

  const [notice, setNotice] = useState('');
  const readRequests=useRef(new WeakMap<object,Map<string,'pending'|'read'>>());
  useEffect(()=>{
    if(!visible||viewTab!=='REPORT'||!loaded||!activeLog||activeLog.approvalStatus==='DRAFT'||
       !currentUser||currentUser!==useAuthStore.getState().currentUser||openWorkLogId||openExtension||openDate||
       !activeLog.serverRevision||formRevision!==activeLog.serverRevision||
       JSON.stringify(items)!==JSON.stringify(activeLog.items)||overallNotes!==activeLog.overallNotes||
       (activeLog.items.length>0&&!selectedItem))return;
    const actor=currentUser,key=`${activeLog.id}|${activeLog.serverRevision}`;
    let requests=readRequests.current.get(actor);
    if(!requests){requests=new Map();readRequests.current.set(actor,requests);}
    if(requests.has(key))return;
    const marks=requests;marks.set(key,'pending');let cancelled=false;
    void readWorkLog(activeLog.id,activeLog.serverRevision).then(recorded=>{
      if(recorded&&actor===useAuthStore.getState().currentUser)marks.set(key,'read');else marks.delete(key);
    },error=>{
      marks.delete(key);
      if(!cancelled&&actor===useAuthStore.getState().currentUser)setNotice(previous=>previous||
        `업무일지 본문은 표시되었으나 열람 기록을 저장하지 못했습니다. ${error instanceof Error?error.message:'다시 열어 확인하세요.'}`);
    });
    return()=>{cancelled=true;};
  },[visible,viewTab,loaded,activeLog,currentUser,openWorkLogId,openExtension,openDate,formRevision,items,overallNotes,selectedItem,readWorkLog]);
  const run = async (action: () => unknown) => { if(busy)return;setBusy(true);setNotice('');try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : '저장에 실패했습니다.'); } finally{setBusy(false);} };
  const chooseTask=(id:string)=>{
    setSelectedTaskId(id);const task=allTasks.find(item=>item.id===id);const context=task||items.find(item=>item.id===id);
    if(context){setProjectFilter(context.projectId);setRoleFilter(context.roleName);}
    if(task&&canEdit)setReportMode(task.reportingMode);else{const saved=items.find(item=>item.id===id);if(saved)setReportMode(saved.reportBasis||'DAILY');}
    if(!task||!canEdit||task.startDate>selectedDate||(task.reportingMode==='DAILY'&&task.endDate<selectedDate))return;
    setItems(previous=>{const old=previous.find(item=>item.id===id);const changed=automaticWorkLogItems([{...(old||task),reportBasis:task.reportingMode}],selectedDate)[0];return old?previous.map(item=>item.id===id?changed:item):[...previous,changed];});
  };
  const projectItems=items.filter(item=>projectFilter==='ALL'||sameWorkProject(projects,item.projectId,projectFilter));
  const projectTasks=allTasks.filter(task=>projectFilter==='ALL'||sameWorkProject(projects,task.projectId,projectFilter));
  const sameAllocation=(left:WorkLogItem,right:WorkLogItem)=>!!left.allocationId&&left.allocationId===right.allocationId&&left.projectId===right.projectId&&left.roleName===right.roleName;
  const linkedLegacyItems=projectItems.filter(item=>item.id===`gen-${item.projectId}-${item.roleName}`&&projectItems.filter(other=>sameAllocation(item,other)).length===1&&projectTasks.filter(task=>sameAllocation(item,task)).length===1);
  const reportOptions=canEdit?[...projectTasks.filter(task=>!linkedLegacyItems.some(item=>sameAllocation(item,task))),...projectItems.filter(item=>!allTasks.some(task=>task.id===item.id))]:projectItems;
  const roles=[...new Set(reportOptions.map(item=>item.roleName))];
  const taskOptions=reportOptions.filter(item=>!roleFilter||item.roleName===roleFilter);
  const initialProjectChosen=useRef(false);
  useEffect(()=>{
    if(openExtension||openWorkLogId||openDate)return;
    if(loaded&&!initialProjectChosen.current&&dayTasks.length){initialProjectChosen.current=true;if(projectFilter==='ALL')setProjectFilter(dayTasks[0].projectId);}
  },[loaded,projectFilter,dayTasks,openExtension,openWorkLogId,openDate]);
  useEffect(()=>{
    if(openExtension||openWorkLogId||openDate||!loaded||viewTab==='HISTORY'||selectedTaskId||!taskOptions.length)return;
    const first=taskOptions.find(task=>dayTasks.some(assigned=>assigned.id===task.id))||taskOptions.find(task=>(!canEdit||!!activeLog?.items.some(item=>item.id===task.id))&&(!task.startDate||task.startDate<=selectedDate&&(task.reportBasis==='TASK'||!task.endDate||task.endDate>=selectedDate)));
    if(first)chooseTask(first.id);
    // Selection uses the canonical assignment; there is no separate employee-facing report-mode chooser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loaded,viewTab,projectFilter,roleFilter,selectedDate,activeLog?.id,selectedTaskId,taskOptions.length,dayTasks,openExtension,openWorkLogId,openDate]);
  const panel='rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
  const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-orange-500';
  const button='rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600';
  const openLog=(log:DailyWorkLog)=>{const item=log.items.find(i=>(projectFilter==='ALL'||sameWorkProject(projects,i.projectId,projectFilter))&&(!roleFilter||i.roleName===roleFilter))||log.items[0];rememberDraft();setSelectedDate(log.date);setSelectedWorkLogId(log.id);setSelectedTaskId(item?.id||'');setProjectFilter(item?.projectId||'ALL');setRoleFilter(item?.roleName||'');setViewTab('REPORT');};
  const line=hasApprovalLine?TEAM_APPROVAL_LINES[approvalDepartment as keyof typeof TEAM_APPROVAL_LINES]:undefined;
  const leaderTitle=line?.leader.title||'팀장',chiefTitle=line?.chief.title||'실장';
  const stage=activeLog?.approvalStatus==='APPROVED_FINAL'?'최종 승인 완료':activeLog?.approvalStatus&&activeLog.approvalStatus!=='DRAFT'?(activeLog.leaderReview?.approved?`${chiefTitle} 승인 대기`:`${leaderTitle} 검토 대기`):selectedItem?.status==='완료'?'완료':selectedItem?.startDate&&selectedItem.startDate<=selectedDate?'진행 중':'착수 예정';
  const leaderId=activeLog?.department==='구조팀'?'u_25':activeLog?.department==='토목&조경팀'?'u_8':'u_13';
  const chiefId=activeLog?.department==='구조팀'?'u_24':activeLog?.department==='토목&조경팀'?'u_8':'u_12';
  const projectLogs=userWorkLogs.filter(log=>projectFilter==='ALL'||log.items.some(item=>sameWorkProject(projects,item.projectId,projectFilter)));
  const todayDate=new Date().toLocaleDateString('sv-SE');
  const currentTask=allTasks.find(task=>task.id===selectedTaskId)||(selectedItem&&!selectedItem.scheduleRemoved?legacyAllocationTask(selectedItem,allTasks):undefined);
  const extensionTasks=assignedTasks(currentUser?.id||'',projects,ownAliases);
  // Keep the journal's legacy ID; only the extension form uses its uniquely linked current assignment.
  const extensionMatches=extensionTasks.filter(task=>task.id===selectedTaskId||!!selectedItem&&selectedItem.id===`gen-${selectedItem.projectId}-${selectedItem.roleName}`&&sameAllocation(selectedItem,task));
  const extensionTaskId=extensionMatches.length===1?extensionMatches[0].id:'';
  const reportSteps=['작업 선택','실제 업무 결과','업무보고 제출'];
  const currentStep=!selectedItem?1:!canEdit?reportSteps.length:2;
  return <div className="space-y-4 text-slate-900 dark:text-slate-100" data-worklog-screen>
    <header className={panel+' px-5 pt-5'}>
      <div className="grid gap-5 xl:grid-cols-[minmax(240px,.8fr)_minmax(0,1.2fr)] items-center pb-4">
        <div className="flex items-center gap-3"><ClipboardCheck size={42} className="rounded-xl bg-orange-600 p-2 text-white shrink-0"/><div><h2 className="text-xl font-bold">프로젝트 업무일지</h2><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">배정 일정에 따라 자동 저장하고 오후 5시에 보고합니다. 변경 사항과 신청만 입력하세요.</p></div></div>
        <div className={'grid gap-3 '+(viewTab==='HISTORY'?'sm:grid-cols-2':'sm:grid-cols-3')} aria-label="보고 대상 연결">
          <label className="min-w-0 text-xs text-slate-600 dark:text-slate-300">보고 프로젝트<select aria-label="보고 프로젝트" className={field+' mt-1'} value={workProjectOptions(projects).find(project=>sameWorkProject(projects,project.id,projectFilter))?.id||'ALL'} onChange={e=>{rememberDraft();setProjectFilter(e.target.value);setRoleFilter('');setSelectedTaskId('');}}><option value="ALL">전체 프로젝트</option>{workProjectOptions(projects).map(project=><option data-no-translate key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
          <label className="min-w-0 text-xs text-slate-600 dark:text-slate-300">보고 역할<select aria-label="보고 역할" className={field+' mt-1'} value={roleFilter} onChange={e=>{rememberDraft();setRoleFilter(e.target.value);setSelectedTaskId('');}}><option value="">전체 역할</option>{roles.map(role=><option key={role}>{role}</option>)}</select></label>
          {viewTab!=='HISTORY'&&<label className="min-w-0 text-xs text-slate-600 dark:text-slate-300">보고 작업<select aria-label="보고 작업" className={field+' mt-1'} value={selectedTaskId} onChange={e=>chooseTask(e.target.value)}><option value="">작업을 선택하세요</option>{taskOptions.map(task=><option data-no-translate={!task.scheduleMemo?'':undefined} key={task.id} value={task.id} disabled={canEdit&&allTasks.some(t=>t.id===task.id&&(t.startDate>selectedDate||(t.reportingMode==='DAILY'&&t.endDate<selectedDate)))}>{task.roleName} · {task.scheduleMemo||task.projectName}</option>)}</select></label>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-3 dark:border-slate-700">
        <nav role="tablist" className="flex flex-wrap gap-1" aria-label="업무일지 탐색">{([['REPORT','업무보고',ClipboardCheck],['HISTORY','업무일지 이력',History],['OVERTIME','야근 신청',Clock],['EXTENSIONS','일정 연장 요청',Hourglass]] as const).map(([key,label,Icon])=><button role="tab" aria-selected={viewTab===key} key={key} className={'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold '+(viewTab===key?'bg-orange-700 text-white':'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')} onClick={()=>{rememberDraft();setViewTab(key);}}><Icon size={15}/>{label}{key==='HISTORY'&&<span className="rounded-full bg-white/90 px-1.5 text-xs text-orange-800">{projectLogs.length}</span>}</button>)}</nav>
        <div className="flex gap-5 items-center"><div className="hidden 2xl:flex items-center gap-2 text-orange-700 dark:text-orange-300"><Sun size={24}/><div><strong className="text-sm">오늘의 업무를 확인하세요</strong><p className="text-xs text-slate-600 dark:text-slate-300">배정된 작업과 마감일을 확인하세요.</p></div></div><label className="flex items-center gap-2 text-xs"><CalendarDays size={21} className="text-blue-700 dark:text-blue-300"/><span>보고 날짜<input aria-label="보고 날짜" type="date" disabled={busy} className="block bg-transparent text-sm font-semibold text-slate-900 dark:text-slate-100" value={selectedDate} onChange={e=>{rememberDraft();setSelectedDate(e.target.value);setSelectedWorkLogId(null);setSelectedTaskId('');setProjectFilter('ALL');setRoleFilter('');initialProjectChosen.current=false;}}/></span></label></div>
      </div>
    </header>
    {preservedDraft&&<details className="rounded-lg bg-amber-100 p-3 text-amber-950"><summary>다른 화면에서 상신되어 최신 결재본을 표시합니다. 이전 미저장 입력 확인</summary><pre data-no-translate className="whitespace-pre-wrap break-words text-xs mt-2">{preservedDraft}</pre></details>}
    <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">배정 일정 기준 자동 저장 · 오후 5시(한국시간) 자동 보고{activeLog?.autoReportedAt?` · 자동 보고 완료 ${new Date(activeLog.autoReportedAt).toLocaleString('ko-KR')}`:' · 수정한 내용은 자동 저장됩니다.'}</p>
    {!loaded&&<p role="status" className="rounded-lg bg-amber-100 p-3 text-amber-950">중앙 업무일지를 연결하고 있습니다. 연결 후 작성할 수 있습니다.</p>}
    {leavesFor(leaves,reportUserId,selectedDate).length>0&&<p className="rounded-lg bg-amber-100 p-3 text-amber-950">휴가 등록일: {leavesFor(leaves,reportUserId,selectedDate).map(leave=>leave.kind).join(', ')} · 배정 업무를 확인하고 담당자와 조정하세요.</p>}
    {activeLog?.serverRevision!==formRevision&&activeLog?.approvalStatus==='DRAFT'&&<p role="status" className="rounded-lg bg-amber-100 p-3 text-amber-950">다른 화면의 저장본이 갱신되었습니다. 현재 입력은 유지되며 덮어쓰기를 막습니다. <button className="underline" onClick={()=>{localDrafts.current.delete(draftKey);editorSource.current={key:draftKey,logId:activeLog.id,items:structuredClone(activeLog.items),notes:activeLog.overallNotes};setItems(activeLog.items);setOverallNotes(activeLog.overallNotes);setFormRevision(activeLog.serverRevision);}}>최신 저장본 불러오기</button></p>}
    {notice&&<p role="status" className="rounded-lg bg-amber-100 p-3 text-amber-950">{notice}</p>}
    {(viewTab==='EXTENSIONS'||viewTab==='OVERTIME')?<ScheduleExtensionRequests projects={projects} projectId={projectFilter} tasks={extensionTasks} selectedTaskId={extensionTaskId} requestType={viewTab==='OVERTIME'?'OVERTIME':'DEADLINE'} suggestedDate={selectedDate}/>:viewTab==='HISTORY'?<div className={panel+' grid xl:grid-cols-[minmax(0,1fr)_280px] gap-4 p-5'}><WorkLogHistory logs={userWorkLogs} projects={projects} roleName={roleFilter} projectId={projectFilter} onOpen={openLog}/><WorkLogProjectSummary project={selectedProject} logs={userWorkLogs} date={selectedDate}/></div>:<section aria-label="업무보고 화면" className={panel+' p-5 space-y-5'}>
      <div className="grid sm:grid-cols-3 gap-3" aria-label="업무보고 현황">{[['오늘 작성한 업무일지',userWorkLogs.filter(log=>log.userId===reportUserId&&log.date===todayDate).length,ClipboardCheck,'blue'],['진행 중인 업무',allTasks.filter(task=>task.status!=='완료'&&task.progress<100&&task.startDate<=todayDate).length,Clock,'orange'],['완료한 업무',allTasks.filter(task=>task.status==='완료'||task.progress===100).length,CheckCircle2,'emerald']].map(([label,count,Icon,color])=>{const Symbol=Icon as typeof ClipboardCheck;return <article key={String(label)} className="flex gap-3 items-center rounded-lg border border-slate-200 p-5 dark:border-slate-700"><Symbol size={36} className={`rounded-full p-2 ${color==='blue'?'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':color==='orange'?'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300':'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}/><div><p className="text-xs text-slate-600 dark:text-slate-300">{String(label)}</p><strong className="text-2xl">{String(count)}</strong><span className="ml-1 text-xs text-slate-600 dark:text-slate-300">건</span></div></article>;})}</div>
      <p className="text-xs text-slate-600 dark:text-slate-300">배정된 모든 작업을 기준으로 집계합니다.</p>
      <details className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/30"><summary className="cursor-pointer font-semibold">보고 날짜 배정 {dayTasks.length}개 · 내일 배정 {tomorrowTasks.length}개</summary><ul className="mt-3 space-y-2" aria-label="내일 배정 업무">{tomorrowTasks.map(task=><li data-no-translate key={task.id}>{task.projectCode} · {task.projectName} · {task.roleName}{task.scheduleMemo&&` · ${task.scheduleMemo}`}</li>)}</ul>{!tomorrowTasks.length&&<p className="mt-2 text-xs">내일 배정된 업무가 없습니다.</p>}</details>
      <section className="rounded-xl border border-slate-200 dark:border-slate-700" aria-label="업무보고 작성">
        <div className="flex items-center justify-between gap-3 p-5"><div className="flex gap-3 items-center"><CalendarDays size={40} className="p-2 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"/><div><h3 className="font-bold text-xl">작업 진행 보고</h3><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">선택한 업무의 진행률과 결과를 기록하거나 일정 연장을 요청하세요.</p></div></div><div className="rounded-lg bg-orange-50 px-5 py-3 text-orange-800 dark:bg-orange-950 dark:text-orange-200"><span className="block text-xs">상태</span><strong className="text-sm">{stage}</strong></div></div>
        <div className="flex flex-wrap justify-between gap-2 border-y border-slate-200 px-5 py-3 dark:border-slate-700"><div><strong className="text-xs">보고 방식</strong><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{reportMode==='TASK'?'하루 목표 없이 전체 작업 결과를 직접 보고합니다.':'당일 진행률과 업무 결과를 기록합니다. 업무계획은 선택 입력입니다.'}</p></div><span className="self-center rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-200">{reportMode==='TASK'?'작업 기준':'일일 기준'}</span></div>
        <div className="p-5 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><WorkLogSteps steps={reportSteps} current={currentStep}/><div className="flex gap-2"><button type="button" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50" disabled={!loaded||busy||!extensionTaskId} onClick={()=>{rememberDraft();setViewTab('OVERTIME');}}>야근 신청</button><button type="button" aria-label="일정 연장 요청" className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50" disabled={!loaded||busy||!extensionTaskId} onClick={()=>{rememberDraft();setViewTab('EXTENSIONS');}}>일정 연장 요청</button></div></div>
          {selectedItem?<div className="grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-5 items-start">
            <div className="space-y-4"><WorkLogTaskInfo item={selectedItem} userName={activeLog?.userName||currentUser?.name||''}/><label className="block rounded-lg border border-slate-200 p-4 text-sm font-semibold dark:border-slate-700">내일 업무계획<textarea aria-label="내일 업무계획" rows={3} disabled={!canEdit} className={field+' mt-3 font-normal'} placeholder="다음에 수행할 업무를 입력하세요..." value={selectedItem.tomorrowPlan} onChange={e=>handleUpdateItem(selectedItem.id,'tomorrowPlan',e.target.value)}/></label></div>
            <div><TaskReportFields key={selectedItem.id} item={selectedItem} task={currentTask} approvedProgress={approvedTaskProgress(currentTask,projects)} canEdit={canEdit} update={handleUpdateItem}/>{reportMode==='DAILY'&&<details className="border-t border-slate-200 pt-4 mt-4 dark:border-slate-700"><summary className="text-sm font-semibold cursor-pointer">업무계획 · 선택 입력</summary><DailyPlanFields item={selectedItem} canEdit={canEdit} update={handleUpdateItem}/></details>}</div>
          </div>:<div className="rounded-lg border border-dashed border-slate-300 p-10 text-center dark:border-slate-600"><FileText size={28} className="mx-auto text-slate-500"/><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">상단에서 프로젝트와 배정된 작업을 선택하세요.</p></div>}
          <label className="block text-sm font-semibold">종합 보고 및 특이사항<textarea aria-label="종합 보고 및 특이사항" disabled={!canEdit} rows={2} className={field+' mt-2 font-normal'} value={overallNotes} onChange={e=>setOverallNotes(e.target.value)}/></label>
          <div className="flex flex-wrap justify-between items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><span className="text-sm text-slate-600 dark:text-slate-300">작업 결과 · {selectedItem?`${selectedItem.progress}%`:'작업 선택'}</span><div className="flex gap-2"><button className={button} disabled={!canEdit||busy} onClick={()=>void run(()=>handleSaveLog())}><Save size={14} className="inline mr-1"/>임시 저장</button><button className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!canEdit||busy||!selectedItem} onClick={()=>void run(handleSubmitToLeader)}><Send size={14} className="inline mr-1"/>업무보고 제출</button></div></div>
        </div>
      </section>
      <details className="border-t border-slate-200 pt-4 dark:border-slate-700"><summary className="text-sm font-semibold cursor-pointer">업무일지 결재 · {stage}</summary><section className="space-y-4 pt-4" aria-label="업무일지 결재">{!hasApprovalLine&&<p role="status">결재선이 설정되지 않았습니다. 소속과 결재 담당자를 확인하세요.</p>}<div className="grid sm:grid-cols-3 gap-3">{[['작성자',activeLog?.authorSignature?.name||activeLog?.userName||currentUser?.name,activeLog?.authorSignature?.signed],[hasApprovalLine?`1차 ${leaderTitle} 검토 (${approvalDepartment})`:`${leaderTitle} 검토`,activeLog?.leaderReview?.name||line?.leader.name,activeLog?.leaderReview?.approved],[`${chiefTitle} 최종 승인`,activeLog?.chiefApproval?.name||line?.chief.name,activeLog?.chiefApproval?.approved]].map(([label,name,done])=><div key={String(label)} className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700"><p className="text-slate-600 dark:text-slate-300">{label}</p><strong className="block mt-2">{name}</strong><p className="mt-2">{done?'확인 완료':'대기'}</p></div>)}</div><div className="flex gap-3">{activeLog?.approvalStatus==='SUBMITTED_LEADER'&&!activeLog.leaderReview?.approved&&currentUser?.id===leaderId&&<button className={button} disabled={busy} onClick={()=>void run(handleApproveByLeader)}>{leaderTitle} 검토 승인</button>}{activeLog?.approvalStatus==='SUBMITTED_LEADER'&&activeLog.leaderReview?.approved&&currentUser?.id===chiefId&&<button className={button} disabled={busy} onClick={()=>void run(handleApproveFinalByChief)}>{chiefTitle} 최종 승인</button>}</div></section></details>
      <details className="border-t border-slate-200 pt-4 dark:border-slate-700"><summary className="text-sm cursor-pointer">오늘의 보고 항목 ({items.length}개)</summary><ul className="space-y-2 mt-3">{items.map(item=><li key={item.id} className="flex justify-between gap-3 text-sm"><button className="text-left underline" onClick={()=>chooseTask(item.id)}>{item.projectCode} · {item.roleName||'추가 업무'}</button>{canEdit&&!item.scheduleDerived&&<button aria-label="추가 업무 삭제" onClick={()=>handleDeleteItem(item.id)} className="text-rose-700 dark:text-rose-300"><Trash2 size={15}/></button>}</li>)}</ul>{canEdit&&<div className="flex gap-2 mt-3"><button className={button} onClick={handleAddItem}><Plus size={14} className="inline mr-1"/>추가 업무 기록</button><button className={button} onClick={handleAutoLoadFromSchedule}><Sparkles size={14} className="inline mr-1"/>최신 배정 확인</button></div>}</details>
    </section>}
    {isAdmin&&<label className="block text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={viewAllAsAdmin} onChange={e=>setViewAllAsAdmin(e.target.checked)}/> 중앙 열람 가능한 전체 일지</label>}
    <LegacyWorkLogArchive/>
  </div>;
};
