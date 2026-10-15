import assert from 'node:assert/strict';
import {nativeSsrPackages} from './ssr-native-packages.mjs';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import * as XLSX from 'xlsx';

const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
globalThis.window={localStorage:globalThis.localStorage};
const server=await createServer({ssr:{noExternal:[/^(react|react-dom|zustand|xlsx)(\/|$)/]},plugins:[nativeSsrPackages()],server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  const {parseLegacyProjectsWorkbook}=await server.ssrLoadModule('/src/services/excelService.ts');
  const staff=[
    {id:'finish-chief',name:'조한빈 실장',team:'마감팀'},
    {id:'structure-chief',name:'장범선 실장',team:'구조팀'},
    {id:'civil-chief',name:'오승균 파트장',team:'토목&조경팀'},
    {id:'finish-brick',name:'VIET 조적팀',team:'마감팀'},
  ];
  const input=Array.from({length:5},()=>[]);
  input[0][0]='마감팀 프로젝트 일정';
  input[3]=Array(34).fill('');
  Object.assign(input[3],{2:'No',3:'업무명',11:'PM',21:'작업시작일',22:'납품일'});
  input[4]=Array(34).fill('');
  Object.assign(input[4],{2:'TK-TEST',3:'검수 프로젝트',4:'검수 거래처',8:'조한빈',9:'장범선',10:'오승균',11:'조한빈',19:'VIET 조적팀',21:46290,22:46304,25:45,26:'진행중'});
  const settings=[['공종', '표준일수'],...['PM','검토','내역','가설','세대','내부','외부','창호','조적'].map(role=>[role,role==='PM'?0:4])];
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(input),'진행중');
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['공종별 표준 투입일수'],[],[],...settings]),'설정');
  const rows=parseLegacyProjectsWorkbook(workbook,staff);
  assert.equal(rows.length,3,'작업범위 3팀 각각 프로젝트로 분리');
  assert.deepEqual(rows.map(r=>r.project.department),['마감팀','구조팀','토목&조경팀']);
  assert.deepEqual(rows.map(r=>r.project.pmId),['finish-chief','structure-chief','civil-chief']);
  assert.equal(rows[0].project.subTasks.조적.personId,'finish-brick');
  assert.equal(rows[0].project.progress,0,'원본 퍼센트를 승인된 업무일지 실적으로 가져오지 않음');
  assert.equal(rows[0].oldProgress,45);
  assert.ok(rows.every(r=>r.issues.length===0));
  const original=structuredClone(input);
  original[4][11]='미등록 직원';
  workbook.Sheets['진행중']=XLSX.utils.aoa_to_sheet(original);
  assert.ok(parseLegacyProjectsWorkbook(workbook,staff)[0].issues.some(issue=>issue.includes('미등록 직원')));
  original[4][8]='X';original[4][9]='X';original[4][10]='X';
  workbook.Sheets['진행중']=XLSX.utils.aoa_to_sheet(original);
  assert.throws(()=>parseLegacyProjectsWorkbook(workbook,staff),/작업범위 담당자/);
  assert.throws(()=>parseLegacyProjectsWorkbook(XLSX.utils.book_new(),staff),/형식/);
  console.log('PASS 구형 Excel 3팀·담당자·날짜·실적 분리·미등록자 차단');
  if (process.argv[2]) {
    const source=XLSX.read(readFileSync(process.argv[2]),{type:'buffer'});
    const {useProjectStore}=await server.ssrLoadModule('/src/store/useProjectStore.ts');
    const actual=parseLegacyProjectsWorkbook(source,useProjectStore.getState().personnel);
    assert.equal(new Set(actual.map(r=>r.project.code)).size,6);
    const target=actual.filter(r=>r.project.code==='2026010');
    assert.deepEqual(target.map(r=>r.project.department),['마감팀','구조팀']);
    const {assignedItems}=await server.ssrLoadModule('/src/utils/personalWork.ts');
    assert.ok(assignedItems('vt_brick','2026-03-06',[target[0].project]).some(item=>item.roleName==='조적'));
    assert.equal(assignedItems('vt_brick','2026-03-12',[target[0].project]).length,0);
    console.log(JSON.stringify({sourceCodes:[...new Set(actual.map(r=>r.project.code))],teamRows:actual.length,readyRows:actual.filter(r=>!r.issues.length).length,issues:actual.filter(r=>r.issues.length).map(r=>({code:r.project.code,department:r.project.department,issues:r.issues}))},null,2));
  }
} finally {
  await server.close();
}
