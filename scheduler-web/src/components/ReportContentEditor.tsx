import {useLayoutEffect,useRef} from 'react';
import {Bold,Italic,Strikethrough,List,ListOrdered,Quote,RemoveFormatting} from 'lucide-react';
import {sanitizeReportHtml,reportHtmlMatchesText} from '../utils/reportContent';

export function ReportContentEditor({value,html,disabled,onChange}:{value:string;html?:string;disabled:boolean;onChange:(text:string,html:string)=>void}){
 const editor=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=editor.current;if(!element||document.activeElement===element)return;
  if(html&&reportHtmlMatchesText(html,value))element.innerHTML=sanitizeReportHtml(html);else element.textContent=value;
 },[value,html,disabled]);
 const save=()=>{const element=editor.current;if(element&&!disabled)onChange(element.innerText,sanitizeReportHtml(element.innerHTML));};
 return <div className="overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
  <div role="toolbar" aria-label="완료 업무 서식" className="flex flex-wrap gap-1 border-b border-slate-300 bg-slate-50 px-2 py-1 dark:border-slate-600 dark:bg-slate-900">{[
   ['bold','굵게',Bold],['italic','기울임꼴',Italic],['strikeThrough','취소선',Strikethrough],['insertOrderedList','순서 있는 목록',ListOrdered],['insertUnorderedList','순서 없는 목록',List],['formatBlock','인용 단락',Quote],['removeFormat','형식 지우기',RemoveFormatting]
  ].map(([command,label,Icon])=>{const Symbol=Icon as typeof Bold;return <button key={String(command)} type="button" aria-label={String(label)} title={String(label)} disabled={disabled} className="rounded p-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700" onMouseDown={event=>event.preventDefault()} onClick={()=>{editor.current?.focus();document.execCommand('styleWithCSS',false,'false');document.execCommand(String(command),false,command==='formatBlock'?'blockquote':undefined);save();}}><Symbol size={15}/></button>;})}</div>
  <div className="relative"><div ref={editor} role="textbox" aria-label="완료 업무" aria-multiline="true" aria-readonly={disabled} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning className="min-h-[170px] max-h-[420px] overflow-y-auto p-3 text-sm font-normal text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-orange-500 [&_ol]:list-decimal [&_ul]:list-disc [&_li]:ml-5 [&_blockquote]:border-l [&_blockquote]:border-slate-400 [&_blockquote]:pl-3" onInput={save} onBlur={save} onPaste={event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));save();}}/>{!value&&<span className="pointer-events-none absolute left-3 top-3 text-sm text-slate-500 dark:text-slate-400">수행한 업무와 결과를 입력하세요...</span>}</div>
 </div>;
}
