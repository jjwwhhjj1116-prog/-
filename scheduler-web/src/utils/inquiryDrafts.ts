import type {Inquiry,InquiryUnassignedImage} from '../types/inquiries';
export interface InquiryDraft {rows:Inquiry[];unassignedImages:InquiryUnassignedImage[];updatedAt:number;baseRows?:Inquiry[];retainedRows?:Inquiry[]}
let database:Promise<IDBDatabase>|undefined;
const db=()=>database??=new Promise((resolve,reject)=>{
 const request=indexedDB.open('concost-inquiry-drafts',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error);};
});
export async function readInquiryDraft(key:string):Promise<InquiryDraft|undefined>{
 const database=await db();return new Promise((resolve,reject)=>{
  const request=database.transaction('drafts').objectStore('drafts').get(key);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
export async function writeInquiryDraft(key:string,draft:InquiryDraft){
 const database=await db();return new Promise<void>((resolve,reject)=>{
  const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,key);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
