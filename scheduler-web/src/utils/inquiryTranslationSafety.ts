// Translation must not convert or invent engineering quantities, units or drawing codes.
export function inquiryTranslationTokens(value: string): string[] {
    const boundary = String.raw`(?=$|[가-힣]|[^\p{L}\p{N}_])`;
    const start = String.raw`(?:(?<![\p{L}\p{N}_])|(?<=[가-힣]))`;
    const simpleUnit = String.raw`(?:mm[²³23]?|cm[²³23]?|km|m[²³23]?|㎡|㎥|kg|kN|MPa|kPa|Pa|N|g|t|ft|L|l|%|°C|℃)`;
    const unit = String.raw`${simpleUnit}(?:\s*[/*·]\s*${simpleUnit})*${boundary}`;
    // Bare "in" is an English preposition; only an attached numeric suffix means inches.
    const suffix = String.raw`(?:in${boundary}|\s*${unit})?`;
    const number = String.raw`[-+]?\d+(?:[.,]\d+)*(?:[eE][-+]?\d+)?`;
    const relationship = String.raw`${number}(?:\s*[/：:~〜–—-]\s*${number})+`;
    const pattern = new RegExp([
        String.raw`[ØøΦφ⌀]\s*${number}${suffix}`,
        String.raw`${start}(?=[A-Za-z0-9_./-]*\d)[A-Za-z][A-Za-z0-9]*(?:[-_./][A-Za-z0-9]+)*${boundary}`,
        String.raw`(?:${relationship}|${number})${suffix}`,
        String.raw`${start}${unit}`,
        '[㎡㎥%±×ØøΦφ⌀]',
    ].join('|'), 'gu');
    return [...value.matchAll(pattern)].map(match => match[0].replace(/\s+/g, '')).sort();
}

export function inquiryTranslationPreserves(source: string, translated: string): boolean {
    return JSON.stringify(inquiryTranslationTokens(source)) === JSON.stringify(inquiryTranslationTokens(translated));
}
