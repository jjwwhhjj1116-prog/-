import * as XLSX from 'xlsx';
import type { MeetingRecord } from '../components/MinutesView';

const bodyMetaKey = 'CONCOST_MINUTES_BODY_V1';
// Keep the existing 70-character/18pt height calculation within Excel's 409pt row limit.
const bodyRowCharacterLimit = 70 * Math.floor(409 / 18);
// Synchronous edit detection, not a signature or authorization check.
function bodyCheck(rows: string[]) {
  const text = JSON.stringify(rows);
  let first = 2166136261, second = 5381;
  for (let i=0; i<text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
}
const orderedIndices = (values: unknown, min: number, max: number): values is number[] => Array.isArray(values)
  && values.every((value, i) => Number.isInteger(value) && value >= min && value < max && (!i || value > values[i-1]));
const meetingBody = (meeting: MeetingRecord) => meeting.notesAndInstructions || [meeting.summary, ...(meeting.decisions || []),
  ...(meeting.actionItems || []).map(a => `[${a.roleName}] ${a.title} (${a.assigneeName}, ${a.dueDate})`)].filter(Boolean).join('\n') || meeting.rawTranscript || '';
function bodyParts(body: string) {
  const parts: {text: string; continued: boolean}[] = [];
  for (const line of body.split(/\r?\n/)) {
    let start = 0;
    do {
      let end = Math.min(start + bodyRowCharacterLimit, line.length);
      if (end < line.length && /[\uD800-\uDBFF]/.test(line[end-1]) && /[\uDC00-\uDFFF]/.test(line[end])) end--;
      parts.push({text: line.slice(start, end), continued: start > 0});
      start = end;
    } while (start < line.length);
  }
  return parts;
}

export function extractAiMeetingSummary(rawText: string, _projectName = '') {
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // 원문 발췌이며 생성형 AI가 아니다. 미합의·미확정을 확정으로 변환하지 않는다.
  return { summary: lines.join('\n'), decisions: [] as string[] };
}

export function buildMeetingWorkbook(meeting: MeetingRecord) {
  const body = meetingBody(meeting), parts = bodyParts(body);
  const lines = parts.map(part => part.text);
  const wb = XLSX.utils.book_new();
  const pageCount = Math.max(1, Math.ceil(lines.length / 27));
  for (let page = 0; page < pageCount; page++) {
    const rows: (string | number)[][] = Array.from({length:45}, () => Array(9).fill(''));
    rows[1][2] = '회   의   록';
    rows[3][1] = '작 성 자'; rows[3][2] = meeting.authorAffiliation || ''; rows[3][4] = meeting.authorPosition || ''; rows[3][6] = meeting.author || '';
    rows[4][1] = '회의일시'; rows[4][2] = (meeting.meetingDate || '').slice(0,10).replace(/-/g,'.'); rows[4][4] = '시 간'; rows[4][5] = meeting.startTime || ''; rows[4][6] = '~'; rows[4][7] = meeting.endTime || '';
    for (const [r,label,value] of [
      [5,'회의장소',meeting.location], [6,'거 래 처 명',meeting.clientName], [7,'보 고 부 서',meeting.reportingDept],
      [8,'참 조 부 서',meeting.referenceDept], [9,'참석자 (컨코스트)',meeting.attendeesInternal.join(', ')],
      [10,'참석자 (거 래 처)',meeting.attendeesExternal.join(', ')], [12,'회  의  명',meeting.title], [14,'첨 부 파 일',meeting.attachedFileName]
    ] as const) { rows[r][1] = label; rows[r][2] = value || ''; }
    rows[15][1] = '회의내용 및 지시사항';
    for (let i=0; i<27; i++) rows[16+i][1] = lines[page*27+i] || '';
    rows[43][1] = `※거래처 명함은 PDF파일로 업로드 · ${page+1}/${pageCount}`;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [3,18,22,10,10,10,12,12,3].map(wch=>({wch}));
    ws['!rows'] = rows.map(row=>({hpt: Math.max(20, Math.ceil(String(row[1] || row[2] || '').length / 70) * 18)}));
    ws['!merges'] = [
      {s:{r:1,c:2},e:{r:1,c:5}}, {s:{r:3,c:2},e:{r:3,c:3}}, {s:{r:3,c:4},e:{r:3,c:5}}, {s:{r:3,c:6},e:{r:3,c:7}}, {s:{r:4,c:2},e:{r:4,c:3}},
      ...[5,6,7,8,9,10,12,14].map(r=>({s:{r,c:2},e:{r,c:7}})),
      ...Array.from({length:29},(_,i)=>i+15).map(r=>({s:{r,c:1},e:{r,c:7}}))
    ];
    XLSX.utils.book_append_sheet(wb, ws, page === 0 ? '회의록' : `회의록_${page+1}`);
  }
  const metadata = JSON.stringify({rows: lines.length, joins: parts.flatMap((part, index) => part.continued ? [index] : []),
    crlfBreaks: [...body.matchAll(/\r?\n/g)].flatMap((match, index) => match[0] === '\r\n' ? [index] : []),
    check: bodyCheck([...lines, ...Array(pageCount*27-lines.length).fill('')])});
  const props: Record<string, string | number> = {[bodyMetaKey]: Math.ceil(metadata.length / 255), [`${bodyMetaKey}_check`]: bodyCheck([metadata])};
  for (let start=0; start<metadata.length; start+=255) props[`${bodyMetaKey}_${start/255}`] = metadata.slice(start, start+255);
  wb.Custprops = props;
  return wb;
}

// The exporter knows these cells are the translated copy of its own generated parts.
// Ordinary imported/edited workbooks still use the checked reader below.
export function rebuildTranslatedMeetingWorkbook(meeting: MeetingRecord, translated: XLSX.WorkBook) {
  const body = meetingBody(meeting), parts = bodyParts(body), breaks = [...body.matchAll(/\r?\n/g)].map(match => match[0]);
  const names = translated.SheetNames.filter(name => /^회의록(?:_\d+)?$/.test(name));
  let translatedBody = '', logicalLine = 0;
  for (let i=0; i<parts.length; i++) {
    if (i && !parts[i].continued) translatedBody += breaks[logicalLine++] || '\n';
    const cell = translated.Sheets[names[Math.floor(i/27)]]?.[`B${17+i%27}`];
    translatedBody += String(cell?.v ?? '');
  }
  const wb = buildMeetingWorkbook({...meeting, notesAndInstructions: translatedBody}), template = translated.Sheets[names[0]];
  for (const [page, name] of wb.SheetNames.entries()) {
    const sheet = wb.Sheets[name];
    for (let row=0; row<16; row++) for (let col=0; col<9; col++) {
      const key = XLSX.utils.encode_cell({r:row,c:col});
      if (template[key]) sheet[key] = {...template[key]};
    }
    if (template.B44) sheet.B44 = {...template.B44, v: String(template.B44.v).replace(/\d+\s*\/\s*\d+(?=\s*$)/, `${page+1}/${wb.SheetNames.length}`)};
  }
  return wb;
}

// The installed writer omits alignment styles. Adjust only our generated meeting body cells.
export function writeMeetingWorkbook(wb: XLSX.WorkBook): Uint8Array<ArrayBuffer> {
  const cfb = XLSX.CFB || (XLSX as unknown as {default?: {CFB: typeof XLSX.CFB}}).default?.CFB;
  const invalid = () => new Error('회의록 Excel 양식 구조를 확인해 주세요.');
  if (!cfb || !wb.SheetNames.length || !wb.SheetNames.every(name => /^회의록(?:_\d+)?$/.test(name))) throw invalid();
  const zip = cfb.read(new Uint8Array(XLSX.write(structuredClone(wb), {type:'array', bookType:'xlsx'})), {type:'array'});
  const decoder = new TextDecoder(), encoder = new TextEncoder();
  const entry = (suffix: string) => {
    const index = zip.FullPaths.findIndex((path: string) => path.endsWith(`/${suffix}`));
    if (index < 0 || !zip.FileIndex[index]?.content) throw invalid();
    return {path: zip.FullPaths[index], text: decoder.decode(zip.FileIndex[index].content)};
  };
  const styles = entry('xl/styles.xml');
  const group = styles.text.match(/(<cellXfs\b[^>]*\bcount="(\d+)"[^>]*>)([\s\S]*?)(<\/cellXfs>)/);
  const xfs = group?.[3].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
  if (!group || !xfs?.length || Number(group[2]) !== xfs.length || !xfs[0].endsWith('/>')) throw invalid();
  const wrapIndex = xfs.length;
  const wrap = xfs[0].replace(/\s+applyAlignment="[^"]*"/, '').replace(/\/>$/, ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>');
  const updatedStyles = styles.text.replace(group[0], group[1].replace(/\bcount="\d+"/, `count="${wrapIndex+1}"`) + group[3] + wrap + group[4]);
  cfb.utils.cfb_add(zip, styles.path, encoder.encode(updatedStyles));
  for (let page=0; page<wb.SheetNames.length; page++) {
    const sheet = entry(`xl/worksheets/sheet${page+1}.xml`), addresses = new Set<string>();
    const updated = sheet.text.replace(/<c\b[^>]*\br="(B(?:1[7-9]|[23]\d|4[0-3]))"[^>]*>/g, (tag, address) => {
      const style = tag.match(/\bs="(\d+)"/);
      if (addresses.has(address) || /\bs=/.test(tag) && (!style || Number(style[1]) !== 0)) throw invalid();
      addresses.add(address);
      return style ? tag.replace(/\bs="\d+"/, `s="${wrapIndex}"`) : tag.replace(/\/?>$/, end => ` s="${wrapIndex}"${end}`);
    });
    if (addresses.size !== 27) throw invalid();
    cfb.utils.cfb_add(zip, sheet.path, encoder.encode(updated));
  }
  return Uint8Array.from(cfb.write(zip, {type:'array', fileType:'zip'}));
}

export function downloadMeetingWorkbook(wb: XLSX.WorkBook, filename: string) {
  const bytes = writeMeetingWorkbook(wb);
  const url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click();
  } finally {
    anchor?.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function readMeetingBody(wb: XLSX.WorkBook) {
  const names = wb.SheetNames.filter(name => /^회의록(?:_\d+)?$/.test(name));
  const lines: string[] = [];
  for (const name of names.length ? names : [wb.SheetNames[0]]) {
    const sheet = wb.Sheets[name];
    for (let r=17; r<=43; r++) lines.push(String(sheet[`B${r}`]?.v ?? sheet[`C${r}`]?.v ?? ''));
  }
  const props = wb.Custprops as Record<string, unknown> | undefined;
  const chunks = Object.keys(props || {}).filter(key => new RegExp(`^${bodyMetaKey}_\\d+$`).test(key))
    .sort((a, b) => Number(a.slice(bodyMetaKey.length+1)) - Number(b.slice(bodyMetaKey.length+1)));
  if (chunks.length && chunks.length === props?.[bodyMetaKey] && chunks.every((key, index) => key === `${bodyMetaKey}_${index}`
    && typeof props?.[key] === 'string' && (props[key] as string).length <= 255)) {
    try {
      const serialized = chunks.map(key => props![key]).join(''), metadata = JSON.parse(serialized);
      if (props?.[`${bodyMetaKey}_check`] === bodyCheck([serialized]) && Number.isInteger(metadata.rows) && metadata.rows > 0 && metadata.rows <= lines.length
        && metadata.check === bodyCheck(lines) && orderedIndices(metadata.joins, 1, metadata.rows)
        && orderedIndices(metadata.crlfBreaks, 0, metadata.rows-metadata.joins.length-1)) {
        const joins = new Set(metadata.joins), crlf = new Set(metadata.crlfBreaks), restored: string[] = [];
        for (let i=0; i<metadata.rows; i++) {
          if (joins.has(i)) restored[restored.length-1] += lines[i];
          else restored.push(lines[i]);
        }
        return restored.map((line, index) => (index ? crlf.has(index-1) ? '\r\n' : '\n' : '') + line).join('');
      }
    } catch { /* Ordinary/edited workbooks retain the existing row-based reader. */ }
  }
  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}
