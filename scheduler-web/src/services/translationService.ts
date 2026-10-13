import type {WorkBook,CellObject} from 'xlsx';
import dictionary from '../data/vi.json';
import {useLanguageStore,type Language} from '../store/useLanguageStore';
import {parseTranslation,translationQuery} from '../../../functions/lib/translation';
import {useAuthStore} from '../store/useAuthStore';

const cache=new Map<string,string>(Object.entries(dictionary));
const waiting=new Map<string,{resolve:(value:string)=>void;reject:(error:Error)=>void}>();
const pending=new Map<string,Promise<string>>();
let running=0;
let preferBrowserEndpoint=false;
export const needsTranslation=(text:string)=>cache.has(text.trim())||(/[\uac00-\ud7a3\u3131-\u318e]/.test(text)&&(text.trim().length!==1||['화','수','목','금','토'].includes(text.trim())));
export function cachedTranslation(text:string){
  // Personal names identify assignees; translating a name like 서화원 into "garden" would be misleading.
  const people=useAuthStore.getState().users.filter(user=>/[가-힣]/.test(user.name));
  let named=text;const originals:string[]=[];
  for(const person of people)if(named.includes(person.name)){const index=originals.push(person.name)-1;named=named.replaceAll(person.name,`__PERSON_${index}__`);}
  if(originals.length){
    for(const role of ['본부장','실장','팀장','파트장','수석','책임','선임','프로'])named=named.replaceAll(role,cache.get(role)||role);
    if(!needsTranslation(named))return named.replace(/__PERSON_(\d+)__/g,(_match,index)=>originals[Number(index)]);
  }
  const exact=cache.get(text);if(exact)return exact;
  const saved=cache.get(text.trim());if(!saved)return undefined;
  return text.slice(0,text.length-text.trimStart().length)+saved+text.slice(text.trimEnd().length);
}

async function translateInBrowser(text:string):Promise<string>{
  const endpoint=new URL('https://translate.googleapis.com/translate_a/single');
  const contextual=translationQuery(text);
  for(const[k,v]of Object.entries({client:'gtx',sl:'auto',tl:'vi',dt:'t',q:contextual}))endpoint.searchParams.set(k,v);
  const response=await fetch(endpoint,{credentials:'omit',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Provider unavailable');
  const translated=parseTranslation(await response.json());
  if(!translated)throw new Error('Invalid translation');return translated.translatedText;
}

async function drain(){
  if(running>=2||!waiting.size)return;
  const entries:[string,{resolve:(value:string)=>void;reject:(error:Error)=>void}][]=[];
  let length=0;
  for(const entry of waiting){if(entries.length===16||length+entry[0].length>12000)break;entries.push(entry);length+=entry[0].length;waiting.delete(entry[0]);}
  running++;void drain();
  try{
    let data:{results:{translatedText?:string;error?:string}[]};
    if(preferBrowserEndpoint)data={results:entries.map(()=>({error:'Use browser endpoint'}))};
    else{
      const response=await fetch('/api/translation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:entries.map(([text])=>text),source:'auto',target:'vi'}),signal:AbortSignal.timeout(45000)});
      data=await response.json();
      if(!response.ok||!Array.isArray(data.results)||data.results.length!==entries.length)throw new Error('Không thể dịch. Giữ nguyên bản gốc.');
      if(data.results.some(result=>result.error))preferBrowserEndpoint=true;
    }
    // Google may reject requests from a cloud-server address while accepting the same public endpoint in the user's browser.
    let next=0;
    await Promise.all(Array.from({length:4},async()=>{while(next<entries.length){const i=next++,[text,callbacks]=entries[i];
      try{
        const value=typeof data.results[i]?.translatedText==='string'&&data.results[i].translatedText?data.results[i].translatedText:await translateInBrowser(text);
        if(cache.size>4000)cache.delete(cache.keys().next().value!);cache.set(text,value);callbacks.resolve(value);
      }catch{callbacks.reject(new Error('Không thể dịch. Giữ nguyên bản gốc.'));}
    }}));
  }catch{entries.forEach(([,callbacks])=>callbacks.reject(new Error('Không thể dịch. Giữ nguyên bản gốc.')));}
  finally{entries.forEach(([text])=>pending.delete(text));running--;void drain();}
}

export function splitTranslationText(text:string):string[]{
  const chunks:string[]=[];
  while(text.length>4500){let cut=text.lastIndexOf('\n',4500);if(cut<2000)cut=4500;else cut++;chunks.push(text.slice(0,cut));text=text.slice(cut);}
  if(text)chunks.push(text);return chunks;
}
export async function translateText(text:string):Promise<string>{
  if(!needsTranslation(text))return text;
  const saved=cachedTranslation(text);if(saved)return saved;
  if(text.length>5000){const result=(await Promise.all(splitTranslationText(text).map(translateText))).join('');cache.set(text,result);return result;}
  const existing=pending.get(text);if(existing)return existing;
  const promise=new Promise<string>((resolve,reject)=>waiting.set(text,{resolve,reject}));pending.set(text,promise);
  queueMicrotask(()=>void drain());return promise;
}

export async function translateWorkbook(workbook:WorkBook,language:Language=useLanguageStore.getState().lang):Promise<WorkBook>{
  if(language!=='vi')return workbook;
  // Translate a copy of visible cells; formulas, numeric/date cells and restoration JSON remain exact.
  const copy=structuredClone(workbook);
  const cells:CellObject[]=[];
  for(const name of copy.SheetNames){if(name==='복원데이터')continue;
    for(const [key,cell] of Object.entries(copy.Sheets[name]))if(!key.startsWith('!')&&cell.t==='s'&&!cell.f&&typeof cell.v==='string'&&needsTranslation(cell.v))cells.push(cell);
  }
  const values=await Promise.all(cells.map(cell=>translateText(String(cell.v))));
  cells.forEach((cell,i)=>{cell.v=values[i];delete cell.w;});
  // Sheet names remain stable so an exported meeting can still be imported by its official cell coordinates.
  return copy;
}

export async function translatedAlert(text:string){
  const actor=useAuthStore.getState().currentUser;
  const value=useLanguageStore.getState().lang==='vi'?await translateText(text).catch(()=>text):text;
  if(actor!==useAuthStore.getState().currentUser)return;
  window.alert(value);
}
export async function translatedConfirm(text:string){
  const actor=useAuthStore.getState().currentUser;
  const value=useLanguageStore.getState().lang==='vi'?await translateText(text).catch(()=>text):text;
  if(actor!==useAuthStore.getState().currentUser)return false;
  return window.confirm(value);
}

let prepare:()=>Promise<void>=async()=>{};
export function registerTranslationPreparation(callback:()=>Promise<void>){prepare=callback;return()=>{prepare=async()=>{};};}
export async function printTranslated(){
  try{await prepare();window.print();}catch{window.alert('Không thể dịch toàn bộ bản in. Vui lòng thử lại hoặc chọn 한국.');}
}
