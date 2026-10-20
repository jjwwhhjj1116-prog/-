import type {StudioUser} from './collaboration';
export async function claimWorklogsRoute(request:Request,env:{CLAIM_WORKLOGS?:{fetch(request:Request):Promise<Response>}},user:StudioUser,route:string):Promise<Response|null>{
  if(route!=='claim-worklogs'&&!route.startsWith('claim-worklogs/'))return null;
  const fail=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}}),url=new URL(request.url);
  if(!['GET','PUT'].includes(request.method))return fail('지원하지 않는 요청입니다.',405);
  if(!/^claim-worklogs(?:\/[0-9a-f-]{36})?$/.test(route)||url.search&&!/^\?date=\d{4}-\d{2}-\d{2}$/.test(url.search))return fail('프로젝트·작성일을 확인하세요.',400);
  if(!env.CLAIM_WORKLOGS)return fail('클레임센터 업무일지 연결이 준비되지 않았습니다. 기존 기술본부 일지는 그대로 이용할 수 있습니다.',503);
  let body:unknown;
  if(request.method==='PUT'){
    if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return fail('현재 기술본부 화면에서 저장하세요.',403);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return fail('JSON 입력이 필요합니다.',415);
    const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>40000)return fail('업무일지 입력이 너무 큽니다.',413);
    try{body=JSON.parse(raw);}catch{return fail('입력 형식을 확인하세요.',400);}
  }
  // Never forward an actor supplied by the browser or an editable display name.
  const actor={id:user.id,login:user.login,email:user.email};
  try{
    const result=await env.CLAIM_WORKLOGS.fetch(new Request('https://claim-worklogs.internal/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,method:request.method,path:'/api/project-worklogs'+route.slice('claim-worklogs'.length)+url.search,...(request.method==='PUT'?{body}:{})})}));
    return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return fail('클레임센터 연결에 실패했습니다. 입력은 유지됩니다. 잠시 후 다시 시도하세요.',502);}
}
