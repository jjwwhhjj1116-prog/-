import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {applyProjectDates,taskWithProjectDates} from '../src/utils/projectScheduleDates.ts';
import {updateAssignmentMembers} from '../src/utils/scheduleAllocations.ts';
import {rebaseProject} from '../src/utils/rebaseProject.ts';
import {allocationScheduleOnly} from '../src/utils/scheduleProgress.ts';
globalThis.crypto??=webcrypto;
const task={roleName:'내부',personId:'a',personIds:['a'],startDate:'2026-10-13',endDate:'2026-10-15',status:'진행중',memo:'원문',progress:42,actualProgressDate:'2026-10-13',reportingModes:{a:'TASK'}};
const project={id:'qa-common',code:'QA-COMMON',name:'합성 공통 기간',department:'마감팀',pmId:'',startDate:'2026-10-13',endDate:'2026-10-15',status:'진행중',progress:42,roles:{},subTasks:{내부:task}};
const test=(name,fn)=>{fn();console.log('PASS '+name);};
test('공통 날짜: 명시 PROJECT만 갱신하고 기존 수기·실적·보고 데이터 불변',()=>{
 const before=structuredClone(project),next={...before,endDate:'2026-10-20',subTasks:{내부:{...before.subTasks.내부,dateMode:'PROJECT'},창호:{...before.subTasks.내부,roleName:'창호'},외부:{...before.subTasks.내부,roleName:'외부',dateMode:'CUSTOM'}}};
 const result=applyProjectDates(next);assert.equal(result.내부.endDate,'2026-10-20');assert.deepEqual(result.창호,next.subTasks.창호);assert.deepEqual(result.외부,next.subTasks.외부);for(const key of ['personIds','progress','actualProgressDate','reportingModes','memo'])assert.deepEqual(result.내부[key],task[key]);assert.deepEqual(project,before);
});
test('개인 날짜: PROJECT allocation만 상속하고 Excel ID/source·개별 기간·공백 유지',()=>{
 const original={...task,dateMode:'PROJECT',legacyAllocationId:'original',allocations:[{id:'common',personIds:['a'],startDate:task.startDate,endDate:task.endDate,dateMode:'PROJECT'},{id:'original',personIds:['b'],startDate:'2026-10-22',endDate:'2026-10-23',source:{sheet:'원본',projectRange:'B1'}}]};
 const result=taskWithProjectDates(original,{startDate:'2026-10-16',endDate:'2026-10-16'});assert.equal(result.allocations[0].id,'common');assert.equal(result.allocations[0].startDate,'2026-10-16');assert.equal(result.allocations[0].endDate,'2026-10-16');assert.deepEqual(result.allocations[1],original.allocations[1]);assert.equal(result.legacyAllocationId,'original');assert.equal(result.progress,42);assert.equal(result.endDate,'2026-10-23');
});
test('공통 날짜 범위: 전체 프로젝트 입력에서도 작업/투입 ID 및 역할 구조는 복사되지 않음',()=>{
 const common={...task,dateMode:'PROJECT',allocations:[{id:'common-id',personIds:['a'],startDate:task.startDate,endDate:task.endDate,dateMode:'PROJECT'}]};
 const next={...project,endDate:'2026-10-20',subTasks:{내부:common,창호:{...task,dateMode:'PROJECT',roleName:'창호'}}};
 const result=applyProjectDates(next);assert.equal(result.내부.allocations[0].id,'common-id');assert.equal(result.내부.allocations[0].endDate,'2026-10-20');
 for(const entry of [result.내부.allocations[0],result.창호])for(const key of ['code','name','subTasks','roles','department'])assert.ok(!(key in entry),'Project field leaked: '+key);
 assert.equal(result.창호.roleName,'창호');assert.ok(!('id' in result.창호));
});
test('계획 날짜/상속 방식/담당 변경은 승인 실적 재계산0, 실제 보고 변경은 감지',()=>{
 const before={내부:task},after={내부:{...task,dateMode:'PROJECT',startDate:'2026-10-20',endDate:'2026-10-21',personId:'b',personIds:['b']}};
 assert.equal(allocationScheduleOnly(before,after),true);assert.equal(allocationScheduleOnly(before,{내부:{...after.내부,progress:43}}),false);
 const allocated={내부:{...task,allocations:[{id:'same-id',personIds:['a'],startDate:task.startDate,endDate:task.endDate}]}};
 assert.equal(allocationScheduleOnly(allocated,{내부:{...allocated.내부,dateMode:'PROJECT',allocations:[{...allocated.내부.allocations[0],dateMode:'PROJECT',endDate:'2026-10-20'}]}}),true);
});
test('VN 신규 팀/개인: 자동 구간은 PROJECT, 직접 정한 개인 기간은 CUSTOM',()=>{
 const blank={...task,personId:'',personIds:[],dateMode:'PROJECT'};
 const common=updateAssignmentMembers(blank,{addIds:['vn-one','vn-two']});assert.equal(common.allocations.length,1);assert.equal(common.allocations[0].dateMode,'PROJECT');assert.deepEqual(common.allocations[0].personIds,['vn-one','vn-two']);
 const updated=taskWithProjectDates(common,{startDate:'2026-10-20',endDate:'2026-10-21'});assert.equal(updated.allocations[0].id,common.allocations[0].id);assert.equal(updated.allocations[0].startDate,'2026-10-20');
 const custom=updateAssignmentMembers(blank,{addIds:['vn-custom'],startDate:'2026-10-22',endDate:'2026-10-22'});assert.notEqual(custom.allocations[0].dateMode,'PROJECT');assert.deepEqual(taskWithProjectDates(custom,{startDate:'2026-11-01',endDate:'2026-11-03'}).allocations,custom.allocations);
});
test('공통 기간 검증: 하루 허용·역순/미정 입력은 기존 배정 미변경·빈 alloc 유령0',()=>{
 const common={...task,dateMode:'PROJECT'};assert.equal(taskWithProjectDates(common,{startDate:'2026-10-20',endDate:'2026-10-20'}).endDate,'2026-10-20');assert.equal(taskWithProjectDates(common,{startDate:'2026-10-21',endDate:'2026-10-20'}),common);assert.equal(taskWithProjectDates(common,{startDate:'',endDate:''}),common);
 const empty={...common,allocations:[]};assert.deepEqual(taskWithProjectDates(empty,{startDate:'2026-10-20',endDate:'2026-10-20'}),empty);
});
test('공통 기간 경합: 다른 메모 보존·같은 project 날짜 동시 변경은 입력 보존 오류',()=>{
 const original={...project,subTasks:{내부:{...task,dateMode:'PROJECT'}}},local={...original,endDate:'2026-10-20'},remote={...original,subTasks:{내부:{...original.subTasks.내부,memo:'다른 화면 메모'}}};
 const merged=rebaseProject(remote,original,local,true);assert.equal(merged.subTasks.내부.memo,'다른 화면 메모');assert.equal(merged.subTasks.내부.endDate,'2026-10-20');assert.equal(merged.subTasks.내부.progress,42);
 assert.throws(()=>rebaseProject({...remote,endDate:'2026-10-22'},original,local,true),/같은 일정 항목/);
});
