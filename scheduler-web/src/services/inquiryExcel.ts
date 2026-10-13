import type { Workbook, Worksheet, Cell } from 'exceljs';
import type { Department } from '../store/useProjectStore';
import type { Inquiry, InquiryImage, InquiryImagePoint, InquiryImportResult, InquiryUnassignedImage } from '../types/inquiries';

const HEADERS = ['No', '분야', '관련도면', '부위', '질의사항', '산출사항', '답변사항(발주처확인)', '비고(최종확정날짜)'];
const WIDTHS = [1, 9, 13.125, 21.75, 22.25, 63.375, 65.625, 45.625, 17.25];
// Source Excel photographs remain lossless; central registration applies its
// separate 1MiB/four-photo limit without altering this local import/export.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
type XmlNode = { name: string; attrs: Record<string, string>; text: string; children: XmlNode[] };
type RawImage = Omit<InquiryImage, 'field'> & { sourceSheet: string; sourceRow: number };

function base64Bytes(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}

/** No remote URLs or HTML/SVG are accepted as embedded inquiry photographs. */
export function inquiryImageBytes(dataUrl: string): Uint8Array {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('사진은 20MB 이하 PNG 또는 JPEG여야 합니다.');
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); }
    catch { throw new Error('사진 데이터가 올바르지 않습니다.'); }
    const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (bytes.length > MAX_IMAGE_BYTES || (match[1] === 'png' ? !png : !jpeg)) throw new Error('사진 형식과 실제 파일이 일치하지 않습니다.');
    return bytes;
}

async function xmlTree(text: string): Promise<XmlNode> {
    if (text.length > 8 * 1024 * 1024) throw new Error('엑셀 내부 자료가 너무 큽니다.');
    const { SaxesParser } = await import('saxes');
    const root: XmlNode = { name: '', attrs: {}, text: '', children: [] };
    const stack = [root];
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => { throw new Error('지원하지 않는 엑셀 XML 선언입니다.'); });
    parser.on('opentag', tag => {
        const node: XmlNode = { name: tag.local, attrs: {}, text: '', children: [] };
        for (const attr of Object.values(tag.attributes)) node.attrs[attr.local] = attr.value;
        stack[stack.length - 1].children.push(node); stack.push(node);
    });
    parser.on('text', text => { stack[stack.length - 1].text += text; });
    parser.on('closetag', () => { stack.pop(); });
    parser.write(text).close();
    return root.children[0];
}
const child = (node: XmlNode | undefined, name: string) => node?.children.find(n => n.name === name);
const descendants = (node: XmlNode, name: string): XmlNode[] => node.children.flatMap(n => [...(n.name === name ? [n] : []), ...descendants(n, name)]);
const number = (node: XmlNode | undefined, name: string) => Number(child(node, name)?.text || 0);

