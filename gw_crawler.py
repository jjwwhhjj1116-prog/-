"""
CONCOST 사내 그룹웨어 수주소식 실시간 크롤러
- 그룹웨어 URL: https://gw.con-cost.com:1205/
- 계정: .env (GW_USERNAME, GW_PASSWORD)
- 대상: 수주소식 게시판 (RoomNo=95)
- 기능:
  1. 단발성 크롤링 (--once)
  2. 스케줄러 데몬 (--daemon): 평일 09:00 ~ 17:00 매시 정각 자동 크롤링
  3. 지능형 공종 파싱: (마감, 구조, 토목, 조경, 오승균 등)
  4. 웹 앱 연동용 JSON (scheduler-web/src/data/intakeProjects.json) 자동 갱신
"""

import os
import re
import sys
import time
import json
import logging
import argparse
import datetime
import urllib3
from pathlib import Path
from typing import List, Dict, Any, Optional
import requests
from dotenv import load_dotenv

# SSL 경고 억제
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("GWCrawler")

# 환경변수 로드
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

GW_URL = os.getenv("GW_URL", "https://gw.con-cost.com:1205")
GW_USER = os.getenv("GW_USERNAME", "yjw@con-cost.com")
GW_PW = os.getenv("GW_PASSWORD", "dbwhddnr1!")
OUTPUT_JSON = BASE_DIR / "scheduler-web" / "src" / "data" / "intakeProjects.json"

