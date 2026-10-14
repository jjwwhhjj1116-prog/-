import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
function photoRect(sheet, placement) {
 const point=value=>{
  let x=(value.nativeColOff??0)/9525,y=(value.nativeRowOff??0)/9525;
  for(let i=0;i<value.nativeCol;i++)x+=(sheet.getColumn(i+1).width??9)*7+5;
  for(let i=0;i<value.nativeRow;i++)y+=(sheet.getRow(i+1).height??15)*4/3;
  return {x,y};
 };
 const start=point(placement.range.tl),end=placement.range.br?point(placement.range.br):{x:start.x+placement.range.ext.width,y:start.y+placement.range.ext.height};
 return {left:start.x,top:start.y,right:end.x,bottom:end.y};
}
function assertPhotoBounds(book, original, reopened) {
 const rectangles=[];
 for(let i=0;i<original.length;i++){
  const row=reopened[i],sheet=book.getWorksheet(row.sourceSheet),placements=sheet.getImages();
  const offset=original.slice(0,i).filter((_,j)=>reopened[j].sourceSheet===row.sourceSheet).reduce((n,item)=>n+item.images.length,0);
  let rowTop=0;for(let r=1;r<row.sourceRow;r++)rowTop+=(sheet.getRow(r).height??15)*4/3;
  let rowBottom=rowTop;for(let r=0;r<row.excelLayout.rowSpan;r++)rowBottom+=(sheet.getRow(row.sourceRow+r).height??15)*4/3;
  for(let j=0;j<original[i].images.length;j++){
   const image=original[i].images[j],rect=photoRect(sheet,placements[offset+j]),col=image.field==='question'?6:image.field==='answer'?7:8;
   let left=0;for(let c=1;c<col;c++)left+=(sheet.getColumn(c).width??9)*7+5;
   const right=left+(sheet.getColumn(col).width??9)*7+5;
   assert.ok(rect.left>=left-0.001&&rect.right<=right+0.001,`${image.name} leaves its ${image.field} column`);
   assert.ok(rect.top>=rowTop-0.001&&rect.bottom<=rowBottom+0.001,`${image.name} leaves its inquiry row block`);
   rectangles.push({...rect,name:image.name});
  }
 }
 for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
  const a=rectangles[i],b=rectangles[j];assert.ok(a.right<=b.left+0.001||b.right<=a.left+0.001||a.bottom<=b.top+0.001||b.bottom<=a.top+0.001,`${a.name} overlaps ${b.name}`);
 }
}
await test('질의 Excel 새 사진: 동일열3/4장·질문/산출/검토·좁은열은 겹침 없이 해당질의 안에 보존',async()=>{
 for(const field of ['question','answer','review'])for(const count of [3,4]){
  const row=item('토목&조경팀');row.images=Array.from({length:count},(_,i)=>({...image(field,`${field}-${i}.png`),caption:`도면 ${i} & "설명"`}));
  const tail={...item('토목&조경팀','2'),question:'다음 질의는 사진과 겹치지 않음'};
  const data=await buildInquiryWorkbookBuffer([row,tail],{projectName:'사진배치110'}),read=await readInquiryExcel(data,options),book=new ExcelJS.Workbook();await book.xlsx.load(data);
  assert.equal(read.inquiries.length,2);assert.equal(read.inquiries[1].question,tail.question);assert.equal(read.inquiries[0].images.length,count);
  for(let i=0;i<count;i++)for(const key of ['field','name','caption','dataUrl'])assert.equal(read.inquiries[0].images[i][key],row.images[i][key]);
  assertPhotoBounds(book,[row,tail],read.inquiries);assert.equal(read.unassignedImages.length,0);
 }
 const narrow=item('구조팀');narrow.excelLayout={rowSpan:1,rowHeights:[45],columnWidths:[1,9,13,21,22,20,18,12,17],reviewHeader:'답변사항'};
 narrow.images=['question','answer','review'].flatMap(field=>Array.from({length:4},(_,i)=>image(field,`${field}-${i}.png`)));
 const data=await buildInquiryWorkbookBuffer([narrow],{projectName:'좁은열110'}),read=await readInquiryExcel(data,options),book=new ExcelJS.Workbook();await book.xlsx.load(data);
 assert.equal(read.inquiries[0].images.length,12);assertPhotoBounds(book,[narrow],read.inquiries);
});
await test('질의 Excel 사진 혼합: 원본anchor·행높이·bytes·설명 보존하며 새 웹사진은 원본아래 별도배치',async()=>{
 const row=item('토목&조경팀');row.excelLayout={rowSpan:2,rowHeights:[66,90],columnWidths:[1,9,13,21,22,63,65,45,17],reviewHeader:'답변사항'};
 row.images=[{...image('question','원본 도면.png'),caption:'원본 설명',sourceAnchor:{tl:{col:5,row:0,nativeCol:5,nativeRow:0,nativeColOff:95250,nativeRowOff:114300},br:{col:5,row:1,nativeCol:5,nativeRow:1,nativeColOff:1047750,nativeRowOff:285750}}},
  {...image('question','추가 질문1.png'),caption:'추가 & "질문"'},image('question','추가 질문2.png'),image('review','추가 검토.png')];
 const data=await buildInquiryWorkbookBuffer([row],{projectName:'혼합사진110'}),read=await readInquiryExcel(data,options),book=new ExcelJS.Workbook();await book.xlsx.load(data);
 const restored=read.inquiries[0];assert.deepEqual(restored.excelLayout.rowHeights.slice(0,2),[66,90]);assert.equal(restored.images.length,4);
 for(let i=0;i<4;i++)for(const key of ['field','name','caption','dataUrl'])assert.equal(restored.images[i][key],row.images[i][key]);
 for(const point of ['tl','br'])for(const key of ['nativeCol','nativeRow','nativeColOff','nativeRowOff'])assert.equal(restored.images[0].sourceAnchor[point][key],row.images[0].sourceAnchor[point][key]);
 assertPhotoBounds(book,[row],read.inquiries);assert.equal(read.unassignedImages.length,0);
 const placements=book.getWorksheet(restored.sourceSheet).getImages(),original=photoRect(book.getWorksheet(restored.sourceSheet),placements[0]);
 for(const placement of placements.slice(1))assert.ok(photoRect(book.getWorksheet(restored.sourceSheet),placement).top>=original.bottom+8);
});
await test('질의 Excel 긴본문: 한영20줄·영문단어wrap·긴한글은 새사진보다 위에 전부 보존',async()=>{
 const cases=[['question',Array.from({length:20},(_,i)=>`${i+1}. 질의 본문 / Drawing A-104-03 150mm 확인`).join('\n'),400],
  ['answer','Please review drawing A-104-03 before approval. '.repeat(35),320],['review','구조도면검토요청'.repeat(60),280]];
 for(const [field,text,minimumTextHeight] of cases){
  const row=item('토목&조경팀');row[field]=text;row.images=[{...image(field,`${field}-긴본문.png`),caption:'본문 뒤 도면 & "원본"'}];
  const tail={...item('토목&조경팀','2'),question:'다음 질의 본문 보존'};
  const data=await buildInquiryWorkbookBuffer([row,tail],{projectName:'긴본문사진110'}),read=await readInquiryExcel(data,options),book=new ExcelJS.Workbook();await book.xlsx.load(data);
  const restored=read.inquiries[0],sheet=book.getWorksheet(restored.sourceSheet);let rowTop=0;for(let r=1;r<restored.sourceRow;r++)rowTop+=(sheet.getRow(r).height??15)*4/3;
  assert.ok(photoRect(sheet,sheet.getImages()[0]).top>=rowTop+minimumTextHeight+8,`${field} text is covered by its photo`);
  assert.equal(restored[field],text);assert.equal(restored.images[0].dataUrl,row.images[0].dataUrl);assert.equal(restored.images[0].caption,row.images[0].caption);assert.equal(read.inquiries[1].question,tail.question);
  assertPhotoBounds(book,[row,tail],read.inquiries);assert.equal(read.unassignedImages.length,0);
 }
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

await test('질의 Excel 차수: 1/2/3차·반복No·공종·원group·8열과사진 왕복',async()=>{
 const rows=[1,2,3].map(roundNumber=>({...item('마감팀'),roundNumber,group:'원본 그룹은 그대로',images:[image('question',`${roundNumber}차.png`)]}));
 const data=await buildInquiryWorkbookBuffer(rows,{projectName:'차수104'}),read=await readInquiryExcel(data,options);
 assert.deepEqual(read.inquiries.map(row=>row.roundNumber),[1,2,3]);
 for(let n=0;n<rows.length;n++)for(const field of ['no','trade','classification','drawingNumbers','question','answer','review','notes','group'])assert.deepEqual(read.inquiries[n][field],rows[n][field]);
 assert.ok(read.inquiries.every(row=>row.id!==rows.find(old=>old.roundNumber===row.roundNumber).id&&row.status==='DRAFT'&&row.revision===0&&row.authorId===options.authorId));
 assert.deepEqual(read.inquiries.map(row=>row.images[0].dataUrl),rows.map(row=>row.images[0].dataUrl));
 const book=new ExcelJS.Workbook();await book.xlsx.load(data);assert.equal(book.worksheets[0].getCell('B2').text,'No');assert.equal(book.worksheets[0].getCell('I2').text,'비고(최종확정날짜)');
 assert.equal(book.worksheets.filter(sheet=>sheet.state==='visible').length,1);
});
await test('질의 Excel 차수: metadata 없는 기존1/2/3차 group 인식·문자열 보존',async()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('질의사항(구조)');
 sheet.addRow(['No','분야','관련도면','부위','질의사항','산출사항','답변사항','비고']);
 for(const round of [1,2,3]){const heading=sheet.addRow([`${round} 차 질의사항`]);sheet.mergeCells(heading.number,1,heading.number,8);sheet.addRow(['1','철골-수직','','','원문','','','']);}
 const result=await readInquiryExcel(new Uint8Array(await book.xlsx.writeBuffer()),options);
 assert.deepEqual(result.inquiries.map(row=>row.roundNumber),[1,2,3]);assert.deepEqual(result.inquiries.map(row=>row.group),['1 차 질의사항','2 차 질의사항','3 차 질의사항']);
});
await test('질의 Excel 발송상태: 3팀 공유라운드 SENT snapshot은 미리보기정보로 보존·자동등록0',async()=>{
 const rows=['마감팀','구조팀','토목&조경팀'].map(department=>({...item(department),roundNumber:2}));
 const rounds=rows.map(row=>({projectId:'source-project',department:row.department,roundNumber:2,status:'SENT',revision:4,createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',sentAt:'2026-10-13T00:00:00Z',sentBy:'source-author',sentByName:'합성 관리자'}));
 const input=structuredClone({rows,rounds}),data=await buildInquiryWorkbookBuffer(rows,{projectName:'발송104',rounds});
 const restored=await readInquiryExcel(data,options);
 assert.deepEqual(restored.rounds,rounds);
 assert.ok(restored.inquiries.every(row=>row.projectId===options.projectId&&row.authorId===options.authorId&&row.status==='DRAFT'&&row.revision===0));
 assert.deepEqual({rows,rounds},input);
 const scoped=await readInquiryExcel(await buildInquiryWorkbookBuffer(rows,{projectName:'팀필터',department:'구조팀',rounds}),options);
 assert.deepEqual(scoped.rounds,[rounds[1]]);assert.equal(scoped.inquiries.length,1);assert.equal(scoped.inquiries[0].department,'구조팀');
});
await test('질의 Excel metadata: 잘못된차수/상태·중복연결·다른팀 상태는 수용하지 않음',async()=>{
 const data=await buildInquiryWorkbookBuffer([{...item('마감팀'),roundNumber:2}],{projectName:'손상검수'}),book=new ExcelJS.Workbook();await book.xlsx.load(data);
 const metadata=book.worksheets.find(sheet=>sheet.getCell('A1').text==='CONCOST_INQUIRIES_METADATA_V1');assert.ok(metadata);
 const bad=new ExcelJS.Workbook();await bad.xlsx.load(data);const sheet=bad.getWorksheet(metadata.name);const row=sheet.getRow(2);assert.equal(row.getCell(1).text,'ROW');row.getCell(4).value=1000;
 await assert.rejects(readInquiryExcel(new Uint8Array(await bad.xlsx.writeBuffer()),options),/차수|메타/);
 await assert.rejects(buildInquiryWorkbookBuffer([{...item('마감팀'),roundNumber:0}],{projectName:'잘못된차수'}),/차수/);
 await assert.rejects(buildInquiryWorkbookBuffer([{...item('마감팀'),roundNumber:1}],{projectName:'잘못된상태',rounds:[{projectId:'x',department:'마감팀',roundNumber:1,status:'UNKNOWN',revision:1,createdAt:'x',updatedAt:'x'}]}),/상태|메타/);
 const duplicate=new ExcelJS.Workbook();await duplicate.xlsx.load(data);const duplicateSheet=duplicate.getWorksheet(metadata.name);duplicateSheet.addRow(duplicateSheet.getRow(2).values.slice(1));await assert.rejects(readInquiryExcel(new Uint8Array(await duplicate.xlsx.writeBuffer()),options),/중복/);
 const foreign=new ExcelJS.Workbook();await foreign.xlsx.load(data);foreign.getWorksheet(metadata.name).addRow(['ROUND',JSON.stringify({projectId:'x',department:'구조팀',roundNumber:2,status:'SENT',revision:1,createdAt:'2026-10-13',updatedAt:'2026-10-13'})]);await assert.rejects(readInquiryExcel(new Uint8Array(await foreign.xlsx.writeBuffer()),options),/팀|차수|메타/);
 const nativeSave=new ExcelJS.Workbook();await nativeSave.xlsx.load(data);const saved=await readInquiryExcel(new Uint8Array(await nativeSave.xlsx.writeBuffer()),options);assert.equal(saved.inquiries[0].roundNumber,2);
});

const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
const outputDirectory=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13)||fileURLToPath(new URL('../../private-provisioning/qa-inquiry103-20261013/',import.meta.url));
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
  await fs.mkdir(outputDirectory,{recursive:true});await fs.writeFile(path.join(outputDirectory,'inquiry-roundtrip.xlsx'),out);
  assert.equal(digest(await fs.readFile(source)),digest(before));
 });
}
const summary={kind:source?'SOURCE_XLSX_TEXT_IMAGE_ROUNDTRIP':'SYNTHETIC_INQUIRY_XLSX',pass:results.length,fail:0,results};
if(source)await fs.writeFile(path.join(outputDirectory,'excel-test-result.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
