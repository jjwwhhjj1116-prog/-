import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { readInquiryExcel, buildInquiryWorkbookBuffer, inquiryImageBytes } from '../src/services/inquiryExcel.ts';

const results = [];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Vn1cAAAAASUVORK5CYII=';
const options = { projectId:'qa-inquiry103', authorId:'qa-author103', authorName:'합성 질의 작성자' };
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function item(department, no='1') { return {id:crypto.randomUUID(),...options,department,no,trade:department==='구조팀'?'철골-수직':department==='마감팀'?'조적':'부대토목',classification:'지하 1층',group:'1차 질의',drawingNumbers:['A-201','A-502'],question:'첫째 줄\n둘째 줄 =SUM(A1:A2)',answer:'산출 반영',review:'발주처 확인',notes:'원문 비고',images:[],status:'DRAFT',createdAt:'2026-10-13T00:00:00.000Z',updatedAt:'2026-10-13T00:00:00.000Z',revision:0}; }
async function test(name, fn) { await fn(); results.push({name,pass:true}); console.log(`PASS ${name}`); }
const image = (field, name) => ({id:crypto.randomUUID(),field,name,mimeType:'image/png',dataUrl:png});

await test('질의 Excel: 3팀 8열·원문 줄바꿈·도면번호·반복 NO 왕복',async()=>{
 const rows=[item('마감팀'),item('마감팀'),item('구조팀'),item('토목&조경팀')];
 const data=await buildInquiryWorkbookBuffer(rows,{projectName:'합성103'}); const read=await readInquiryExcel(data,options);
 assert.equal(read.inquiries.length,4); assert.deepEqual(read.inquiries.map(r=>r.department),rows.map(r=>r.department));
 for(let i=0;i<4;i++)for(const key of ['no','trade','classification','drawingNumbers','question','answer','review','notes','group']) assert.deepEqual(read.inquiries[i][key],rows[i][key]);
 const book=new ExcelJS.Workbook();await book.xlsx.load(data); assert.equal(book.worksheets[0].getCell('F4').type,ExcelJS.ValueType.String);
 assert.ok(read.inquiries.every(r=>r.status==='DRAFT'&&r.revision===0));
});
await test('질의 Excel: 질문·산출·검토 사진 바이트와 열 귀속 왕복',async()=>{
 const row=item('마감팀'); row.images=[image('question','질문.png'),image('answer','산출.png'),{...image('review','검토.png'),caption:'사진 설명 & "확인"\n둘째 줄'}];
 const data=await buildInquiryWorkbookBuffer([row],{projectName:'사진검수'}); const read=await readInquiryExcel(data,options);
 assert.equal(read.inquiries[0].images.length,3); assert.deepEqual(read.inquiries[0].images.map(i=>i.field),['question','answer','review']);
 assert.deepEqual(read.inquiries[0].images.map(i=>i.name),['질문.png','산출.png','검토.png']);assert.equal(read.inquiries[0].images[2].caption,row.images[2].caption);
 assert.ok(read.inquiries[0].images.every(i=>i.dataUrl===png)); assert.equal(read.unassignedImages.length,0);
});
await test('질의 Excel: 병합2행·표 밖 사진 원 위치 보존과 자동귀속 금지',async()=>{
 const row=item('구조팀');row.sourceSheet='원본 구조';row.excelLayout={rowSpan:2,rowHeights:[66,90],columnWidths:[1,9,13,21,22,63,65,45,17],reviewHeader:'답변사항',headers:['No','분야','관련도면','부위','질의사항','산출사항','답변사항','비고'],mergedColumns:[2,3,4,5,7,8,9]};
 const orphan={...image('question','미연결.png'),sourceSheet:'원본 구조',sourceRow:47,sourceAnchor:{tl:{col:65,row:46},width:120,height:70}};delete orphan.field;
 const data=await buildInquiryWorkbookBuffer([row],{projectName:'병합검수',unassignedImages:[orphan]});const read=await readInquiryExcel(data,options);
 assert.equal(read.inquiries.length,1);assert.equal(read.inquiries[0].images.length,0);assert.equal(read.unassignedImages.length,1);assert.ok(!('field'in read.unassignedImages[0]));
 assert.equal(read.unassignedImages[0].sourceAnchor.tl.col,65);assert.equal(read.unassignedImages[0].sourceAnchor.tl.row,46);
 assert.equal(read.inquiries[0].excelLayout.rowSpan,2); assert.deepEqual(read.inquiries[0].excelLayout.rowHeights,[66,90]);
 assert.deepEqual(read.inquiries[0].excelLayout.mergedColumns,row.excelLayout.mergedColumns);assert.equal(read.inquiries[0].excelLayout.reviewHeader,'답변사항');
});
await test('질의 Excel: 외부주소·SVG·위장 형식·손상 파일·빈 표 거부',async()=>{
 for(const invalid of ['https://example.com/picture.png','data:image/svg+xml;base64,PHN2Zy8+','data:image/jpeg;base64,'+png.split(',')[1],'data:image/png;base64,AAAA'])assert.throws(()=>inquiryImageBytes(invalid));
 const mismatch=item('마감팀');mismatch.images=[{...image('question','위장.jpg'),mimeType:'image/jpeg'}];await assert.rejects(buildInquiryWorkbookBuffer([mismatch],{projectName:'형식검수'}),/형식/);
 await assert.rejects(readInquiryExcel(new Uint8Array([0,1,2]),options));
 const empty=new ExcelJS.Workbook();empty.addWorksheet('빈시트');await assert.rejects(readInquiryExcel(new Uint8Array(await empty.xlsx.writeBuffer()),options),/가져올/);
});

