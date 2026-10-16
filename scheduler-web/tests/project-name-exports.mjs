import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createServer} from 'vite';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
const originalFetch=globalThis.fetch;
// Dynamic workbook dependencies use the same installed packages through Node on Windows SSR.
const nativeExportPackages={name:'qa-native-export-packages',enforce:'pre',resolveId(id){if(['exceljs','jszip','saxes'].includes(id))return '\0qa-export:'+id;},load(id){if(!id.startsWith('\0qa-export:'))return;const name=id.slice('\0qa-export:'.length),require=createRequire(new URL('../package.json',import.meta.url)),names=Object.keys(require(name)).filter(key=>/^[A-Za-z_$][\w$]*$/.test(key)&&key!=='default');return `import {createRequire} from 'node:module';const original=createRequire(${JSON.stringify(String(new URL('../package.json',import.meta.url)))})(${JSON.stringify(name)});export default original;${names.map(key=>`export const ${key}=original.${key};`).join('')}`;}};
const server=await createServer({configFile:false,ssr:{noExternal:[/^(react|react-dom|zustand|xlsx|exceljs|jszip|saxes)(\/|$)/]},plugins:[nativeSsrPackages(),nativeExportPackages],server:{middlewareMode:true,hmr:false},appType:'custom'});
const fullName='[현대건설(주)] 아산병원 P동 주차장 증축공사 견적용역';
const shortName=fullName.replace(/^\[.*?\]\s*/, '').replace(/\s*(견적용역|용역|공사\s*견적용역)$/g, '').trim();
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
function exporter(source,start,end,assignment,context){
 const text=readFileSync(source,'utf8'),first=text.indexOf(start),last=text.indexOf(end,first);
 assert.ok(first>=0&&last>first,'Actual export function boundary must exist');
 const code=ts.transpileModule(text.slice(first,last)+'\n'+assignment,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};runInNewContext(code,{exports,...context});return exports;
}
try{
 const {translateWorkbook}=await server.ssrLoadModule('/src/services/translationService.ts');
 const {buildProjectRangeWorkbook,parseProjectsWorkbook}=await server.ssrLoadModule('/src/services/excelService.ts');
 const {useLanguageStore}=await server.ssrLoadModule('/src/store/useLanguageStore.ts');
 const {buildMeetingWorkbook,rebuildTranslatedMeetingWorkbook,writeMeetingWorkbook,readMeetingBody}=await server.ssrLoadModule('/src/services/meetingExcel.ts');
 const {buildInquiryWorkbookBuffer,readInquiryExcel}=await server.ssrLoadModule('/src/services/inquiryExcel.ts');
 useLanguageStore.setState({lang:'vi'});
 const requests=[];
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),'/api/translation','Export test must not call an external provider');
  const {texts}=JSON.parse(init.body);requests.push(...texts);
  for(const text of texts){assert.ok(!text.includes(fullName),'Full project identity must not leave the exporter');assert.ok(!text.includes(shortName),'Short project identity must not leave the exporter');}
  return Response.json({results:texts.map(text=>({translatedText:'VI: '+text.replace(/[가-힣]/g,'v')}))});
 };
 const task={roleName:'조적',personId:'worker',personIds:['worker'],startDate:'2026-10-01',endDate:'2026-10-20',status:'예정',memo:''};
 const project={id:'qa-project-name106',code:'QA-NAME106',name:fullName,department:'마감팀',pmId:'worker',startDate:'2026-10-01',endDate:'2026-10-20',status:'진행중',progress:0,roles:{PM:{...task,roleName:'PM'}},subTasks:{조적:task,창호:{...task,roleName:'창호',startDate:'',endDate:''}},postDeliveryTasks:[{id:'followup106',kind:'수정',startDate:'2026-11-01',endDate:'2026-11-02',personIds:['worker'],status:'예정',memo:''}]};
 await check('프로젝트명 VI Excel: 실제 일정 exporter의 월간·통합·공종·납품후·검수 이름과 복원 원본 보존',async()=>{
  const before=structuredClone(project),messages=[];let downloaded;
  const {exportProjectsToExcel}=exporter(new URL('../src/services/excelService.ts',import.meta.url),'export async function exportProjectsToExcel','export function parseProjectsWorkbook','exports.exportProjectsToExcel=exportProjectsToExcel;',{
   buildProjectRangeWorkbook,translateWorkbook,useLanguageStore,usePersonalStore:{getState:()=>({leaves:[]})},translatedAlert:message=>messages.push(message),XLSX:{writeFile(workbook,filename){assert.ok(filename.startsWith('CONCOST_Lich_trinh_'));downloaded=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});}},
  });
  assert.equal(await exportProjectsToExcel([project],[{id:'worker',name:'담당자',team:'마감팀'}],new Date(2026,9,1),2,'ALL','vi'),true);
  assert.deepEqual(messages,[]);assert.ok(downloaded);assert.deepEqual(project,before);
  for(const sheetName of downloaded.SheetNames){
   if(sheetName==='복원데이터'||sheetName==='계획실적'||sheetName==='휴가일정')continue;
   const visible=Object.entries(downloaded.Sheets[sheetName]).filter(([key])=>!key.startsWith('!')).map(([,cell])=>String(cell.v));
   assert.ok(visible.includes(sheetName.includes('타임라인')||sheetName==='프로젝트통합요약'?shortName:fullName),'Project identity preserved in '+sheetName);
  }
  assert.notEqual(downloaded.Sheets['2026년10월_타임라인일정표'].A1.v,buildProjectRangeWorkbook([project],[],new Date(2026,9,1),2).Sheets['2026년10월_타임라인일정표'].A1.v,'Other export labels must still translate');
  assert.deepEqual(parseProjectsWorkbook(downloaded),[before]);
 });
 await check('프로젝트명 VI 회의록: 실제 exporter 제목·본문 Korean 이름, 번역된 항목·XLSX 재개봉 보존',async()=>{
  const record={id:'qa-meeting-name106',projectId:project.id,projectCode:project.code,projectName:fullName,title:shortName+' 회의',author:'합성 작성자',authorAffiliation:'합성 부서',authorPosition:'프로',clientName:'합성 발주처',meetingDate:'2026-10-14',startTime:'09:00',endTime:'10:00',location:'회의실',reportingDept:'마감팀',referenceDept:'구조팀',attendeesInternal:[],attendeesExternal:[],notesAndInstructions:shortName+' 일정 검토',attachedFileName:'',summary:'',decisions:[],actionItems:[]};
  const before=structuredClone(record),messages=[];let downloaded;
  const {exportMeeting}=exporter(new URL('../src/components/MinutesView.tsx',import.meta.url),'  const handleExportMeetingExcel =','  const handleExportExcel =','exports.exportMeeting=handleExportMeetingExcel;',{
   buildMeetingWorkbook,rebuildTranslatedMeetingWorkbook,activeSubTab:'archive',currentMeeting:undefined,getMeetingClientName:meeting=>meeting.clientName,translateWorkbook,downloadMeetingWorkbook(workbook){downloaded=XLSX.read(writeMeetingWorkbook(workbook),{type:'array'});},useLanguageStore,setAiToast:message=>messages.push(message),setTimeout:()=>0,
  });
  await exportMeeting(record);assert.ok(downloaded,'Actual meeting exporter must write XLSX');assert.deepEqual(record,before);
  assert.equal(downloaded.Sheets.회의록.C13.v,record.title);assert.equal(readMeetingBody(downloaded),record.notesAndInstructions);
  assert.notEqual(downloaded.Sheets.회의록.C2.v,buildMeetingWorkbook(record).Sheets.회의록.C2.v,'Meeting labels still translate');
  assert.ok(!messages.some(message=>/실패|완료하지 못/.test(message)));
 });
 await check('프로젝트명 질의 Excel: VI 화면에서도 3팀 표제·텍스트·사진 원본의 Korean 이름 보존',async()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Vn1cAAAAASUVORK5CYII=';
  const rows=['마감팀','구조팀','토목&조경팀'].map((department,index)=>({id:'qa-inquiry-name106-'+index,projectId:project.code,department,no:'1',trade:department==='구조팀'?'보':department==='마감팀'?'조적':'부대토목',classification:'1층',drawingNumbers:['A-101'],question:shortName+' 확인',answer:'한국어 답변',review:'검토',notes:'',group:'1차',roundNumber:1,images:index?[]:[{id:'qa-name106-picture',field:'question',name:'도면.png',mimeType:'image/png',dataUrl:png,caption:'도면 설명'}],authorId:'qa-author106',authorName:'합성 직원',status:'PUBLISHED',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z',revision:1}));
  const before=structuredClone(rows),requestCount=requests.length,bytes=await buildInquiryWorkbookBuffer(rows,{projectName:fullName});
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
  for(const sheet of book.worksheets.filter(sheet=>sheet.state==='visible'))assert.equal(sheet.getCell('B1').text,'■ '+fullName);
  const read=await readInquiryExcel(bytes,{projectId:project.code,authorId:'qa-reader106',authorName:'합성 직원'});
  assert.deepEqual(read.inquiries.map(row=>row.question),rows.map(row=>row.question));assert.equal(read.inquiries[0].images[0].dataUrl,png);assert.deepEqual(rows,before);assert.equal(requests.length,requestCount,'Inquiry export must not send saved inquiry text to the VI provider');
 });
 assert.ok(requests.length,'VI calendar/meeting labels must exercise translation');
 console.log(JSON.stringify({kind:'SYNTHETIC_KOREAN_PROJECT_NAME_EXPORTS',pass:checks.length,fail:0,checks}));
}finally{globalThis.fetch=originalFetch;await server.close();}
