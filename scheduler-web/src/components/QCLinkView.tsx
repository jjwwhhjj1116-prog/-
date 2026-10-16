import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ShieldCheck, FileSearch, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectStore } from '../store/useProjectStore';
import { useStudioStore } from '../store/useStudioStore';
import type {IntakeProject} from './IntakeListView';
import {buildProjectCatalog} from '../utils/projectCatalog';

const emptyIntakes:IntakeProject[]=[];
export const QCLinkView: React.FC<{intakeProjects?:IntakeProject[]}> = ({intakeProjects=emptyIntakes}={}) => {
  const user = useAuthStore(state => state.currentUser);
  const projects = useProjectStore(state => state.projects);
  const ready = useStudioStore(state => !!user && state.ready && state.actorId === user.id);
  const archivedProjects=useStudioStore(state=>state.archivedProjects);
  const [selection, setSelection] = useState<{ actor: typeof user; code: string; round: number } | null>(null);
  const availableProjects = useMemo(() => {
    return buildProjectCatalog(intakeProjects,projects,archivedProjects)
      .filter(project=>typeof project.code==='string'&&project.code.length>=2&&project.code.length<=40&&project.code===project.code.trim())
      .map(project=>({code:project.code,name:project.name,client:project.client||'',round:Math.min(999,Math.max(1,...project.projects.flatMap(record=>(record.revisions||[]).map(revision=>revision.round+1))))}));
  }, [intakeProjects,projects,archivedProjects]);
  const selectedCode = ready && selection && selection.actor === user && availableProjects.some(project => project.code === selection.code) ? selection.code : '';
  useEffect(() => {
    setSelection(previous => previous && (!ready || previous.actor !== user || !availableProjects.some(project => project.code === previous.code)) ? null : previous);
  }, [user, ready, availableProjects]);
  const target = new URL('https://concost-qc-studio.jjwwhhjj1116.workers.dev/');
  const selectedProject = availableProjects.find(project => project.code === selectedCode);
  const round = selection?.round ?? 1;
  const canRegister = !!selectedProject && Number.isInteger(round) && round >= 1 && round <= 999 &&
    (round === 1 ? selectedCode : `${selectedCode}-R${round}`).length <= 40 &&
    `${selectedProject.name} · ${round}차`.length <= 120 && selectedProject.client.length <= 120;
  if (selectedProject) {
    target.searchParams.set('projectCode', selectedCode);
    if (canRegister) {
      target.searchParams.set('register', '1');
      target.searchParams.set('projectName', selectedProject.name);
      target.searchParams.set('projectRound', String(round));
      target.searchParams.set('projectClient', selectedProject.client);
    }
  }
  const qcUrl = target.href;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-fadeIn">
      {/* 대형 QC Studio 바로 접속하기 단일 카드에셋 */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden text-center flex flex-col items-center justify-center gap-6">
        {/* 은은한 배경 글로우 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. 상단 아이콘 및 상태 뱃지 */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl bg-purple-600/20 border-2 border-purple-500/50 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-500/20">
            <FileSearch className="w-10 h-10" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-black shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            QC Studio 별도 서비스로 이동
          </div>
        </div>

        {/* 2. 메인 타이틀 및 핵심 안내 */}
        <div className="relative z-10 max-w-xl space-y-2.5">
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-snug">
            CONCOST QC Studio 품질 검토
          </h2>
          <p className="text-sm font-medium text-slate-300 leading-relaxed">
            산출 성과물 및 도면 변경점 데이터를 등록하여 물량 정합성, 중복 산출, 도면 불일치를 원격 검토 스테이션에서 정밀 분석합니다.
          </p>
        </div>

        {/* 3. 대형 바로 접속하기 액션 버튼 */}
        <div className="relative z-10 w-full max-w-md pt-2">
          <label className="block mb-3 text-left text-sm font-semibold text-slate-200">
            검토할 프로젝트
            <select aria-label="검토할 프로젝트" disabled={!ready} value={selectedCode} onChange={event => { const project = availableProjects.find(project => project.code === event.target.value); setSelection(user && ready && project ? { actor: user, code: project.code, round: project.round } : null); }} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 disabled:opacity-60">
              <option value="">{ready ? '프로젝트를 선택하세요' : '프로젝트 목록을 불러오고 있습니다'}</option>
              {ready && availableProjects.map(project => <option data-no-translate key={project.code} value={project.code}>{project.code} · {project.name}</option>)}
            </select>
          </label>
          {selectedProject && <label className="block mb-3 text-left text-sm font-semibold text-slate-200">
            검수 차수
            <input aria-label="검수 차수" type="number" min="1" max="999" value={round || ''} onChange={event => setSelection(previous => previous ? {...previous, round: Number(event.target.value)} : null)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" />
            <span className="mt-1 block text-xs font-normal text-slate-400">같은 차수는 기존 프로젝트를 열고, 새로운 차수는 별도로 등록합니다.</span>
          </label>}
          {selectedProject && !canRegister && <p role="alert" className="mb-3 text-sm text-amber-400">차수와 프로젝트명·코드 길이를 확인해 주세요.</p>}
          <a
            href={selectedProject && !canRegister ? undefined : qcUrl}
            aria-disabled={selectedProject && !canRegister ? true : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full py-4 px-8 bg-purple-600 hover:bg-purple-500 text-white font-black text-base rounded-2xl shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-0.5"
          >
            <span>{selectedCode ? '선택한 프로젝트 검토하기' : 'QC 스튜디오 열기'}</span>
            <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>선택한 프로젝트명과 차수를 QC에 자동 등록·연결합니다.</span>
          </div>
        </div>

        {/* 4. 시스템 접속 주소 표시 바 */}
        <div className="relative z-10 mt-2 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs text-slate-400 font-mono">
          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          <span>https://concost-qc-studio.jjwwhhjj1116.workers.dev/</span>
        </div>
      </div>
    </div>
  );
};
