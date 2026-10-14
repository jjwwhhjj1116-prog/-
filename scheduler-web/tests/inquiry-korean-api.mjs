import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {handleCollaboration,passwordHash} from '../../functions/lib/collaboration.ts';

const {db,DB}=database(),cookies={},results=[],originalFetch=globalThis.fetch;
for(const name of ['0007_project_inquiries','0008_inquiry_rounds'])db.exec(readFileSync(new URL('../../migrations/'+name+'.sql',import.meta.url),'utf8'));
for(const [id,department,position,email,role] of [['admin','개발 TF','실장','yjw@con-cost.com','ADMIN'],['u_12','마감팀','실장','chief@qa.invalid','MEMBER'],['staff','마감팀','사원','a@qa.invalid','MEMBER'],['staff2','마감팀','사원','b@qa.invalid','MEMBER'],['unassigned','마감팀','사원','none@qa.invalid','MEMBER'],['struct','구조팀','사원','structure@qa.invalid','MEMBER']]){
 const profile={id,name:id,department,position,email,role};db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,id,email,id,department,position,JSON.stringify(profile),'test',await passwordHash('local-test-password','test'));
}
const env={DB,GEMINI_API_KEY:'mock-key-105-only',GEMINI_MODEL:'gemini-test'};
async function req(actor,route,method='GET',body,settings=env,origin='https://qa.invalid'){
 const response=await handleCollaboration(new Request('https://qa.invalid/api/collaboration/'+route,{method,headers:{Cookie:cookies[actor]||'',Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),settings,async()=> '');return {status:response.status,data:await response.json(),response};
}
for(const id of ['admin','u_12','staff','staff2','unassigned','struct']){const r=await req(id,'login','POST',{login:id,password:'local-test-password'});assert.equal(r.status,200);cookies[id]=r.response.headers.get('set-cookie').split(';')[0];}
const project={id:'translation-pF',code:'QA-105',name:'합성 번역',department:'마감팀',startDate:'2026-10-13',endDate:'2026-10-14',subTasks:{조적:{personIds:['staff','staff2'],startDate:'2026-10-13',endDate:'2026-10-14'}},roles:{},progress:0};
db.prepare('INSERT INTO studio_projects VALUES (?,?,1,?,?)').run(project.id,JSON.stringify(project),'2026-10-13','admin');
const photo={id:'qa-photo-105',name:'local.png',mimeType:'image/png',field:'question',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Vn1cAAAAASUVORK5CYII=',caption:'Please check 150 mm A-104-03'};
const row=(id='q-105',extra={})=>({id,projectId:project.id,department:'마감팀',no:'1',trade:'조적',roundNumber:2,group:'2차 질의사항',classification:'B1',drawingNumbers:['A-104-03'],question:'Vui lòng 150mm A-104-03 기존 한국어',answer:'Please check 3,300 m²\r\n한국어 유지',review:'100 tường',notes:'Please check -0.25 m and 1/2, 1:50, 100~200',images:[photo],status:'REGISTERED',authorId:'staff',authorName:'staff',createdAt:'2026-10-13',updatedAt:'2026-10-13',revision:1,...extra});
const seed=inquiry=>db.prepare('INSERT INTO studio_project_inquiries VALUES (?,?,?,?,?,?,?,?)').run(inquiry.id,inquiry.projectId,inquiry.department,inquiry.authorId,inquiry.status,JSON.stringify(inquiry),inquiry.revision,inquiry.updatedAt);
seed(row());
const item=inquiry=>({id:inquiry.id,revision:inquiry.revision,classification:inquiry.classification,question:inquiry.question,answer:inquiry.answer,review:inquiry.review,notes:inquiry.notes,imageCaptions:inquiry.images.map(image=>({id:image.id,caption:image.caption||''}))});
const body=(items=[item(row())],extra={})=>({actorId:'staff',projectId:project.id,department:'마감팀',roundNumber:2,items,...extra});
const translate=(actor='staff',value=body(),settings=env)=>req(actor,'inquiries/translate-korean','POST',{...value,actorId:actor},settings);
const snapshot=()=>Object.fromEntries(['studio_project_inquiries','studio_inquiry_rounds','studio_projects','studio_users','studio_worklogs','studio_sync_versions'].map(table=>[table,db.prepare('SELECT * FROM '+table).all()]));
let calls=[];
const korean=text=>text.replaceAll('Vui lòng','확인 요청').replaceAll('Please check','확인 요청').replaceAll('100 tường','100개의 벽');
const providerResult=(segments,change=korean)=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({translations:segments.map(segment=>({id:segment.id,text:change(segment.text)}))})}]}}]});
function provider(handler){calls=[];globalThis.fetch=async(url,init)=>{
 assert.equal(new URL(url).origin,'https://generativelanguage.googleapis.com');assert.ok(String(url).includes('/gemini-test:generateContent'));assert.equal(init.method,'POST');assert.ok(init.signal instanceof AbortSignal);const payload=JSON.parse(init.body),segments=JSON.parse(payload.contents[0].parts[0].text).segments;assert.ok(!init.body.includes(photo.dataUrl));assert.ok(!init.body.includes('studio_session='));calls.push({segments:structuredClone(segments),signal:init.signal});return handler?handler(segments,init,calls.length):Response.json(providerResult(segments));
};}
async function check(name,fn){provider();try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(error){results.push({name,status:'FAIL',error:error.message});console.log('FAIL '+name+' '+error.message);process.exitCode=1;}}

