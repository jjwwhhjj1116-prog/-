import React, { useState } from 'react';
import { X, Check, FileText, UploadCloud, MessageSquare } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { format } from 'date-fns';

interface RevisionModalProps {
  onClose: () => void;
  projectId: string;
}

export default function RevisionModal({ onClose, projectId }: RevisionModalProps) {
  const { projects, addRevision, updateProject } = useProjectStore();
  const project = projects.find(p => p.id === projectId);
  
  const [reason, setReason] = useState<'도면변경' | '거래처 요청사항 반영' | '산출오류' | string>('도면변경');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comment, setComment] = useState('');
  const [mockAttachmentName, setMockAttachmentName] = useState('');

  if (!project) return null;

  const revisions = project.revisions || [];
  const currentRound = revisions.length + 1;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    addRevision(projectId, {
      reason,
      date,
      comment,
      attachments: mockAttachmentName ? [{ name: mockAttachmentName, url: '#' }] : []
    });

    // Optionally update the project's endDate to the new revision date to reflect delays
    updateProject(projectId, { endDate: date });
    
    // Clear form
    setComment('');
    setMockAttachmentName('');
    
    // Close modal after saving
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMockAttachmentName(file.name);
      alert(`[모의 작동] ${file.name} 파일이 선택되었습니다. 실제 구글 드라이브 연동은 백엔드 API 구성이 필요합니다.`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-gray-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="text-[#bc13fe]" /> 프로젝트 수정 히스토리
            </h2>
            <p className="text-sm text-gray-400 mt-1">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 custom-scrollbar">
          {/* History List */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">수정 내역</h3>
            {revisions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4 bg-gray-900/30 rounded-lg">등록된 수정 내역이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {revisions.map((rev) => (
                  <div key={rev.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-[#bc13fe]/20 text-[#bc13fe] border border-[#bc13fe]/50 px-2 py-0.5 rounded text-xs font-bold">
                          {rev.round}차 수정
                        </span>
                        <span className="font-bold text-white">{rev.reason}</span>
                      </div>
                      <span className="text-xs text-gray-500">{rev.date}</span>
                    </div>
                    {rev.comment && (
                      <div className="mt-3 text-sm text-gray-300 bg-black/30 p-3 rounded-lg flex items-start gap-2">
                        <MessageSquare size={16} className="text-gray-500 mt-0.5 shrink-0" />
                        <p>{rev.comment}</p>
                      </div>
                    )}
                    {rev.attachments.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {rev.attachments.map((att, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs bg-gray-800 text-gray-300 px-2.5 py-1.5 rounded-md border border-gray-700">
                            <UploadCloud size={14} className="text-primary" />
                            {att.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Revision Form */}
          <div className="bg-[rgba(188,19,254,0.05)] border border-[#bc13fe]/20 p-5 rounded-xl">
            <h3 className="text-sm font-bold text-[#bc13fe] uppercase tracking-wider mb-4 flex items-center gap-2">
              <PlusCircleIcon /> {currentRound}차 수정 등록
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">수정 사유</label>
                  <select 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-2.5 text-white focus:outline-none focus:border-[#bc13fe]"
                  >
                    <option value="도면변경">도면변경</option>
                    <option value="거래처 요청사항 반영">거래처 요청사항 반영</option>
                    <option value="산출오류">산출오류</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">납품(수정) 일자</label>
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-2.5 text-white focus:outline-none focus:border-[#bc13fe] [color-scheme:dark]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">코멘트 (메모장 내용 복사 등)</label>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] min-h-[100px] resize-none"
                  placeholder="통화 내용이나 메모장 등 히스토리를 상세히 기록해주세요."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">첨부파일 (통화녹음, 추가자료 등)</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-md transition-colors flex items-center gap-2 text-sm font-bold">
                    <UploadCloud size={16} /> 파일 선택
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {mockAttachmentName ? (
                    <span className="text-sm text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                      {mockAttachmentName} 첨부됨
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">선택된 파일 없음</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">※ 첨부 시 회사 전용 구글 드라이브의 해당 프로젝트 폴더로 자동 저장됩니다. (모의 작동 중)</p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-lg font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  취소
                </button>
                <button 
                  type="submit"
                  className="bg-[#bc13fe]/20 hover:bg-[#bc13fe]/30 text-[#bc13fe] border border-[#bc13fe]/50 px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(188,19,254,0.15)]"
                >
                  <Check size={18} /> {currentRound}차 수정 등록
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlusCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 12h8"/>
      <path d="M12 8v8"/>
    </svg>
  );
}
