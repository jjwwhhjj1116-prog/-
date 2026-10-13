export function inquiryRoundNumber(row: { roundNumber?: number; group?: string }): number {
    if (Number.isInteger(row.roundNumber) && row.roundNumber! >= 1 && row.roundNumber! <= 999) return row.roundNumber!;
    const inferred = Number(row.group?.match(/([0-9]+)\s*차/)?.[1]);
    return Number.isInteger(inferred) && inferred >= 1 && inferred <= 999 ? inferred : 1;
}
