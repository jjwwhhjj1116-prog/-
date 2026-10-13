type Translation = {translatedText:string;detectedSourceLanguage:string|null};
const cache = new Map<string,{value:Translation;expires:number}>();
export function translationQuery(text:string):string {
  const terms:Record<string,string>={'토목&조경팀':'civil engineering and landscape team','토목/조경팀':'civil engineering and landscape team','마감팀':'finishing works team','구조팀':'structural engineering team','회의록':'meeting minutes','결재':'approval','공종':'construction work category'};
  text=text.replace(/토목&조경팀|토목\/조경팀|마감팀|구조팀|회의록|결재|공종/g,term=>terms[term]).replace(/\bPM\b/g,'project manager');
  const titles:Record<string,string>={'본부장':'division director','실장':'department head','팀장':'team leader','파트장':'section leader','수석':'principal specialist','책임':'lead specialist','선임':'senior specialist'};
  return text.replace(/([가-힣]{2,4}) (본부장|실장|팀장|파트장|수석|책임|선임)(?=[^가-힣]|님|$)/g,(_whole,name:string,title:string)=>`${name} (${titles[title]})`);
}

export function parseTranslation(data:unknown):Translation|null {
  if(!Array.isArray(data)||!Array.isArray(data[0]))return null;
  const text=data[0].filter((s:unknown)=>Array.isArray(s)&&typeof s[0]==='string').map((s:string[])=>s[0]).join('');
  if(!text)return null;
  const translatedText=text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_whole,entity:string)=>{
    const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(named[entity])return named[entity];
    const number=entity.startsWith('#x')?parseInt(entity.slice(2),16):Number(entity.slice(1));
    return number>0&&number<=0x10ffff?String.fromCodePoint(number):_whole;
  });
  return {translatedText,detectedSourceLanguage:typeof data[2]==='string'?data[2]:null};
}

export async function handleTranslation(request:Request):Promise<Response> {
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply({error:'POST 요청만 지원합니다.'},405);
  let body:{texts?:unknown;target?:unknown;source?:unknown};
  try{body=await request.json();}catch{return reply({error:'번역 요청 형식이 잘못되었습니다.'},400);}
  const {texts,target='vi',source='auto'}=body;
  if(!Array.isArray(texts)||!texts.length||texts.length>16||!['vi','ko'].includes(String(target))||!['auto','ko','vi','en'].includes(String(source))||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>5000)||texts.reduce((n,t)=>n+t.length,0)>12000)
    return reply({error:'번역은 최대 16개, 문장당 5,000자, 합계 12,000자까지 지원합니다.'},400);
  const results:(Translation|{error:string})[]=new Array(texts.length);
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,texts.length)},async()=>{
    while(next<texts.length){
      const i=next++,text=texts[i] as string,key=JSON.stringify([source,target,text]);
      const saved=cache.get(key);
      if(saved&&saved.expires>Date.now()){results[i]=saved.value;continue;}
      try{
        const endpoint=new URL('https://translate.googleapis.com/translate_a/single');
        // Korean '구조' also means rescue. Supply the construction context for team names.
        const contextual=target==='vi'?translationQuery(text):text;
        for(const [k,v] of Object.entries({client:'gtx',sl:String(source),tl:String(target),dt:'t',q:contextual}))endpoint.searchParams.set(k,v);
        const response=await fetch(endpoint,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('provider');
        const value=parseTranslation(await response.json());
        if(!value)throw new Error('format');
        if(cache.size>=1500)cache.delete(cache.keys().next().value!);
        cache.set(key,{value,expires:Date.now()+6*3600000});results[i]=value;
      }catch{results[i]={error:'번역 응답을 받지 못했습니다. 원문을 유지합니다.'};}
    }
  }));
  return reply({results});
}
