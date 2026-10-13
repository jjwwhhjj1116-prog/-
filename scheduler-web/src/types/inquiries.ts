import type { Department } from '../store/useProjectStore';

export type InquiryStatus = 'DRAFT' | 'REGISTERED';
export interface InquiryRound {
    projectId: string;
    department: Department;
    roundNumber: number;
    status: 'DRAFT' | 'SENT';
    revision: number;
    createdAt: string;
    updatedAt: string;
    sentAt?: string;
    sentBy?: string;
    sentByName?: string;
}
export type InquiryImageField = 'question' | 'answer' | 'review';
export interface InquiryImagePoint {
    col: number;
    row: number;
    nativeCol?: number;
    nativeRow?: number;
    nativeColOff?: number;
    nativeRowOff?: number;
}

export interface InquiryImage {
    id: string;
    name: string;
    mimeType: 'image/png' | 'image/jpeg';
    dataUrl: string;
    field: InquiryImageField;
    caption?: string;
    // Zero-based, relative to the inquiry's first physical Excel row.
    sourceAnchor?: {
        tl: InquiryImagePoint;
        br?: InquiryImagePoint;
        width?: number;
        height?: number;
    };
}

export interface Inquiry {
    id: string;
    projectId: string;
    department: Department;
    no: string;
    trade: string;
    classification: string;
    group: string;
    drawingNumbers: string[];
    question: string;
    answer: string;
    review: string;
    notes: string;
    images: InquiryImage[];
    status: InquiryStatus;
    roundNumber?: number;
    deletedAt?: string;
    deletedBy?: string;
    deletedByName?: string;
    authorId: string;
    authorName: string;
    createdAt: string;
    updatedAt: string;
    registeredAt?: string;
    updatedBy?: string;
    updatedByName?: string;
    revision: number;
    sourceSheet?: string;
    sourceRow?: number;
    excelLayout?: {
        rowSpan: number;
        rowHeights: number[];
        columnWidths: number[];
        reviewHeader: string;
        headers?: string[];
        mergedColumns?: number[];
    };
}

export type InquiryUnassignedImage = Omit<InquiryImage, 'field'> & {
    sourceSheet: string;
    sourceRow: number;
};

export interface InquiryImportResult {
    inquiries: Inquiry[];
    // Imported dispatch metadata is a preview; it never marks central rounds sent.
    rounds?: InquiryRound[];
    warnings: string[];
    // Images outside the inquiry table stay unassigned for human review.
    unassignedImages: InquiryUnassignedImage[];
}
