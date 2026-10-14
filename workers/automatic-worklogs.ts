import {syncAutomaticWorklogs} from '../functions/lib/automaticWorklogs.ts';
import {sendWeeklyReports} from '../functions/lib/weeklyReports.ts';
export default {
 async scheduled(event:{scheduledTime:number},env:any){
  const result=await syncAutomaticWorklogs(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify(result));
  if(result.conflicts)throw new Error('Automatic worklog conflicts; next scheduled run will retry');
  const weekly=await sendWeeklyReports(env,{now:new Date(event.scheduledTime)});
  console.log(JSON.stringify({weekly}));
  if(weekly.status==='CONFLICT_RETRY')throw new Error('Weekly reporting conflicts; next scheduled run will retry');
 }
};
