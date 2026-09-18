import React from 'react';
import { ExternalLink, ShieldCheck, FileSearch, ArrowUpRight } from 'lucide-react';

export const QCLinkView: React.FC = () => {
  const qcUrl = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev/?drive=connected';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 타이틀 및 헤더 안내 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center">
              <FileSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                연계시스템: QC Studio 검토
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                  스튜디오 연동 정상
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                산출 성과물 및 도면 변경점 데이터를 QC Studio에 등록하여 물량 정합성 및 오류를 정밀 검토합니다.
              </p>
            </div>
          </div>
        </div>

        <a
          href={qcUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow"
        >
          <ArrowUpRight className="w-4 h-4" />
          QC Studio 시스템 새 창 열기
        </a>
      </div>

      {/* 안내 및 퀵 런처 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-3">
            1
          </div>
          <h4 className="text-sm font-bold text-slate-900 mb-1">자료실 자료 준비</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            구글 드라이브 자료실에서 공종별 폴더(<code className="bg-slate-100 px-1 py-0.5 rounded">창호_날짜_이름</code>)에 산출서 및 도면 파일을 먼저 업로드합니다.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm mb-3">
            2
          </div>
          <h4 className="text-sm font-bold text-slate-900 mb-1">QC Studio 검토 등록</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            QC Studio 접속 후 프로젝트 및 공종을 선택하여 드라이브에 등록된 산출 데이터의 정합성 검토를 시작합니다.
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm mb-3">
            3
          </div>
          <h4 className="text-sm font-bold text-slate-900 mb-1">품질 피드백 반영</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            검토 결과 리포트(누락 항목, 중복 산출, 도면 불일치)를 확인 후 프로젝트 일정표에 수정(Revision)을 반영합니다.
          </p>
        </div>
      </div>

      {/* 임베드 및 다이렉트 프레임 워크스페이스 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-900 text-white flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-xs font-mono text-slate-300 ml-2">
              https://concost-qc-studio.jjwwhhjj1116.workers.dev/?drive=connected
            </span>
          </div>
          <a
            href={qcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            전체 화면으로 접속
          </a>
        </div>
        <div className="h-[600px] w-full bg-slate-100 flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              CONCOST QC Studio 원격 검토 스테이션
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              사내 Cloudflare 보안 정책상 최적의 검토 환경을 위해 별도 브라우저 탭 또는 전체 창으로 실행하는 것을 권장합니다.
            </p>
            <a
              href={qcUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              <ArrowUpRight className="w-4 h-4 text-purple-400" />
              QC Studio 바로 접속하기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
