import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import {
  FileText,
  Plus,
  Search,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  FolderKanban,
  FileSignature,
} from 'lucide-react';

interface MinuteItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  date: string;
  author: string;
  department: string;
  attendees: string[];
  summary: string;
  actionItems: string[];
}

const initialMinutes: MinuteItem[] = [
  {
    id: 'm-1',
    projectId: 'p1',
    projectName: '[수택E구역 재개발] 건축 마감 수량산출',
    title: '마감팀 산출기준 및 창호/조적 인터페이스 사전 조정 회의',
    date: '2026-09-15',
    author: '조한빈 실장',
    department: '마감팀',
    attendees: ['조한빈 실장', '성대용 수석', '김재헌 수석', '임승주 선임'],
    summary:
      '수택E구역 지하층 방수턱 높이 기준 및 조적벽체 단열재 두께 변경건에 대한 물량산출 적용 기준 확정. 창호 프레임 디테일은 건축도면 Rev.2 기준으로 10월 5일까지 납품 협의 완료.',
    actionItems: [
      '지하 1층~2층 조적벽체 기준선 도면 마킹 (담당: 임승주 선임)',
      '창호 입면 리스트와 수량 검토 시트 동기화 (담당: 송치영 책임)',
      '1차 납품 전 내역 통합 검토회 일정 확정 (담당: 성대용 수석)',
    ],
  },
  {
    id: 'm-2',
    projectId: 'p2',
    projectName: '[과천 지식정보타운 8BL] 지하주차장 골조구조',
    title: '구조팀 슬라브/보 철근 배근 변경에 따른 긴급 물량 검토회',
    date: '2026-09-12',
    author: '장범선 실장',
    department: '구조팀',
    attendees: ['장범선 실장', '신동헌 팀장', '김채원 수석', '이정철 수석'],
    summary:
      '구조계산서 변경으로 인한 지하주차장 기둥 드롭패널 및 슬라브 HD16 철근 간격 수정사항 반영. VIET 골조팀에 변경된 단면도 긴급 전달 및 산출표 갱신 요청.',
    actionItems: [
      'B2F 주차장 슬라브 철근 물량 재집계 (담당: 김채원 수석)',
      '베트남 VIET 골조팀 산출 가이드라인 전달 (담당: 신동헌 팀장)',
    ],
  },
  {
    id: 'm-3',
    projectId: 'p3',
    projectName: '[송도 바이오단지 A-3] 토목 및 부대토목',
    title: '토목&조경팀 토공 굴착토량 및 우·오수 관로 수량 산출 착수 회의',
    date: '2026-09-16',
    author: '오승균 파트장',
    department: '토목&조경팀',
    attendees: ['오승균 파트장', '양한규 수석', '장명진 선임'],
    summary:
      '송도 부지 연약지반 개량공사 수량 산출 범위 확인. 조경 식재 및 포장 면적은 건축 마감 레벨 확정 후 2차 산출로 분리 진행 결정.',
    actionItems: [
      '토공 횡단면도 기반 절/성토량 산출 시트 작성 (담당: 장명진 선임)',
      '외부 우수맨홀 및 배수관 수량 집계 (담당: 오승균 파트장)',
    ],
  },
];

