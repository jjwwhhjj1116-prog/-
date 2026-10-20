export async function optimizeCardImage(file:File,maxBytes=10_000_000):Promise<File>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20_000_000)throw new Error('20MB 이하 JPG·PNG·WEBP 사진을 선택해 주세요.');
 const bitmap=await createImageBitmap(file);
 try{
  for(const [edge,quality] of [[1600,0.88],[1400,0.82],[1200,0.76],[1000,0.7],[800,0.65]]){
   const ratio=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
   canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob&&blob.size<=maxBytes)return new File([blob],`${file.name.replace(/\.[^.]+$/,'').slice(0,160)||'명함'}.jpg`,{type:'image/jpeg'});
  }
  throw new Error('사진 용량을 줄이지 못했습니다. 다시 촬영하거나 다른 사진을 선택해 주세요.');
 }finally{bitmap.close();}
}
