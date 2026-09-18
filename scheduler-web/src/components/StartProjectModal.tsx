import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { useProjectStore, type ProjectRole, type RoleName, ROLE_NAMES } from '../store/useProjectStore';

interface StartProjectModalProps {
  onClose: () => void;
  projectId: string;
}

export default function StartProjectModal({ onClose, projectId }: StartProjectModalProps) {
  const { personnel, updateProject, projects } = useProjectStore();
  const project = projects.find(p => p.id === projectId);
  
  if (!project) return null;

  // Initialize roles from the project (if any already exist) or empty object.
  // We will store the full ProjectRole objects locally before submitting.
  const [localRoles, setLocalRoles] = useState<Partial<Record<RoleName, ProjectRole>>>(project.roles || {});

  const handleRoleChange = (role: RoleName, field: keyof ProjectRole, value: string) => {
    setLocalRoles(prev => {
      const newRoles = { ...prev };
      if (field === 'personId' && value === '') {
        // If unassigned, remove the role entry
        delete newRoles[role];
      } else {
        // If assigning for the first time, initialize with project's default dates
        if (!newRoles[role]) {
          newRoles[role] = {
            personId: '',
            startDate: project.startDate,
            endDate: project.endDate
          };
        }
        // Update the specific field
        newRoles[role] = {
          ...newRoles[role]!,
          [field]: value
        };
      }
      return newRoles;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Ensure that any assigned role has valid dates
    const hasInvalidDates = Object.values(localRoles).some(
      r => r && (!r.startDate || !r.endDate)
    );
    if (hasInvalidDates) {
      alert('배정된 인원의 투입일과 종료일을 모두 입력해주세요.');
      return;
    }

    updateProject(projectId, {
      status: '진행중',
      roles: localRoles
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-gray-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">프로젝트 착수 및 인원 배정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6 bg-[rgba(0,0,0,0.3)] p-4 rounded-xl border border-gray-800">
            <h3 className="text-lg font-bold text-white mb-2">{project.name}</h3>
            <p className="text-sm text-gray-400">
              총괄 일정: {project.startDate} ~ {project.endDate} | 배정 부서: <span className="text-primary font-bold">{project.department}</span>
            </p>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-bold text-gray-300 mb-4">공종별 투입 인원 및 개별 일정 (Role & Schedule)</label>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-12 gap-4 px-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                <div className="col-span-2">공종 (Role)</div>
                <div className="col-span-4">담당자 (Person)</div>
                <div className="col-span-3">투입일 (Start)</div>
                <div className="col-span-3">종료일 (End)</div>
              </div>
              {ROLE_NAMES.map(role => {
                const roleData = localRoles[role];
                return (
                  <div key={role} className="grid grid-cols-12 gap-4 items-center bg-[rgba(0,0,0,0.2)] p-2 rounded-lg border border-gray-800/50 hover:border-gray-700 transition-colors">
                    <div className="col-span-2 flex items-center gap-2 px-2">
                      <span className="text-sm font-bold text-gray-300">{role}</span>
                    </div>
                    <div className="col-span-4">
                      <select
                        value={roleData?.personId || ''}
                        onChange={(e) => handleRoleChange(role, 'personId', e.target.value)}
                        className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-700 rounded text-sm px-3 py-2 text-white focus:outline-none focus:border-primary"
                      >
                        <option value="">-- 미배정 --</option>
                        {personnel.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.team})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input 
                        type="date"
                        value={roleData?.startDate || ''}
                        onChange={(e) => handleRoleChange(role, 'startDate', e.target.value)}
                        disabled={!roleData?.personId}
                        className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary disabled:opacity-50 [color-scheme:dark]"
                      />
                    </div>
                    <div className="col-span-3">
                      <input 
                        type="date"
                        value={roleData?.endDate || ''}
                        onChange={(e) => handleRoleChange(role, 'endDate', e.target.value)}
                        disabled={!roleData?.personId}
                        className="w-full bg-[rgba(0,0,0,0.5)] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-primary disabled:opacity-50 [color-scheme:dark]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button 
              type="button" 
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit"
              className="neon-button flex items-center gap-2"
            >
              <Check size={18} /> 확정 및 착수 (Start)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
