import React, { useState, useRef } from 'react';
import { X, Check, Upload } from 'lucide-react';
import { useProjectStore, type Department, DEPARTMENTS } from '../store/useProjectStore';

interface OrderModalProps {
  onClose: () => void;
}

export default function OrderModal({ onClose }: OrderModalProps) {
  const { addProject } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]);

  const technicalDepartments = DEPARTMENTS;

  const handleDeptToggle = (dept: Department) => {
    setSelectedDepartments(prev => 
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  const handleMockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Mocking the parsing of the excel file
      setName(file.name.replace('.xlsx', '').replace('.xls', '') + ' (자동입력)');
      setClient('아이파크현대산업개발(주)');
      setStartDate('2026-09-17');
      setEndDate('2026-10-31');
      setMemo('마감, 구조공사 / 공내역서 작성');
      setSelectedDepartments(['마감팀', '구조팀']);
      alert('수주소식 엑셀 파일 정보가 성공적으로 불러와졌습니다.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) {
      alert('필수 항목(프로젝트명, 착수일, 납품일)을 모두 입력해주세요.');
      return;
    }
    if (selectedDepartments.length === 0) {
      alert('할당할 기술본부 팀을 하나 이상 선택해주세요.');
      return;
    }

    selectedDepartments.forEach(dept => {
      addProject({
        name: `${name}`,
        code: `TK-2026-${Math.floor(Math.random() * 90000 + 10000)}`,
        startDate,
        endDate,
        status: '착수예정',
        department: dept,
        pmId: '22',
        progress: 0,
        roles: {},
        subTasks: {}
      });
    });
    
    alert('프로젝트가 선택된 각 팀의 착수예정 항목으로 전달되었습니다.');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-gray-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">수주소식 등록</h2>
          <div className="flex items-center gap-3">
            <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleMockUpload} className="hidden" />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()} 
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition-colors border border-gray-700 text-gray-300"
            >
              <Upload size={14} /> 엑셀 업로드 자동채우기
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-300 mb-2">프로젝트 명</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-primary placeholder-gray-500 transition-colors"
                  placeholder="예: 서울 국제교류복합지구 잠실 스포츠 MICE 복합공간"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-gray-300 mb-2">의뢰처 / 고객사</label>
                <input 
                  type="text" 
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-primary placeholder-gray-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">총괄 착수일</label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-primary [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">총괄 최종 납품일</label>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-primary [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-800">
              <label className="block text-sm font-semibold text-gray-300 mb-3">배정할 기술본부 팀 (다중 선택)</label>
              <div className="flex flex-wrap gap-3">
                {technicalDepartments.map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleDeptToggle(dept)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                      selectedDepartments.includes(dept) 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(0,212,255,0.2)]' 
                        : 'bg-[rgba(0,0,0,0.5)] border-gray-600 text-gray-400 hover:text-white'
                    }`}
                  >
                    {dept} {selectedDepartments.includes(dept) && '✓'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">특이사항 / 메모</label>
              <textarea 
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-600 rounded-md px-4 py-3 text-white focus:outline-none focus:border-primary placeholder-gray-500 transition-colors h-24 resize-none"
                placeholder="수주 시 요청사항이나 작업 범위 등을 입력하세요..."
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit"
              className="neon-button flex items-center gap-2 bg-primary text-black hover:bg-primary/90"
            >
              <Check size={18} /> 프로젝트 등록 및 전달
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
