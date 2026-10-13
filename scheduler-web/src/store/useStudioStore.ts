import {refreshPersonal,usePersonalStore} from './usePersonalStore';
import seedProjects from '../data/realProjects.json';
import {rebaseProject} from '../utils/rebaseProject';
import {create} from 'zustand';
import {studioApi,StudioError} from '../services/studioApi';
import {useProjectStore,mergeDirectoryPersonnel,type Project} from './useProjectStore';
import {useAuthStore} from './useAuthStore';
import {focusWorkLogsForUser,useWorkLogStore} from './useWorkLogStore';
import {canManageSchedule} from '../utils/schedulePermissions';
import type {PendingIntakeProject} from '../utils/pendingAssignment';
export interface StudioNotification {id:string;meeting_id:string;message:string;created_at:string;read_at:string|null}
interface StudioState {
 pendingIntake:PendingIntakeProject[];
 archivedProjects:Project[];
 actorId:string|null;ready:boolean;hasLoaded:boolean;status:string;pending:number;conflict:boolean;
 unreadCount:number;notifications:StudioNotification[];meetings:any[];openMeetingId:string|null;
}
export const useStudioStore=create<StudioState>(()=>({pendingIntake:[],archivedProjects:[],actorId:null,ready:false,hasLoaded:false,status:'중앙 서버 연결 확인 중',pending:0,conflict:false,unreadCount:0,notifications:[],meetings:[],openMeetingId:null}));
let stopCurrent=()=>{};
let refreshCurrent=async()=>{};
let flushCurrent=async()=>{};
let queue=new Map<string,{base:Project;project:Project}>();
let known=new Map<string,Project>();
let queueKey='';
let applying=false;
let meetingRefresh=0;
const persist=()=>{if(queueKey)localStorage.setItem(queueKey,JSON.stringify([...queue]));useStudioStore.setState({pending:queue.size});};
export async function restoreStudioSession(){
 try{const {user}=await studioApi('session');useAuthStore.setState({currentUser:user,isAuthenticated:true});}
 catch(error){if(!import.meta.env.DEV)useAuthStore.setState({currentUser:null,isAuthenticated:false,loginError:error instanceof StudioError&&error.status===401?null:'중앙 서버 연결을 확인할 수 없습니다. 잠시 후 다시 로그인해 주세요.'});}
}
export async function refreshStudioMeetings(){
 const actor=useAuthStore.getState().currentUser?.id,session=refreshCurrent,request=++meetingRefresh;
 const [minutes,inbox]=await Promise.all([studioApi('meetings'),studioApi('notifications')]);
 if(!actor||actor!==useAuthStore.getState().currentUser?.id||session!==refreshCurrent||request!==meetingRefresh)return;
 useStudioStore.setState({meetings:minutes.meetings,notifications:inbox.notifications,unreadCount:inbox.unreadCount});
}
export function startStudioSync(userId:string) {
 stopCurrent();let stopped=false,busy=false,sessionConfirmed=false;let timer:ReturnType<typeof setInterval>;
 focusWorkLogsForUser(userId);
 let unsubscribe=()=>{};let versions:Record<string,number|string>={};
 queueKey=`studio-outbox:${userId}`;
 try{queue=new Map(JSON.parse(localStorage.getItem(queueKey)||'[]'));}catch{queue=new Map();}
 known=new Map();
 useStudioStore.setState({pendingIntake:[],actorId:userId,ready:false,hasLoaded:false,conflict:false,status:'중앙 서버 연결 확인 중',pending:queue.size});
 // Before the first shared pull, preserve this PC's old store and merge only edits versus the shipped seed.
 const backupKey='studio-legacy-project-backup-v1',migrationKey=`studio-legacy-import-v1:${userId}`;
 try{
  if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(useProjectStore.getState().projects));
  if(!localStorage.getItem(migrationKey)){
   const previous=JSON.parse(localStorage.getItem(backupKey)||'[]') as Project[];
   for(const project of previous){
    if(!canManageSchedule(useAuthStore.getState().currentUser,project.department,false))continue;
    const base=(seedProjects as unknown as Project[]).find(p=>p.id===project.id);
    if(!queue.has(project.id)&&(!base||JSON.stringify(base)!==JSON.stringify(project)))queue.set(project.id,{base:base||project,project});
   }
   persist();localStorage.setItem(migrationKey,'1');
  }
 }catch{useStudioStore.setState({status:'이전 PC 자료 보존 실패 · 저장 공간을 확보한 뒤 다시 로그인하세요.'});return ()=>{};}

 const current=()=>!stopped&&useAuthStore.getState().currentUser?.id===userId;
 const publishRemote=(records:{project:Project}[],archived:{project:Project}[]=[],pendingIntake:PendingIntakeProject[]=[])=>{
  if(!current())return;
  const remote=new Map(records.map(r=>[r.project.id,r.project]));
  known=new Map(remote);
  applying=true;
  const local=useProjectStore.getState().projects;
  useStudioStore.setState({pendingIntake,archivedProjects:archived.map(r=>r.project)});
  const merged=local.filter(p=>remote.has(p.id)||queue.has(p.id)).map(p=>queue.get(p.id)?.project||(JSON.stringify(remote.get(p.id))===JSON.stringify(p)?p:remote.get(p.id))||p);
  for(const [id,p]of remote)if(!merged.some(x=>x.id===id))merged.push(p);
  if(merged.length!==local.length||merged.some((p,i)=>p!==local[i]))useProjectStore.setState({projects:merged});applying=false;
 };
 const tick=async()=>{
  if(!current()||busy)return;busy=true;
  try{
   if(!sessionConfirmed){
    const {user}=await studioApi('session');if(!current()||user.id!==userId)return;
    sessionConfirmed=true;useStudioStore.setState({conflict:false,pending:queue.size});
   }
   if(!useStudioStore.getState().conflict)for(const [id,item] of [...queue]){
    const result=await studioApi('projects','POST',item);
    if(!current())return;
    known.set(id,result.project);
    if(queue.get(id)===item){queue.delete(id);applying=true;useProjectStore.setState({projects:useProjectStore.getState().projects.map(p=>p.id===id?result.project:p)});applying=false;}
    else {const latest=queue.get(id);if(latest)queue.set(id,{base:result.project,project:rebaseProject(result.project,item.project,latest.project)});}
    persist();
   }
   const {versions:latest}=await studioApi('changes');
   if(latest.projects!==versions.projects||latest.intake!==versions.intake){const response=await studioApi('projects');publishRemote(response.projects,response.archived,response.pendingIntake);}
   if(latest.meetings!==versions.meetings||latest.inbox!==versions.inbox)await refreshStudioMeetings();
   if(latest.directory!==versions.directory){const {users}=await studioApi('directory');if(current()){useAuthStore.setState({users});useProjectStore.setState({personnel:mergeDirectoryPersonnel(useProjectStore.getState().personnel,users)});}}
   if(latest.personal!==versions.personal||latest.projects!==versions.projects)await refreshPersonal();
   versions=latest;
   if(current())useStudioStore.setState({ready:true,hasLoaded:true,status:queue.size?'변경 전송 대기':'중앙 공유 연결 · 다른 화면 자동 갱신 (2초 간격)',pending:queue.size});
  }catch(error){if(current())useStudioStore.setState({ready:false,status:error instanceof Error?error.message:'중앙 공유 연결 실패 · 로컬 변경 유지',conflict:error instanceof StudioError&&error.status===409||useStudioStore.getState().conflict});}
  finally{busy=false;}
 };
 refreshCurrent=()=>{versions.projects=-1;return tick();};
 flushCurrent=tick;
   let previous=useProjectStore.getState().projects;
   unsubscribe=useProjectStore.subscribe(state=>{
    const before=previous;previous=state.projects;if(applying||!current())return;
    for(const project of state.projects){const old=before.find(p=>p.id===project.id);if(!old||JSON.stringify(old)!==JSON.stringify(project)){
     if(!canManageSchedule(useAuthStore.getState().currentUser,project.department))continue;
     queue.set(project.id,{base:queue.get(project.id)?.base||known.get(project.id)||old||project,project});
    }}
    persist();if(useStudioStore.getState().ready)void tick();
   });
 void tick();
 timer=setInterval(()=>void tick(),2000);
 const stop=()=>{usePersonalStore.setState({leaves:[],checks:[],loaded:false,openDate:null,openWorkLogId:null,openExtension:null});useWorkLogStore.setState({workLogs:[],selectedWorkLogId:null});stopped=true;refreshCurrent=async()=>{};flushCurrent=async()=>{};clearInterval(timer);unsubscribe();useStudioStore.setState({pendingIntake:[],archivedProjects:[],actorId:null,ready:false,hasLoaded:false,conflict:false,pending:0,status:'중앙 서버 연결 확인 중',unreadCount:0,notifications:[],meetings:[],openMeetingId:null});};stopCurrent=stop;return stop;
}
export async function refreshStudioProjects(){
 const actor=useAuthStore.getState().currentUser?.id,session=refreshCurrent;
 await session();
 const state=useStudioStore.getState();
 if(!actor||actor!==useAuthStore.getState().currentUser?.id||session!==refreshCurrent||state.actorId!==actor)throw new Error('계정 또는 연결이 변경되어 일정 확인을 중단했습니다.');
 if(!state.ready||!state.hasLoaded)throw new Error(state.status||'중앙 일정 연결을 확인해 주세요.');
}
export async function waitForSchedulePublished(ids:string[], timeoutMs=20000){
 const actor=useAuthStore.getState().currentUser?.id;
 if(!actor||!useStudioStore.getState().ready)throw new Error('중앙 공유 연결 후 일정을 가져오세요.');
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  if(useAuthStore.getState().currentUser?.id!==actor)throw new Error('계정이 변경되어 중앙 저장 확인을 중단했습니다.');
  if(useStudioStore.getState().conflict)throw new Error('중앙 일정 충돌이 발생했습니다. 상단의 미전송 변경을 확인하세요.');
  if(ids.every(id=>known.has(id)&&!queue.has(id)))return;
  await flushCurrent();
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('중앙 저장을 아직 확인하지 못했습니다. 상단의 미전송 상태를 확인하세요.');
}
export async function publishLocalTeam(){
 if(!useStudioStore.getState().ready)throw new Error('중앙 서버에 로그인해 주세요.');
 for(const project of useProjectStore.getState().projects)if(canManageSchedule(useAuthStore.getState().currentUser,project.department)&&!known.has(project.id))queue.set(project.id,{base:project,project});
 persist();
}
export async function resolveScheduleConflict(keepLocal:boolean){
 const actor=useAuthStore.getState().currentUser?.id,session=refreshCurrent;
 const response=await studioApi('projects');
 if(!actor||actor!==useAuthStore.getState().currentUser?.id||useStudioStore.getState().actorId!==actor||session!==refreshCurrent)throw new Error('계정 또는 동기화 연결이 변경되어 충돌 처리를 중단했습니다. 현재 계정의 입력은 유지됩니다.');
 const remote=new Map<string,Project>(response.projects.map((r:any)=>[r.project.id,r.project]));
 const archived=new Set<string>((response.archived||[]).map((r:any)=>r.project.id));
 if(keepLocal&&[...queue.keys()].some(id=>archived.has(id)))throw new Error('정리된 프로젝트의 대기 변경은 보존되어 있습니다. 서버 내용 적용 후 프로젝트를 복원하고 수정하세요.');
 if(keepLocal){for(const [id,item]of queue)if(remote.has(id))queue.set(id,{base:remote.get(id)!,project:rebaseProject(remote.get(id)!,item.base,item.project)});}
 else {applying=true;useProjectStore.setState({projects:useProjectStore.getState().projects.filter(p=>!archived.has(p.id)).map(p=>remote.get(p.id)||p)});applying=false;queue.clear();}
 persist();useStudioStore.setState({pendingIntake:response.pendingIntake||[],conflict:false,archivedProjects:(response.archived||[]).map((r:any)=>r.project)});refreshCurrent();
}

export async function changeProjectLifecycle(project:Project,restore:boolean){
 const state=useStudioStore.getState();
 if(!state.ready||state.pending||state.conflict)throw new Error('공유 연결과 대기 변경을 먼저 확인하세요.');
 await studioApi(`projects/${encodeURIComponent(project.id)}/${restore?'restore':'archive'}`,'POST',{base:project});
 refreshCurrent();
}