export const MinutesView: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { projects } = useProjectStore();
  const [minutes, setMinutes] = useState<MinuteItem[]>(initialMinutes);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMinute, setSelectedMinute] = useState<MinuteItem | null>(initialMinutes[0]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 신규 회의록 입력 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id || '');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newAttendees, setNewAttendees] = useState(currentUser?.name || '');
  const [newSummary, setNewSummary] = useState('');
  const [newActionItem, setNewActionItem] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const proj = projects.find((p) => p.id === newProjectId);
    const item: MinuteItem = {
      id: `m-${Date.now()}`,
      projectId: newProjectId,
      projectName: proj?.name || '공통 회의',
      title: newTitle,
      date: newDate,
      author: currentUser ? `${currentUser.name} ${currentUser.position}` : '작성자',
      department: currentUser?.department || '기술본부',
      attendees: newAttendees.split(',').map((s) => s.trim()).filter(Boolean),
      summary: newSummary,
      actionItems: newActionItem.split('\n').map((s) => s.trim()).filter(Boolean),
    };

    setMinutes([item, ...minutes]);
    setSelectedMinute(item);
    setIsCreateOpen(false);
    setNewTitle('');
    setNewSummary('');
    setNewActionItem('');
  };

  const filteredMinutes = minutes.filter(
    (m) =>
      m.title.includes(searchTerm) ||
      m.projectName.includes(searchTerm) ||
      m.author.includes(searchTerm) ||
      m.summary.includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 타이틀 및 헤더 액션 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                기술본부 프로젝트 회의록
              </h2>
              <p className="text-xs text-slate-500">
                클레임센터 스튜디오 협업 프로토콜 연계 · 공종별 회의 안건 및 실행 과제(Action Items) 기록
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="회의록 또는 프로젝트 검색..."
              className="pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none w-64"
            />
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-lg transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            회의록 작성
          </button>
        </div>
      </div>

      {/* 2열 레이아웃: 좌측 목록, 우측 상세 뷰 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 목록 */}
        <div className="lg:col-span-5 space-y-3">
          {filteredMinutes.map((item) => {
            const isSelected = selectedMinute?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedMinute(item)}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 shadow-sm ring-1 ring-blue-400'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {item.department}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {item.date}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 line-clamp-1 mb-1">{item.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                  <FolderKanban className="w-3 h-3 inline mr-1 text-slate-400" />
                  {item.projectName}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>작성자: {item.author}</span>
                  <span>참석: {item.attendees.length}명</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 상세 뷰 */}
        <div className="lg:col-span-7">
          {selectedMinute ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                    {selectedMinute.department}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {selectedMinute.date}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mb-1">{selectedMinute.title}</h2>
                <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <FolderKanban className="w-4 h-4 text-blue-600" />
                  {selectedMinute.projectName}
                </p>
              </div>

              {/* 참석자 정보 */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-start gap-2.5">
                <Users className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-700 mr-2">참석자:</span>
                  <span className="text-xs text-slate-600">
                    {selectedMinute.attendees.join(', ')}
                  </span>
                  <span className="text-xs text-slate-400 ml-3">
                    (작성자: {selectedMinute.author})
                  </span>
                </div>
              </div>

              {/* 회의 주요 요약 */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  회의 주요 안건 및 협의 내용
                </h4>
                <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200 text-slate-800 text-sm leading-relaxed whitespace-pre-line">
                  {selectedMinute.summary}
                </div>
              </div>

              {/* 결정사항 및 액션 아이템 */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  실행 과제 및 결정 사항 (Action Items)
                </h4>
                <div className="space-y-2">
                  {selectedMinute.actionItems.map((act, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-950 font-medium"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{act}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400 text-xs">
              회의록을 선택해 주세요.
            </div>
          )}
        </div>
      </div>

      {/* 회의록 작성 모달 */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-blue-600" />
              신규 프로젝트 회의록 등록
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  대상 프로젝트
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.department}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">회의 제목</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 마감팀 조적·창호 인터페이스 상세 산출 회의"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">회의 일자</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    참석자 명단 (쉼표 구분)
                  </label>
                  <input
                    type="text"
                    value={newAttendees}
                    onChange={(e) => setNewAttendees(e.target.value)}
                    placeholder="예: 조한빈 실장, 김재헌 수석"
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  회의 주요 요약
                </label>
                <textarea
                  rows={4}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="회의에서 협의된 공종별 산출 기준 및 쟁점사항을 기록하세요."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  결정사항 및 실행과제 (줄바꿈으로 구분)
                </label>
                <textarea
                  rows={3}
                  value={newActionItem}
                  onChange={(e) => setNewActionItem(e.target.value)}
                  placeholder="예: 지하 1층 조적 도면 재검토 (담당: 임승주)&#10;창호 리스트 검토 (담당: 송치영)"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs text-white bg-blue-600 hover:bg-blue-700 font-semibold rounded-lg"
                >
                  회의록 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