class GroupwareSujuCrawler:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Referer": f"{GW_URL}/bbs/BbsMain"
        })
        self.is_logged_in = False

    def login(self) -> bool:
        """사내 그룹웨어 세션 로그인"""
        try:
            logger.info("그룹웨어 세션 로그인 시도...")
            # 1. 초기 세션 쿠키 획득
            self.session.get(f"{GW_URL}/AlterServiceLogin/templates/template16/login4?PreUrl=&argSectionType=business", timeout=10)
            
            # 2. LoginOK 인증 POST
            payload = {
                "CorpID": "con-cost.com",
                "CorpCheck": "N",
                "UserID": GW_USER,
                "UserPass": GW_PW,
                "UserOTP": ""
            }
            res = self.session.post(f"{GW_URL}/LoginOK", data=payload, timeout=10)
            if res.status_code == 200 and "parent.location.href" in res.text:
                logger.info("그룹웨어 로그인 성공!")
                self.is_logged_in = True
                return True
            else:
                logger.error(f"로그인 실패: {res.status_code}")
                return False
        except Exception as e:
            logger.error(f"로그인 예외 발생: {e}")
            return False

    def crawl_suju_list(self) -> List[Dict[str, Any]]:
        """수주소식 게시판(RoomNo=95) 목록 크롤링 및 메타데이터 파싱"""
        if not self.is_logged_in and not self.login():
            logger.error("로그인 불가로 크롤링 중단")
            return []

        suju_url = f"{GW_URL}/bbs/bbslist?AddBbs=0&csrf=eyJ0b2tlbiI6IiIsIlJvb21ObyI6Ijk1In0="
        try:
            logger.info("수주소식 게시판 데이터 수집 중...")
            res = self.session.get(suju_url, timeout=15)
            if res.status_code != 200:
                logger.error(f"수주소식 조회 실패: {res.status_code}")
                return []

            return self._parse_html(res.text)
        except Exception as e:
            logger.error(f"수주소식 크롤링 오류: {e}")
            return []

    def _parse_html(self, html: str) -> List[Dict[str, Any]]:
        """HTML 테이블에서 수주 목록 추출 및 정규식 분석"""
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)
        items: List[Dict[str, Any]] = []

        for tr in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            if len(tds) < 4:
                continue

            clean_tds = [re.sub(r'<[^>]+>', ' ', td).replace('&nbsp;', ' ').strip() for td in tds]
            # 글번호 (tds[0])
            no_str = clean_tds[0].strip()
            if not no_str.isdigit():
                continue

            # 제목 추출 (tds[2])
            raw_title = clean_tds[2].strip() if len(clean_tds) > 2 else ""
            if not raw_title:
                continue

            # 작성자 (tds[3]), 작성일 (tds[4])
            author = clean_tds[3].strip() if len(clean_tds) > 3 else ""
            date_str = clean_tds[4].replace('&nbsp;', ' ').strip() if len(clean_tds) > 4 else ""
            
            # 정규식 분석: 예: "2026087.[(주)삼성물산]P5 FAB2 신축공사 견적용역(마감,구조)"
            # 1) 코드 (2026xxx)
            code_m = re.search(r'^(\d{7})', raw_title)
            project_code = f"TK-{code_m.group(1)}" if code_m else f"TK-2026-{no_str.zfill(5)}"
            
            # 2) 발주처 ([...])
            client_m = re.search(r'\[(.*?)\]', raw_title)
            client_name = client_m.group(1).strip() if client_m else "미지정 발주처"
            
            # 3) 대상 공종 괄호 ((마감, 구조...))
            scope_m = re.search(r'\(([^)]*(?:마감|구조|토목|조경|오승균|견적)[^)]*)\)$', raw_title)
            scope_text = scope_m.group(1) if scope_m else "마감,구조"
            
            # 타깃 부서 판별
            departments = []
            if "마감" in scope_text:
                departments.append("마감팀")
            if "구조" in scope_text:
                departments.append("구조팀")
            if "토목" in scope_text or "조경" in scope_text or "오승균" in scope_text:
                departments.append("토목&조경팀")
            if not departments:
                departments = ["마감팀"]

            # 프로젝트명 클렌징
            clean_name = raw_title
            if code_m:
                clean_name = re.sub(r'^\d{7}\.?\s*', '', clean_name)
            if client_m:
                clean_name = clean_name.replace(f"[{client_name}]", "").strip()
            if scope_m:
                clean_name = re.sub(r'\([^)]*\)$', '', clean_name).strip()

            display_name = f"[{client_name}] {clean_name}" if client_name != "미지정 발주처" else clean_name

            # 기본 일정 산정 (접수일 기준 1개월~1.5개월)
            try:
                base_date = datetime.datetime.strptime(date_str.split()[0], "%y.%m.%d")
            except Exception:
                base_date = datetime.datetime.now()

            start_date = base_date.strftime("%Y-%m-%d")
            end_date = (base_date + datetime.timedelta(days=35)).strftime("%Y-%m-%d")

            item = {
                "id": f"intake_{no_str}",
                "no": int(no_str),
                "code": project_code,
                "client": client_name,
                "name": display_name,
                "rawTitle": raw_title,
                "author": author,
                "receivedDate": base_date.strftime("%Y-%m-%d"),
                "startDate": start_date,
                "endDate": end_date,
                "scopeText": scope_text,
                "targetDepartments": departments,
                "status": "접수완료", # 접수완료 -> 일정표 등록
                "isScheduled": False
            }
            items.append(item)

        logger.info(f"총 {len(items)}건 수주소식 파싱 완료")
        return items

    def save_to_json(self, items: List[Dict[str, Any]]) -> None:
        """프론트엔드 React 컴포넌트가 직접 읽을 수 있는 JSON 저장"""
        OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        
        # 기존 저장 데이터가 있다면 스케줄 등록 여부 유지
        existing_map = {}
        if OUTPUT_JSON.exists():
            try:
                with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                    old_items = json.load(f)
                    for oi in old_items:
                        existing_map[oi["id"]] = oi
            except Exception:
                pass

        for item in items:
            if item["id"] in existing_map:
                item["isScheduled"] = existing_map[item["id"]].get("isScheduled", False)
                if item["isScheduled"]:
                    item["status"] = "일정등록완료"

        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        logger.info(f"성공적으로 JSON 파일 저장 완료: {OUTPUT_JSON}")

    def run_daemon(self):
        """오전 9시 ~ 오후 5시 1시간 간격 자동 크롤링 데몬"""
        logger.info("=== 수주소식 자동 크롤러 데몬 모드 가동 시작 ===")
        logger.info("크롤링 조건: 평일(월~금) 09:00 ~ 17:00, 1시간 주기")
        
        while True:
            now = datetime.datetime.now()
            # 0=월요일, 4=금요일
            is_weekday = now.weekday() < 5
            is_work_hour = 9 <= now.hour <= 17

            if is_weekday and is_work_hour:
                logger.info(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] 정기 크롤링 수행")
                items = self.crawl_suju_list()
                if items:
                    self.save_to_json(items)
            else:
                logger.info(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] 업무 시간 외 대기 (평일 09~17시 동작)")

            # 다음 1시간 대기 (또는 10분 주기 체크)
            time.sleep(3600)

def main():
    parser = argparse.ArgumentParser(description="CONCOST 그룹웨어 수주소식 크롤러")
    parser.add_argument("--once", action="store_true", help="1회 즉시 실행 후 종료")
    parser.add_argument("--daemon", action="store_true", help="스케줄러 데몬 모드로 상시 구동")
    args = parser.parse_args()

    crawler = GroupwareSujuCrawler()

    if args.daemon:
        # 데몬 모드 실행 전 최초 1회 크롤링
        items = crawler.crawl_suju_list()
        if items:
            crawler.save_to_json(items)
        crawler.run_daemon()
    else:
        # 기본 1회 실행
        items = crawler.crawl_suju_list()
        if items:
            crawler.save_to_json(items)

if __name__ == "__main__":
    main()
