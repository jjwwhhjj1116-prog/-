import {create} from 'zustand';
import {studioApi} from '../services/studioApi';
import {useAuthStore} from './useAuthStore';
import {useWorkLogStore,type DailyWorkLog} from './useWorkLogStore';
import type {Leave} from '../utils/personalWork';
export const usePersonalStore=create<{leaves:Leave[];checks:{day:string;task_id:string;done:number}[];loaded:boolean;openDate:string|null;openTaskId?:string|null;openWorkLogId?:string|null;openExtension?:string|{projectId:string;type:'OVERTIME'|'WEEKEND';requestId:string}|null}>(()=>({leaves:[],checks:[],loaded:false,openDate:null,openWorkLogId:null,openExtension:null}));
let refreshId=0;
export async function refreshPersonal(){
 const actor=useAuthStore.getState().currentUser;if(!actor)return false;
 const requestId=++refreshId,syncedIds=new Set(useWorkLogStore.getState().workLogs.filter(p=>p.serverRevision).map(p=>p.id));
 const observedIds=new Set(syncedIds),unsubscribe=useWorkLogStore.subscribe(state=>{for(const log of state.workLogs)if(log.serverRevision)observedIds.add(log.id);});
 let result;
 try{result=await studioApi('personal');}catch(error){if(actor===useAuthStore.getState().currentUser&&requestId===refreshId)throw error;return false;}finally{unsubscribe();}
 if(actor!==useAuthStore.getState().currentUser||requestId!==refreshId)return false;
 usePersonalStore.setState({leaves:result.leaves,checks:result.checks,loaded:true});
 const previous=useWorkLogStore.getState().workLogs;
 const incoming=result.worklogs.filter((r:DailyWorkLog)=>!observedIds.has(r.id)||previous.some(p=>p.id===r.id)).map((r:DailyWorkLog)=>{
  const current=previous.find(p=>p.id===r.id);
  return current&&typeof current.serverRevision==='number'&&typeof r.serverRevision==='number'&&current.serverRevision>r.serverRevision?current:r;
 });
 const merged=[...incoming,...previous.filter(p=>p.userId===actor.id&&(!p.serverRevision||!syncedIds.has(p.id))&&!result.worklogs.some((r:DailyWorkLog)=>r.id===p.id))];
 if(JSON.stringify(previous)!==JSON.stringify(merged))useWorkLogStore.setState({workLogs:merged});
 return true;
}
