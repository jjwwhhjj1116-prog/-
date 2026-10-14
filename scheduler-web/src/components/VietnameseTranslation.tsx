import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {useLanguageStore} from '../store/useLanguageStore';
import {useAuthStore} from '../store/useAuthStore';
import {cachedTranslation,needsTranslation,registerTranslationPreparation,translateText} from '../services/translationService';

type Original={source:string;shown:string};
type FieldPreview={id:number;text:string;label:string;multiline:boolean;scrollTop:number;style:React.CSSProperties};
const protectedContent='script,style,noscript,[data-no-translate],.notranslate';
const excluded=protectedContent+',[contenteditable]';
const richTextbox=(element:Element)=>element.matches('[role="textbox"][contenteditable]');
const protectedAttribute=(element:Element,name:string)=>element.getAttribute('data-no-translate-attrs')?.split(/\s+/).includes(name);
const fieldValue=(field:HTMLElement)=>field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement?field.value:field.innerText;

// Preserve React's text nodes and controlled values. Replacing/wrapping nodes would break reconciliation.
export function VietnameseTranslation(){
  const {lang,setLang}=useLanguageStore();
  const actor=useAuthStore(state=>state.currentUser?.id);
  const [status,setStatus]=useState<'idle'|'working'|'error'>('idle');
  const [previews,setPreviews]=useState<FieldPreview[]>([]);
  const [retry,setRetry]=useState(0);
  const [fullText,setFullText]=useState<{text:string;label:string}|null>(null);
  useEffect(()=>{
    document.documentElement.lang=lang;
    const originalTitle=document.title;
    if(lang==='vi')document.title='CONCOST · Quản lý tiến độ';
    const root=document.getElementById('root');if(!root)return;
    const texts=new Map<Text,Original>(),attrs=new Map<Element,Map<string,Original>>();
    const optionValues=new Map<HTMLOptionElement,string>();
    const fields=new Map<HTMLElement,{id:number;source:string;translated:string}>();
    const jobs=new Set<Promise<void>>(),failed=new Set<string>();
    let disposed=false,frame=0,nextId=0;
    const isVietnamese=(element:Element)=> (element.closest('[data-translation-language]')?.getAttribute('data-translation-language')||lang)==='vi';
    const permitted=(text:string,element:Element)=>isVietnamese(element)&&needsTranslation(text)&&(!!actor||!!cachedTranslation(text));
    function request(text:string,apply:(result:string)=>void){
      const saved=cachedTranslation(text);if(saved){apply(saved);return;}
      if(failed.has(text))return;
      const job=translateText(text).then(result=>{if(!disposed)apply(result);}).catch(()=>{failed.add(text);}).finally(()=>{
        jobs.delete(job);if(!disposed){setStatus(failed.size?'error':jobs.size?'working':'idle');schedule();}
      });
      jobs.add(job);setStatus('working');
    }
    function renderFields(){
      const views:FieldPreview[]=[];
      for(const [field,record] of fields){
        if(!field.isConnected){fields.delete(field);continue;}
        if(!isVietnamese(field)||fieldValue(field)!==record.source||document.activeElement===field||!record.translated){field.removeAttribute('data-vietnamese-value');continue;}
        field.removeAttribute('data-vietnamese-value');
        const rect=field.getBoundingClientRect(),style=getComputedStyle(field);
        let left=rect.left,top=rect.top,right=rect.right,bottom=rect.bottom;
        // Do not let a field translation cover another panel when its scroll container clips it.
        for(let parent=field.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
          const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
          if(/hidden|auto|scroll|clip/.test(css.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}
          if(/hidden|auto|scroll|clip/.test(css.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
        }
        left=Math.max(0,left);top=Math.max(0,top);right=Math.min(innerWidth,right);bottom=Math.min(innerHeight,bottom);
        if(right<=left||bottom<=top||style.visibility==='hidden'||style.display==='none'){field.removeAttribute('data-vietnamese-value');continue;}
        const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
        if(hit&&hit!==field&&!field.contains(hit)){field.removeAttribute('data-vietnamese-value');continue;}
        const color=style.color;
        field.setAttribute('data-vietnamese-value','true');
        const multiline=field.tagName==='TEXTAREA'||richTextbox(field);
        views.push({id:record.id,text:record.translated,label:field.getAttribute('aria-label')||field.getAttribute('placeholder')||'Nội dung',multiline,scrollTop:field.scrollTop,style:{position:'fixed',pointerEvents:'none',left:rect.left,top:rect.top,width:field.clientWidth+field.clientLeft,height:rect.height,boxSizing:'border-box',padding:style.padding,border:`${style.borderTopWidth} solid transparent`,color,font:style.font,letterSpacing:style.letterSpacing,lineHeight:style.lineHeight,textAlign:style.textAlign as 'left',whiteSpace:multiline?'pre-wrap':'pre',overflow:'hidden',clipPath:`inset(${top-rect.top}px ${rect.right-right}px ${rect.bottom-bottom}px ${left-rect.left}px)`,transform:'none',zIndex:200}});
      }
      setPreviews(views);
    }
    function scan(){
      frame=0;if(disposed)return;
      // An implicit option value follows its label. Keep the original domain value while translating display text.
      for(const option of root!.querySelectorAll('option')){
        const pinned=optionValues.get(option);
        if(!isVietnamese(option)||option.closest(excluded)){if(pinned!==undefined&&option.getAttribute('value')===pinned)option.removeAttribute('value');optionValues.delete(option);continue;}
        if(option.hasAttribute('value')&&pinned===undefined)continue;
        if(pinned!==undefined&&option.getAttribute('value')!==pinned){optionValues.delete(option);continue;}
        const label=document.createTreeWalker(option,NodeFilter.SHOW_TEXT);let source='';
        while(label.nextNode()){const node=label.currentNode as Text,record=texts.get(node);source+=record&&node.data===record.shown?record.source:node.data;}
        const original=document.createElement('option');original.textContent=source;
        const value=original.value;optionValues.set(option,value);
        if(option.getAttribute('value')!==value)option.value=value;
      }
      const walker=document.createTreeWalker(root!,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode as Text,parent=node.parentElement;
        if(!parent||parent.closest(excluded)||parent.closest('textarea,input'))continue;
        let record=texts.get(node);
        if(record&&node.data!==record.shown){record={source:node.data,shown:node.data};texts.set(node,record);}
        const source=record?.source??node.data;
        if(!isVietnamese(parent)){if(record&&node.data===record.shown){record.shown=source;if(node.data!==source)node.data=source;}continue;}
        if(parent.closest('thead')&&['일','월','화','수','목','금','토'].includes(source.trim())){
          if(!record){record={source,shown:source};texts.set(node,record);}
          const weekday=['CN','T2','T3','T4','T5','T6','T7'][['일','월','화','수','목','금','토'].indexOf(source.trim())];
          record.shown=weekday;if(node.data!==weekday)node.data=weekday;continue;
        }
        if(!permitted(source,parent))continue;
        if(!record){record={source,shown:source};texts.set(node,record);}
        const current=record;
        request(source,result=>{if(node.isConnected&&isVietnamese(parent)&&texts.get(node)===current&&node.data===current.shown){current.shown=result;if(node.data!==result)node.data=result;}});
      }
      for(const element of root!.querySelectorAll('[title],[placeholder],[aria-label],input[type="button"],input[type="submit"]')){
        if(element.closest(protectedContent)||(!richTextbox(element)&&element.closest('[contenteditable]')))continue;
        const names=['title','placeholder','aria-label',...((element instanceof HTMLInputElement&&['button','submit'].includes(element.type))?['value']:[])];
        for(const name of names){const value=element.getAttribute(name);if(value===null)continue;
          if(protectedAttribute(element,name)){
            const previous=attrs.get(element)?.get(name);
            if(previous&&value===previous.shown&&value!==previous.source)element.setAttribute(name,previous.source);
            attrs.get(element)?.delete(name);continue;
          }
          let records=attrs.get(element);if(!records){records=new Map();attrs.set(element,records);}
          let record=records.get(name);if(record&&value!==record.shown){record={source:value,shown:value};records.set(name,record);}
          const source=record?.source??value;
          if(!isVietnamese(element)){if(record&&value===record.shown){record.shown=source;if(value!==source)element.setAttribute(name,source);}continue;}
          if(!permitted(source,element))continue;
          if(!record){record={source,shown:source};records.set(name,record);}
          const current=record;request(source,result=>{if(element.isConnected&&isVietnamese(element)&&!protectedAttribute(element,name)&&records!.get(name)===current&&element.getAttribute(name)===current.shown){current.shown=result;if(element.getAttribute(name)!==result)element.setAttribute(name,result);}});
        }
      }
      for(const field of root!.querySelectorAll<HTMLElement>('textarea,input[type="text"],input:not([type]),[role="textbox"][contenteditable]')){
        // Login IDs, passwords (including the show-password mode) and secrets must never be sent for translation.
        if(field.closest(protectedContent)||(!richTextbox(field)&&field.closest('[contenteditable]'))||field.getAttribute('autocomplete')==='username'||/password|secret|token|credential|client.?id|email/i.test(`${field.getAttribute('name')} ${field.id} ${field.getAttribute('autocomplete')}`)||field.closest('[data-no-field-translate]'))continue;
        const value=fieldValue(field);
        if(!permitted(value,field)){field.removeAttribute('data-vietnamese-value');fields.delete(field);continue;}
        let record=fields.get(field);if(!record||record.source!==value){record={id:++nextId,source:value,translated:''};fields.set(field,record);}
        const current=record;request(record.source,result=>{if(field.isConnected&&isVietnamese(field)&&fields.get(field)===current&&fieldValue(field)===current.source){current.translated=result;}});
      }
      for(const [node] of texts)if(!node.isConnected)texts.delete(node);
      for(const [element] of attrs)if(!element.isConnected)attrs.delete(element);
      for(const [option] of optionValues)if(!option.isConnected)optionValues.delete(option);
      renderFields();
    }
    function schedule(){if(!frame&&!disposed)frame=requestAnimationFrame(scan);}
    const observer=new MutationObserver(schedule);
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label','value','class','style','hidden','contenteditable','data-translation-language','data-no-translate-attrs']});
    for(const event of ['input','change','focusin','focusout','scroll'])document.addEventListener(event,schedule,true);
    window.addEventListener('resize',schedule);schedule();
    const unregister=registerTranslationPreparation(async()=>{
      scan();while(jobs.size){await Promise.all([...jobs]);scan();}
      const activeSources=new Set<string>();
      for(const [node,record] of texts)if(node.isConnected&&node.parentElement&&isVietnamese(node.parentElement))activeSources.add(record.source);
      for(const [element,records] of attrs)if(element.isConnected&&isVietnamese(element))for(const record of records.values())activeSources.add(record.source);
      for(const [field,record] of fields)if(field.isConnected&&isVietnamese(field))activeSources.add(record.source);
      if([...failed].some(source=>activeSources.has(source)&&!cachedTranslation(source)))throw new Error('Incomplete translation');
    });
    return()=>{
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();unregister();
      if(document.title==='CONCOST · Quản lý tiến độ')document.title=originalTitle;
      for(const event of ['input','change','focusin','focusout','scroll'])document.removeEventListener(event,schedule,true);
      window.removeEventListener('resize',schedule);
      for(const [node,record] of texts)if(node.isConnected&&node.data===record.shown)node.data=record.source;
      for(const [element,records] of attrs)for(const [name,record] of records)if(element.isConnected&&element.getAttribute(name)===record.shown)element.setAttribute(name,record.source);
      for(const [option,value] of optionValues)if(option.isConnected&&option.getAttribute('value')===value)option.removeAttribute('value');
      for(const [field] of fields)field.removeAttribute('data-vietnamese-value');
      setPreviews([]);setStatus('idle');setFullText(null);
    };
  },[lang,actor,retry]);
  return createPortal(<div data-no-translate>
    {!actor&&<div className="fixed top-3 right-3 z-[210] flex gap-1 rounded-lg bg-white p-1 text-xs text-slate-900 shadow">
      <button className="px-3 py-2" onClick={()=>setLang('ko')} aria-pressed={lang==='ko'}>🇰🇷 한국</button>
      <button className="px-3 py-2" onClick={()=>setLang('vi')} aria-pressed={lang==='vi'}>🇻🇳 Tiếng Việt</button>
    </div>}
    {status!=='idle'&&<div role="status" className="fixed bottom-3 right-3 z-[210] max-w-sm rounded-lg border border-blue-200 bg-white p-3 text-xs text-slate-900 shadow print:hidden">
      {status==='working'?'Đang dịch…':<>Một số nội dung chưa được dịch. Bản gốc được giữ nguyên. <button className="underline font-bold" onClick={()=>setRetry(v=>v+1)}>Thử lại</button></>}
    </div>}
    {previews.map(preview=><div key={preview.id} className="vietnamese-field-preview" style={preview.style}>
      <div aria-hidden="true" style={{transform:`translateY(-${preview.scrollTop}px)`}}>{preview.text}</div>
      {preview.multiline&&<button type="button" title="Xem toàn bộ bản dịch" aria-label="Xem toàn bộ bản dịch" onClick={()=>setFullText({text:preview.text,label:preview.label})} style={{position:'absolute',right:2,top:2,pointerEvents:'auto',background:'#1d4ed8',color:'white',borderRadius:4,padding:'2px 6px',fontSize:12}}>↗</button>}
    </div>)}
    {fullText&&<div className="fixed inset-0 z-[230] bg-slate-950/70 flex items-center justify-center p-5 print:hidden" onClick={()=>setFullText(null)}>
      <section role="dialog" aria-modal="true" aria-label="Bản dịch đầy đủ" className="max-w-3xl w-full max-h-[85vh] overflow-auto rounded-xl bg-white text-slate-900 p-6" onClick={event=>event.stopPropagation()}>
        <div className="relative mb-4 min-h-9 pr-12"><h2 className="font-bold">{fullText.label}</h2><button type="button" aria-label="Đóng bản dịch đầy đủ" className="absolute top-0 right-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={()=>setFullText(null)}><X size={20}/></button></div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{fullText.text}</p>
      </section>
    </div>}
  </div>,document.body);
}
