import {syncAutomaticWorklogs} from '../functions/lib/automaticWorklogs.ts';
export default {
 async scheduled(event:{scheduledTime:number},env:any){
  const result=await syncAutomaticWorklogs(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify(result));
  if(result.conflicts)throw new Error('Automatic worklog conflicts; next scheduled run will retry');
 }
};
