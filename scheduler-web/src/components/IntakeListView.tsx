import React, { useState } from 'react';
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
  lang?: 'ko' | 'vi';
}

export const IntakeListView: React.FC<Props> = ({ onNavigateToSchedule, lang = 'ko' }) => {
  const { addProject, projects, setSelectedProjectId } = useProjectStore();
  const [selectedIntake, setSelectedIntake] = useState<IntakeProject | null>(null);
  const [intakeList, setIntakeList] = useState<IntakeProject[]>(() => {
    // 기존 프로젝트 코드들과 비교하여 이미 등록된 항목은 isScheduled=true로 동기화
    const scheduledCodes = new Set(projects.map((p) => p.code));
    return (intakeRawData as IntakeProject[]).map((item) => ({
      ...item,
      isScheduled: item.isScheduled || scheduledCodes.has(item.code),
      status: item.isScheduled || scheduledCodes.has(item.code) ? '일정등록완료' : '접수완료',
    }));
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

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
      (statusFilter === 'PENDING' && !item.isScheduled) ||
      (statusFilter === 'SCHEDULED' && item.isScheduled);

    return matchesSearch && matchesDept && matchesStatus;
  });

  // 일정표로 원클릭 등록
  const handleRegisterToSchedule = (item: IntakeProject, targetDept: Department) => {
    setRegisteringId(item.id);

    setTimeout(() => {
      // 프로젝트 생성
      addProject({
        code: item.code,
        name: item.name,
        startDate: item.startDate,
        endDate: item.endDate,
        department: targetDept,
        pmId: targetDept === '마감팀' ? '4' : targetDept === '구조팀' ? '3' : '26', // 양한규(마감), 김재헌(구조), 오승균(토목)
        progress: 0,
        status: '착수예정',
        roles: {
          PM: {
            personId: targetDept === '마감팀' ? '4' : targetDept === '구조팀' ? '3' : '26',
            startDate: item.startDate,
            endDate: item.endDate,
          },
        },
        subTasks: {
          PM: {
            roleName: 'PM',
            personId: targetDept === '마감팀' ? '4' : targetDept === '구조팀' ? '3' : '26',
            startDate: item.startDate,
            endDate: item.endDate,
            status: '예정',
            memo: `그룹웨어 수주소식 접수 (담당: ${item.author})`,
            version: 'v1',
          },
        },
      });

      // 목록 상태 갱신
      setIntakeList((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, isScheduled: true, status: '일정등록완료' } : it
        )
      );

      setRegisteringId(null);
      setSuccessToast(`[${item.name}]이(가) ${targetDept} 일정표에 성공적으로 등록되었습니다!`);
      setTimeout(() => setSuccessToast(null), 4000);
    }, 400);
  };

  const t = {
    title: lang === 'vi' ? 'Danh sách tiếp nhận dự án (Tiếp nhận trúng thầu)' : '프로젝트 접수목록 (그룹웨어 수주소식 연동)',
    subtitle:
      lang === 'vi'
        ? 'Tự động đồng bộ từ Groupware (gw.con-cost.com). Quản lý dự án mới và đăng ký lịch trình một chạm.'
        : '그룹웨어(gw.con-cost.com) 수주소식에서 1시간마다 자동 크롤링된 신규 수주 프로젝트를 통합 검토하고 일정표로 원클릭 등록합니다.',
    totalIntake: lang === 'vi' ? 'Tổng số tiếp nhận' : '수주 접수 건수',
    pending: lang === 'vi' ? 'Chưa xếp lịch' : '일정 미등록 (대기)',
    scheduled: lang === 'vi' ? 'Đã xếp lịch' : '일정표 등록완료',
    syncDesc: lang === 'vi' ? 'Tự động thu thập: 09:00 ~ 17:00 ngày thường' : '평일 09:00 ~ 17:00 매시간 자동 동기화 구동 중',
    searchPlaceholder: lang === 'vi' ? 'Tìm theo tên dự án, chủ đầu tư, mã...' : '프로젝트명, 발주처, 수주코드 검색...',
  };

  return (
    <div className="space-y-6">
      {/* 알림 토스트 */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-fade-in">
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
                GW 1205 LIVE CRAWLER
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
              {intakeList.length} <span className="text-xs font-normal text-slate-500">건</span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-semibold">
              <span>{t.pending}</span>
              <Clock size={16} />
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1">
              {intakeList.filter((i) => !i.isScheduled).length}{' '}
              <span className="text-xs font-normal text-amber-600">건 미등록</span>
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              <span>{t.scheduled}</span>
              <CheckCircle2 size={16} />
            </div>
            <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-1">
              {intakeList.filter((i) => i.isScheduled).length}{' '}
              <span className="text-xs font-normal text-emerald-600">건 배정완료</span>
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
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              미등록
            </button>
            <button
              onClick={() => setStatusFilter('SCHEDULED')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                statusFilter === 'SCHEDULED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              등록완료
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-16 text-center">No</th>
                <th className="py-3.5 px-4 w-32">수주코드</th>
                <th className="py-3.5 px-4 w-44">발주처</th>
                <th className="py-3.5 px-4">프로젝트명 (수주소식 제목)</th>
                <th className="py-3.5 px-4 w-36 text-center">해당 팀 (공종)</th>
                <th className="py-3.5 px-4 w-28 text-center">접수일자</th>
                <th className="py-3.5 px-4 w-28 text-center">작성자</th>
                <th className="py-3.5 px-4 w-32 text-center">상태</th>
                <th className="py-3.5 px-4 w-44 text-center">일정표 등록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 dark:text-slate-500">
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
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-500">
                        {item.no}
                      </td>

                      {/* 코드 */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {item.code}
                        </span>
                      </td>

                      {/* 발주처 */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {item.client}
                        </span>
                      </td>

                      {/* 프로젝트명 */}
                      <td className="py-3.5 px-4 cursor-pointer group" onClick={() => setSelectedIntake(item)}>
                        <div className="font-extrabold text-slate-900 dark:text-white group-hover:text-[#00338d] dark:group-hover:text-blue-400 flex items-center gap-1.5 transition-colors">
                          <span className="group-hover:underline">{item.name}</span>
                          <span className="text-[10px] bg-blue-50 dark:bg-slate-700 text-[#00338d] dark:text-blue-300 px-1.5 py-0.5 rounded font-bold border border-blue-200 dark:border-slate-600">
                            세부내용 확인
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
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
                      <td className="py-3.5 px-4 text-center font-mono text-slate-600 dark:text-slate-300">
                        {item.receivedDate}
                      </td>

                      {/* 작성자 */}
                      <td className="py-3.5 px-4 text-center text-slate-600 dark:text-slate-300">
                        {item.author}
                      </td>

                      {/* 상태 */}
                      <td className="py-3.5 px-4 text-center">
                        {item.isScheduled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 size={12} /> 등록완료
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock size={12} /> 미등록
                          </span>
                        )}
                      </td>

                      {/* 일정표 등록 액션 버튼들 */}
                      <td className="py-3.5 px-4 text-center">
                        {item.isScheduled ? (
                          <button
                            onClick={() => onNavigateToSchedule()}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1"
                          >
                            일정표 보기 <ArrowRight size={13} />
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {item.targetDepartments.map((dept) => (
                              <button
                                key={dept}
                                disabled={registeringId === item.id}
                                onClick={() => handleRegisterToSchedule(item, dept as Department)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#00338d] hover:bg-[#002266] text-white transition-all shadow-xs flex items-center gap-1 disabled:opacity-50"
                              >
                                <CalendarPlus size={12} />
                                {dept.replace('팀', '')} 등록
                              </button>
                            ))}
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
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/80 dark:bg-slate-850">
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
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
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

              {/* 원본 수주소식 타이틀 */}
              <div className="text-[11px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 p-2.5 rounded-lg">
                그룹웨어 원문: {selectedIntake.rawTitle}
              </div>
            </div>

            {/* 모달 푸터 액션 */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                대상부서: <strong className="text-slate-800 dark:text-slate-200">{selectedIntake.targetDepartments.join(', ')}</strong>
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
                    일정표 & 공종별 상세 배정 모달 열기 <ArrowRight size={14} />
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {selectedIntake.targetDepartments.map((dept) => (
                      <button
                        key={dept}
                        onClick={() => {
                          handleRegisterToSchedule(selectedIntake, dept as Department);
                          setSelectedIntake(null);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-[#00338d] hover:bg-[#002266] text-white transition-all shadow-sm flex items-center gap-1"
                      >
                        <CalendarPlus size={13} />
                        {dept} 일정 등록
                      </button>
                    ))}
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
