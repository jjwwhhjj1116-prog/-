import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {encodeTsv,decodeTsv,parseCopiedInquiryRows,inquiryClipboardMime} from '../src/utils/inquiryClipboard.ts';
const results=[],target={projectId:'new-project',department:'구조팀',trade:'철골-수직',authorId:'new-author',authorName:'새 작성자'};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6Vn1cAAAAASUVORK5CYII=';
const row={id:'original-row',projectId:'old-project',department:'마감팀',trade:'조적',authorId:'old-author',authorName:'기존 작성자',status:'REGISTERED',revision:9,registeredAt:'2026-10-01',createdAt:'2026-10-01',updatedAt:'2026-10-02',no:'7',classification:'지하1층',group:'1차 질의',drawingNumbers:['S-101','S-202'],question:'첫째 줄\n둘째\t칸 "확인"',answer:'산출 반영',review:'발주처 검토',notes:'원문 비고',sourceSheet:'원본',sourceRow:37,excelLayout:{rowSpan:2},images:[{id:'original-image',name:'도면.png',mimeType:'image/png',dataUrl:png,field:'question',caption:'사진 "설명"\n두 줄',sourceAnchor:{tl:{col:2,row:35}}}]};
const test=(name,fn)=>{fn();results.push({name,status:'PASS'});console.log('PASS '+name);};
test('TSV: 줄바꿈/탭/따옴표/공백/빈 마지막 행 원문 왕복',()=>{
 const cells=[['No','첫 줄\n둘째 줄','탭\t포함','"인용"',''],['2','CRLF\r\n원문','  양쪽 공백  ','=SUM(A1:A2)',''],['','']];assert.deepEqual(decodeTsv(encodeTsv(cells)),cells);assert.equal(inquiryClipboardMime,'application/x-concost-inquiries');
});
test('TSV: Excel의 끝 CRLF와 quoted multiline 셀은 추가 행/열로 나누지 않음',()=>{
 assert.deepEqual(decodeTsv('1\t"A\r\nB\tC ""D"""\t\r\n2\t끝\t\r\n'),[['1','A\r\nB\tC "D"',''],['2','끝','']]);assert.deepEqual(decodeTsv(''),[['']]);
});
test('TSV: 잘못 닫힌 따옴표/20k 초과 셀/100행 초과 거부',()=>{
 for(const raw of ['"미완성','"닫힘"이후','잘못"된셀','a'.repeat(20001),Array(101).fill('x').join('\n')])assert.throws(()=>decodeTsv(raw));
});
test('질의 복사: 소유/승인/원본좌표 제거·새 초안/사진 ID·내용/캡션 보존',()=>{
 const original=structuredClone(row),[copy]=parseCopiedInquiryRows(JSON.stringify([row]),target);assert.notEqual(copy.id,row.id);assert.notEqual(copy.images[0].id,row.images[0].id);for(const [key,value]of Object.entries(target))assert.equal(copy[key],value);assert.equal(copy.status,'DRAFT');assert.equal(copy.revision,0);
 for(const key of ['registeredAt','sourceSheet','sourceRow','excelLayout'])assert.ok(!(key in copy));assert.ok(!('sourceAnchor'in copy.images[0]));for(const key of ['no','classification','group','drawingNumbers','question','answer','review','notes'])assert.deepEqual(copy[key],row[key]);assert.equal(copy.images[0].caption,row.images[0].caption);assert.equal(copy.images[0].dataUrl,png);assert.deepEqual(row,original);
});
test('질의 복사: 반복/복수 붙여넣기도 행·사진 ID 충돌0',()=>{
 const copies=[...parseCopiedInquiryRows(JSON.stringify([row,row]),target),...parseCopiedInquiryRows(JSON.stringify([row]),target)];assert.equal(new Set(copies.map(r=>r.id)).size,3);assert.equal(new Set(copies.flatMap(r=>r.images.map(i=>i.id))).size,3);copies[0].drawingNumbers.push('변경');assert.equal(copies[1].drawingNumbers.length,2);
});
test('질의 복사: invalid JSON/object/null 및100행 초과·본문20k 초과 거부',()=>{
 for(const raw of ['{invalid','{}','[null]',JSON.stringify(Array(101).fill(row)),JSON.stringify([{...row,question:'x'.repeat(20001)}])])assert.throws(()=>parseCopiedInquiryRows(raw,target));
 assert.equal(parseCopiedInquiryRows(JSON.stringify([{...row,question:'x'.repeat(20000)}]),target)[0].question.length,20000);
});
test('사진 복사: 원격URL/SVG/위장MIME/틀린magic/사진5개/캡션 초과 거부',()=>{
 const original=row.images[0];for(const image of [{...original,dataUrl:'https://example.com/image.png'},{...original,mimeType:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},{...original,mimeType:'image/jpeg',name:'도면.jpg'},{...original,dataUrl:'data:image/png;base64,AAAA'},{...original,caption:'x'.repeat(1001)}])assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([{...row,images:[image]}]),target));
 assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([{...row,images:Array(5).fill(original)}]),target));
});
test('사진 복사: 개별1MiB 및 행별 합계1MiB 제한·네 장 이하 PNG 허용',()=>{
 const original=row.images[0],large=Buffer.alloc(600000);large.set([137,80,78,71,13,10,26,10]);const image={...original,dataUrl:'data:image/png;base64,'+large.toString('base64')};assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([{...row,images:[image,image]}]),target));
 assert.equal(parseCopiedInquiryRows(JSON.stringify([{...row,images:Array(4).fill(original)}]),target)[0].images.length,4);
 const huge=Buffer.alloc(1048577);huge.set([137,80,78,71,13,10,26,10]);assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([{...row,images:[{...image,dataUrl:'data:image/png;base64,'+huge.toString('base64')}]}]),target));
});
test('질의 복사: 도면번호/대상팀/대상작성자 연결 유효성 검사',()=>{
 assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([{...row,drawingNumbers:['x'.repeat(301)]}]),target));assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([row]),{...target,department:'미확정'}));assert.throws(()=>parseCopiedInquiryRows(JSON.stringify([row]),{...target,authorId:''}));
});
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({pass:results.length,results,networkRequests:0,operatingWrites:0},null,2));
