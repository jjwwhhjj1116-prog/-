export const MAX_UPLOAD_BYTES=15_000_000_000;
export const CHUNK_BYTES=4*1024*1024;
export type UploadProgress={phase:'검증'|'전송';loaded:number;total:number;name:string};
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export async function resumableVaultUpload(file:File,metadata:Record<string,unknown>,signal?:AbortSignal,onProgress?:(p:UploadProgress)=>void):Promise<string>{
 if(file.size<=0||file.size>MAX_UPLOAD_BYTES)throw new Error('파일당 1바이트 이상 15GB 이하만 업로드할 수 있습니다.');
 const progress=(phase:UploadProgress['phase'],loaded:number)=>onProgress?.({phase,loaded,total:file.size,name:file.name});
 // 조각별 해시만 보관한다. 같은 이름/크기의 다른 파일을 기존 세션에 이어 붙이지 않는다.
 const hashes:string[]=[];
 for(let offset=0;offset<file.size;offset+=CHUNK_BYTES){
  signal?.throwIfAborted();progress('검증',offset);
  hashes.push(hex(await crypto.subtle.digest('SHA-256',await file.slice(offset,offset+CHUNK_BYTES).arrayBuffer())));
 }
 signal?.throwIfAborted();progress('검증',file.size);
 async function call(path:string,init:RequestInit){
  const r=await fetch(`/api/drive/uploads${path}`,{...init,signal});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'전송 실패. 같은 파일을 다시 선택하면 재개합니다.');
  return data;
 }
 const start=await call('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...metadata,originalName:file.name,byteSize:file.size,mimeType:file.type,hashes})});
 let state=await call(`/${start.id}`,{method:'POST'});
 let failures=0;
 while(!state.completed){
  signal?.throwIfAborted();progress('전송',state.offset);
  const offset=Math.floor(state.offset/CHUNK_BYTES)*CHUNK_BYTES;
  if(offset>=file.size)throw new Error('서버가 원본 등록을 확인하지 못했습니다. 같은 파일을 다시 선택하세요.');
  try{
   const next=await call(`/${start.id}?offset=${offset}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file.slice(offset,Math.min(offset+CHUNK_BYTES,file.size))});
   if(!next.completed&&next.offset<=state.offset)throw new Error('전송 진행을 확인하지 못했습니다.');
   state=next;failures=0;
  }catch(error){
   if(signal?.aborted||++failures>3)throw error;
   // 실패한 조각을 무작정 다시 보내지 않고 Google 수신 위치부터 확인한다.
   await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},failures*1000);signal?.addEventListener('abort',abort,{once:true});});
   state=await call(`/${start.id}`,{method:'POST'});
  }
 }
 progress('전송',file.size);return start.id;
}
