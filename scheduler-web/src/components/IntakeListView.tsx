import { canManageSchedule } from '../utils/schedulePermissions';
import { useAuthStore } from '../store/useAuthStore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  CalendarPlus,
  Search,
  CheckCircle2,
  Clock,
  Building2,
  Layers,
  Trees,
  ExternalLink,
  ArrowRight,
  Maximize2,
  Building,
  FileText,
  PhoneCall,
  X,
  Info
} from 'lucide-react';
import { useProjectStore, type Department } from '../store/useProjectStore';
import {newProjectFromIntake} from '../utils/intakeRegistration';
import {refreshStudioProjects,waitForSchedulePublished,useStudioStore} from '../store/useStudioStore';
import {pendingAssignmentReason} from '../utils/pendingAssignment';
import intakeRawData from '../data/intakeProjects.json';

export interface IntakeProject {
  id: string;
  no: number;
  code: string;
  client: string;
  name: string;
  rawTitle: string;
  author: string;
  receivedDate: string;
  startDate: string;
  endDate: string;
  scopeText: string;
  targetDepartments: string[];
  status: string;
  isScheduled: boolean;
  // 그룹웨어 세부 스펙
  pmByDepartment?: Record<string, string>;
  scopeVerified?: boolean;
  area?: string;
  usage?: string;
  buildings?: string;
  floors?: string;
  contacts?: string[];
  notes?: string;
  request?: string;
}

interface Props {
  onNavigateToSchedule: (dept?: Department) => void;
  openIntakeCode?:string|null;
  onIntakeOpened?:()=>void;
  lang?: 'ko' | 'vi';
}

