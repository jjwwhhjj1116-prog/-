import type {StudioUser} from './collaboration';

type Env={DB:D1Database;GOOGLE_CLIENT_SECRET?:string;GEMINI_API_KEY?:string;GEMINI_MODEL?:string};
type Dependencies={accessToken:()=>Promise<string|null>;folder:(name:string,parent:string,token:string)=>Promise<string>;upload:(params:{fileName:string;mimeType:string;fileBytes:Uint8Array;folderId:string;accessToken:string})=>Promise<{id:string}>};
const keys=['name','company','department','title','mobile','phone','fax','email','address','website','tags','notes'] as const;
type Fields=Record<typeof keys[number],string>;
const limits:Record<keyof Fields,number>={name:120,company:200,department:160,title:160,mobile:80,phone:80,fax:80,email:200,address:500,website:300,tags:500,notes:2000};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const error=(message:string,status=400)=>reply({error:message},status);
const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const bytesFromHex=(value:string)=>new Uint8Array(value.match(/.{2}/g)!.map(byte=>parseInt(byte,16)));
const isAdmin=(actor:StudioUser)=>['yjw@con-cost.com','yjpark@con-cost.com'].includes(String(JSON.parse(actor.profile).email||'').toLowerCase());

function parseFields(raw:unknown):Fields|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const source=raw as Record<string,unknown>;
 if(Object.keys(source).some(key=>!keys.includes(key as typeof keys[number])))return null;
 const fields={} as Fields;
 for(const key of keys){if(source[key]!==undefined&&typeof source[key]!=='string')return null;fields[key]=(String(source[key]||'').trim().split('').map(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127?' ':char).join('').replace(/\s+/g,' ')).slice(0,limits[key]);}
 if(fields.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))return null;
 return fields;
}
async function validImage(value:FormDataEntryValue|null){
 if(!(value instanceof File)||!['image/jpeg','image/png','image/webp'].includes(value.type)||value.size<16||value.size>10_000_000)throw new Error('10MB 이하 JPG·PNG·WEBP 명함 사진을 선택해 주세요.');
 const bytes=new Uint8Array(await value.arrayBuffer());
 const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
 const png=[137,80,78,71,13,10,26,10].every((number,index)=>bytes[index]===number);
 const webp=new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP';
 if(!(value.type==='image/jpeg'&&jpeg||value.type==='image/png'&&png||value.type==='image/webp'&&webp))throw new Error('파일 내용이 선택한 명함 이미지 형식과 다릅니다.');
 return{file:value,bytes,sha:hex(await crypto.subtle.digest('SHA-256',bytes))};
}
function base64(bytes:Uint8Array){let output='';for(let i=0;i<bytes.length;i+=8192)output+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(output);}
async function secretKey(env:Env,purpose='Gemini API key at rest'){
 if(!env.GOOGLE_CLIENT_SECRET)throw new Error('서버 암호화 설정이 없습니다. 관리자에게 연결 상태를 확인해 주세요.');
 const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.GOOGLE_CLIENT_SECRET),'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode('concost-studio-business-card-key-v1'),info:new TextEncoder().encode(purpose)},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const transferKey=(env:Env)=>secretKey(env,'Phone to PC business card photo transfer v1');
const transferHash=async(token:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
const fromBase64=(encoded:string)=>Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
async function credential(env:Env){
 const row=await env.DB.prepare("SELECT ciphertext,iv FROM studio_business_card_credentials WHERE id='gemini'").first<{ciphertext:string;iv:string}>();
 if(!row)return env.GEMINI_API_KEY?.trim()||'';
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytesFromHex(row.iv)},await secretKey(env),bytesFromHex(row.ciphertext));
 return new TextDecoder().decode(decrypted);
}
const currentModel=(env:Env)=>/^gemini-[a-z0-9.-]+$/.test(env.GEMINI_MODEL||'')?env.GEMINI_MODEL!:'gemini-3.1-flash-lite';
export const configuredGeminiKey=credential;
export const configuredGeminiModel=currentModel;

