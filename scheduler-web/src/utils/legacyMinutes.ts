type LegacyMeeting = {id:string;author?:string;authorId?:string;serverRevision?:number};
export function ownLegacyMinutes<T extends LegacyMeeting>(records:T[],seeds:T[],user:{id:string;name:string}|null):T[]{
 if(!user)return [];
 return records.filter(m=>!m.serverRevision && (m.authorId?m.authorId===user.id:(m.author||'').trim().replace(/\s+(실장|팀장|파트장|수석|책임|선임|프로|본부장)$/,'')===user.name) && !seeds.some(seed=>seed.id===m.id&&JSON.stringify(seed)===JSON.stringify(m)));
}
export async function legacyMinuteId(userId:string,meeting:LegacyMeeting){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(meeting)));
 return `legacy-${userId}-${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;
}