export const IntakeListView: React.FC<Props> = ({ onNavigateToSchedule, openIntakeCode, onIntakeOpened, lang = 'ko' }) => {
  const { addProject, projects, setSelectedProjectId } = useProjectStore();
  const [selectedIntake, setSelectedIntake] = useState<IntakeProject | null>(null);
  const currentUser = useAuthStore(state => state.currentUser);
  const [remoteIntake,setRemoteIntake]=useState<IntakeProject[]>([]);
  const [syncState,setSyncState]=useState('중앙 수주 연결 확인 중');
  useEffect(()=>{
    let stopped=false, busy=false;
    const refresh=async()=>{
      if(busy)return; busy=true;
      try{
        const response=await fetch('/api/intake',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error('수주 연결 실패');
        const data=await response.json();
        if(!Array.isArray(data.intakeList))throw new Error('수주 응답 오류');
        if(stopped)return;
        setRemoteIntake(data.intakeList);
        const last=data.sync?.last_success;
        const stale=last && Date.now()-Date.parse(last)>90*60*1000;
        const issue=data.sync?.last_error?` · 수집 실패 (${data.sync.last_error})`:last?(stale?' · 갱신 지연':' · 정상'):'';
        setSyncState((last?`마지막 수집 ${new Date(last).toLocaleString('ko-KR')}`:'자동 수집 기록 없음 · 저장 자료 표시')+issue);
      }catch{if(!stopped)setSyncState('수주 서버 연결 실패 · 마지막 자료 표시');}
      finally{busy=false;}
    };
    void refresh(); const timer=setInterval(()=>void refresh(),60000);
    const focus=()=>void refresh(); window.addEventListener('focus',focus);
    return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[currentUser?.id]);
  const intakeList = useMemo(()=>{
    const mergedIntake=new Map((intakeRawData as IntakeProject[]).map(item=>[item.id,item]));
    remoteIntake.forEach(item=>mergedIntake.set(item.id,{...mergedIntake.get(item.id),...item}));
    return [...mergedIntake.values()].sort((a,b)=>b.no-a.no).map(item => {
    const departments=item.targetDepartments.length?item.targetDepartments:[...new Set(projects.filter(p=>p.code===item.code).map(p=>p.department))];
    const isScheduled=departments.length>0&&departments.every(dept=>projects.some(p=>p.code===item.code&&p.department===dept));
    const needsAssignment=!isScheduled||departments.some(dept=>{const project=projects.find(p=>p.code===item.code&&p.department===dept);return project&&pendingAssignmentReason(project);});
    return {...item,targetDepartments:departments,isScheduled,needsAssignment,status:isScheduled?'프로젝트등록':'접수완료'};
    });
  },[remoteIntake,projects]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  useEffect(()=>{
    if(!openIntakeCode)return;
    const item=intakeList.find(item=>item.code===openIntakeCode);
    if(item){setSearchTerm(openIntakeCode);setDeptFilter('ALL');setStatusFilter('ALL');setSelectedIntake(item);onIntakeOpened?.();}
  },[openIntakeCode,intakeList,onIntakeOpened]);

  // 필터링
  const filteredList = intakeList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept =
      deptFilter === 'ALL' || item.targetDepartments.includes(deptFilter);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PENDING' && item.needsAssignment) ||
      (statusFilter === 'SCHEDULED' && item.isScheduled&&!item.needsAssignment);

    return matchesSearch && matchesDept && matchesStatus;
  });

  // 일정표로 원클릭 등록
  const handleRegisterToSchedule = async (item: IntakeProject, targetDept: Department) => {
    if (!canManageSchedule(currentUser, targetDept)) { setSuccessToast('해당 팀 실장·팀장만 일정을 등록할 수 있습니다.'); return; }
    if (projects.some(p => p.code === item.code && p.department === targetDept)) { setSuccessToast('이미 등록된 프로젝트/부서입니다.'); return; }
    if (item.startDate && item.endDate && item.endDate < item.startDate) { setSuccessToast('수주 원문 착수·납품일의 순서가 잘못되어 등록할 수 없습니다.'); return; }
    setRegisteringId(item.id);

    try{
      // 확인된 참여 팀은 서버에서 자동 등록한다. 별도 로컬 복제본을 만들지 않는다.
      if(item.targetDepartments.includes(targetDept)){
        await refreshStudioProjects();
        setSuccessToast('중앙 일정표에 자동 반영됩니다. 신규·미배정 프로젝트에서 PM과 담당 인원을 배정해 주세요.');
      }else{
        const actor=useAuthStore.getState().currentUser;
        if(!useStudioStore.getState().ready)throw new Error('중앙 공유 연결 후 담당팀을 지정해 주세요.');
        addProject(newProjectFromIntake(item,targetDept));
        const created=useProjectStore.getState().projects.find(p=>p.code===item.code&&p.department===targetDept);
        if(!created)throw new Error('담당팀 일정을 확인할 수 없습니다.');
        await waitForSchedulePublished([created.id]);
        if(actor!==useAuthStore.getState().currentUser)return;
        openRegisteredProject(created);
        setSuccessToast(`${targetDept} 일정을 등록했습니다. PM·담당 인원·날짜를 배정해 주세요.`);
      }
    }catch(error){setSuccessToast(error instanceof Error?error.message:'중앙 일정 등록 실패');}
    finally{setRegisteringId(null);}
  };

  const registeredProject = (item: IntakeProject, dept: string) => projects.find(p => p.code === item.code && p.department === dept);
  const registrationLabel = (item: IntakeProject) => {
    const registered = item.targetDepartments.map(dept => registeredProject(item, dept)).filter(p => p !== undefined);
    const needsPM = registered.some(p => pendingAssignmentReason(p)==='PM 미배정');
    const needsDates = registered.some(p => pendingAssignmentReason(p)==='일정 미정');
    return item.isScheduled ? (needsPM ? '신규 · PM 배정 필요' : needsDates?'일정 미정':'프로젝트 등록') : registered.length ? `일부 등록${needsPM ? ' · PM 배정 필요' : ''}` : '신규·미배정';
  };
  const openRegisteredProject = (project: (typeof projects)[number]) => {
    setSelectedProjectId(project.id);
    setSelectedIntake(null);
    onNavigateToSchedule(project.department);
  };

  const t = {
    title: lang === 'vi' ? 'Danh sách tiếp nhận dự án (Tiếp nhận trúng thầu)' : '프로젝트 접수목록 (그룹웨어 수주소식 연동)',
    subtitle:
      lang === 'vi'
        ? 'Dữ liệu Groupware theo phạm vi công việc đã đánh dấu; lịch hiện có được giữ nguyên.'
        : '그룹웨어 작업범위 체크에 따라 참여 팀의 신규 프로젝트를 등록합니다. PM은 자동 지정하지 않으므로 해당 팀 실장·팀장이 PM과 담당 인원을 배정해 주세요.',
    totalIntake: lang === 'vi' ? 'Tổng số tiếp nhận' : '수주 접수 건수',
    pending: lang === 'vi' ? 'Chờ phân công' : '신규·미배정 (배정 대기)',
    scheduled: lang === 'vi' ? 'Đã xác nhận phân công' : '배정 확인',
    syncDesc: syncState,
    searchPlaceholder: lang === 'vi' ? 'Tìm theo tên dự án, chủ đầu tư, mã...' : '프로젝트명, 발주처, 수주코드 검색...',
  };

  return (
    <div className="space-y-6">
      {/* 알림 토스트 */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in">
          <CheckCircle2 size={20} className="text-emerald-200" />
          <span className="text-sm font-bold">{successToast}</span>
        </div>
      )}

      {/* 헤더 & 통계 배너 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#00338d] dark:bg-blue-900/40 dark:text-blue-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                그룹웨어 수주 연동
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.syncDesc}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Inbox className="text-[#00338d] dark:text-blue-400" size={26} />
              {t.title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">{t.subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://gw.con-cost.com:1205/bbs/bbslist?AddBbs=0&csrf=eyJ0b2tlbiI6IiIsIlJvb21ObyI6Ijk1In0="
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <ExternalLink size={14} />
              그룹웨어 원문보기
            </a>
          </div>
        </div>

        {/* 요약 통계 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span>{t.totalIntake}</span>
              <Inbox size={16} />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {intakeList.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-300">건</span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-semibold">
              <span>{t.pending}</span>
              <Clock size={16} />
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1">
              {intakeList.filter((i) => i.needsAssignment).length}{' '}
              <span className="text-xs font-normal text-amber-700 dark:text-amber-300">건 배정 대기</span>
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <span>{t.scheduled}</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-1">
              {intakeList.filter((i) => i.isScheduled&&!i.needsAssignment).length}{' '}
              <span className="text-xs font-normal text-emerald-700 dark:text-emerald-300">건 배정 확인</span>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 및 검색 바 */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* 부서 필터 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setDeptFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                deptFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              전체 공종
            </button>
            <button
              onClick={() => setDeptFilter('마감팀')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                deptFilter === '마감팀'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Building2 size={13} /> 마감
            </button>
            <button
              onClick={() => setDeptFilter('구조팀')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                deptFilter === '구조팀'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Layers size={13} /> 구조
            </button>
            <button
              onClick={() => setDeptFilter('토목&조경팀')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                deptFilter === '토목&조경팀'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Trees size={13} /> 토목·조경
            </button>
          </div>

          {/* 등록 상태 필터 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              전체 상태
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              미배정
            </button>
            <button
              onClick={() => setStatusFilter('SCHEDULED')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'SCHEDULED'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              배정 확인
            </button>
          </div>
        </div>

        {/* 검색 입력창 */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#00338d]"
          />
        </div>
      </div>

      {/* 수주소식 데이터 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] 2xl:min-w-[1600px] table-fixed text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="hidden 2xl:table-cell py-3.5 px-4 w-16 text-center">No</th>
                <th className="py-3.5 px-4 w-28 2xl:w-32">수주코드</th>
                <th className="hidden 2xl:table-cell py-3.5 px-4 w-44">발주처</th>
                <th className="py-3.5 px-4 w-[320px] 2xl:w-[360px]">프로젝트명 (수주소식 제목)</th>
                <th className="py-3.5 px-4 w-32 2xl:w-36 text-center">해당 팀 (공종)</th>
                <th className="hidden 2xl:table-cell py-3.5 px-4 w-28 text-center">접수일자</th>
                <th className="hidden 2xl:table-cell py-3.5 px-4 w-28 text-center">작성자</th>
                <th className="hidden 2xl:table-cell py-3.5 px-4 w-32 text-center">상태</th>
                <th className="py-3.5 px-4 w-[300px] text-center">일정표 등록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="2xl:hidden text-center py-12 text-slate-400 dark:text-slate-500">
                    조건에 맞는 수주 프로젝트가 없습니다.
                  </td>
                  <td colSpan={9} className="hidden 2xl:table-cell text-center py-12 text-slate-400 dark:text-slate-500">
                    조건에 맞는 수주 프로젝트가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors ${
                        item.isScheduled ? 'bg-slate-50/30 dark:bg-slate-800/50' : ''
                      }`}
                    >
                      {/* 번호 */}
                      <td className="hidden 2xl:table-cell py-3.5 px-4 text-center font-semibold text-slate-500">
                        {item.no}
                      </td>

                      {/* 코드 */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {item.code}
                        </span>
                      </td>

                      {/* 발주처 */}
                      <td className="hidden 2xl:table-cell py-3.5 px-4">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {item.client}
                        </span>
                      </td>

                      {/* 프로젝트명 */}
                      <td className="py-3.5 px-4 cursor-pointer group" onClick={() => setSelectedIntake(item)}>
                        <div className="font-extrabold text-slate-900 dark:text-white group-hover:text-[#00338d] dark:group-hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                          <span className="group-hover:underline">{item.name}</span>
                          <span className="shrink-0 whitespace-nowrap text-[10px] bg-blue-50 dark:bg-slate-700 text-[#00338d] dark:text-blue-300 px-1.5 py-0.5 rounded font-bold border border-blue-200 dark:border-slate-600">
                            세부내용 확인
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-1 dark:text-slate-400">
                          {item.rawTitle}
                        </div>
                        {/* 연면적 및 세부 스펙 태그 */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {item.area && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black bg-blue-50 text-[#00338d] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md">
                              <Maximize2 size={10} /> 연면적 {item.area}
                            </span>
                          )}
                          {item.usage && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded-md">
                              <Building size={10} /> {item.usage}
                            </span>
                          )}
                          {(item.buildings || item.floors) && (
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1">
                              {[item.buildings, item.floors].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 대상 부서/공종 */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {!item.targetDepartments.length&&<span className="text-amber-700 dark:text-amber-300">담당팀 확인 필요</span>}
                          {item.targetDepartments.map((dept) => (
                            <span
                              key={dept}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                dept === '마감팀'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                  : dept === '구조팀'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              }`}
                            >
                              {dept}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* 접수일자 */}
                      <td className="hidden 2xl:table-cell py-3.5 px-4 text-center font-mono text-slate-600 dark:text-slate-300">
                        {item.receivedDate}
                      </td>

                      {/* 작성자 */}
                      <td className="hidden 2xl:table-cell py-3.5 px-4 text-center text-slate-600 dark:text-slate-300">
                        {item.author}
                      </td>

                      {/* 상태 */}
                      <td className="hidden 2xl:table-cell py-3.5 px-4 text-center">
                        {item.isScheduled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 size={12} /> {registrationLabel(item)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock size={12} /> {registrationLabel(item)}
                          </span>
                        )}
                      </td>

                      {/* 일정표 등록 액션 버튼들 */}
                      <td className="py-3.5 px-4 text-center">
                        {item.isScheduled ? (
                          <button
                            onClick={() => {const project=projects.find(p=>p.code===item.code&&pendingAssignmentReason(p))||projects.find(p=>p.code===item.code);if(project)openRegisteredProject(project);else onNavigateToSchedule();}}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1"
                          >
                            일정표 보기 <ArrowRight size={13} />
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {!item.targetDepartments.length&&<button onClick={()=>setSelectedIntake(item)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300">신규·미배정 · 담당팀 확인</button>}
                            {item.targetDepartments.map((dept) => {
                              const existing = registeredProject(item, dept);
                              return existing ? <button key={dept} onClick={() => openRegisteredProject(existing)} className="shrink-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1">
                                {dept.replace('팀', '')} 일정 보기 <ArrowRight size={13} />
                              </button> : <button
                                key={dept}
                                disabled={registeringId === item.id || !canManageSchedule(currentUser, dept as Department) || projects.some(p => p.code === item.code && p.department === dept)}
                                onClick={() => handleRegisterToSchedule(item, dept as Department)}
                                className="shrink-0 whitespace-nowrap px-2 py-1.5 rounded-lg text-[11px] font-bold bg-[#00338d] hover:bg-[#002266] text-white transition-all shadow-xs flex items-center gap-1 disabled:opacity-50"
                              >
                                <CalendarPlus size={12} />
                                {dept.replace('팀', '')} 등록
                              </button>;
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수주 프로젝트 세부내용 확인 모달 */}
      {selectedIntake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* 모달 헤더 */}
            <div className="relative p-5 pr-16 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/80 dark:bg-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-black tracking-wider text-[#00338d] dark:text-blue-400 uppercase">
                    GROUPWARE INTAKE DETAIL · 수주소식 원문 및 건축 개요
                  </span>
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-[#00338d] dark:text-blue-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    {selectedIntake.status}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="font-mono text-[#00338d] dark:text-blue-400">{selectedIntake.code}</span>
                  <span className="text-slate-300">·</span>
                  <span>{selectedIntake.name}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  작성자: {selectedIntake.author} · 접수일: {selectedIntake.receivedDate} · 기간: {selectedIntake.startDate} ~ {selectedIntake.endDate}
                </p>
              </div>
              <button
                onClick={() => setSelectedIntake(null)}
                aria-label="수주 상세 닫기"
                className="absolute right-3 top-3 p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 본문: 세부 스펙 카드 그리드 */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {/* 4대 핵심 지표 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. 연면적 */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Maximize2 size={14} className="text-[#00338d] dark:text-blue-400" />
                    연면적
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1.5">
                    {selectedIntake.area || '미기재'}
                  </div>
                  {selectedIntake.buildings && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      동수: {selectedIntake.buildings}
                    </div>
                  )}
                </div>

                {/* 2. 건물용도 및 규모 */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Building size={14} className="text-[#00338d] dark:text-blue-400" />
                    건물용도 / 층수
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1.5">
                    {selectedIntake.usage || '일반 건축물'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {selectedIntake.floors ? `층수: ${selectedIntake.floors}` : (selectedIntake.buildings ? `동수: ${selectedIntake.buildings}` : '규모: 정보 확인중')}
                  </div>
                </div>

                {/* 3. 발주처 / 의뢰처 */}
                <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 sm:col-span-2 lg:col-span-1">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <PhoneCall size={14} className="text-[#00338d] dark:text-blue-400" />
                    발주처 / 담당자
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1.5">
                    {selectedIntake.client}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {selectedIntake.contacts && selectedIntake.contacts.length > 0 ? selectedIntake.contacts.join(' / ') : '담당자 미지정'}
                  </div>
                </div>
              </div>

              {/* 대상 공종 및 견적조건 */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText size={14} className="text-[#00338d] dark:text-blue-400" />
                  견적조건 및 특기사항 (원문)
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  {selectedIntake.notes || selectedIntake.request || '공내역서 및 시공사 견적기준 물량산출 진행'}
                </div>
              </div>

              {/* 수주시 요청사항 / 회의록 */}
              {selectedIntake.request && (
                <div className="bg-blue-50/60 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 space-y-1.5">
                  <div className="text-xs font-bold text-[#00338d] dark:text-blue-400 flex items-center gap-1.5">
                    <Info size={14} />
                    수주시 요청사항 & 회의록 연계
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedIntake.request}
                  </div>
                </div>
              )}

              {selectedIntake.pmByDepartment && Object.keys(selectedIntake.pmByDepartment).length > 0 && (
                <div className="text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                  원문 담당자 참고: {Object.entries(selectedIntake.pmByDepartment).map(([team,name])=>`${team} · ${name}`).join(' / ')} · PM 자동 배정 없음
                </div>
              )}
              {/* 원본 수주소식 타이틀 */}
              <div className="text-[11px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 p-2.5 rounded-lg">
                그룹웨어 원문: {selectedIntake.rawTitle}
              </div>
            </div>

            {/* 모달 푸터 액션 */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                대상부서: <strong className="text-slate-800 dark:text-slate-200">{selectedIntake.targetDepartments.join(', ')}</strong>
                {!selectedIntake.isScheduled && selectedIntake.targetDepartments.some(dept => registeredProject(selectedIntake, dept)) && <span className="block mt-1">{registrationLabel(selectedIntake)}</span>}
              </span>

              <div className="flex items-center gap-2">
                {selectedIntake.isScheduled ? (
                  <button
                    onClick={() => {
                      const found = projects.find((p) => p.code === selectedIntake.code);
                      if (found) {
                        setSelectedProjectId(found.id);
                        setSelectedIntake(null);
                        onNavigateToSchedule(found.department);
                      } else {
                        setSelectedIntake(null);
                        onNavigateToSchedule();
                      }
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00338d] hover:bg-[#002266] text-white transition-all shadow-sm flex items-center gap-1.5"
                  >
                    일정표에서 PM·담당 인원 배정 확인 <ArrowRight size={14} />
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {(selectedIntake.targetDepartments.length?selectedIntake.targetDepartments:['마감팀','구조팀','토목&조경팀']).map((dept) => {
                      const existing = registeredProject(selectedIntake, dept);
                      return existing ? <button key={dept} onClick={() => openRegisteredProject(existing)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1">
                        {dept} 일정 보기 <ArrowRight size={13} />
                      </button> : <button
                        key={dept}
                        disabled={registeringId === selectedIntake.id || !canManageSchedule(currentUser, dept as Department)}
                        onClick={() => {
                          handleRegisterToSchedule(selectedIntake, dept as Department);
                          setSelectedIntake(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-[#00338d] hover:bg-[#002266] text-white transition-all shadow-sm flex items-center gap-1"
                      >
                        <CalendarPlus size={13} />
                        {dept} {selectedIntake.targetDepartments.length?'자동 반영 확인':'담당팀 지정'}
                      </button>;
                    })}
                  </div>
                )}
                <button
                  onClick={() => setSelectedIntake(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