const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
if(source){
 const before=await fs.readFile(source);assert.equal(digest(before),'c74828a900e1ee9347272795c535217af2e6d437aa6e118c2723433ca82c6d9b');
 const imported=await readInquiryExcel(before,options);
 await test('질의 원본: 16항목·반복 NO·병합행·분야/도면/원문 보존',async()=>{
  assert.equal(imported.inquiries.length,16);assert.equal(imported.inquiries.filter(r=>r.department==='구조팀').length,11);assert.equal(imported.inquiries.filter(r=>r.department==='마감팀').length,5);
  const finish=imported.inquiries.filter(r=>r.department==='마감팀');assert.deepEqual(finish.map(r=>r.no),['1','1','2','3','4']);assert.equal(finish[0].excelLayout.rowSpan,2);assert.equal(finish[1].excelLayout.rowSpan,2);
  const original=new ExcelJS.Workbook();await original.xlsx.load(before);
  for(const inquiry of imported.inquiries){const sheet=original.getWorksheet(inquiry.sourceSheet);for(const[col,key]of [[3,'trade'],[5,'classification'],[6,'question'],[7,'answer'],[8,'review'],[9,'notes']])assert.equal(inquiry[key],sheet.getCell(inquiry.sourceRow,col).text);}
 });
 await test('질의 원본: ExcelJS 그룹사진 누락 재현 및 원본57장 완전 읽기',async()=>{
  const original=new ExcelJS.Workbook();await original.xlsx.load(before);assert.equal(original.worksheets.reduce((n,s)=>n+s.getImages().length,0),56);
  assert.equal(imported.inquiries.flatMap(r=>r.images).length,15);assert.equal(imported.unassignedImages.length,42);assert.equal(imported.inquiries.flatMap(r=>r.images).length+imported.unassignedImages.length,57);
  const last=imported.inquiries.find(r=>r.sourceSheet==='질의사항(구조)'&&r.sourceRow===40);assert.equal(last.images.length,2);assert.deepEqual(last.images.map(i=>i.name),['image15.png','image16.png']);
 });
 await test('질의 원본: 전체 텍스트·57장 사진·귀속/앵커 내보낸 파일 재개봉',async()=>{
  const out=await buildInquiryWorkbookBuffer(imported.inquiries,{projectName:'아산병원 P동 주차장 증축공사',unassignedImages:imported.unassignedImages});
  const reopened=await readInquiryExcel(out,options);assert.equal(reopened.inquiries.length,16);assert.equal(reopened.unassignedImages.length,42);
  for(let i=0;i<16;i++){const a=imported.inquiries[i],b=reopened.inquiries[i];for(const key of ['no','trade','classification','drawingNumbers','question','answer','review','notes','group'])assert.deepEqual(b[key],a[key]);
   assert.equal(b.images.length,a.images.length);for(let k=0;k<a.images.length;k++){assert.equal(b.images[k].dataUrl,a.images[k].dataUrl);assert.equal(b.images[k].field,a.images[k].field);for(const point of ['tl','br'])if(a.images[k].sourceAnchor[point])for(const key of ['nativeCol','nativeRow','nativeColOff','nativeRowOff'])assert.equal(b.images[k].sourceAnchor[point][key],a.images[k].sourceAnchor[point][key]);}
  }
  for(let i=0;i<42;i++){assert.equal(reopened.unassignedImages[i].dataUrl,imported.unassignedImages[i].dataUrl);assert.deepEqual(reopened.unassignedImages[i].sourceAnchor,imported.unassignedImages[i].sourceAnchor);}
  await fs.writeFile(new URL('../../private-provisioning/qa-inquiry103-20261013/inquiry-roundtrip.xlsx',import.meta.url),out);
  assert.equal(digest(await fs.readFile(source)),digest(before));
 });
}
const summary={kind:source?'SOURCE_XLSX_TEXT_IMAGE_ROUNDTRIP':'SYNTHETIC_INQUIRY_XLSX',pass:results.length,fail:0,results};
if(source)await fs.writeFile(new URL('../../private-provisioning/qa-inquiry103-20261013/excel-test-result.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
