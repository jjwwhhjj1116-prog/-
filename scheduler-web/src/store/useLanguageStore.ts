import {create} from 'zustand';
export type Language='ko'|'vi';
export const useLanguageStore=create<{lang:Language;setLang:(lang:Language)=>void}>((set)=>({
  lang:typeof localStorage!=='undefined'&&localStorage.getItem('concost_language')==='vi'?'vi':'ko',
  setLang:(lang)=>{localStorage.setItem('concost_language',lang);set({lang});},
}));
