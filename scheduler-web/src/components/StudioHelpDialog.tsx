import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { releaseNotes } from './studioHelpState';

export type HelpTab = 'guide' | 'updates';
export type HelpMenu = '프로젝트 접수목록' | '프로젝트 일정표' | '할 일' | '업무일지' | '주간 업무·야근 보고';

type Language = 'ko' | 'vi';
type GuideStep = { title: string; summary: string; actions: string[]; menu: HelpMenu; menuLabel: string };

const guideSteps: Record<Language, GuideStep[]> = {
  ko: [
    { title: '프로젝트와 일정 찾기', summary: '프로젝트 번호나 이름으로 찾고, 팀·개인 일정에서 누가 언제 일하는지 확인하세요.', actions: ['좌측 프로젝트 접수목록에서 프로젝트를 찾습니다.', '프로젝트 일정표에서 검색하거나 개인/팀별 캘린더를 엽니다.'], menu: '프로젝트 일정표', menuLabel: '일정표 열기' },
    { title: '오늘·내일 할 일 확인', summary: '배정된 업무를 날짜별로 보고 해당 업무의 일지로 바로 이동할 수 있습니다.', actions: ['좌측 할 일 (TO DO)을 펼쳐 오늘·내일 할 일을 누릅니다.', '업무 아래 이 업무의 업무일지 열기를 누릅니다.'], menu: '할 일', menuLabel: '오늘·내일 할 일 열기' },
    { title: '업무일지 작성과 저장', summary: '보고 날짜·프로젝트·역할을 확인하고 결과를 기록하세요.', actions: ['업무 결과와 내일 업무계획을 입력한 뒤 임시 저장 또는 저장을 누릅니다. 입력만으로는 저장되지 않습니다.', '평일 오후 5시 자동 업무보고는 배정 업무를 기준으로 실행됩니다. 결재 상태는 업무일지에서 확인하세요.'], menu: '업무일지', menuLabel: '업무일지 열기' },
    { title: '야근·주말 출근·일정 연장', summary: '업무일지의 신청 탭에서 프로젝트와 날짜·시간·사유를 적어 요청합니다.', actions: ['야근 신청, 주말 출근 신청 또는 일정 연장 요청 탭을 선택합니다.', '요청을 제출하고 승인 알림을 확인합니다. 승인된 일정은 관련 달력에서 확인할 수 있습니다.'], menu: '업무일지', menuLabel: '신청 화면 열기' },
    { title: '납품 후 보완 일정', summary: '납품한 프로젝트를 다시 수정할 때 보완 일정을 등록하세요.', actions: ['프로젝트 일정표의 프로젝트 보완 일정 등록을 누릅니다.', '납품한 프로젝트·수정 날짜·사유를 등록하면 일정이 바로 확정되고 팀장·실장에게 보고됩니다. 달력에서는 주황색으로 표시됩니다.'], menu: '프로젝트 일정표', menuLabel: '보완 일정 등록 위치 보기' },
    { title: '주간보고와 알림 확인', summary: '개인·팀의 업무일지와 승인된 야근·주말 기록을 한 주 단위로 확인합니다.', actions: ['좌측 주간 업무·야근 보고에서 기간과 항목을 확인합니다.', '결재 담당자는 상단 알림에서 도착한 보고를 열고 내용을 확인합니다.'], menu: '주간 업무·야근 보고', menuLabel: '주간보고 열기' },
  ],
  vi: [
    { title: 'Tìm dự án và lịch', summary: 'Tìm theo mã hoặc tên dự án; xem ai làm việc và khi nào trên lịch nhóm/cá nhân.', actions: ['Mở Danh sách tiếp nhận dự án ở thanh bên trái.', 'Tìm trên Lịch dự án hoặc mở lịch cá nhân/nhóm.'], menu: '프로젝트 일정표', menuLabel: 'Mở lịch dự án' },
    { title: 'Xem việc hôm nay và ngày mai', summary: 'Xem việc được giao theo ngày và mở nhật ký của đúng công việc.', actions: ['Mở TO DO ở thanh bên rồi chọn Việc hôm nay · ngày mai.', 'Chọn Mở nhật ký công việc trên dòng việc cần xem.'], menu: '할 일', menuLabel: 'Mở việc hôm nay' },
    { title: 'Viết và lưu nhật ký', summary: 'Kiểm tra ngày báo cáo, dự án và vai trò trước khi ghi kết quả.', actions: ['Nhập kết quả và kế hoạch ngày mai rồi chọn Lưu tạm hoặc Lưu. Chỉ nhập nội dung sẽ không tự lưu.', 'Báo cáo tự động lúc 17:00 ngày làm việc dùng các việc được giao. Xem trạng thái duyệt trong nhật ký.'], menu: '업무일지', menuLabel: 'Mở nhật ký' },
    { title: 'Làm thêm, cuối tuần, gia hạn', summary: 'Gửi yêu cầu trong các thẻ của Nhật ký công việc.', actions: ['Chọn thẻ Làm thêm, Làm việc cuối tuần hoặc Gia hạn lịch.', 'Nhập dự án, ngày, giờ và lý do; sau khi được duyệt, kiểm tra thông báo và lịch liên quan.'], menu: '업무일지', menuLabel: 'Mở màn hình yêu cầu' },
    { title: 'Lịch sửa sau bàn giao', summary: 'Đăng ký lịch sửa cho dự án đã bàn giao.', actions: ['Trong Lịch dự án, chọn Đăng ký lịch sửa dự án.', 'Chọn dự án, ngày và lý do. Lịch được xác nhận ngay, báo cho trưởng nhóm và trưởng bộ phận, và hiển thị màu cam.'], menu: '프로젝트 일정표', menuLabel: 'Xem nơi đăng ký' },
    { title: 'Báo cáo tuần và thông báo', summary: 'Xem nhật ký và các ca làm thêm/cuối tuần đã duyệt theo tuần.', actions: ['Mở Báo cáo công việc · làm thêm hàng tuần ở thanh bên.', 'Người duyệt mở thông báo ở đầu trang để xem báo cáo đã gửi.'], menu: '주간 업무·야근 보고', menuLabel: 'Mở báo cáo tuần' },
  ],
};

