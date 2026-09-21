/**
 * 2026년 공휴일 마스터 데이터 (CONCOST 한국 본사 & 베트남 지사)
 * - 한국: 추석 황금연휴 (9/24 ~ 9/28, 5일간 전일 연속 빗금 유지 - 27일 일요일 포함)
 * - 베트남: 국경일 황금연휴 (9/1 ~ 9/4, 4일간 전일 연속 빗금 유지)
 */

export interface HolidayInfo {
  country: 'KR' | 'VN' | 'UK';
  name: string;
}

export const HOLIDAYS_2026: Record<string, HolidayInfo> = {
  // 9월 베트남 국경일 연휴 (9/1 ~ 9/4 전일 연속 빗금 - 중간 끊김 원천 차단)
  '2026-09-01': { country: 'VN', name: '베트남 국경일 연휴' },
  '2026-09-02': { country: 'VN', name: '베트남 독립기념일' },
  '2026-09-03': { country: 'VN', name: '베트남 국경일 연휴' },
  '2026-09-04': { country: 'VN', name: '베트남 국경일 연휴' },

  // 9월 한국 추석 대연휴 (9/24 ~ 9/28 5일간 전일 연속 붉은 빗금 유지)
  '2026-09-24': { country: 'KR', name: '추석 연휴' },
  '2026-09-25': { country: 'KR', name: '추석 당일' },
  '2026-09-26': { country: 'KR', name: '추석 연휴' },
  '2026-09-27': { country: 'KR', name: '추석 연휴(일)' }, // 일요일 포함하여 빗금 끊김 원천 방지
  '2026-09-28': { country: 'KR', name: '대체공휴일(추석)' },

  // 10월 공휴일
  '2026-10-03': { country: 'KR', name: '개천절' },
  '2026-10-05': { country: 'KR', name: '대체공휴일(개천절)' },
  '2026-10-09': { country: 'KR', name: '한글날' },
};
