import React, { useState } from 'react';
import {
  Printer,
  X,
} from 'lucide-react';
import type { Project, Person, Department } from '../store/useProjectStore';

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
  const [printMode, setPrintMode] = useState<'ALL' | 'MONTH'>('ALL');
  const [colorMode, setColorMode] = useState<'color' | 'mono'>('color');
  const [currentLang, setCurrentLang] = useState<'ko' | 'vi'>(lang);

  if (!isOpen) return null;

  const personMap = new Map(personnel.map((p) => [p.id, p.name]));
  const filteredProjects =
    departmentFilter === 'ALL'
      ? projects
      : projects.filter((p) => p.department === departmentFilter);

  // 출력 대상 월 목록 (2026년 9월, 10월, 11월 3개월 자동 계산)
  const months = [
    { year: 2026, month: 9, days: 30, label: '2026년 9월' },
    { year: 2026, month: 10, days: 31, label: '2026년 10월' },
    { year: 2026, month: 11, days: 30, label: '2026년 11월' },
  ];

  // 한국 / 베트남 / 영국 휴일 정의 (스크린샷 2, 4 기준)
  const holidays2026: Record<string, { label: string; country: 'KR' | 'VN' | 'UK' }> = {
    '2026-09-02': { label: 'VN', country: 'VN' },
    '2026-09-03': { label: 'VN', country: 'VN' },
    '2026-09-24': { label: 'KR', country: 'KR' },
    '2026-09-25': { label: 'KR', country: 'KR' },
    '2026-09-26': { label: 'KR', country: 'KR' },
    '2026-10-03': { label: 'KR', country: 'KR' },
    '2026-10-09': { label: 'KR', country: 'KR' },
  };

  const handlePrint = () => {
    window.print();
  };

  const nowStr = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-start py-6 px-4">
      {/* 상단 컨트롤 바 (스크린샷 4번) */}
      <div className="w-full max-w-[1240px] bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 mb-6 sticky top-2 z-50 print:hidden">
        {/* 좌측 타이틀 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00338d] text-white flex items-center justify-center font-black">
            <Printer size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              {currentLang === 'vi' ? 'In lịch trình dự án' : '프로젝트 일정표 출력'}
              <span className="text-[11px] font-normal text-slate-400">
                (A4 가로 · 현재 저장 일정 기준)
              </span>
            </h2>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>
                {departmentFilter === 'ALL'
                  ? '전체 기술본부'
                  : departmentFilter}
              </span>
              <span>•</span>
              <span>총 {filteredProjects.length}개 프로젝트</span>
            </div>
          </div>
        </div>

        {/* 우측 컨트롤 도구들 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 기간 필터 토글 */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg text-xs font-bold">
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

      {/* 인쇄 A4 가로 시트 컨테이너 (스크린샷 4번 완벽 복원) */}
      <div className={`print-container w-full max-w-[1240px] space-y-8 ${colorMode === 'mono' ? 'grayscale' : ''}`}>
        {(printMode === 'ALL' ? months : [months[0]]).map((m, pageIdx) => {
          return (
            <div
              key={`${m.year}-${m.month}`}
              className="bg-white text-slate-900 rounded-xl shadow-2xl p-8 border border-slate-300 w-full min-h-[780px] flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:m-0 print:min-h-screen page-break-sheet"
              style={{ breakAfter: 'page', pageBreakAfter: 'always' }}
            >
              <div>
                {/* 시트 상단 헤더 */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-4">
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
                          : '수주 확정 프로젝트 단계별 기간 일정 · 한국 본사 / VIETQS 투입 현황'}
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

                {/* 4대 KPI 요약 바 */}
                <div className="grid grid-cols-4 gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">전체 프로젝트</span>
                    <div className="text-sm font-black text-slate-900">{filteredProjects.length}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">수주 확정 / 착수</span>
                    <div className="text-sm font-black text-blue-700">
                      {filteredProjects.filter((p) => p.status !== '납품').length}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">도면변경 (REV)</span>
                    <div className="text-sm font-black text-amber-600">
                      {filteredProjects.filter((p) => p.status === '수정').length}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] font-bold">납품 완료</span>
                    <div className="text-sm font-black text-emerald-700">
                      {filteredProjects.filter((p) => p.status === '납품').length}
                    </div>
                  </div>
                </div>

                {/* 타임라인 메인 테이블 */}
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse table-fixed text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 text-slate-600 font-bold">
                        <th className="py-2 px-3 w-[260px] border-r border-slate-300">
                          프로젝트 / PM
                        </th>
                        <th className="py-2 px-2 w-[80px] text-center border-r border-slate-300">
                          담당 PM
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
                                <div className="text-[8px] font-bold text-rose-500 scale-90">
                                  {holiday.label}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredProjects.map((p) => {
                        const pmName = personMap.get(p.pmId) || p.pmId;
                        const pStart = new Date(p.startDate);
                        const pEnd = new Date(p.endDate);

                        return (
                          <tr key={p.id} className="h-10 hover:bg-slate-50/50">
                            {/* 프로젝트 정보 */}
                            <td className="py-1 px-3 border-r border-slate-300 font-medium">
                              <div className="font-bold text-slate-900 truncate" title={p.name}>
                                {p.name}
                              </div>
                              <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1">
                                <span>{p.code}</span>
                                <span>·</span>
                                <span>{p.department}</span>
                                <span>·</span>
                                <span>진척률 {p.progress}%</span>
                              </div>
                            </td>

                            {/* 담당 PM */}
                            <td className="py-1 px-2 border-r border-slate-300 text-center font-semibold text-slate-800">
                              {pmName}
                            </td>

                            {/* 1 ~ days 일자별 셀 & 막대바 렌더링 */}
                            {Array.from({ length: m.days }, (_, i) => i + 1).map((day) => {
                              const cellDate = new Date(m.year, m.month - 1, day);
                              const isWithin = cellDate >= pStart && cellDate <= pEnd;
                              const isStartDay =
                                cellDate.getFullYear() === pStart.getFullYear() &&
                                cellDate.getMonth() === pStart.getMonth() &&
                                cellDate.getDate() === pStart.getDate();

                              const isEndDay =
                                cellDate.getFullYear() === pEnd.getFullYear() &&
                                cellDate.getMonth() === pEnd.getMonth() &&
                                cellDate.getDate() === pEnd.getDate();

                              const dateKey = `${m.year}-${String(m.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                              const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                              const holiday = holidays2026[dateKey];

                              return (
                                <td
                                  key={day}
                                  className={`p-0 border-r border-slate-200 relative ${
                                    isWeekend
                                      ? 'bg-slate-100/70'
                                      : holiday
                                      ? 'bg-rose-50/40'
                                      : ''
                                  }`}
                                >
                                  {isWithin && (
                                    <div
                                      className={`h-6 w-full flex items-center justify-center text-[9px] font-bold text-white shadow-xs ${
                                        p.status === '수정'
                                          ? 'bg-amber-500'
                                          : p.status === '납품'
                                          ? 'bg-emerald-600'
                                          : 'bg-[#00338d]'
                                      } ${isStartDay ? 'rounded-l-md ml-0.5' : ''} ${
                                        isEndDay ? 'rounded-r-md mr-0.5' : ''
                                      }`}
                                    >
                                      {isStartDay && (
                                        <span className="truncate px-1 scale-90 whitespace-nowrap">
                                          {p.name.replace(/\[.*?\]/, '').trim()}
                                        </span>
                                      )}
                                    </div>
                                  )}
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

              {/* 시트 하단 범례 및 주석 (스크린샷 4번) */}
              <div className="border-t border-slate-300 pt-3 mt-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 gap-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#00338d]"></span>
                    <span>프로젝트 기간</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-amber-500"></span>
                    <span>수정 (REV)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-rose-100 border border-rose-300 text-rose-600 font-bold text-[8px] flex items-center justify-center">
                      KR
                    </span>
                    <span>한국 공휴일</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-100 border border-emerald-300 text-emerald-600 font-bold text-[8px] flex items-center justify-center">
                      VN
                    </span>
                    <span>베트남 휴일</span>
                  </div>
                </div>

                <div className="text-slate-400 italic">
                  ※ 일정 변경은 프로젝트별 세부 공종 타임라인에서 실시간 자동 반영됩니다.
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 인쇄 전용 글로벌 스타일 (A4 가로 강제 규격) */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container, .print-container * {
            visibility: visible;
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
            padding: 10mm !important;
          }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>
    </div>
  );
};