export function StudioHelpDialog({ initialTab, language, onClose, onOpenMenu }: {
  initialTab: HelpTab;
  language: Language;
  onClose: () => void;
  onOpenMenu: (menu: HelpMenu) => void;
}) {
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const [stepIndex, setStepIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const steps = guideSteps[language];
  const step = steps[stepIndex];
  const vi = language === 'vi';

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus(); };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="studio-help-title" onKeyDown={onKeyDown} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-7 dark:border-slate-700">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00338d] text-white"><BookOpen size={20}/></span>
          <div><h2 id="studio-help-title" className="text-lg font-extrabold">{vi ? 'Hướng dẫn sử dụng · Cập nhật' : '사용 안내 · 업데이트'}</h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{vi ? 'Tìm hiểu cách làm việc và những thay đổi mới.' : '실제 메뉴로 이동하며 사용법과 변경 내용을 확인하세요.'}</p></div>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={vi ? 'Đóng hướng dẫn' : '사용 안내 닫기'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300 dark:hover:bg-slate-800"><X size={20}/></button>
      </div>
      <div role="tablist" aria-label={vi ? 'Nội dung trợ giúp' : '안내 종류'} className="flex gap-1 border-b border-slate-200 px-5 pt-3 sm:px-7 dark:border-slate-700">
        <button type="button" role="tab" aria-selected={tab === 'guide'} onClick={() => setTab('guide')} className={`rounded-t-lg px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${tab === 'guide' ? 'bg-blue-50 text-[#00338d] dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{vi ? 'Hướng dẫn sử dụng' : '사용 안내'}</button>
        <button type="button" role="tab" aria-selected={tab === 'updates'} onClick={() => setTab('updates')} className={`rounded-t-lg px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${tab === 'updates' ? 'bg-blue-50 text-[#00338d] dark:bg-blue-950 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{vi ? 'Cập nhật' : '업데이트'} <span className="ml-1 text-xs opacity-75">{releaseNotes.length}</span></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7" role="tabpanel">
        {tab === 'guide' ? <>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300"><span>{vi ? 'Bắt đầu nhanh · khoảng 2 phút' : '빠른 시작 · 약 2분'}</span><span>{stepIndex + 1} / {steps.length}</span></div>
          <div className="mt-3 flex gap-1.5" aria-label={vi ? 'Các bước hướng dẫn' : '안내 단계'}>{steps.map((item, index) => <button key={item.title} type="button" aria-label={`${vi ? 'Bước' : '단계'} ${index + 1}: ${item.title}`} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => setStepIndex(index)} className={`h-2 flex-1 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${index === stepIndex ? 'bg-[#00338d]' : 'bg-slate-200 hover:bg-blue-200 dark:bg-slate-700 dark:hover:bg-blue-700'}`}/>)}</div>
          <div aria-live="polite" className="mt-7"><h3 className="text-xl font-extrabold tracking-tight">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{step.summary}</p><ol className="mt-5 space-y-3">{step.actions.map((action, index) => <li key={action} className="flex gap-3 text-sm leading-6"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-[#00338d] dark:bg-blue-900 dark:text-blue-200">{index + 1}</span><span>{action}</span></li>)}</ol></div>
          <button type="button" onClick={() => onOpenMenu(step.menu)} className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#00338d] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{step.menuLabel}<ArrowRight size={15}/></button>
        </> : <div aria-live="polite"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><CalendarDays size={17} className="text-[#00338d] dark:text-blue-300"/>{vi ? 'Thay đổi theo ngày phát hành' : '배포 날짜별 변경 내용'}</div><div className="mt-5 space-y-6">{releaseNotes.map((note, index) => <section key={note.id} className="border-t border-slate-200 pt-4 first:border-0 first:pt-0 dark:border-slate-700"><div className="flex items-center gap-2"><h3 className="font-bold tabular-nums">{note.date}</h3>{index === 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800 dark:bg-orange-900 dark:text-orange-200">{vi ? 'Mới nhất' : '최신'}</span>}</div><ul className="mt-2 space-y-2">{note[language].map(item => <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700 dark:text-slate-200"><Check size={16} className="mt-1 shrink-0 text-emerald-700 dark:text-emerald-400"/><span>{item}</span></li>)}</ul></section>)}</div></div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-7 dark:border-slate-700"><p className="text-xs text-slate-600 dark:text-slate-300">{vi ? 'Có thể mở lại từ phần đầu trang.' : '닫아도 상단 버튼에서 언제든 다시 볼 수 있습니다.'}</p><div className="flex items-center gap-2">{tab === 'guide' && stepIndex > 0 && <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"><ChevronLeft size={15}/>{vi ? 'Trước' : '이전'}</button>}{tab === 'guide' && stepIndex < steps.length - 1 ? <button type="button" onClick={() => setStepIndex(stepIndex + 1)} className="inline-flex items-center gap-1 rounded-lg bg-[#00338d] px-3 py-2 text-sm font-bold text-white hover:bg-blue-800">{vi ? 'Tiếp' : '다음'}<ChevronRight size={15}/></button> : <button type="button" onClick={onClose} className="rounded-lg bg-[#00338d] px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">{vi ? 'Xong' : '확인'}</button>}</div></div>
    </div>
  </div>;
}
