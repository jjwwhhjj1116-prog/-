// Both languages use the same source document; the Korean policy remains intact.
(async()=>{
  const originals=new Map();const walker=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(node.parentElement?.closest('script,style,noscript'))continue;
    if(/[\uac00-\ud7a3]/.test(node.data))originals.set(node,node.data);
  }
  const bar=document.createElement('div');bar.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-bottom:16px';
  const ko=document.createElement('button'),vi=document.createElement('button');ko.textContent='🇰🇷 한국';vi.textContent='🇻🇳 Tiếng Việt';
  for(const button of [ko,vi]){button.type='button';button.style.cssText='background:white;color:#00338d;border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;cursor:pointer';bar.append(button);}
  document.querySelector('.container').prepend(bar);
  const catalog=await fetch('/legal-vi.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
  function apply(lang){
    document.documentElement.lang=lang;localStorage.setItem('concost_language',lang);
    for(const[node,text]of originals){const translated=catalog[text.trim()];node.data=lang==='vi'&&translated?text.slice(0,text.length-text.trimStart().length)+translated+text.slice(text.trimEnd().length):text;}
    ko.setAttribute('aria-pressed',String(lang==='ko'));vi.setAttribute('aria-pressed',String(lang==='vi'));
  }
  ko.onclick=()=>apply('ko');vi.onclick=()=>apply('vi');apply(localStorage.getItem('concost_language')==='vi'?'vi':'ko');
})();
