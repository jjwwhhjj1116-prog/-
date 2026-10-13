export class StudioError extends Error {
 status:number; details:any;
 constructor(message:string,status:number,details:any){super(message);this.status=status;this.details=details;}
}
export async function studioApi<T=any>(path:string,method='GET',body?:unknown):Promise<T> {
 const response=await fetch(`/api/collaboration/${path}`,{method,credentials:'same-origin',signal:AbortSignal.timeout(30000),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({error:'중앙 저장 서버 응답을 확인할 수 없습니다.'}));
 if(!response.ok)throw new StudioError(data.error||'서버 요청 실패',response.status,data);
 return data;
}