function zipTarget(base: string, target: string): string {
    const parts: string[] = [];
    for (const part of (target.startsWith('/') ? target.slice(1) : `${base.slice(0, base.lastIndexOf('/') + 1)}${target}`).split('/')) {
        if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
}
const relationFile = (file: string) => `${file.slice(0, file.lastIndexOf('/') + 1)}_rels/${file.slice(file.lastIndexOf('/') + 1)}.rels`;
const colPixels = (sheet: Worksheet, col: number) => Math.max(1, (sheet.getColumn(col + 1).width ?? 9) * 7 + 5);
const rowPixels = (sheet: Worksheet, row: number) => Math.max(1, (sheet.findRow(row + 1)?.height ?? 15) * 4 / 3);

function nativePoint(sheet: Worksheet, node: XmlNode): InquiryImagePoint {
    const nativeCol = number(node, 'col'), nativeRow = number(node, 'row');
    const nativeColOff = number(node, 'colOff'), nativeRowOff = number(node, 'rowOff');
    return { col: nativeCol + nativeColOff / ((sheet.getColumn(nativeCol + 1).width ?? 9) * 10000),
        row: nativeRow + nativeRowOff / ((sheet.findRow(nativeRow + 1)?.height ?? 15) * 10000),
        nativeCol, nativeRow, nativeColOff, nativeRowOff };
}
function pointPixels(sheet: Worksheet, point: InquiryImagePoint): { x: number; y: number } {
    const col = point.nativeCol ?? Math.floor(point.col), row = point.nativeRow ?? Math.floor(point.row);
    let x = (point.nativeColOff ?? 0) / 9525, y = (point.nativeRowOff ?? 0) / 9525;
    for (let i = 0; i < col; i++) x += colPixels(sheet, i);
    for (let i = 0; i < row; i++) y += rowPixels(sheet, i);
    return { x, y };
}
function pixelPoint(sheet: Worksheet, x: number, y: number): InquiryImagePoint {
    let col = 0, row = 0;
    while (col < 16383 && x >= colPixels(sheet, col)) { x -= colPixels(sheet, col); col++; }
    while (row < 10000 && y >= rowPixels(sheet, row)) { y -= rowPixels(sheet, row); row++; }
    return { col: col + x / colPixels(sheet, col), row: row + y / rowPixels(sheet, row),
        nativeCol: col, nativeRow: row, nativeColOff: Math.round(x * 9525), nativeRowOff: Math.round(y * 9525) };
}

// ExcelJS drops all but the last picture in an OOXML grpSp. Read the drawing
// relationships directly so each source photograph survives, including groups.
async function rawWorkbookImages(data: Uint8Array, book: Workbook, warnings: string[]): Promise<RawImage[]> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(data);
    const tree = async (file: string) => {
        const entry = zip.file(file); if (!entry) throw new Error(`엑셀 내부 연결을 찾을 수 없습니다: ${file}`);
        return xmlTree(await entry.async('string'));
    };
    const relationships = async (file: string) => {
        const relFile = relationFile(file); if (!zip.file(relFile)) return new Map<string, string>();
        return new Map((await tree(relFile)).children.filter(n => n.name === 'Relationship' && n.attrs.TargetMode !== 'External').map(n => [n.attrs.Id, zipTarget(file, n.attrs.Target)]));
    };
    const wb = await tree('xl/workbook.xml'), wbRels = await relationships('xl/workbook.xml');
    const images: RawImage[] = [];
    for (const sourceSheet of descendants(wb, 'sheet')) {
        const sheet = book.getWorksheet(sourceSheet.attrs.name); if (!sheet) continue;
        const sheetFile = wbRels.get(sourceSheet.attrs.id); if (!sheetFile) continue;
        const sheetDoc = await tree(sheetFile), sheetRels = await relationships(sheetFile);
        for (const drawing of descendants(sheetDoc, 'drawing')) {
            const drawingFile = sheetRels.get(drawing.attrs.id); if (!drawingFile) continue;
            const drawingDoc = await tree(drawingFile), imageRels = await relationships(drawingFile);
            for (const anchor of drawingDoc.children) {
                const from = child(anchor, 'from'); if (!from) { warnings.push(`${sheet.name}: 셀에 연결되지 않은 그림은 가져오지 못했습니다.`); continue; }
                const tl = nativePoint(sheet, from), to = child(anchor, 'to');
                const br = to ? nativePoint(sheet, to) : undefined;
                const ext = child(anchor, 'ext');
                const group = child(anchor, 'grpSp');
                const groupTransform = child(child(group, 'grpSpPr'), 'xfrm');
                for (const pic of descendants(anchor, 'pic')) {
                    const blip = descendants(pic, 'blip')[0], mediaPath = blip && imageRels.get(blip.attrs.embed);
                    if (!mediaPath || !zip.file(mediaPath)) { warnings.push(`${sheet.name}: 연결되지 않은 사진이 있습니다.`); continue; }
                    const bytes = await zip.file(mediaPath)!.async('uint8array');
                    const mimeType = /\.jpe?g$/i.test(mediaPath) ? 'image/jpeg' : /\.png$/i.test(mediaPath) ? 'image/png' : undefined;
                    if (!mimeType) throw new Error(`${sheet.name}: PNG/JPEG가 아닌 사진은 지원하지 않습니다.`);
                    let imageTl = tl, imageBr = br;
                    if (groupTransform) {
                        const p = child(child(pic, 'spPr'), 'xfrm');
                        const off = child(p, 'off'), size = child(p, 'ext');
                        const goff = child(groupTransform, 'chOff'), gsize = child(groupTransform, 'chExt'), actualSize = child(groupTransform, 'ext');
                        if (off && size && goff && gsize && actualSize && +gsize.attrs.cx && +gsize.attrs.cy) {
                            const origin = pointPixels(sheet, tl);
                            const scaleX = +actualSize.attrs.cx / +gsize.attrs.cx / 9525, scaleY = +actualSize.attrs.cy / +gsize.attrs.cy / 9525;
                            const x = origin.x + (+off.attrs.x - +goff.attrs.x) * scaleX, y = origin.y + (+off.attrs.y - +goff.attrs.y) * scaleY;
                            imageTl = pixelPoint(sheet, x, y); imageBr = pixelPoint(sheet, x + +size.attrs.cx * scaleX, y + +size.attrs.cy * scaleY);
                        } else throw new Error(`${sheet.name}: 그룹 사진의 위치를 읽을 수 없습니다.`);
                    }
                    const dataUrl = `data:${mimeType};base64,${base64Bytes(bytes)}`;
                    inquiryImageBytes(dataUrl);
                    const description = descendants(pic, 'cNvPr')[0]?.attrs;
                    images.push({ id: crypto.randomUUID(), name: description?.title || mediaPath.split('/').pop()!, mimeType, dataUrl,
                        ...(description?.descr ? { caption: description.descr } : {}),
                        sourceSheet: sheet.name, sourceRow: (imageTl.nativeRow ?? Math.floor(imageTl.row)) + 1,
                        sourceAnchor: { tl: imageTl, ...(imageBr ? { br: imageBr } : {}),
                            ...(!imageBr && ext ? { width: +ext.attrs.cx / 9525, height: +ext.attrs.cy / 9525 } : {}) } });
                }
            }
        }
    }
    return images;
}