export async function businessCardsRoute(request:Request,env:Env,actor:StudioUser,path:string,deps:Dependencies):Promise<Response|null>{
 if(!path.startsWith('business-cards'))return null;
 const url=new URL(request.url),method=request.method,admin=isAdmin(actor);
 try{
  if(path.startsWith('business-cards/transfers')){
   const now=new Date().toISOString();
   if(path==='business-cards/transfers'&&method==='POST'){
    await env.DB.prepare('DELETE FROM studio_business_card_transfers WHERE expires_at<=?').bind(now).run();
    const active=await env.DB.prepare('SELECT COUNT(*) AS count FROM studio_business_card_transfers WHERE actor_id=?').bind(actor.id).first<{count:number}>();
    if((active?.count||0)>=3)return error('열린 휴대폰 촬영 연결이 3개입니다. 이전 연결을 닫거나 10분 후 다시 시도해 주세요.',429);
    const token=hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
    const expiresAt=new Date(Date.now()+10*60_000).toISOString();
    await env.DB.prepare("INSERT INTO studio_business_card_transfers(token_hash,actor_id,status,created_at,expires_at) VALUES(?,?,'PENDING',?,?)").bind(await transferHash(token),actor.id,now,expiresAt).run();
    return reply({token,expiresAt},201);
   }
   const match=/^business-cards\/transfers\/([0-9a-f]{48})(?:\/(upload|image))?$/.exec(path);
   if(!match)return error('촬영 연결을 찾을 수 없습니다.',404);
   const hash=await transferHash(match[1]);
   const row=await env.DB.prepare('SELECT status,original_name,mime_type,expires_at FROM studio_business_card_transfers WHERE token_hash=? AND actor_id=?').bind(hash,actor.id).first<{status:string;original_name:string|null;mime_type:string|null;expires_at:string}>();
   if(!row)return error('촬영 연결이 없거나 만료됐습니다. PC에서 새 QR을 만들어 주세요.',404);
   if(row.expires_at<=now){await env.DB.prepare('DELETE FROM studio_business_card_transfers WHERE token_hash=? AND actor_id=?').bind(hash,actor.id).run();return error('촬영 연결이 만료됐습니다. PC에서 새 QR을 만들어 주세요.',404);}
   if(method==='GET'&&!match[2])return reply({status:row.status,originalName:row.original_name,expiresAt:row.expires_at});
   if(method==='POST'&&match[2]==='upload'){
    if(row.status!=='PENDING')return error('이미 사진이 전송됐습니다. PC에서 확인해 주세요.',409);
    const image=await validImage((await request.formData()).get('file'));
    if(image.bytes.length>900_000)return error('전송 사진은 900KB 이하여야 합니다. 사진 크기를 줄인 뒤 다시 시도해 주세요.',413);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await transferKey(env),image.bytes));
    const name=image.file.name.slice(0,160).split('').map(char=>char==='/'||char==='\\'||char.charCodeAt(0)<32?'_':char).join('')||'business-card.jpg';
    const uploadedAt=new Date().toISOString();
    const result=await env.DB.prepare("UPDATE studio_business_card_transfers SET status='UPLOADED',ciphertext=?,iv=?,original_name=?,mime_type=?,uploaded_at=? WHERE token_hash=? AND actor_id=? AND status='PENDING' AND expires_at>?").bind(base64(encrypted),hex(iv.buffer),name,image.file.type,uploadedAt,hash,actor.id,uploadedAt).run();
    if(result.meta.changes!==1)return error('촬영 연결이 변경됐거나 만료됐습니다.',409);
    return reply({status:'UPLOADED'});
   }
   if(method==='GET'&&match[2]==='image'){
    if(row.status!=='UPLOADED'||!row.mime_type)return error('아직 사진이 도착하지 않았습니다.',409);
    const photo=await env.DB.prepare('SELECT ciphertext,iv FROM studio_business_card_transfers WHERE token_hash=? AND actor_id=?').bind(hash,actor.id).first<{ciphertext:string;iv:string}>();
    if(!photo?.ciphertext||!photo.iv)return error('명함 사진을 읽지 못했습니다.',409);
    const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytesFromHex(photo.iv)},await transferKey(env),fromBase64(photo.ciphertext));
    return new Response(decrypted,{headers:{'Content-Type':row.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(method==='DELETE'&&!match[2]){
    await env.DB.prepare('DELETE FROM studio_business_card_transfers WHERE token_hash=? AND actor_id=?').bind(hash,actor.id).run();
    return reply({ok:true});
   }
   return error('지원하지 않는 촬영 요청입니다.',405);
  }
  if(path==='business-cards/settings'){
   if(!admin)return error('관리자만 Gemini API 키를 설정할 수 있습니다.',403);
   if(method==='GET')return reply({configured:!!(await credential(env)),source:(await env.DB.prepare("SELECT id FROM studio_business_card_credentials WHERE id='gemini'").first())?'ADMIN':'SERVER',model:currentModel(env)});
   if(method==='PUT'){
    const body=await request.json().catch(()=>null) as {key?:unknown}|null;
    const value=body?.key;
    if(typeof value!=='string'||value.length<16||value.length>256||!/^[A-Za-z0-9_-]+$/.test(value))return error('유효한 Gemini API 키를 입력해 주세요.');
    const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await secretKey(env),new TextEncoder().encode(value));
    await env.DB.prepare("INSERT INTO studio_business_card_credentials(id,ciphertext,iv,updated_by,updated_at) VALUES('gemini',?,?,?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(hex(encrypted),hex(iv.buffer),actor.id,new Date().toISOString()).run();
    return reply({configured:true,source:'ADMIN',model:currentModel(env)});
   }
   return error('지원하지 않는 요청입니다.',405);
  }
  if(path==='business-cards/analyze'&&method==='POST'){
   const image=await validImage((await request.formData()).get('file'));
   const apiKey=await credential(env);if(!apiKey)return error('관리자 설정에서 Gemini API 키를 등록해 주세요.',503);
   const model=currentModel(env);
   const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:AbortSignal.timeout(45000),
    body:JSON.stringify({systemInstruction:{parts:[{text:'한국어·영문 명함에서 실제 보이는 내용만 추출하세요. 추측하지 마세요. 없는 항목은 빈 문자열로 둡니다. 이름, 회사, 부서, 직함, 전화번호 종류를 구별하세요.'}]},contents:[{role:'user',parts:[{text:'명함 정보를 JSON 필드로 추출하세요. 이름이 불확실하면 빈 문자열로 두세요.'},{inline_data:{mime_type:image.file.type,data:base64(image.bytes)}}]}],generationConfig:{temperature:0,maxOutputTokens:2048,responseMimeType:'application/json',responseSchema:{type:'OBJECT',required:[...keys],properties:Object.fromEntries(keys.map(key=>[key,{type:'STRING'}]))}}})
   });
   if(!response.ok)return error('Gemini 명함 인식에 실패했습니다. 관리자 키와 모델 상태를 확인해 주세요.',502);
   const data=await response.json() as any;
   if(data.candidates?.[0]?.finishReason!=='STOP')return error('Gemini 인식 결과가 완성되지 않았습니다. 다른 사진으로 다시 시도해 주세요.',502);
   const content=data.candidates[0]?.content?.parts?.map((part:any)=>part.text||'').join('')||'';
   let fields:Fields|null=null;try{fields=parseFields(JSON.parse(content));}catch{ /* malformed provider response */ }
   if(!fields)return error('명함 인식 형식이 올바르지 않습니다. 다른 사진으로 다시 시도해 주세요.',502);
   const id=crypto.randomUUID(),expiry=new Date(Date.now()+30*60_000).toISOString();
   await env.DB.prepare('INSERT INTO studio_business_card_analyses(id,actor_id,source_sha256,model,fields_json,expires_at,consumed_at) VALUES(?,?,?,?,?,?,NULL)').bind(id,actor.id,image.sha,model,JSON.stringify(fields),expiry).run();
   return reply({analysis:{id,fields,model,expiresAt:expiry}});
  }
  if(path==='business-cards'&&method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,120).replace(/[\\%_]/g,'\\$&');
   const archived=admin&&url.searchParams.get('includeArchived')==='true';
   const rows=await env.DB.prepare("SELECT c.id,c.fields_json,c.original_name,c.model,c.version,c.created_at,c.updated_at,c.deleted_at,u.name AS created_by_name FROM studio_business_cards c JOIN studio_users u ON u.id=c.created_by WHERE (?=1 OR c.deleted_at IS NULL) AND (?='' OR c.search_text LIKE ? ESCAPE '\\') ORDER BY c.deleted_at IS NOT NULL,c.name COLLATE NOCASE,c.created_at DESC LIMIT 300").bind(archived?1:0,q,`%${q}%`).all<any>();
   return reply({cards:rows.results.map(row=>({id:row.id,...JSON.parse(row.fields_json),originalName:row.original_name,model:row.model,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,deletedAt:row.deleted_at,createdByName:row.created_by_name})),canManage:admin});
  }
  const cardId=/^business-cards\/([0-9a-f-]{36})(?:\/(image))?$/.exec(path);
  if(cardId&&method==='GET'&&cardId[2]==='image'){
   const row=await env.DB.prepare('SELECT google_file_id,mime_type,deleted_at FROM studio_business_cards WHERE id=?').bind(cardId[1]).first<any>();
   if(!row||row.deleted_at&&!admin)return error('명함 원본을 찾을 수 없습니다.',404);
   const token=await deps.accessToken();if(!token)return error('회사 Google Drive 연결을 확인해 주세요.',503);
   const res=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.google_file_id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
   if(!res.ok)return error('명함 원본을 내려받지 못했습니다.',502);
   return new Response(res.body,{headers:{'Content-Type':row.mime_type,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(cardId&&method==='PUT'&&!cardId[2]){
   if(!admin)return error('명함 DB관리는 관리자만 할 수 있습니다.',403);
   const input=await request.json().catch(()=>null) as {action?:string;expectedVersion?:number}|null;
   if(!['ARCHIVE','RESTORE'].includes(input?.action||'')||!Number.isInteger(input?.expectedVersion))return error('명함 관리 요청을 확인해 주세요.');
   const row=await env.DB.prepare('SELECT version,deleted_at FROM studio_business_cards WHERE id=?').bind(cardId[1]).first<any>();
   if(!row)return error('명함을 찾을 수 없습니다.',404);
   if(row.version!==input!.expectedVersion||!!row.deleted_at!==(input!.action==='RESTORE'))return error('다른 화면에서 명함 상태가 변경되었습니다.',409);
   const now=new Date().toISOString();
   const result=await env.DB.prepare('UPDATE studio_business_cards SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND (deleted_at IS NULL)=(?=1)').bind(input!.action==='ARCHIVE'?now:null,now,cardId[1],row.version,input!.action==='ARCHIVE'?1:0).run();
   if(result.meta.changes!==1)return error('다른 화면에서 명함 상태가 변경되었습니다.',409);
   await env.DB.prepare('INSERT INTO studio_business_card_events VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),cardId[1],actor.id,input!.action,now).run();
   return reply({ok:true,version:row.version+1});
  }
  if(path==='business-cards'&&method==='POST'){
   const operationId=request.headers.get('Idempotency-Key')||'';
   if(!/^business-card:[0-9a-f-]{36}$/.test(operationId))return error('안전한 명함 등록 키가 필요합니다.');
   const form=await request.formData(),image=await validImage(form.get('file'));
   const analysisId=form.get('analysisId'),fieldsRaw=form.get('fields');
   if(typeof analysisId!=='string'||typeof fieldsRaw!=='string')return error('인식 후 확인한 명함 정보를 제출해 주세요.');
   let fields:Fields|null=null;try{fields=parseFields(JSON.parse(fieldsRaw));}catch{/* invalid JSON */}
   if(!fields?.name)return error('명함의 이름과 입력값을 확인해 주세요.');
   const analysis=await env.DB.prepare('SELECT source_sha256,model,expires_at,consumed_at FROM studio_business_card_analyses WHERE id=? AND actor_id=?').bind(analysisId,actor.id).first<any>();
   if(!analysis||analysis.expires_at<=new Date().toISOString()||analysis.source_sha256!==image.sha)return error('인식 세션이 만료됐거나 명함 사진이 바뀌었습니다. 다시 인식해 주세요.',409);
   const fingerprint=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${analysisId}:${image.sha}:${JSON.stringify(fields)}`)));
   const prior=await env.DB.prepare('SELECT fingerprint,status,card_id FROM studio_business_card_operations WHERE id=?').bind(operationId).first<any>();
   if(prior)return prior.fingerprint===fingerprint&&prior.status==='SUCCEEDED'?reply({cardId:prior.card_id,replay:true}):error('동일한 등록 요청이 진행 중이거나 내용이 다릅니다.',409);
   if(analysis.consumed_at)return error('이미 등록된 명함 인식 결과입니다.',409);
   if(await env.DB.prepare('SELECT id FROM studio_business_cards WHERE source_sha256=? AND deleted_at IS NULL').bind(image.sha).first())return error('같은 명함 사진이 이미 등록되어 있습니다.',409);
   const card=crypto.randomUUID(),created=new Date().toISOString();
   const reserved=await env.DB.prepare("INSERT OR IGNORE INTO studio_business_card_operations(id,actor_id,fingerprint,status,card_id,google_file_id,created_at) VALUES(?,?,?,'PENDING',?,NULL,?)").bind(operationId,actor.id,fingerprint,card,created).run();
   if(reserved.meta.changes!==1)return error('동일한 등록 요청이 진행 중입니다.',409);
   let uploaded=false;
   try{
    const token=await deps.accessToken();if(!token)throw new Error('회사 Google Drive 연결을 확인해 주세요.');
    const root=await deps.folder('기술본부 자료실','root',token),folder=await deps.folder('인맥관리·명함원본',root,token);
    const safeName=image.file.name.slice(0,180).split('').map(char=>char==='/'||char==='\\'||char.charCodeAt(0)<32?'_':char).join('')||'business-card.jpg';
    const result=await deps.upload({fileName:`${card}_${safeName}`,mimeType:image.file.type,fileBytes:image.bytes,folderId:folder,accessToken:token});
    if(!/^[A-Za-z0-9_-]{10,}$/.test(result.id))throw new Error('Google Drive 원본 파일 확인에 실패했습니다.');
    uploaded=true;await env.DB.prepare('UPDATE studio_business_card_operations SET google_file_id=? WHERE id=?').bind(result.id,operationId).run();
    const now=new Date().toISOString(),search=Object.values(fields).join(' ').toLowerCase();
    await env.DB.batch([
     env.DB.prepare('INSERT INTO studio_business_cards(id,analysis_id,fields_json,name,company,search_text,source_sha256,original_name,mime_type,google_file_id,google_folder_id,model,version,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,NULL)').bind(card,analysisId,JSON.stringify(fields),fields.name,fields.company,search,image.sha,safeName,image.file.type,result.id,folder,analysis.model,actor.id,now,now),
     env.DB.prepare('UPDATE studio_business_card_analyses SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now,analysisId),
     env.DB.prepare("UPDATE studio_business_card_operations SET status='SUCCEEDED' WHERE id=? AND status='PENDING'").bind(operationId),
     env.DB.prepare('INSERT INTO studio_business_card_events VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),card,actor.id,'REGISTERED',now)
    ]);
    return reply({cardId:card,driveStored:true},201);
   }catch{
    await env.DB.prepare('UPDATE studio_business_card_operations SET status=? WHERE id=?').bind(uploaded?'RECONCILIATION_REQUIRED':'FAILED',operationId).run().catch(()=>undefined);
    return error(uploaded?'원본은 Drive에 저장됐지만 목록 반영 확인이 필요합니다. 다시 등록하지 말고 관리자에게 알려주세요.':'회사 Google Drive 명함 등록에 실패했습니다. 연결을 확인해 주세요.',503);
   }
  }
  return error('지원하지 않는 명함 요청입니다.',405);
 }catch(reason){
  if(reason instanceof Error&&/명함|파일|서버 암호화/.test(reason.message))return error(reason.message,reason.name==='TimeoutError'?504:400);
  return error('인맥관리 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',500);
 }
}
