import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import type { Project, Person, Department } from '../store/useProjectStore';
import { HOLIDAYS_2026 } from '../constants/holidays';
import { exportProjectsToExcel } from '../services/excelService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  personnel: Person[];
  currentUserName: string;
  departmentFilter?: Department | 'ALL';
  lang?: 'ko' | 'vi';
}

export const PrintScheduleModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projects,
  personnel,
  currentUserName,
  departmentFilter = 'ALL',
  lang = 'ko',
}) => {
  const [printMode, setPrintMode] = useState<'ALL' | 'MONTH'>('MONTH');
  const [colorMode, setColorMode] = useState<'color' | 'mono'>('color');
  const [currentLang, setCurrentLang] = useState<'ko' | 'vi'>(lang);

  const personMap = useMemo(() => new Map(personnel.map((p) => [p.id, p.name])), [personnel]);
  const filteredProjects = useMemo(() => {
    return departmentFilter === 'ALL'
      ? projects
      : projects.filter((p) => p.department === departmentFilter);
  }, [projects, departmentFilter]);

  // 1. 프로젝트 코드 기준 통합 그룹핑 (메인 캘린더와 100% 동일한 통합 양식)
  const groupedProjects = useMemo(() => {
    const groupMap: Record<string, {
      code: string;
      name: string;
      client: string;
      area?: string;
      usage?: string;
      departments: Department[];
      lanes: {
        projectId: string;
        department: Department;
        pmName: string;
        startDate: string;
        endDate: string;
        progress: number;
        status: string;
      }[];
    }> = {};

    filteredProjects.forEach((p) => {
      const code = p.code || p.id || 'NO_CODE';
      if (!groupMap[code]) {
        groupMap[code] = {
          code: p.code || p.id || '',
          name: p.name || '미정 프로젝트',
          client: (p as any).client || '',
          area: (p as any).area || '',
          usage: (p as any).usage || '',
          departments: [],
          lanes: [],
        };
      }

      if (p.department && !groupMap[code].departments.includes(p.department)) {
        groupMap[code].departments.push(p.department);
      }

      const pmName = (personMap.get(p.pmId) || p.pmId || '-');

      groupMap[code].lanes.push({
        projectId: p.id,
        department: p.department || '마감팀',
        pmName,
        startDate: p.startDate || '2026-09-01',
        endDate: p.endDate || '2026-09-30',
        progress: p.progress ?? 0,
        status: p.status || '진행중',
      });
    });

    const deptOrder: Record<string, number> = {
      '마감팀': 1,
      '구조팀': 2,
      '토목&조경팀': 3,
    };

    return Object.values(groupMap).map((grp) => {
      grp.lanes.sort((a, b) => ((deptOrder[a.department] ?? 99) - (deptOrder[b.department] ?? 99)));
      return grp;
    });
  }, [filteredProjects, personnel]);

  // 출력 대상 월 목록 (2026년 9월, 10월, 11월 3개월 자동 계산)
  const months = [
    { year: 2026, month: 9, days: 30, label: '2026년 9월' },
    { year: 2026, month: 10, days: 31, label: '2026년 10월' },
    { year: 2026, month: 11, days: 30, label: '2026년 11월' },
  ];

  // 한국 / 베트남 / 영국 휴일 정의 (공통 상수 동기화)
  const holidays2026 = Object.entries(HOLIDAYS_2026).reduce((acc, [key, val]) => {
    acc[key] = { label: val.country, country: val.country };
    return acc;
  }, {} as Record<string, { label: string; country: 'KR' | 'VN' | 'UK' }>);

  const handlePrint = () => {
    document.body.classList.add('modal-printing');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('modal-printing');
    }, 1200);
  };

  const handleExportExcel = () => {
    const targetDate = new Date(months[0].year, months[0].month - 1, 1);
    exportProjectsToExcel(projects, personnel, targetDate);
  };

  const nowStr = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  if (!isOpen) return null;

  return (
    <div
      id="printable-schedule-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-start py-6 px-4 print:p-0 print:bg-white print:static print:overflow-visible print:w-full print:m-0 print:block"
    >
      {/* 상단 컨트롤 바 (인쇄 시 완전 숨김) */}
      <div className="w-full max-w-[1240px] bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 mb-6 sticky top-2 z-50 print:hidden">
        {/* 좌측 타이틀 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00338d] text-white flex items-center justify-center font-black">
            <Printer size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              {currentLang === 'vi' ? 'In lịch trình dự án' : '프로젝트 통합 일정표 출력'}
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                A4 가로 최적화 · 실 진행 {groupedProjects.length}개 프로젝트
              </span>
            </h2>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>
                {departmentFilter === 'ALL'
                  ? '마감·구조·토목 전사 통합'
                  : departmentFilter}
              </span>
              <span>•</span>
              <span className="text-slate-600 dark:text-slate-300 font-medium">
                동일 프로젝트 중복 제거 및 공종별 층 통합 양식
              </span>
            </div>
          </div>
        </div>

        {/* 우측 컨트롤 도구들 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 기간 필터 토글 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setPrintMode('MONTH')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                printMode === 'MONTH'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              당월 기준 (1개월)
            </button>
            <button
              onClick={() => setPrintMode('ALL')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                printMode === 'ALL'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              전체 일정 (3개월)
            </button>
          </div>

          {/* 언어 토글 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setCurrentLang('ko')}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                currentLang === 'ko'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              한국어
            </button>
            <button
              onClick={() => setCurrentLang('vi')}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                currentLang === 'vi'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Tiếng Việt
            </button>
          </div>

          {/* 컬러 / 흑백 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
            <button
              onClick={() => setColorMode('color')}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                colorMode === 'color'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              컬러
            </button>
            <button
              onClick={() => setColorMode('mono')}
              className={`px-2.5 py-1.5 rounded-md transition-all ${
                colorMode === 'mono'
                  ? 'bg-white dark:bg-slate-600 text-[#00338d] dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              흑백
            </button>
          </div>

          {/* 엑셀 내보내기 버튼 */}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-md transition-all"
            title="엑셀 (.xlsx) 파일로 내보내기"
          >
            <FileSpreadsheet size={14} />
            엑셀 (.xlsx)
          </button>

          {/* 인쇄 및 닫기 버튼 */}
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#00338d] hover:bg-[#002266] text-white flex items-center gap-1.5 shadow-md transition-all"
          >
            <Printer size={14} />
            인쇄 / PDF 저장
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 인쇄 A4 가로 시트 컨테이너 (1일~31일 전체 무짤림 100% 핏 보장) */}
      <div className={`print-container w-full max-w-[1240px] print:max-w-none print:w-full space-y-8 print:space-y-0 ${colorMode === 'mono' ? 'grayscale' : ''}`}>
        {(printMode === 'ALL' ? months : [months[0]]).map((m, pageIdx) => {
          const mStartStr = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
          const mEndStr = `${m.year}-${String(m.month).padStart(2, '0')}-${String(m.days).padStart(2, '0')}`;

          // 해당 월에 일정이 겹치는 프로젝트만 선별 (중복 없는 통합 프로젝트 기준)
          const monthProjects = groupedProjects.filter((grp) =>
            grp.lanes.some((l) => !(l.endDate < mStartStr || l.startDate > mEndStr))
          );

          return (
            <div
              key={`${m.year}-${m.month}`}
              className="bg-white text-slate-900 rounded-xl shadow-2xl p-6 print:p-3 border border-slate-300 print:border-none w-full min-h-[780px] print:min-h-0 print:h-auto flex flex-col justify-between print:shadow-none print:m-0 page-break-sheet"
              style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
            >
              <div>
                {/* 시트 상단 헤더 */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-3">
                  <div className="flex items-center gap-4">
                    <div className="bg-[#00338d] text-white px-3 py-2 rounded-md font-black text-xs tracking-wider leading-tight text-center">
                      CONCOST<br />
                      <span className="text-[9px] text-blue-200">TECH HQ</span>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 tracking-wider uppercase">
                        PROJECT DELIVERY · MONTHLY SCHEDULE
                      </div>
                      <h1 className="text-xl font-black text-slate-900 tracking-tight">
                        {m.year}년 {m.month}월 {currentLang === 'vi' ? 'LỊCH TRÌNH DỰ ÁN TỔNG HỢP' : '프로젝트 통합 일정표'}
                      </h1>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {currentLang === 'vi'
                          ? 'Tiến độ dự án trúng thầu · Tình hình bố trí Trụ sở Hàn Quốc & VIETQS'
                          : '수주 확정 프로젝트 단계별 기간 일정 · 마감·구조·토목 협업 통합 표현'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 font-mono">
                    <div>출력 시간: {nowStr}</div>
                    <div>출력자: {currentUserName}</div>
                    <div className="font-bold text-slate-700 mt-0.5">
                      페이지: {pageIdx + 1} / {printMode === 'ALL' ? months.length : 1}
                    </div>
                  </div>
                </div>

                {/* 4대 KPI 요약 바 (중복 제거된 고유 프로젝트 기준) */}
                <div className="grid grid-cols-4 gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200 text-center text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">진행 프로젝트</span>
                    <div className="text-sm font-black text-slate-900">{monthProjects.length}개</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">정상 진행 중</span>
                    <div className="text-sm font-black text-blue-700">
                      {monthProjects.filter((g) => g.lanes.some((l) => l.status === '진행중')).length}개
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">도면변경 (REV)</span>
                    <div className="text-sm font-black text-amber-600">
                      {monthProjects.filter((g) => g.lanes.some((l) => l.status === '수정')).length}개
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">납품 완료/대기</span>
                    <div className="text-sm font-black text-emerald-700">
                      {monthProjects.filter((g) => g.lanes.every((l) => l.status === '납품' || l.progress >= 100)).length}개
                    </div>
                  </div>
                </div>

                {/* 타임라인 메인 테이블 (메인 캘린더와 동일한 1개 행 통합 양식) */}
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse table-fixed text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-black">
                        <th className="py-1.5 px-2 w-[165px] border-r border-slate-300 text-[10px]">
                          프로젝트 정보
                        </th>
                        <th className="py-1.5 px-1 w-[65px] text-center border-r border-slate-300 text-[10px]">
                          공종 / PM
                        </th>
                        {/* 1 ~ days 일자 컬럼 헤더 */}
                        {Array.from({ length: m.days }, (_, i) => i + 1).map((day) => {
                          const dateKey = `${m.year}-${String(m.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const dateObj = new Date(m.year, m.month - 1, day);
                          const dayOfWeek = dateObj.getDay(); // 0=일, 6=토
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const holiday = holidays2026[dateKey];

                          return (
                            <th
                              key={day}
                              className={`py-1 text-center font-mono text-[10px] border-r border-slate-200 ${
                                isWeekend
                                  ? 'bg-slate-200/80 text-rose-600'
                                  : holiday
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              <div>{day}</div>
                              {holiday && (
                                <div className="text-[7px] font-bold text-rose-500 scale-90">
                                  {holiday.label}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {monthProjects.map((group, gIdx) => {
                        return (
                          <tr key={`${group.code || 'grp'}-${gIdx}`} className="hover:bg-slate-50/50">
                            {/* 프로젝트 정보 (단일 행 통합) */}
                            <td className="py-1 px-1.5 w-[165px] border-r border-slate-300 align-middle">
                              <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                                <span className="text-[9px] font-mono font-black bg-slate-100 px-1 rounded border border-slate-300">
                                  {group.code}
                                </span>
                                {group.departments.map((dept) => (
                                  <span
                                    key={dept}
                                    className={`text-[8px] font-black px-1 rounded ${
                                      dept === '마감팀'
                                        ? 'bg-blue-100 text-blue-800'
                                        : dept === '구조팀'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {dept.slice(0, 2)}
                                  </span>
                                ))}
                              </div>
                              <div className="font-black text-slate-900 line-clamp-1 leading-snug text-[10px]" title={group.name}>
                                {((group.name || '').replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim()) || group.name || '프로젝트'}
                              </div>
                              {group.area && (
                                <div className="text-[8px] text-slate-500 truncate">
                                  {group.area} {group.usage && `· ${group.usage}`}
                                </div>
                              )}
                            </td>

                            {/* 담당 PM 및 공정률 (마감/구조/토목 상하 분할) */}
                            <td className="py-1 px-1 w-[65px] border-r border-slate-300 text-center align-middle">
                              <div className="flex flex-col gap-1">
                                {group.lanes.map((lane, lIdx) => (
                                  <div
                                    key={lane.projectId || lIdx}
                                    className="flex items-center justify-between text-[9px] font-bold leading-tight"
                                  >
                                    <span className="text-slate-500 font-semibold">{(lane.department || '마감').slice(0, 2)}</span>
                                    <span className="text-slate-900">{(lane.pmName || '-').split(' ')[0]}</span>
                                    <span className="text-blue-700 font-mono text-[8px]">{lane.progress ?? 0}%</span>
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* 1 ~ days 일자별 셀 & 층별 간트 바 렌더링 */}
                            {Array.from({ length: m.days }, (_, i) => i + 1).map((day) => {
                              const cellDate = new Date(m.year, m.month - 1, day);
                              const cellDateStr = `${m.year}-${String(m.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                              const holiday = holidays2026[cellDateStr];

                              return (
                                <td
                                  key={day}
                                  className={`p-0.5 border-r border-slate-200 relative align-middle ${
                                    isWeekend
                                      ? 'bg-slate-100/70'
                                      : holiday
                                      ? 'bg-rose-50/40'
                                      : ''
                                  }`}
                                >
                                  <div className="flex flex-col gap-1 w-full justify-center">
                                    {group.lanes.map((lane, lIdx) => {
                                      const isWithin = Boolean(lane.startDate && lane.endDate && cellDateStr >= lane.startDate && cellDateStr <= lane.endDate);
                                      const isStartDay = cellDateStr === lane.startDate;
                                      const isEndDay = cellDateStr === lane.endDate;

                                      const barBg =
                                        lane.department === '마감팀'
                                          ? 'bg-[#00338d] text-white'
                                          : lane.department === '구조팀'
                                          ? 'bg-[#7c3aed] text-white'
                                          : 'bg-[#059669] text-white';

                                      return (
                                        <div
                                          key={lane.projectId || lIdx}
                                          className={`h-4 w-full flex items-center justify-center text-[7px] font-bold ${
                                            isWithin ? barBg : 'bg-transparent'
                                          } ${isStartDay ? 'rounded-l-xs' : ''} ${
                                            isEndDay ? 'rounded-r-xs' : ''
                                          }`}
                                        >
                                          {isWithin && isStartDay && (
                                            <span className="scale-75 whitespace-nowrap leading-none">
                                              {(lane.department || '마감').slice(0, 2)}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 시트 하단 범례 및 주석 */}
              <div className="border-t border-slate-300 pt-2 mt-3 flex flex-col sm:flex-row items-center justify-between text-[9px] text-slate-500 gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 font-bold">
                    <span className="w-2.5 h-2.5 rounded bg-[#00338d]"></span> 마감팀
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <span className="w-2.5 h-2.5 rounded bg-[#7c3aed]"></span> 구조팀
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <span className="w-2.5 h-2.5 rounded bg-[#059669]"></span> 토목&조경팀
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>동일 프로젝트 내 공종별 층 분할 표기</span>
                </div>
                <div className="font-mono">
                  CONCOST Tech HQ Scheduling & Deliverables Cloud System
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 인쇄 전용 CSS */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm !important;
          }
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, aside, nav, button, .print-hide, .no-print {
            display: none !important;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .page-break-sheet {
            page-break-after: always;
            break-after: page;
            border: none !important;
            box-shadow: none !important;
            padding: 4mm !important;
            margin: 0 !important;
            min-height: 98vh !important;
          }
        }
      `}</style>
    </div>
  );
};