await check('질의 AI번역 API 인증/CSRF/actor위조는 provider요청0',async()=>{
 assert.equal((await translate('none')).status,401);assert.equal((await req('staff','inquiries/translate-korean','POST',body(),env,'https://foreign.invalid')).status,403);assert.equal((await req('staff2','inquiries/translate-korean','POST',body())).status,403);assert.equal(calls.length,0);
});
await check('질의 AI번역 API 프로젝트·부서·배정권한·차수 연결은 제공자 호출전에 검증',async()=>{
 assert.equal((await translate('unassigned')).status,403);assert.equal((await translate('struct')).status,403);assert.equal((await translate('staff',body(undefined,{department:'구조팀'}))).status,400);assert.equal((await translate('staff',body(undefined,{projectId:'missing'}))).status,404);assert.equal((await translate('staff',body(undefined,{roundNumber:3}))).status,409);assert.equal(calls.length,0);
});
await check('질의 AI번역 API 미설정 key/model은503·원문 exact·HTTP정보/키 출력0',async()=>{
 const before=snapshot();for(const settings of [{DB},{DB,GEMINI_API_KEY:env.GEMINI_API_KEY},{DB,GEMINI_MODEL:env.GEMINI_MODEL},{...env,GEMINI_MODEL:'invalid-model'}]){const r=await translate('staff',body(),settings);assert.equal(r.status,503);assert.ok(!JSON.stringify(r.data).includes(env.GEMINI_API_KEY));assert.equal(r.data.items,undefined);}assert.equal(calls.length,0);assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 텍스트만·필드상한/중복id/사진bytes/unknownkey/round필수 거부',async()=>{
 const original=item(row()),before=snapshot();for(const changed of [{...original,images:[photo]},{...original,question:'x'.repeat(20001)},{...original,classification:'x'.repeat(201)},{...original,imageCaptions:[{id:photo.id,caption:'x'.repeat(1001)}]},{...original,question:3},{...original,imageCaptions:[{id:'bad\nid',caption:'x'}]},{...original,question:'\ud800'}])assert.equal((await translate('staff',body([changed]))).status,400);
 assert.equal((await translate('staff',body(Array.from({length:9},(_,index)=>({...original,id:'new-'+index,revision:0}))))).status,400);
 assert.equal((await translate('staff',body([original,original]))).status,400);assert.equal((await translate('staff',body([original],{unexpected:'field'}))).status,400);const missing=body();delete missing.roundNumber;assert.equal((await translate('staff',missing)).status,400);assert.equal(calls.length,0);assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API stale/삭제 saved행과 新draftrevision위조는409·provider0',async()=>{
 assert.equal((await translate('staff',body([{...item(row()),revision:0}]))).status,409);assert.equal((await translate('staff',body([{...item(row()),id:'new-draft',revision:1}]))).status,409);const deleted=row('deleted-105',{deletedAt:'2026-10-13'});seed(deleted);assert.equal((await translate('staff',body([item(deleted)]))).status,409);assert.equal(calls.length,0);
});
await check('질의 AI번역 API private DRAFT은owner/관리자만·공유REGISTERED peer가능·본문저장0',async()=>{
 const draft=row('private-105',{status:'DRAFT',question:'Please check private 150mm'});seed(draft);const before=snapshot();assert.equal((await translate('staff2',body([item(draft)]))).status,403);assert.equal(calls.length,0);assert.equal((await translate('u_12',body([item(draft)]))).status,200);provider();assert.equal((await translate('staff2')).status,200);assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API VN/EN/KO 혼합·수치/단위/코드/줄바꿈·사진캡션만 번역·DB exact',async()=>{
 const before=snapshot(),r=await translate();assert.equal(r.status,200);assert.equal(r.data.provider,'gemini');assert.deepEqual(r.data.warnings,[]);const output=r.data.items[0];assert.equal(output.question,'확인 요청 150mm A-104-03 기존 한국어');assert.equal(output.answer,'확인 요청 3,300 m²\r\n한국어 유지');assert.equal(output.review,'100개의 벽');assert.equal(output.notes,'확인 요청 -0.25 m and 1/2, 1:50, 100~200');assert.equal(output.imageCaptions[0].id,photo.id);assert.equal(output.imageCaptions[0].caption,'확인 요청 150 mm A-104-03');const dirty={...item(row()),imageCaptions:[...item(row()).imageCaptions,{id:'unsaved-new-photo',caption:'Please check 150 mm'}]};const fresh=await translate('staff',body([dirty]));assert.equal(fresh.status,200);assert.equal(fresh.data.items[0].imageCaptions[1].id,'unsaved-new-photo');assert.equal(fresh.data.items[0].imageCaptions[1].caption,'확인 요청 150 mm');provider(segments=>Response.json(providerResult(segments,text=>korean(text).replaceAll('floor 3 in A-104-03','A-104-03의 3층').replaceAll('Φ25mm 3in','Φ25mm와 3in로'))));const technical=await translate('staff',body([{...item(row()),question:'Please check Φ25mm 3in',notes:'floor 3 in A-104-03'}]));assert.equal(technical.status,200,technical.data.error);assert.equal(technical.data.items[0].question,'확인 요청 Φ25mm와 3in로');assert.equal(technical.data.items[0].notes,'A-104-03의 3층');assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 한국어 본문·기술표기·공백은provider 전송없이 exact 보존',async()=>{
 const before=snapshot(),input={...item(row()),classification:'구조',question:'도면 S-301의 치수 500 mm 유지.',answer:'',review:'  철근 Φ25mm, 3in 유지.\r\n한국어 원문  ',notes:'축척 1:50, 표고 -0.25 m, 밀도 7,850 kg/m3.',imageCaptions:[{id:photo.id,caption:'도면 A-104-03의 벽체.'}]};
 provider(()=>{throw new Error('Already Korean text must not be sent to the provider');});const r=await translate('staff',body([input]));assert.equal(r.status,200,r.data.error);assert.deepEqual(r.data.items,[input]);assert.equal(calls.length,0);assert.deepEqual(snapshot(),before);
 provider(segments=>Response.json(providerResult(segments,text=>text.replace('Đã','완료'))));const mixed=await translate('staff',body([{...input,question:'한국어 Đã.'}]));assert.equal(mixed.status,200,mixed.data.error);assert.equal(mixed.data.items[0].question,'한국어 완료.');assert.equal(calls.length,1);assert.ok(calls[0].segments.some(segment=>segment.text==='한국어 Đã.'));assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API unsaved rev0는현재차수 preview만·SENT면 saved/新draft 모두409',async()=>{
 const draft={...item(row()),id:'new-unsaved-105',revision:0};const before=snapshot();assert.equal((await translate('staff',body([draft]))).status,200);assert.deepEqual(snapshot(),before);db.prepare('INSERT INTO studio_inquiry_rounds VALUES (?,?,?,?,?,?,?)').run(project.id,'마감팀',2,'SENT','{}',1,'2026-10-13');try{provider();assert.equal((await translate()).status,409);assert.equal((await translate('staff',body([draft]))).status,409);assert.equal(calls.length,0);}finally{db.prepare('DELETE FROM studio_inquiry_rounds WHERE project_id=?').run(project.id);}
});
await check('질의 AI번역 API HTTP실패/차단/JSON손상/불완전응답/누락/추가id는502·부분items없음',async()=>{
 const before=snapshot();for(const mock of [()=>new Response('do not reflect upstream detail '+env.GEMINI_API_KEY,{status:429}),()=>Response.json({}),()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'broken'}]}}]}),segments=>Response.json(providerResult(segments.slice(1))),segments=>Response.json(providerResult([...segments,{id:'extra',text:'extra'}]))]){provider(mock);const r=await translate();assert.equal(r.status,502);assert.equal(r.data.items,undefined);assert.ok(!JSON.stringify(r.data).includes(env.GEMINI_API_KEY));}assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 단위/도면코드/숫자/분수/비율/범위 변경은422·원문 exact',async()=>{
 const before=snapshot();for(const change of [text=>text.replaceAll('150mm','150cm'),text=>text.replaceAll('A-104-03','A-104-04'),text=>text.replaceAll('3,300','3,301'),text=>text.replaceAll('1/2','2/1'),text=>text.replaceAll('1:50','50:1'),text=>text.replaceAll('100~200','200~100')]){provider(segments=>Response.json(providerResult(segments,change)));const r=await translate();assert.equal(r.status,422);assert.equal(r.data.items,undefined);}assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 밀도·면적비 compound단위는그대로번역200·나눗셈을곱셈으로변경422',async()=>{
 const before=snapshot();for(const unit of ['kg/m3','m²/m²']){const input={...item(row()),notes:'Please check 1 '+unit};provider();const allowed=await translate('staff',body([input]));assert.equal(allowed.status,200,allowed.data.error);assert.equal(allowed.data.items[0].notes,'확인 요청 1 '+unit);provider(segments=>Response.json(providerResult(segments,text=>korean(text).replaceAll(unit,unit.replace('/','*')))));const denied=await translate('staff',body([input]));assert.equal(denied.status,422);assert.equal(denied.data.items,undefined);provider(segments=>Response.json(providerResult(segments,text=>korean(text).replaceAll(unit,unit.replace('/',' / ')+'의'))));const spaced=await translate('staff',body([input]));assert.equal(spaced.status,200,spaced.data.error);assert.equal(spaced.data.items[0].notes,'확인 요청 1 '+unit.replace('/',' / ')+'의');}assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 실제전체20초 timeout은504·실행중provider 취소·번역items없음',async()=>{
 const before=snapshot();provider((_segments,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});}));const started=Date.now(),r=await translate(),elapsed=Date.now()-started;assert.equal(r.status,504);assert.equal(r.data.items,undefined);assert.ok(elapsed>=19000&&elapsed<26000,'Actual whole-request deadline did not bound execution');assert.ok(calls.every(call=>call.signal.aborted));assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 단일20k UTF16/줄바꿈 chunk는 surrogate안분리·완전연결·부분쓰기0',async()=>{
 const long='A'.repeat(3999)+'😀'+'A'.repeat(15999),input={...item(row()),question:long,answer:'  Please check 150mm\r\n\r\n한국어\n',review:'',notes:''};assert.equal(long.length,20000);
 provider(segments=>{for(const segment of segments)for(let n=0;n<segment.text.length;n++){const code=segment.text.charCodeAt(n);if(code>=0xD800&&code<=0xDBFF){const next=segment.text.charCodeAt(++n);assert.ok(next>=0xDC00&&next<=0xDFFF,'Provider received lone high surrogate');}else assert.ok(code<0xDC00||code>0xDFFF,'Provider received lone low surrogate');}return Response.json(providerResult(segments));});const before=snapshot(),r=await translate('staff',body([input]));assert.equal(r.status,200,r.data.error);assert.equal(r.data.items[0].question,long);assert.equal(r.data.items[0].answer,'  확인 요청 150mm\r\n\r\n한국어\n');assert.ok(calls.length>=3);assert.deepEqual(snapshot(),before);
 const field='Please check '+'a'.repeat(19987),full={...item(row()),question:field,answer:field,review:field,notes:field};assert.equal(field.length,20000);provider();const complete=await translate('staff',body([full]));assert.equal(complete.status,200,complete.data.error);for(const key of ['question','answer','review','notes'])assert.equal(complete.data.items[0][key],korean(field));assert.ok(calls.length>=10);assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 복수provider 중두번째실패는전체결과0·DB원문 exact',async()=>{
 const input={...item(row()),question:'Vui lòng 150mm '.repeat(1200),answer:'',review:'',notes:''},before=snapshot();provider((segments,_init,index)=>index===2?new Response('provider-failed',{status:503}):Response.json(providerResult(segments)));const r=await translate('staff',body([input]));assert.equal(r.status,502);assert.equal(r.data.items,undefined);assert.ok(calls.length>=2);assert.deepEqual(snapshot(),before);
});
await check('질의 AI번역 API 응답후다른PC revision변경/새SENT/계정회수는409·items없음',async()=>{
 for(const kind of ['row','project','round','actor']){const inquiry=db.prepare('SELECT * FROM studio_project_inquiries WHERE id=?').get('q-105'),p=db.prepare('SELECT * FROM studio_projects WHERE id=?').get(project.id);provider(segments=>{if(kind==='row')db.prepare('UPDATE studio_project_inquiries SET revision=revision+1 WHERE id=?').run('q-105');if(kind==='project')db.prepare('UPDATE studio_projects SET revision=revision+1 WHERE id=?').run(project.id);if(kind==='round')db.prepare('INSERT INTO studio_inquiry_rounds VALUES (?,?,?,?,?,?,?)').run(project.id,'마감팀',2,'SENT','{}',1,'2026-10-13');if(kind==='actor')db.prepare('UPDATE studio_users SET active=0 WHERE id=?').run('staff');return Response.json(providerResult(segments));});try{const r=await translate();assert.equal(r.status,409);assert.equal(r.data.items,undefined);}finally{db.prepare('UPDATE studio_project_inquiries SET revision=? WHERE id=?').run(inquiry.revision,'q-105');db.prepare('UPDATE studio_projects SET revision=? WHERE id=?').run(p.revision,project.id);db.prepare('DELETE FROM studio_inquiry_rounds WHERE project_id=?').run(project.id);db.prepare('UPDATE studio_users SET active=1 WHERE id=?').run('staff');}}
});

globalThis.fetch=originalFetch;db.close();
const report={kind:'ACTUAL_INQUIRY_TRANSLATION_ROUTE_SQLITE_MOCKED_GEMINI',pass:results.filter(row=>row.status==='PASS').length,fail:results.filter(row=>row.status==='FAIL').length,results,operatingWrites:0,actualProviderCalls:0,provider:'MOCKED_NATIVE_FETCH',realProviderQuality:'NOT_RUN'};
writeFileSync(new URL('../test-results/inquiry-korean-api.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.fail)process.exitCode=1;
