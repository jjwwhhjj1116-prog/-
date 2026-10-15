import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {runDailyHarness} from './notification-context.mjs';

const sourceArg=process.argv.find(arg=>arg.startsWith('--daily-source='));
const source=readFileSync(sourceArg?sourceArg.slice('--daily-source='.length):new URL('../src/components/DailyWorkLogView.tsx',import.meta.url),'utf8');
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):node&&node.props?[node,...nodes(node.props.children)]:[];
const requestForm=screen=>nodes(screen.tree()).find(node=>['OVERTIME','DEADLINE'].includes(node.props.requestType));
const result=await runDailyHarness(source,async({screen,check,manager,author})=>{
 const task=(startDate,endDate)=>({roleName:'PM',personIds:[manager.id],startDate,endDate,status:'진행중',memo:'합성 PM 배정',reportingMode:'DAILY'});
 const other={id:'notice-other',code:'QA-OTHER',name:'다른 합성 현장',department:'마감팀',pmId:manager.id,startDate:'2026-10-06',endDate:'2026-10-12',roles:{},subTasks:{PM:task('2026-10-06','2026-10-12')}};
 const target={...other,id:'notice-target',code:'QA-TARGET',name:'야근 알림 합성 현장',subTasks:{PM:{...task('2026-10-06','2026-10-10'),allocations:[{id:'segment-a',personIds:[manager.id],startDate:'2026-10-06',endDate:'2026-10-08'},{id:'segment-b',personIds:[manager.id],startDate:'2026-10-09',endDate:'2026-10-10'}]}},scheduleExtensions:[
  {id:'older-overtime',userId:manager.id,taskId:'gen-notice-target-PM-segment-a',roleName:'PM',type:'OVERTIME',status:'APPROVED',workDate:'2026-10-07',startTime:'17:00',endTime:'20:00',hours:3},
  {id:'current-overtime',userId:manager.id,taskId:'gen-notice-target-PM-segment-b',roleName:'PM',type:'OVERTIME',status:'APPROVED',workDate:'2026-10-10',startTime:'18:30',endTime:'20:00',hours:1.5},
 ]};
 const context={projectId:target.id,type:'OVERTIME',requestId:'current-overtime',workDate:'2026-10-10'};
 const verify=screen=>{const observed=screen.settle(),form=requestForm(screen);assert.equal(form?.props.requestType,'OVERTIME');assert.equal(observed.project,target.id);assert.equal(observed.role,'PM');assert.equal(observed.date,'2026-10-10');assert.equal(observed.task,'gen-notice-target-PM-segment-b');assert.equal(form.props.projectId,target.id);assert.equal(form.props.selectedTaskId,'gen-notice-target-PM-segment-b');assert.equal(form.props.suggestedDate,'2026-10-10');assert.equal(observed.log,null);assert.equal(screen.readLogs().length,0);return observed;};
 await check('야근 승인 새 화면: 동일 현장 여러 배정 중 신청 ID의 업무·근무일·야근 탭을 정확히 선택',()=>verify(screen({extension:context,projects:[other,target]})));
 await check('야근 근무일은 알림 전달값보다 정확한 신청 ID의 저장 원문을 기준으로 연결',()=>verify(screen({extension:{...context,workDate:'2026-10-11'},projects:[other,target]})));
 await check('야근 승인 기존 화면: 이전 업무 초안은 보관하고 해당 야근으로 이동 후 원래 날짜에서 복원',()=>{
  const s=screen({projects:[other,target]});s.settle();s.editNote('기존 날짜의 미저장 원문');s.update({openExtension:context});const opened=verify(s);
  s.update({openDate:'2026-10-06',openTaskId:'gen-notice-other-PM'});s.settle();s.reportTab();assert.equal(s.note().value,'기존 날짜의 미저장 원문');assert.equal(s.snapshot().project,other.id);assert.equal(s.readLogs().length,0);return {opened,restored:s.snapshot()};
 });
 await check('기존 문자열 연장 알림은 날짜 변경 없이 연장 탭·프로젝트 범위 연결을 유지',()=>{
  const legacy={...target,subTasks:{PM:{...task('2026-10-06','2026-10-10'),personIds:[author.id]}}};
  const s=screen({extension:legacy.id,projects:[other,legacy]}),observed=s.settle(),form=requestForm(s);assert.equal(form.props.requestType,'DEADLINE');assert.equal(observed.project,legacy.id);assert.equal(observed.date,'2026-10-06');assert.equal(observed.role,'');assert.equal(form.props.selectedTaskId,'');return observed;
 });
 await check('다른 직원·없는 신청·잘못된 유형의 야근 문맥은 이전 업무로 잘못 이동하거나 쓰지 않음',()=>{
  for(const options of [{actor:author},{extension:{...context,requestId:'missing'}},{projects:[other,{...target,scheduleExtensions:target.scheduleExtensions.map(request=>request.id===context.requestId?{...request,type:'DEADLINE'}:request)}]}]){
   const s=screen({extension:context,projects:[other,target],...options});s.settle();assert.ok(!requestForm(s));assert.match(s.notice(),/야근 신청을 찾을 수 없거나 현재 열람 권한이 없습니다/);assert.equal(s.readLogs().length,0);
  }
 });
});
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);
if(output){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({...result,kind:'ACTUAL_DAILY_OVERTIME_APPROVAL_CONTEXT',operatingWrites:0},null,2));}
if(result.results.some(row=>row.status==='FAIL'))process.exitCode=1;