const normalized = (text: string) => text.replace(/\s/g, '').toLowerCase();
const cellText = (cell: Cell) => cell.text || '';
const isMaster = (cell: Cell) => !cell.isMerged || cell.master.address === cell.address;
function blockText(sheet: Worksheet, col: number, start: number, end: number): string {
    const values: string[] = [];
    for (let row = start; row <= end; row++) {
        const cell = sheet.getCell(row, col);
        if (isMaster(cell) && cellText(cell)) values.push(cellText(cell));
    }
    return values.join('\n');
}
function movePoint(point: InquiryImagePoint, delta: number): InquiryImagePoint {
    return { ...point, row: point.row + delta, ...(point.nativeRow !== undefined ? { nativeRow: point.nativeRow + delta } : {}) };
}
function relativeImage(image: RawImage, start: number): InquiryImage['sourceAnchor'] {
    const anchor = image.sourceAnchor!;
    return { ...anchor, tl: movePoint(anchor.tl, 1 - start), ...(anchor.br ? { br: movePoint(anchor.br, 1 - start) } : {}) };
}

export async function readInquiryExcel(data: ArrayBuffer | Uint8Array, options: {
    projectId: string; department?: Department; authorId: string; authorName: string;
}): Promise<InquiryImportResult> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!bytes.length || bytes.byteLength > 25 * 1024 * 1024) throw new Error('25MB 이하 엑셀 파일을 선택해 주세요.');
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    const result: InquiryImportResult = { inquiries: [], warnings: [], unassignedImages: [] };
    const images = await rawWorkbookImages(bytes, book, result.warnings);
    const assigned = new Set<string>(), now = new Date().toISOString();
    for (const sheet of book.worksheets) {
        if (sheet.rowCount > 10000) throw new Error(`${sheet.name}: 질의사항 행 수가 너무 많습니다.`);
        let headerRow = 0, firstCol = 0;
        for (let row = 1; row <= Math.min(sheet.rowCount, 20) && !headerRow; row++) for (let col = 1; col <= 12; col++) {
            if (normalized(cellText(sheet.getCell(row, col))) === 'no' && normalized(cellText(sheet.getCell(row, col + 1))) === '분야') { headerRow = row; firstCol = col; break; }
        }
        if (!headerRow) { result.warnings.push(`${sheet.name}: 질의사항 양식이 없어 행을 가져오지 않았습니다.`); continue; }
        const headers = Array.from({ length: 8 }, (_, i) => cellText(sheet.getCell(headerRow, firstCol + i)));
        if (!normalized(headers[4]).includes('질의') || !/(산출|답변)/.test(normalized(headers[5]))) throw new Error(`${sheet.name}: 질의·산출 열을 확인해 주세요.`);
        const department: Department = /구조/.test(sheet.name) ? '구조팀' : /마감/.test(sheet.name) ? '마감팀' : /토목|조경/.test(sheet.name) ? '토목&조경팀' : options.department ?? '마감팀';
        const starts: number[] = [], groups = new Map<number, string>(); let group = '';
        for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
            const no = sheet.getCell(row, firstCol), trade = sheet.getCell(row, firstCol + 1);
            if (!isMaster(no)) continue;
            if (no.isMerged && trade.isMerged && trade.master.address === no.address) {
                const heading = cellText(no);
                group = /^\s*[▶▷►]/.test(heading) ? `${group}\n${heading}` : heading;
                groups.set(row, group); continue;
            }
            if (cellText(no) && (cellText(trade) || cellText(sheet.getCell(row, firstCol + 4)))) { starts.push(row); groups.set(row, group); }
        }
        for (let i = 0; i < starts.length; i++) {
            const start = starts[i], next = starts[i + 1] ?? sheet.rowCount + 1;
            const nextHeading = [...groups.keys()].find(row => row > start && row < next && !starts.includes(row));
            const end = (nextHeading ?? next) - 1;
            const values = Array.from({ length: 8 }, (_, col) => blockText(sheet, firstCol + col, start, end));
            const related = images.filter(image => image.sourceSheet === sheet.name && image.sourceRow >= start && image.sourceRow <= end && (image.sourceAnchor!.tl.nativeCol ?? Math.floor(image.sourceAnchor!.tl.col)) >= firstCol - 1 && (image.sourceAnchor!.tl.nativeCol ?? Math.floor(image.sourceAnchor!.tl.col)) < firstCol + 7);
            const pictures: InquiryImage[] = related.map(image => {
                assigned.add(image.id); const col = image.sourceAnchor!.tl.nativeCol ?? Math.floor(image.sourceAnchor!.tl.col);
                const field = col >= firstCol + 5 ? 'review' : col >= firstCol + 4 ? 'answer' : 'question';
                return { id: image.id, name: image.name, mimeType: image.mimeType, dataUrl: image.dataUrl, field, ...(image.caption ? { caption: image.caption } : {}), sourceAnchor: relativeImage(image, start) };
            });
            result.inquiries.push({ id: crypto.randomUUID(), projectId: options.projectId, department,
                no: values[0], trade: values[1], drawingNumbers: values[2] ? values[2].split(/\r?\n/) : [], classification: values[3], question: values[4], answer: values[5], review: values[6], notes: values[7],
                group: groups.get(start) ?? '', images: pictures, status: 'DRAFT', authorId: options.authorId, authorName: options.authorName, createdAt: now, updatedAt: now, revision: 0,
                sourceSheet: sheet.name, sourceRow: start, excelLayout: { rowSpan: end - start + 1, rowHeights: Array.from({ length: end - start + 1 }, (_, j) => sheet.getRow(start + j).height ?? 15),
                    columnWidths: Array.from({ length: 9 }, (_, col) => sheet.getColumn(col + 1).width ?? WIDTHS[col]), reviewHeader: headers[6], headers,
                    mergedColumns: Array.from({ length: 8 }, (_, col) => firstCol + col).filter(col => sheet.getCell(start, col).isMerged) } });
        }
    }
    result.unassignedImages = images.filter(image => !assigned.has(image.id));
    if (result.unassignedImages.length) result.warnings.push(`표 밖 사진 ${result.unassignedImages.length}장은 질문에 자동 배정하지 않았습니다. 미연결 사진에서 확인해 주세요.`);
    if (!result.inquiries.length) throw new Error('가져올 질의사항 행이 없습니다. No·분야·질의사항 열을 확인해 주세요.');
    return result;
}

