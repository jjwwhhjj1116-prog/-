import {useEffect} from 'react';
import {studioApi} from '../services/studioApi';
import {useAuthStore} from '../store/useAuthStore';
import {useStudioStore} from '../store/useStudioStore';
import {isScheduleAdmin} from '../utils/schedulePermissions';

// One request per browser realm also covers a logout/login while the old request is pending.
let inFlight=false;
export function AutomaticWorklogSync(){
 const actor=useAuthStore(state=>state.currentUser),studio=useStudioStore();
 useEffect(()=>{
  if(!actor||(!isScheduleAdmin(actor)&&!['마감팀','구조팀','토목&조경팀'].includes(actor.department))||!studio.ready||studio.actorId!==actor.id)return;
  let stopped=false,delay=60000,nextAt=0,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!stopped&&useAuthStore.getState().currentUser===actor;
  const interval=()=>document.hidden?300000:60000;
  const schedule=(after:number)=>{clearTimeout(timer);if(current())timer=setTimeout(()=>void tick(),after);};
  const tick=async()=>{
   if(!current())return;
   if(inFlight){schedule(interval());return;}
   if(Date.now()<nextAt){schedule(nextAt-Date.now());return;}
   inFlight=true;
   try{await studioApi('automatic-worklogs/sync','POST');if(current())delay=60000;}
   catch{if(current())delay=Math.min(delay*2,900000);}
   finally{inFlight=false;if(current()){const after=Math.max(delay,interval());nextAt=Date.now()+after;schedule(after);}}
  };
  const visible=()=>{clearTimeout(timer);if(document.hidden){nextAt=Math.max(nextAt,Date.now()+interval());schedule(nextAt-Date.now());}else{if(delay===60000)nextAt=0;void tick();}};
  document.addEventListener('visibilitychange',visible);void tick();
  return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[actor,studio.ready,studio.actorId]);
 return null;
}
