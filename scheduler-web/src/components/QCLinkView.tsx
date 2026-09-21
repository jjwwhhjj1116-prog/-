import React from 'react';
import { ArrowUpRight, ShieldCheck, FileSearch, ExternalLink } from 'lucide-react';

export const QCLinkView: React.FC = () => {
  const qcUrl = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev/?drive=connected';

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
            QC Studio 원격 검토 시스템 정상 연동
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
          <a
            href={qcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full py-4 px-8 bg-purple-600 hover:bg-purple-500 text-white font-black text-base rounded-2xl shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-0.5"
          >
            <span>QC Studio 시스템 바로 접속하기</span>
            <ArrowUpRight className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>

          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Google Drive 실시간 연동 모드 자동 활성화</span>
          </div>
        </div>

        {/* 4. 시스템 접속 주소 표시 바 */}
        <div className="relative z-10 mt-2 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs text-slate-400 font-mono">
          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          <span>https://concost-qc-studio.jjwwhhjj1116.workers.dev/?drive=connected</span>
        </div>
      </div>
    </div>
  );
};
