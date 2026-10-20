import {useEffect,useRef,useState} from 'react';
import {Camera,CheckCircle2,Link2,RefreshCw,Smartphone} from 'lucide-react';
import QRCode from 'qrcode';
import {optimizeCardImage} from './businessCardImage';

type Transfer={token:string;expiresAt:string};
type TransferStatus={status:'PENDING'|'UPLOADED';originalName:string|null;expiresAt:string};
const endpoint='/api/business-cards/transfers';
async function json<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...init});
 const body=await response.json().catch(()=>({error:'서버 응답을 읽지 못했습니다.'}));
 if(!response.ok)throw new Error(body.error||'휴대폰 촬영 연결에 실패했습니다.');
 return body as T;
}

export function BusinessCardTransferPanel({onReceive}:{onReceive:(file:File)=>Promise<boolean>}){
 const [transfer,setTransfer]=useState<Transfer|null>(null),[qr,setQr]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const receiving=useRef(false);
 const onReceiveRef=useRef(onReceive);
 useEffect(()=>{onReceiveRef.current=onReceive;},[onReceive]);
 const start=async()=>{setBusy(true);setError('');setNotice('');try{
  if(transfer)await json(`${endpoint}/${transfer.token}`,{method:'DELETE'}).catch(()=>undefined);
  const created=await json<Transfer>(endpoint,{method:'POST'});
  const link=`${location.origin}/?cardCapture=${created.token}`;
  const encoded=await QRCode.toDataURL(link,{width:220,margin:2,errorCorrectionLevel:'M'});
  setTransfer(created);setQr(encoded);
 }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}};
 const cancel=async()=>{const old=transfer;setTransfer(null);setQr('');setNotice('');if(old)await json(`${endpoint}/${old.token}`,{method:'DELETE'}).catch(()=>undefined);};
 useEffect(()=>{if(!transfer)return;let alive=true;
  const poll=async()=>{if(receiving.current)return;try{
   const state=await json<TransferStatus>(`${endpoint}/${transfer.token}`);
   if(!alive||state.status!=='UPLOADED')return;
   receiving.current=true;
   const response=await fetch(`${endpoint}/${transfer.token}/image`,{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw new Error('도착한 사진을 내려받지 못했습니다. 다시 시도해 주세요.');
   const file=new File([await response.blob()],state.originalName||'명함.jpg',{type:response.headers.get('content-type')||'image/jpeg'});
   if(!alive)return;
   if(!await onReceiveRef.current(file))throw new Error('도착한 사진을 열지 못했습니다. 다시 촬영해 주세요.');
   await json(`${endpoint}/${transfer.token}`,{method:'DELETE'});
   if(alive){setTransfer(null);setQr('');setNotice('휴대폰 사진이 PC에 도착했습니다. Gemini 인식을 누르고 내용을 확인해 주세요.');}
  }catch(cause){if(alive){setError((cause as Error).message);if((cause as Error).message.includes('만료')){setTransfer(null);setQr('');}}}finally{receiving.current=false;}};
  const timer=window.setInterval(()=>void poll(),3000);void poll();
  return()=>{alive=false;window.clearInterval(timer);};
 },[transfer]);
 return <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm space-y-3">
  <div className="flex items-center gap-2 font-bold text-blue-950"><Smartphone size={18}/>휴대폰으로 찍어 PC에서 등록</div>
  <p className="text-xs text-slate-700">PC에서 QR을 만들고 휴대폰으로 스캔하세요. 휴대폰에는 같은 기술본부 계정으로 로그인해야 합니다. 사진 전송 후 PC에서 인식 결과를 확인·수정합니다.</p>
  {!transfer?<button type="button" disabled={busy} onClick={()=>void start()} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-50 flex items-center gap-2"><Link2 size={15}/>휴대폰 촬영 QR 만들기</button>:<div className="flex flex-wrap items-center gap-4"><img src={qr} width="220" height="220" alt="휴대폰 명함 촬영 페이지로 가는 일회용 QR" className="rounded-lg border bg-white p-1"/><div className="space-y-2"><p className="font-bold text-blue-900">휴대폰 사진을 기다리는 중…</p><p className="text-xs text-slate-600">이 연결은 {new Date(transfer.expiresAt).toLocaleTimeString('ko-KR')}까지 유효합니다.</p><button type="button" onClick={()=>void cancel()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">연결 닫기</button></div></div>}
  {notice&&<p role="status" className="flex items-center gap-1 text-emerald-800"><CheckCircle2 size={15}/>{notice}</p>}{error&&<p role="alert" className="text-rose-700">{error} {transfer&&<button type="button" onClick={()=>void start()} className="underline font-bold inline-flex items-center gap-1"><RefreshCw size={13}/>새 QR 만들기</button>}</p>}
 </div>;
}

export function BusinessCardCapture({token,actorName}:{token:string;actorName:string}){
 const [ready,setReady]=useState(false),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 useEffect(()=>{window.history.replaceState({},'',window.location.pathname);},[]);
 useEffect(()=>{let alive=true;void json<TransferStatus>(`${endpoint}/${token}`).then(result=>{if(alive){setReady(result.status==='PENDING');if(result.status!=='PENDING')setError('이미 사진을 보낸 연결입니다. PC를 확인해 주세요.');}}).catch(cause=>{if(alive)setError((cause as Error).message);});return()=>{alive=false;};},[token]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 const choose=async(selected:File|null)=>{setFile(null);setPreview('');setError('');if(!selected)return;setBusy(true);try{const optimized=await optimizeCardImage(selected,900_000);setFile(optimized);setPreview(URL.createObjectURL(optimized));}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}};
 const send=async()=>{if(!file)return;setBusy(true);setError('');try{const body=new FormData();body.set('file',file);await json(`${endpoint}/${token}/upload`,{method:'POST',body});setSent(true);}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}};
 return <main className="min-h-screen bg-slate-50 p-4 text-slate-900"><div className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-blue-800"><Camera size={24}/><h1 className="text-xl font-black">명함 촬영 → PC로 보내기</h1></div><p className="text-sm text-slate-600">로그인: {actorName} · PC와 같은 계정이어야 합니다. 최종 저장은 PC에서 내용을 확인한 뒤 진행합니다.</p>
  {sent?<p role="status" className="rounded-xl bg-emerald-50 p-5 font-bold text-emerald-900">사진을 PC로 보냈습니다. PC 화면에서 인식 결과를 확인해 주세요.</p>:<><div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-3 text-blue-900">{preview?<img src={preview} alt="보낼 명함 사진" className="max-h-80 object-contain"/>:<><Camera size={34}/><span className="font-bold">명함 앞면이 잘 보이게 촬영해 주세요</span></>}</div><div className="grid grid-cols-2 gap-2"><label className="cursor-pointer rounded-lg bg-blue-100 px-3 py-2 text-center text-sm font-bold text-blue-900"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={!ready||busy} onChange={event=>void choose(event.target.files?.[0]||null)}/>카메라로 찍기</label><label className="cursor-pointer rounded-lg border border-blue-200 px-3 py-2 text-center text-sm font-bold text-blue-900"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!ready||busy} onChange={event=>void choose(event.target.files?.[0]||null)}/>기존 사진 선택</label></div><button type="button" disabled={!ready||!file||busy} onClick={()=>void send()} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-40">{busy?'사진 준비·전송 중…':'PC로 사진 보내기'}</button></>}
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<p className="text-xs text-slate-500">사진은 전송 후 최대 10분간 암호화해 임시 보관하며, PC 수신 또는 만료 시 삭제합니다.</p><a href="/" className="text-sm font-bold text-blue-700 underline">기술본부 스튜디오로 돌아가기</a></div></main>;
}