export interface InquiryExcelOptions { projectName: string; department?: Department; unassignedImages?: InquiryUnassignedImage[] }
function addPicture(book: Workbook, sheet: Worksheet, image: Omit<InquiryImage, 'field'>, anchor: InquiryImage['sourceAnchor']): void {
    if (!anchor) throw new Error('사진 위치 정보가 없습니다.');
    if (!image.dataUrl.startsWith(`data:${image.mimeType};base64,`)) throw new Error('사진 형식과 실제 파일이 일치하지 않습니다.');
    inquiryImageBytes(image.dataUrl);
    const id = book.addImage({ base64: image.dataUrl, extension: image.mimeType === 'image/png' ? 'png' : 'jpeg' });
    if (anchor.br) sheet.addImage(id, { tl: anchor.tl, br: anchor.br, editAs: 'oneCell' } as Parameters<typeof sheet.addImage>[1]);
    else sheet.addImage(id, { tl: anchor.tl, ext: { width: anchor.width ?? 300, height: anchor.height ?? 160 } });
}

export async function buildInquiryWorkbookBuffer(inquiries: Inquiry[], options: InquiryExcelOptions): Promise<Uint8Array> {
    const { default: ExcelJS } = await import('exceljs'); const book = new ExcelJS.Workbook();
    const rows = inquiries.filter(item => !options.department || item.department === options.department);
    const sheets = new Map<string, Worksheet>();
    const pictureLabels = new Map<string, { name: string; caption?: string }[]>();
    const putPicture = (sheet: Worksheet, image: Omit<InquiryImage, 'field'>, anchor: InquiryImage['sourceAnchor']) => {
        addPicture(book, sheet, image, anchor);
        pictureLabels.set(sheet.name, [...(pictureLabels.get(sheet.name) ?? []), { name: image.name, caption: image.caption }]);
    };
    const nameFor = (item: Pick<Inquiry, 'sourceSheet' | 'department'>) => (item.sourceSheet || `질의사항(${item.department.replace('팀', '')})`).replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || '질의사항';
    const getSheet = (name: string, item?: Inquiry) => {
        let sheet = sheets.get(name); if (sheet) return sheet;
        sheet = book.addWorksheet(name, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 2 }] }); sheets.set(name, sheet);
        (item?.excelLayout?.columnWidths ?? WIDTHS).slice(0, 9).forEach((width, i) => { sheet!.getColumn(i + 1).width = width; });
        sheet.mergeCells('B1:I1'); sheet.getCell('B1').value = `■ ${options.projectName}`; sheet.getRow(1).height = 39;
        sheet.getCell('B1').font = { name: '맑은 고딕', size: 14, bold: true };
        const headers = item?.excelLayout?.headers ?? [...HEADERS.slice(0, 6), item?.excelLayout?.reviewHeader || HEADERS[6], HEADERS[7]];
        headers.forEach((header, col) => { const cell = sheet!.getCell(2, col + 2); cell.value = header; cell.font = { name: '맑은 고딕', size: 10, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }; });
        sheet.getRow(2).height = 40.5; sheet.pageSetup.printTitlesRow = '1:2';
        return sheet;
    };
    const nextRows = new Map<string, number>(), lastGroups = new Map<string, string>();
    for (const item of rows) {
        const name = nameFor(item), sheet = getSheet(name, item); let row = nextRows.get(name) ?? 3;
        if (item.group && lastGroups.get(name) !== item.group) {
            for (const line of item.group.split('\n')) { sheet.mergeCells(row, 2, row, 9); const cell = sheet.getCell(row, 2); cell.value = line; cell.font = { name: '맑은 고딕', size: 10, bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; sheet.getRow(row).height = 20.25; row++; }
            lastGroups.set(name, item.group);
        }
        const span = Math.max(1, Math.min(1000, item.excelLayout?.rowSpan ?? (item.images.length ? 2 : 1)));
        for (let offset = 0; offset < span; offset++) sheet.getRow(row + offset).height = item.excelLayout?.rowHeights[offset] ?? 90;
        const values = [item.no, item.trade, item.drawingNumbers.join('\n'), item.classification, item.question, item.answer, item.review, item.notes];
        values.forEach((value, col) => {
            if (span > 1 && (item.excelLayout?.mergedColumns ?? [2, 3, 4, 5, 6, 7, 8, 9]).includes(col + 2)) sheet.mergeCells(row, col + 2, row + span - 1, col + 2);
            const cell = sheet.getCell(row, col + 2); cell.value = value; cell.font = { name: '맑은 고딕', size: 10 };
            cell.alignment = { vertical: 'top', horizontal: col < 2 ? 'center' : 'left', wrapText: true };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        item.images.forEach((image, index) => {
            const original = image.sourceAnchor, targetCol = image.field === 'question' ? 5 : image.field === 'answer' ? 6 : 7;
            const anchor = original ? { ...original, tl: movePoint(original.tl, row - 1), ...(original.br ? { br: movePoint(original.br, row - 1) } : {}) }
                : { tl: { col: targetCol + (index % 2) * 0.47, row: row - 1 + 0.25 }, width: 210, height: 100 };
            putPicture(sheet, image, anchor);
        });
        nextRows.set(name, row + span);
    }
    for (const image of options.unassignedImages ?? []) {
        const name = image.sourceSheet.replace(/[\\/*?:[\]]/g, '_').slice(0, 31) || '미연결 사진';
        putPicture(getSheet(name), image, image.sourceAnchor);
    }
    if (!sheets.size) getSheet(`질의사항(${(options.department ?? '마감팀').replace('팀', '')})`);
    const output = new Uint8Array(await book.xlsx.writeBuffer());
    if (!pictureLabels.size) return output;
    // ExcelJS does not expose picture alternative text. Keep captions and names
    // in standard OOXML picture attributes without adding columns or sheets.
    const { default: JSZip } = await import('jszip'); const zip = await JSZip.loadAsync(output);
    const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;');
    for (const [name, labels] of pictureLabels) {
        const sheetFile = `xl/worksheets/sheet${sheets.get(name)!.id}.xml`;
        const relations = await xmlTree(await zip.file(relationFile(sheetFile))!.async('string'));
        const drawing = relations.children.find(n => n.attrs.Type?.endsWith('/drawing'));
        if (!drawing) throw new Error('사진 설명을 엑셀에 보존하지 못했습니다.');
        const drawingFile = zipTarget(sheetFile, drawing.attrs.Target); let index = 0;
        const xml = await zip.file(drawingFile)!.async('string');
        zip.file(drawingFile, xml.replace(/<(?:xdr:)?cNvPr\b[^>]*>/g, tag => {
            const label = labels[index++]; if (!label) throw new Error('사진 설명 연결을 확인하지 못했습니다.');
            const ending = tag.endsWith('/>') ? '/>' : '>';
            return tag.slice(0, -ending.length) + ` title="${escape(label.name)}"${label.caption ? ` descr="${escape(label.caption)}"` : ''}${ending}`;
        }));
        if (index !== labels.length) throw new Error('사진 설명 수가 일치하지 않습니다.');
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function downloadInquiryExcel(inquiries: Inquiry[], options: InquiryExcelOptions): Promise<void> {
    const bytes = await buildInquiryWorkbookBuffer(inquiries, options);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${options.projectName.replace(/[\\/:*?"<>|]/g, '_')}_질의사항.xlsx`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
