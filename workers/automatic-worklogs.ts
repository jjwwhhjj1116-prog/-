import {syncAutomaticWorklogs} from '../functions/lib/automaticWorklogs.ts';
import {sendScheduledWeeklyApprovals,sendScheduledWeekendApprovals} from '../functions/lib/weeklyApprovals.ts';
export default {
 async scheduled(event:{scheduledTime:number},env:any){
  console.log(JSON.stringify({kind:'AUTO_START',scheduledTime:event.scheduledTime}));
  const result=await syncAutomaticWorklogs(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify(result));
  if(result.conflicts)throw new Error('Automatic worklog conflicts; next scheduled run will retry');
  const weekly=await sendScheduledWeeklyApprovals(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify({weekly}));
  if(weekly.status==='CONFLICT_RETRY')throw new Error('Weekly reporting conflicts; next scheduled run will retry');
  const weekend=await sendScheduledWeekendApprovals(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify({weekend}));
  if(weekend.status==='CONFLICT_RETRY')throw new Error('Weekend reporting conflicts; next scheduled run will retry');
 }
};
