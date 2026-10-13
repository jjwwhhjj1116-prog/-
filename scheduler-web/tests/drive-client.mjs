import assert from 'node:assert/strict';
import {resumableVaultUpload,CHUNK_BYTES} from '../src/services/resumableUpload.ts';
const original=globalThis.fetch;
const data=new Blob([new Uint8Array(CHUNK_BYTES+123)]);
const file={name:'resume.bin',type:'application/octet-stream',size:data.size,slice:(a,b)=>data.slice(a,b)};
let uploaded=0,lost=true,statusQueries=0,hashes,largestSlice=0;
const sliced=file.slice;file.slice=(a,b)=>{largestSlice=Math.max(largestSlice,Math.min(file.size,b)-a);return sliced(a,b);};
globalThis.fetch=async(url,init)=>{
 if(url==='/api/drive/uploads'){hashes=JSON.parse(init.body).hashes;return Response.json({id:'session'});}
 if(init.method==='POST'){statusQueries++;return Response.json({offset:uploaded,completed:uploaded===file.size});}
 const offset=Number(new URL(url,'https://test').searchParams.get('offset'));assert.equal(offset,uploaded);
 uploaded+=init.body.size;
 if(lost){lost=false;throw new Error('connection lost AFTER Google accepted first chunk');}
 return Response.json({offset:uploaded,completed:uploaded===file.size});
};
try{
 const progress=[];assert.equal(await resumableVaultUpload(file,{},undefined,p=>progress.push(p)),'session');assert.equal(uploaded,file.size);assert.equal(hashes.length,2);assert.ok(statusQueries>=2);assert.equal(largestSlice,CHUNK_BYTES);assert.equal(progress.at(-1).loaded,file.size);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>resumableVaultUpload(file,{},controller.signal));
 await assert.rejects(()=>resumableVaultUpload({...file,size:15_000_000_001},{}));
 console.log('PASS client bounded reads, lost-response resume without duplicate bytes, progress, abort and 15GB limit');
}finally{globalThis.fetch=original;}
