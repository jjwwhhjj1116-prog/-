/**
 * 2026년 공휴일 마스터 데이터 (CONCOST 한국 본사 & 베트남 지사)
 * - 한국: 추석 황금연휴 (9/24 ~ 9/27, 4일간 전일 연속 빗금 유지 - 27일 일요일 포함)
 * - 베트남: 국경일 황금연휴 (9/1 ~ 9/4, 4일간 전일 연속 빗금 유지)
 */

export interface HolidayInfo {
  country: 'KR' | 'VN' | 'UK';
  name: string;
}

// 한국 기준 출처: 우주항공청 2026 월력요항 (2025-06-30), 2027 월력요항 발표 (2026-06-29)
// https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=BBSMSTR_000000000010&nttId=B000000001860Pe2zT3
// https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
export const HOLIDAYS_2026: Record<string, HolidayInfo> = {
  '2026-01-01': {country: 'KR', name: '신정'},
  '2026-02-16': {country: 'KR', name: '설날 연휴'},
  '2026-02-17': {country: 'KR', name: '설날'},
  '2026-02-18': {country: 'KR', name: '설날 연휴'},
  '2026-03-01': {country: 'KR', name: '삼일절'},
  '2026-03-02': {country: 'KR', name: '삼일절 대체공휴일'},
  '2026-05-01': {country: 'KR', name: '노동절'},
  '2026-05-05': {country: 'KR', name: '어린이날'},
  '2026-05-24': {country: 'KR', name: '부처님오신날'},
  '2026-05-25': {country: 'KR', name: '부처님오신날 대체공휴일'},
  '2026-06-03': {country: 'KR', name: '지방선거'},
  '2026-06-06': {country: 'KR', name: '현충일'},
  '2026-07-17': {country: 'KR', name: '제헌절'},
  '2026-08-15': {country: 'KR', name: '광복절'},
  '2026-08-17': {country: 'KR', name: '광복절 대체공휴일'},
  '2026-12-25': {country: 'KR', name: '기독탄신일'},
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
  // 9/28은 월력요항상 공휴일이 아님. 회사 휴무는 별도 확정 필요.

  // 10월 공휴일
  '2026-10-03': { country: 'KR', name: '개천절' },
  '2026-10-05': { country: 'KR', name: '대체공휴일(개천절)' },
  '2026-10-09': { country: 'KR', name: '한글날' },
};

export const HOLIDAYS_2027: Record<string, HolidayInfo> = {
  '2027-01-01': {country: 'KR', name: '신정'},
  '2027-02-06': {country: 'KR', name: '설날 연휴'},
  '2027-02-07': {country: 'KR', name: '설날'},
  '2027-02-08': {country: 'KR', name: '설날 연휴'},
  '2027-02-09': {country: 'KR', name: '설날 대체공휴일'},
  '2027-03-01': {country: 'KR', name: '삼일절'},
  '2027-05-01': {country: 'KR', name: '노동절'},
  '2027-05-03': {country: 'KR', name: '노동절 대체공휴일'},
  '2027-05-05': {country: 'KR', name: '어린이날'},
  '2027-05-13': {country: 'KR', name: '부처님오신날'},
  '2027-06-06': {country: 'KR', name: '현충일'},
  '2027-07-17': {country: 'KR', name: '제헌절'},
  '2027-07-19': {country: 'KR', name: '제헌절 대체공휴일'},
  '2027-08-15': {country: 'KR', name: '광복절'},
  '2027-08-16': {country: 'KR', name: '광복절 대체공휴일'},
  '2027-09-14': {country: 'KR', name: '추석 연휴'},
  '2027-09-15': {country: 'KR', name: '추석'},
  '2027-09-16': {country: 'KR', name: '추석 연휴'},
  '2027-10-03': {country: 'KR', name: '개천절'},
  '2027-10-04': {country: 'KR', name: '개천절 대체공휴일'},
  '2027-10-09': {country: 'KR', name: '한글날'},
  '2027-10-11': {country: 'KR', name: '한글날 대체공휴일'},
  '2027-12-25': {country: 'KR', name: '기독탄신일'},
  '2027-12-27': {country: 'KR', name: '기독탄신일 대체공휴일'},
};

export const HOLIDAYS: Record<string, HolidayInfo> = {...HOLIDAYS_2026, ...HOLIDAYS_2027};
export const HOLIDAY_YEARS = new Set(['2026', '2027']);
