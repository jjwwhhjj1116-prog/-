const safeTags=new Set(['b','strong','i','em','s','strike','u','p','div','br','ol','ul','li','blockquote']);
// Formatting has no attributes, URLs, images or executable markup. The plain text is kept separately.
export function sanitizeReportHtml(html:string){
 return html.replace(/<[^>]*>/g,tag=>{
  const match=tag.match(/^<(\/?)([a-z]+)(?:\s[^<>]*)?\/?\s*>$/i);
  return match&&safeTags.has(match[2].toLowerCase())?`<${match[1]}${match[2].toLowerCase()}>`:'';
 });
}
// The saved text remains authoritative. Formatting cannot display a different report body.
export function reportHtmlMatchesText(html:string,text:string){
 const plain=sanitizeReportHtml(html).replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
  if(entity[0]==='#'){const point=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return point>0&&point<=0x10ffff?String.fromCodePoint(point):'';}
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[entity.toLowerCase()];
 });
 return plain.replace(/\s/g,'')===text.replace(/\s/g,'');
}
