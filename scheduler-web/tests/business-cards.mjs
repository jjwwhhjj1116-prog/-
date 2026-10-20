import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {businessCardsRoute} from '../../functions/lib/businessCards.ts';

const {db,DB}=database();db.exec(readFileSync(new URL('../../migrations/0013_business_cards.sql',import.meta.url),'utf8'));
const admin={id:'admin',name:'관리자',profile:JSON.stringify({email:'yjw@con-cost.com'})};
const staff={id:'staff',name:'직원',profile:JSON.stringify({email:'staff@example.test'})};
for(const actor of [admin,staff])db.prepare('INSERT INTO studio_users VALUES(?,?,?,?,?,?,?,?,?,1)').run(actor.id,actor.id,JSON.parse(actor.profile).email,actor.name,'마감팀','프로',actor.profile,'salt','hash');
const env={DB,GOOGLE_CLIENT_SECRET:'test-only-secret-that-is-not-a-real-credential',GEMINI_MODEL:'gemini-test'};
let googleUploads=0,providerCalls=0;
const deps={accessToken:async()=> 'mock-company-token',folder:async(name)=>name==='기술본부 자료실'?'root-folder-12345':'cards-folder-12345',upload:async()=>{googleUploads++;return{id:'google-file-12345'};}};
const image=new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64')],'card.png',{type:'image/png'});
const fields={name:'홍길동',company:'건설회사',department:'기술부',title:'실장',mobile:'010-0000-0000',phone:'',fax:'',email:'hong@example.test',website:'',address:'',tags:'발주처',notes:''};
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{providerCalls++;assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));assert.ok(init.headers['x-goog-api-key']);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(fields)}]}}]});};
const send=async(actor,path,method='GET',body,headers={})=>{
 const url=new URL(`https://example.invalid/api/${path}`);
 const response=await businessCardsRoute(new Request(url,{method,headers,body}),env,actor,url.pathname.replace('/api/',''),deps);
 return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():null};
};
const check=async(name,fn)=>{await fn();console.log('PASS',name);};
try{
 await check('관리자만 키 저장·조회, 원문은 DB와 응답에 노출되지 않음',async()=>{
  const raw='test-only-gemini-key-1234567890';
  assert.equal((await send(staff,'business-cards/settings','PUT',JSON.stringify({key:raw}),{'Content-Type':'application/json'})).response.status,403);
  const saved=await send(admin,'business-cards/settings','PUT',JSON.stringify({key:raw}),{'Content-Type':'application/json'});assert.equal(saved.response.status,200);
  assert.ok(!JSON.stringify(saved.data).includes(raw));assert.ok(!JSON.stringify(db.prepare('SELECT * FROM studio_business_card_credentials').all()).includes(raw));
  assert.equal((await send(admin,'business-cards/settings')).data.configured,true);
  assert.equal((await send(staff,'business-cards/settings')).response.status,403);
 });
 await check('이미지 형식과 크기 검증 후 Gemini 인식·사람 수정 값 등록',async()=>{
  const invalid=new FormData();invalid.set('file',new File(['fake'],'fake.png',{type:'image/png'}));assert.equal((await send(staff,'business-cards/analyze','POST',invalid)).response.status,400);assert.equal(providerCalls,0);
  const form=new FormData();form.set('file',image);const analyzed=await send(staff,'business-cards/analyze','POST',form);assert.equal(analyzed.response.status,200);assert.equal(providerCalls,1);
  const analysisId=analyzed.data.analysis.id;const reviewed={...fields,company:'수정한 회사'};
  const registration=new FormData();registration.set('file',image);registration.set('analysisId',analysisId);registration.set('fields',JSON.stringify(reviewed));
  const operation=`business-card:${crypto.randomUUID()}`,registered=await send(staff,'business-cards','POST',registration,{'Idempotency-Key':operation});
  assert.equal(registered.response.status,201);assert.equal(googleUploads,1);assert.equal(db.prepare('SELECT company FROM studio_business_cards').get().company,'수정한 회사');
  assert.equal((await send(staff,'business-cards','POST',registration,{'Idempotency-Key':operation})).data.replay,true);
  assert.equal(googleUploads,1);
  const found=await send(admin,'business-cards?q=수정한');assert.equal(found.data.cards.length,1);assert.equal(found.data.cards[0].company,'수정한 회사');
  const cardId=registered.data.cardId;
  globalThis.fetch=async(url)=>{assert.ok(String(url).includes('google-file-12345?alt=media'));return new Response(image.stream(),{headers:{'Content-Type':'image/png'}});};
  const original=await send(staff,`business-cards/${cardId}/image`);assert.equal(original.response.status,200);assert.equal(original.response.headers.get('cache-control'),'private, no-store');
  const change=(actor,action,version)=>send(actor,`business-cards/${cardId}`,'PUT',JSON.stringify({action,expectedVersion:version}),{'Content-Type':'application/json'});
  assert.equal((await change(staff,'ARCHIVE',1)).response.status,403);assert.equal((await change(admin,'ARCHIVE',1)).response.status,200);
  assert.equal((await send(staff,`business-cards/${cardId}/image`)).response.status,404);assert.equal((await send(staff,'business-cards')).data.cards.length,0);
  assert.equal((await send(admin,'business-cards?includeArchived=true')).data.cards.length,1);
  assert.equal((await change(admin,'RESTORE',2)).response.status,200);assert.equal((await send(staff,'business-cards')).data.cards.length,1);
 });
}finally{globalThis.fetch=oldFetch;db.close();}
