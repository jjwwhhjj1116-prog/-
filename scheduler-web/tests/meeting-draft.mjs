import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './d1.mjs';
import {meetingDraftRoute} from '../../functions/lib/meetingDraft.ts';

const {db,DB}=database();db.exec(readFileSync(new URL('../../migrations/0013_business_cards.sql',import.meta.url),'utf8'));
const env={DB,GEMINI_API_KEY:'test-only-meeting-key',GEMINI_MODEL:'gemini-test'};
const valid={title:'착수 회의',meetingDate:'2026-10-20',location:'본사',clientName:'발주처',attendeesInternal:['김 담당'],attendeesExternal:[],notesAndInstructions:'도면을 검토하기로 했다.',summary:'도면 검토 논의',decisions:[],transcript:''};
const request=(source)=>{const form=new FormData();form.set('projectCode','TK-2026087');form.set('projectName','P5 FAB2 견적용역');if(source instanceof File)form.set('file',source);else form.set('text',source);return new Request('https://example.invalid/api/meetings/draft',{method:'POST',body:form});};
let calls=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 calls.push({url:String(url),method:init.method,body:init.body});
 if(!String(url).endsWith('/upload/file-token'))assert.equal(init.headers['x-goog-api-key'],'test-only-meeting-key');
 if(String(url).endsWith('/upload/v1beta/files'))return new Response('',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/file-token'}});
 if(String(url).endsWith('/upload/file-token'))return Response.json({file:{name:'files/mock-meeting',uri:'https://generativelanguage.googleapis.com/v1beta/files/mock-meeting',state:'ACTIVE'}});
 if(init.method==='DELETE')return Response.json({});
 if(String(url).includes(':generateContent'))return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});
 throw new Error('unexpected Gemini request');
};
const check=async(name,fn)=>{await fn();console.log('PASS',name);};
try{
 await check('원문으로 Gemini 구조화 초안을 만들고 DB 원문 저장 없음',async()=>{
  const response=await meetingDraftRoute(request('도면을 검토하기로 했다.'),env);
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.draft.title,'착수 회의');assert.equal(data.draft.decisions.length,0);assert.equal(data.sourceKind,'text');
  assert.equal(calls.length,1);assert.match(String(calls[0].body),/meeting_source/);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM studio_business_card_analyses').get().n,0);
 });
 await check('잘못된 프로젝트 코드와 PDF는 Gemini로 보내지 않음',async()=>{
  calls=[];const form=new FormData();form.set('projectCode','oops!');form.set('projectName','가짜');form.set('text','원문');assert.equal((await meetingDraftRoute(new Request('https://example.invalid/api/meetings/draft',{method:'POST',body:form}),env)).status,400);
  assert.equal((await meetingDraftRoute(request(new File(['not-a-pdf-content'],'meeting.pdf',{type:'application/pdf'})),env)).status,400);assert.equal(calls.length,0);
 });
 await check('녹음 파일은 Gemini Files API로 보내고 완료 후 즉시 삭제',async()=>{
  calls=[];const response=await meetingDraftRoute(request(new File([Buffer.alloc(64)],'meeting.mp3',{type:'audio/mpeg'})),env);
  assert.equal(response.status,200,JSON.stringify({result:await response.clone().json(),calls:calls.map(call=>({url:call.url,method:call.method}))}));assert.equal((await response.json()).sourceKind,'audio/mpeg');
  assert.equal(calls.length,4);assert.match(calls[0].url,/upload\/v1beta\/files$/);assert.match(calls[1].url,/upload\/file-token$/);assert.match(calls[2].url,/:generateContent$/);assert.equal(calls[3].method,'DELETE');
 });
 await check('Gemini 출력 불완전 시 초안 성공 처리 안 함',async()=>{
  globalThis.fetch=async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(valid)}]}}]});
  assert.equal((await meetingDraftRoute(request('불완전한 회의 원문'),env)).status,502);
 });
}finally{globalThis.fetch=originalFetch;db.close();}
