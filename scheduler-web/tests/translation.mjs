import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer as viteCreateServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
const createServer=options=>viteCreateServer({...options,configFile:false,ssr:{...options.ssr,noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages(),...(options.plugins||[])]});
import {readFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {tokenHash} from '../../functions/lib/collaboration.ts';
import {handleTranslation,parseTranslation,translationQuery} from '../../functions/lib/translation.ts';
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const originalFetch=globalThis.fetch;
assert.equal(translationQuery('담당 PM · 구조팀 · 공종'),'담당 project manager · structural engineering team · construction work category');
const {DB,db}=database();
const dialogSource=process.argv.find(arg=>arg.startsWith('--dialog-source='))?.slice('--dialog-source='.length);
const server=await createServer({plugins:dialogSource?[{name:'protected-dialog-session',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/services/translationService.ts'))return readFileSync(dialogSource,'utf8');}}]:[],server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {onRequest}=await server.ssrLoadModule('../functions/api/[[route]].ts');
 const profile={id:'translation-qa',name:'합성 검수',email:'translation@example.invalid'};
 db.prepare('INSERT INTO studio_users VALUES (?,?,?,?,?,?,?,?,?,1)').run(profile.id,profile.id,profile.email,profile.name,'마감팀','선임',JSON.stringify(profile),'salt','hash');
 db.prepare('INSERT INTO studio_sessions VALUES (?,?,?)').run(await tokenHash('translation-cookie'),profile.id,Date.now()+60000);
 const call=(texts,headers={},target='vi')=>onRequest({request:new Request('https://example.invalid/api/translation',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({texts,target})}),env:{DB}});
 assert.equal((await call(['합성 문장'])).status,401);
 const auth={Cookie:'studio_session=translation-cookie'};
 assert.equal((await call(['합성 문장'],{...auth,Origin:'https://other.invalid'})).status,403);
 let calls=0;
 globalThis.fetch=async(url,init)=>{const u=new URL(url);assert.equal(u.origin,'https://translate.googleapis.com');assert.equal(u.searchParams.get('client'),'gtx');assert.equal(u.searchParams.get('tl'),'vi');assert.equal(init.signal instanceof AbortSignal,true);calls++;return Response.json([[['Bản dịch &amp; an toàn'],[null],['&#60;văn bản&#62;']],null,'ko']);};
 let response=await call(['합성 문장'],auth);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual((await response.json()).results,[{translatedText:'Bản dịch & an toàn<văn bản>',detectedSourceLanguage:'ko'}]);
 await call(['합성 문장'],auth);assert.equal(calls,1);
 for(const texts of [[],[null],['x'.repeat(5001)],Array(17).fill('합성'),['x'.repeat(5000),'y'.repeat(5000),'z'.repeat(5000)]])assert.equal((await call(texts,auth)).status,400);
 assert.equal((await call(['합성'],auth,'fr')).status,400);
 assert.equal((await handleTranslation(new Request('https://example.invalid',{method:'GET'}))).status,405);
 for(const result of [null,{},[],[[]],[[[false]]]])assert.equal(parseTranslation(result),null);
 for(const mock of [async()=>new Response(null,{status:429}),async()=>Response.json({wrong:true}),async()=>{throw new DOMException('Timeout','TimeoutError');}]){
  globalThis.fetch=mock;const value=await (await call([`오류 합성 ${calls++}`],auth)).json();assert.ok(value.results[0].error);assert.equal(value.results[0].translatedText,undefined);
 }
 const {translateText,translateWorkbook,splitTranslationText,cachedTranslation,needsTranslation,translatedAlert,translatedConfirm}=await server.ssrLoadModule('/src/services/translationService.ts');
 assert.equal(needsTranslation('팀'),true);assert.equal(needsTranslation('개'),true);assert.equal(needsTranslation('후'),true);assert.equal(needsTranslation('김'),false);
 assert.equal(needsTranslation('QUANTITY TAKEOFF WORKFLOW'),true);assert.equal(needsTranslation('concost.dt@gmail.com'),false);assert.equal(needsTranslation('TK-2026087'),false);
 const {useLanguageStore}=await server.ssrLoadModule('/src/store/useLanguageStore.ts');
 const long='합성 검수 문장\n'.repeat(1600);assert.equal(splitTranslationText(long).join(''),long);assert.ok(splitTranslationText(long).every(t=>t.length<=5000));
 let clientCalls=0;
 globalThis.fetch=async(_url,init)=>{clientCalls++;const {texts}=JSON.parse(init.body);return Response.json({results:texts.map(t=>({translatedText:`Dịch: ${t.replace(/[\uac00-\ud7a3]/g,'v')}`}))});};
 const [first,second]=await Promise.all([translateText('독립 합성 프로젝트 52'),translateText('독립 합성 프로젝트 52')]);assert.equal(first,second);assert.equal(clientCalls,1);
 const source={SheetNames:['회의록','복원데이터'],Sheets:{'회의록':{A1:{t:'s',v:'일정 검수용 52'},B1:{t:'n',v:37},C1:{t:'s',v:'수식 유지',f:'A1'},'!merges':[{s:{r:0,c:0},e:{r:0,c:1}}]},'복원데이터':{A1:{t:'s',v:'한글 원본 JSON 52'}}}};
 const before=structuredClone(source);useLanguageStore.setState({lang:'vi'});const translated=await translateWorkbook(source);
 assert.deepEqual(source,before);assert.deepEqual(translated.Sheets['복원데이터'],source.Sheets['복원데이터']);assert.deepEqual(translated.Sheets['회의록'].B1,source.Sheets['회의록'].B1);assert.deepEqual(translated.Sheets['회의록'].C1,source.Sheets['회의록'].C1);assert.equal(translated.Sheets['회의록'].A1.v.startsWith('Dịch:'),true);assert.deepEqual(translated.Sheets['회의록']['!merges'],source.Sheets['회의록']['!merges']);
 assert.equal(await translateWorkbook(source,'ko'),source);
 useLanguageStore.setState({lang:'ko'});assert.equal(await translateWorkbook(source),source);
 assert.equal((await translateWorkbook(source,'vi')).Sheets['회의록'].A1.v,translated.Sheets['회의록'].A1.v);
 assert.deepEqual(source,before);console.log('PASS explicit export language overrides screen language without changing the original workbook');
 const koreanProject='[합성 발주처] 아산병원 P동 주차장 증축공사';
 const projectWorkbook={SheetNames:['일정표'],Sheets:{'일정표':{A1:{t:'s',v:koreanProject},A2:{t:'s',v:`프로젝트 · ${koreanProject}`},B1:{t:'s',v:'개인별 일정 보호 합성106'}}}};
 const projectOriginal=structuredClone(projectWorkbook),requestCount=clientCalls;
 const projectExport=await translateWorkbook(projectWorkbook,'vi',[koreanProject]);
 assert.equal(projectExport.Sheets['일정표'].A1.v,koreanProject);assert.equal(projectExport.Sheets['일정표'].A2.v,projectOriginal.Sheets['일정표'].A2.v);
 assert.ok(projectExport.Sheets['일정표'].B1.v.startsWith('Dịch:'));assert.equal(clientCalls,requestCount+1);assert.deepEqual(projectWorkbook,projectOriginal);
 console.log('PASS Vietnamese workbook keeps Korean project names and combined project headings exact while translating other labels without mutating original');
 globalThis.fetch=async()=>new Response(null,{status:503});await assert.rejects(translateText('실패를 성공으로 보고하지 않는 새 합성 52'));
 const {useAuthStore}=await server.ssrLoadModule('/src/store/useAuthStore.ts');
 const staff=useAuthStore.getState().users.find(u=>u.name==='서화원');assert.ok(staff);
 assert.equal(cachedTranslation('서화원'),'서화원');assert.equal(cachedTranslation('서화원 책임'),'서화원 Chuyên viên phụ trách');
 const {default:ProjectCalendar}=await server.ssrLoadModule('/src/components/ProjectCalendar.tsx');
 const viCalendar=renderToStaticMarkup(createElement(ProjectCalendar,{date:new Date('2026-10-01T09:00:00'),lang:'vi'}));
 assert.ok(viCalendar.includes('Tháng 10 năm 2026'));
 console.log('PASS Vietnamese calendar renders without the former date-format RangeError');
 const originalWindow=globalThis.window,originalActor=useAuthStore.getState().currentUser,originalLanguage=useLanguageStore.getState().lang;
 let dialogFailures=0;
 try{
  useLanguageStore.setState({lang:'vi'});
  const a={id:'dialog-A'},b={id:'dialog-B'},dialogs=[];
  globalThis.window={alert:text=>dialogs.push({kind:'alert',actor:useAuthStore.getState().currentUser?.id,text}),confirm:text=>{dialogs.push({kind:'confirm',actor:useAuthStore.getState().currentUser?.id,text});return true;}};
  for(const [index,label,beforeActor,afterActor]of [[0,'계정 전환',a,b],[1,'로그인 전 번역 후 로그인',null,a],[2,'번역 중 로그아웃',a,null],[3,'동일 ID 새 로그인 객체',a,{...a}]]){
   try{
    for(const kind of ['confirm','alert']){
     useAuthStore.setState({currentUser:beforeActor});let release;
     globalThis.fetch=async(url,init)=>{assert.equal(String(url),'/api/translation');const {texts}=JSON.parse(init.body);return new Promise(resolve=>{release=()=>resolve(Response.json({results:texts.map(text=>({translatedText:'Dịch: '+text}))}));});};
     const text=`지연된 확인창 합성81 ${index} ${kind}`,operation=kind==='confirm'?translatedConfirm(text):translatedAlert(text);
     for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,0));assert.equal(typeof release,'function');
     useAuthStore.setState({currentUser:afterActor});const count=dialogs.length;release();const result=await operation;
     assert.equal(dialogs.length,count,'A previous session must not display a dialog in the current session');
     if(kind==='confirm')assert.equal(result,false,'Cancellation must prevent the caller from continuing to archive');
    }
    console.log('PASS '+label+' 동안 늦은 번역 확인창·알림 취소');
   }catch(error){dialogFailures++;console.log('FAIL '+label+': '+error.message);}
  }
  try{
   useAuthStore.setState({currentUser:a});globalThis.fetch=async(_url,init)=>Response.json({results:JSON.parse(init.body).texts.map(text=>({translatedText:'Dịch: '+text}))});
   const count=dialogs.length;assert.equal(await translatedConfirm('현재 계정 정상 확인창 합성81'),true);await translatedAlert('현재 계정 정상 알림 합성81');assert.equal(dialogs.length,count+2);
   assert.equal(await translatedConfirm(koreanProject+'\n기록을 보존할까요?', [koreanProject]),true);
   assert.ok(dialogs.at(-1).text.startsWith(koreanProject+'\nDịch: '),'Project identity remains Korean while the confirmation instruction translates');
   console.log('PASS project-name confirmation preserves Korean identity while translating the instruction');
   const sameActor=useAuthStore.getState().currentUser;useAuthStore.setState({loginError:'합성 독립 오류'});assert.equal(useAuthStore.getState().currentUser,sameActor);assert.equal(await translatedConfirm('현재 계정 정상 확인창 합성81'),true,'Cached translation and unrelated store updates keep valid confirmations');
   let followedUp=false;const cached=translatedConfirm('현재 계정 정상 확인창 합성81').then(accepted=>{if(accepted)followedUp=true;});useAuthStore.setState({currentUser:{...a}});await cached;assert.equal(followedUp,false,'Cached response must not let an old-session caller perform a follow-up write');
   useLanguageStore.setState({lang:'ko'});useAuthStore.setState({currentUser:a});assert.equal(await translatedConfirm('한국어 정상 확인창 합성81'),true);
   console.log('PASS 현재 객체의 정상·캐시·한국어 확인과 무관 상태 갱신 허용; 같은 ID 새 객체 캐시 후속 실행 취소');
  }catch(error){dialogFailures++;console.log('FAIL 정상·캐시 확인 대조: '+error.message);}
 }finally{globalThis.window=originalWindow;useAuthStore.setState({currentUser:originalActor,loginError:null});useLanguageStore.setState({lang:originalLanguage});}
 if(dialogFailures)process.exitCode=1;
 let directCalls=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='/api/translation'){const {texts}=JSON.parse(init.body);return Response.json({results:texts.map(()=>({error:'Server provider rejected'}))});}
  assert.equal(new URL(url).origin,'https://translate.googleapis.com');assert.equal(init.credentials,'omit');directCalls++;return Response.json([[['Bản dịch trình duyệt an toàn']],null,'ko']);
 };
 assert.equal(await translateText('구조팀 브라우저 보완 합성 529864'),'Bản dịch trình duyệt an toàn');assert.equal(directCalls,1);
 globalThis.fetch=async()=>new Response(null,{status:429});await assert.rejects(translateText('브라우저 오류 원문 유지 합성 529865'));
 console.log('PASS browser fallback for cloud provider rejection, no credential forwarding and original-preserving failure');

 console.log('PASS translation: real Worker authentication/origin, limits, segment/HTML parsing, caching, HTTP/format/timeout fallback, client deduplication, long text, Excel original/formula/number/merge preservation');
}finally{globalThis.fetch=originalFetch;await server.close();db.close();}
