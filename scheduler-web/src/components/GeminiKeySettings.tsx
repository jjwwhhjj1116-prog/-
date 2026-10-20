import {useEffect,useState} from 'react';
import {KeyRound,ShieldCheck} from 'lucide-react';

export function GeminiKeySettings(){
 const [configured,setConfigured]=useState(false),[source,setSource]=useState(''),[model,setModel]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{void fetch('/api/business-cards/settings',{credentials:'same-origin'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'설정을 읽지 못했습니다.');setConfigured(data.configured===true);setSource(data.source);setModel(data.model);}).catch(cause=>setMessage(cause.message));},[]);
 const save=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setMessage('');try{const response=await fetch('/api/business-cards/settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});const data=await response.json();if(!response.ok)throw new Error(data.error||'API 키 저장에 실패했습니다.');setConfigured(true);setSource('ADMIN');setKey('');setMessage('Gemini API 키를 암호화해 저장했습니다. 명함 등록 화면에서 인식을 시험해 주세요.');}catch(cause){setMessage((cause as Error).message);}finally{setBusy(false);}};
 return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 md:p-7 space-y-4">
  <div className="flex items-center gap-3"><KeyRound size={22} className="text-blue-600"/><div><h2 className="font-black text-slate-900 dark:text-white">명함 인식 · Gemini API 키</h2><p className="text-xs text-slate-600 dark:text-slate-300">관리자만 변경할 수 있으며 명함 인식 요청은 서버에서 처리합니다.</p></div></div>
  <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><ShieldCheck size={17} className="text-emerald-600"/>{configured?`연결 설정됨 · ${source==='ADMIN'?'관리자 등록 키':'서버 설정 키'}`:'API 키가 아직 설정되지 않았습니다.'}{model?` · 모델 ${model}`:''}</p>
  <form onSubmit={event=>void save(event)} className="space-y-3 max-w-xl"><label className="block text-sm font-bold text-slate-800 dark:text-slate-100">새 Gemini API 키<input type="password" autoComplete="new-password" value={key} onChange={event=>setKey(event.target.value.trim())} placeholder="새 키를 입력하면 기존 설정을 교체합니다" className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"/></label><p className="text-xs text-slate-500">저장된 키의 원문은 화면에 다시 표시하지 않습니다. 입력값은 서버에서 암호화해 보관합니다.</p><button type="submit" disabled={busy||!key} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy?'저장 중…':'Gemini API 키 저장'}</button></form>
  {message&&<p role="status" className="text-sm text-blue-800 dark:text-blue-200">{message}</p>}
 </section>;
}
