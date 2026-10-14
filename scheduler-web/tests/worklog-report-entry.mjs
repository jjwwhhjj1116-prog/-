import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const web=new URL('../',import.meta.url),require=createRequire(new URL('package.json',web));
const sourceArg=process.argv.find(arg=>arg.startsWith('--daily-source='));
const dailyPath=sourceArg?pathToFileURL(sourceArg.slice('--daily-source='.length)):new URL('src/components/DailyWorkLogView.tsx',web);
const dailySource=readFileSync(dailyPath,'utf8');
// Reuse the complete real Daily component/effect harness; expose rendered handlers only in memory.
let harness=readFileSync(new URL('tests/notification-context.mjs',web),'utf8');
harness=harness.slice(0,harness.indexOf('if(process.argv[1]'));
for(const name of ['vite','typescript'])harness=harness.replaceAll("from '"+name+"'","from '"+pathToFileURL(require.resolve(name)).href+"'");
harness=harness.replace("from './ssr-native-packages.mjs'","from '"+new URL('tests/ssr-native-packages.mjs',web).href+"'")
 .replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(new URL('package.json',web).href)})`)
 .replace("new URL('../src/components/DailyWorkLogView.tsx',import.meta.url)",`new URL(${JSON.stringify(dailyPath.href)})`)
 .replace("new URL('../../private-provisioning/original-before-extension-context-20261006/scheduler-web/src/components/DailyWorkLogView.tsx',import.meta.url)",`new URL(${JSON.stringify(dailyPath.href)})`)
 .replace("new URL('../',import.meta.url)",`new URL(${JSON.stringify(web.href)})`);
const expose="elementNodes:()=>nodes(tree),filter:(label,value)=>{const select=control(label);assert.ok(select);select.props.onChange({target:{value}});settle();},";
assert.ok(harness.includes('return {settle,snapshot,trace,effects,reads,'));
harness=harness.replace('return {settle,snapshot,trace,effects,reads,','return {'+expose+'settle,snapshot,trace,effects,reads,');
const {runDailyHarness}=await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64'));
const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.props?.children):node==null?'':String(node);
const button=(s,label)=>s.elementNodes().find(node=>node.type==='button'&&node.props.role!=='tab'&&text(node.props.children).trim()===label);
const headerExtension=s=>{const section=s.elementNodes().find(node=>node.type==='section'&&node.props['aria-label']==='업무보고 작성');const find=node=>Array.isArray(node)?node.flatMap(find):node&&typeof node==='object'&&node.props?[node,...find(node.props.children)]:[];return find(section).find(node=>node.type==='button'&&text(node.props.children).trim()==='일정 연장 요청');};
const result=await runDailyHarness(dailySource,async({screen,check,manager,originalLog})=>{
 // 10/6, 10/7, 10/8, 10/12 are four work days: 10/9 is the KR Hangul holiday, 10/10-11 the weekend.
 const project=(id,role='PM')=>({id,code:'QA-'+id,name:'합성 보고 진입 '+id,department:'마감팀',pmId:manager.id,startDate:'2026-10-06',endDate:'2026-10-12',roles:{},subTasks:{[role]:{roleName:role,personIds:[manager.id],startDate:'2026-10-06',endDate:'2026-10-12',status:'예정',progress:0,memo:'시작 전 배정 업무',reportingMode:'DAILY'}}});
 const p1=project('entry-A'),p2=project('entry-B','내부'),taskId=`gen-${p1.id}-PM`;
 const setup=options=>{const s=screen({projects:[p1,p2],...options});s.settle();return s;};
 const update=(s,key,value)=>{const fields=s.reportFields();assert.ok(fields,'시작 전에도 TaskReportFields를 표시해야 함');assert.equal(fields.props.canEdit,true);fields.props.update(fields.props.item.id,key,value);s.settle();return s.reportFields().props.item;};
 await check('즉시 보고: 최초 DAILY 배정은 첫날 1/4일 25% 자동작성, 수기 37%는 보존',()=>{
  const s=setup(),fields=s.reportFields();assert.ok(fields);assert.equal(fields.props.canEdit,true);assert.equal(fields.props.item.progress,25);assert.equal(fields.props.item.autoScheduleDate,'2026-10-06');assert.equal(fields.props.item.status,'진행중');assert.ok(fields.props.item.todayTask.includes('일정 기준 자동 작성'));assert.ok(!fields.props.item.manualFields.includes('todayTask'),'업무 선택만으로 수기본문으로 표시하지 않음');assert.ok(!button(s,'업무 시작'),'별도의 업무 시작 단계를 요구하지 않음');assert.ok(!text(s.tree()).includes('업무 시작 준비'));
  const updated=update(s,'progress',37);assert.equal(updated.progress,37);assert.ok(updated.manualFields.includes('progress'));assert.equal(updated.planStartedAt,undefined);assert.ok(updated.todayTask.includes('일정 기준 자동 작성'));assert.ok(!updated.manualFields.includes('todayTask'));assert.ok(s.reportFields());return {context:s.snapshot(),progress:updated.progress,manualFields:updated.manualFields};
 });
 await check('시작 전 직접 연장: 보고 헤더 버튼이 현재 프로젝트·PM 배정을 열고 초안을 보존',()=>{
  const s=setup(),before=s.snapshot(),extension=headerExtension(s);assert.ok(extension,'업무보고 작성 헤더에 직접 연장 버튼을 표시해야 함');assert.equal(extension.props.disabled,false);s.editNote('연장 전 종합 초안');extension.props.onClick();s.settle();assert.deepEqual(s.snapshot().extension,{project:p1.id,task:taskId});assert.equal(s.readLogs().length,0,'요청 화면 이동만으로 업무일지를 저장하지 않음');s.reportTab();assert.equal(s.snapshot().task,before.task);assert.equal(s.note().value,'연장 전 종합 초안');return {before,extension:{project:p1.id,task:taskId},returned:s.snapshot(),note:s.note().value};
 });
 await check('프로젝트 전환 후 연장: 다른 공종을 이전 PM으로 보내지 않고 선택한 B·내부에 연결',()=>{
  const s=setup();s.filter('보고 프로젝트',p2.id);const before=s.snapshot();assert.equal(before.task,'gen-entry-B-내부');const extension=headerExtension(s);assert.ok(extension);assert.equal(extension.props.disabled,false);extension.props.onClick();s.settle();assert.deepEqual(s.snapshot().extension,{project:p2.id,task:'gen-entry-B-내부'});return {before,opened:s.snapshot()};
 });
 await check('연장 차단: 공유 연결 전·배정 없음·타인의 결재본에서 직접 요청을 활성화하지 않음',()=>{
  const disconnected=setup({loaded:false}),empty=setup({projects:[]}),readonly=setup({projects:[p1,p2],worklog:originalLog.id,includeLog:true});
  for(const [name,s] of [['disconnected',disconnected],['empty',empty],['readonly',readonly]]){const extension=headerExtension(s);assert.ok(!extension||extension.props.disabled,`${name} 직접 연장 차단`);}assert.equal(readonly.reportFields()?.props.canEdit,false);assert.equal(disconnected.note()?.disabled,true);return {disconnected:disconnected.snapshot(),empty:empty.snapshot(),readonly:readonly.snapshot()};
 });
});
const outputArg=process.argv.find(arg=>arg.startsWith('--output='));
const output={...result,kind:'ACTUAL_DAILY_REPORT_ENTRY_EFFECT_HARNESS',source:fileURLToPath(dailyPath),sourceSha256:createHash('sha256').update(dailySource).digest('hex'),limits:[...result.limits,'실제 Daily onClick/화면 전환을 실행하지만 스토어 입력은 메모리 합성이다. 실제 API/브라우저/다른 PC 운영 검수와 구분한다.','진행률 입력은 실제 Daily가 자식에 전달한 update callback을 호출한다. 실제 자식 슬라이더 DOM 이벤트는 브라우저 검수에서 확인한다.']};
if(outputArg)writeFileSync(outputArg.slice('--output='.length),JSON.stringify(output,null,2)+'\n');
if(output.results.some(row=>row.status==='FAIL'))process.exitCode=1;
