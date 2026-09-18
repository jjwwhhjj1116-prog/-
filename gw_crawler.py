"""
CONCOST 사내 그룹웨어 수주소식 실시간 크롤러 (상세 스펙 크롤링 포함)
- 그룹웨어 URL: https://gw.con-cost.com:1205/
- 계정: .env (GW_USERNAME, GW_PASSWORD)
- 대상: 수주소식 게시판 (RoomNo=95)
- 주요 수집 필드:
  * 기본: 글번호, 제목, 발주처, 작성자, 작성일, 대상부서
  * 상세(BbsView): 연면적(area), 건물용도(usage), 동수(buildings), 층수(floors),
                   발주처 담당자(contacts), 특기사항(notes), 요청사항(request)
"""

import os
import re
import sys
import time
import json
import base64
import logging
import argparse
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import urllib3
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
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Referer": f"{GW_URL}/bbs/BbsMain"
        })
        self.is_logged_in: bool = False

    def login(self) -> bool:
        """사내 그룹웨어 세션 로그인"""
        try:
            logger.info("그룹웨어 세션 로그인 시도...")
            self.session.get(f"{GW_URL}/AlterServiceLogin/templates/template16/login4?PreUrl=&argSectionType=business", timeout=10)
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
            logger.error(f"로그인 실패: {res.status_code}")
            return False
        except Exception as e:
            logger.error(f"로그인 예외 발생: {e}")
            return False

    def fetch_detail(self, doc_no: int) -> Dict[str, Any]:
        """수주소식 상세 페이지(BbsView)에서 연면적 및 건축/견적 개요 파싱"""
        detail_data: Dict[str, Any] = {
            "area": "",
            "usage": "",
            "buildings": "",
            "floors": "",
            "contacts": [],
            "notes": "",
            "request": ""
        }
        try:
            csrf_obj = {"token": "", "RoomNo": "95", "DocNo": str(doc_no)}
            csrf_b64 = base64.b64encode(json.dumps(csrf_obj).encode("utf-8")).decode("utf-8")
            res = self.session.get(f"{GW_URL}/bbs/BbsView?AddBbs=0&csrf={csrf_b64}", timeout=10)
            if res.status_code != 200:
                return detail_data

            # UTF-8 디코딩
            text = res.content.decode("utf-8", errors="replace")

            # 테이블 행 파싱
            tables = re.findall(r'<table[^>]*>(.*?)</table>', text, re.S)
            all_rows: List[List[str]] = []
            for t in tables:
                if any(k in t for k in ["연면적", "건물용도", "프로젝트 개요", "발주처 담당자", "특기사항", "수주시 요청사항"]):
                    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)
                    for r in rows:
                        tds = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
                        clean = [re.sub(r'<[^>]+>', ' ', x).replace('&nbsp;', ' ').strip() for x in tds]
                        clean = [c for c in clean if c]
                        if clean:
                            all_rows.append(clean)

            contact_list: List[str] = []
            for i, row in enumerate(all_rows):
                # 1. 건물용도, 연면적, 동수
                if "건물용도" in row and "연면적" in row:
                    try:
                        u_idx = row.index("건물용도")
                        detail_data["usage"] = row[u_idx + 1].replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass
                    try:
                        a_idx = row.index("연면적")
                        detail_data["area"] = row[a_idx + 1].replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass
                    try:
                        b_idx = row.index("동수")
                        detail_data["buildings"] = row[b_idx + 1].replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass

                # 2. 층수
                if "층수" in row:
                    try:
                        f_idx = row.index("층수")
                        if f_idx + 1 < len(row):
                            detail_data["floors"] = row[f_idx + 1].replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass

                # 3. 발주처 담당자
                if any(k in row for k in ["발주처 담당자", "이름 / 직급"]):
                    clean_c = [c.replace("\r", "").replace("\n", " ").strip() for c in row if c not in ["이름 / 직급", "발주처 담당자", "부서", "일반전화", "휴대폰", "이메일", "담당", "전화번호"]]
                    c_str = " ".join([c for c in clean_c if len(c) > 1])
                    if c_str and c_str not in contact_list:
                        contact_list.append(c_str)

                # 4. 특기사항
                if "특기사항" in row and not detail_data["notes"]:
                    try:
                        n_idx = row.index("특기사항")
                        if n_idx + 1 < len(row):
                            detail_data["notes"] = row[n_idx + 1].replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass

                # 5. 수주시 요청사항 / 회의록
                if "수주시 요청사항" in row:
                    try:
                        r_idx = row.index("수주시 요청사항")
                        req_text = " ".join(row[r_idx + 1:])
                        if i + 1 < len(all_rows):
                            next_row = " ".join(all_rows[i + 1])
                            if "회의록" in next_row:
                                req_text += " | " + next_row
                        detail_data["request"] = req_text.replace("\r", "").replace("\n", " ").strip()
                    except Exception:
                        pass

            detail_data["contacts"] = contact_list
        except Exception as e:
            logger.warning(f"상세 파싱 오류 (DocNo={doc_no}): {e}")

        return detail_data

    def crawl_suju_list(self) -> List[Dict[str, Any]]:
        """수주소식 게시판 목록 크롤링 및 각 게시글 상세 파싱 연동"""
        if not self.is_logged_in and not self.login():
            logger.error("로그인 불가로 크롤링 중단")
            return []

        suju_url = f"{GW_URL}/bbs/bbslist?AddBbs=0&csrf=eyJ0b2tlbiI6IiIsIlJvb21ObyI6Ijk1In0="
        try:
            logger.info("수주소식 게시판 목록 조회 중...")
            res = self.session.get(suju_url, timeout=15)
            if res.status_code != 200:
                logger.error(f"수주소식 조회 실패: {res.status_code}")
                return []

            return self._parse_html(res.content.decode("utf-8", errors="replace"))
        except Exception as e:
            logger.error(f"수주소식 크롤링 오류: {e}")
            return []

    def _parse_html(self, html: str) -> List[Dict[str, Any]]:
        """HTML 테이블에서 수주 목록 추출 및 정규식 분석 + 세부내용 수집"""
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)
        items: List[Dict[str, Any]] = []

        for tr in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
            if len(tds) < 4:
                continue

            clean_tds = [re.sub(r'<[^>]+>', ' ', td).replace('&nbsp;', ' ').strip() for td in tds]
            no_str = clean_tds[0].strip()
            if not no_str.isdigit():
                continue

            doc_no = int(no_str)
            raw_title = clean_tds[2].strip() if len(clean_tds) > 2 else ""
            if not raw_title:
                continue

            author = clean_tds[3].strip() if len(clean_tds) > 3 else ""
            date_str = clean_tds[4].replace('&nbsp;', ' ').strip() if len(clean_tds) > 4 else ""

            # 정규식 분석
            code_m = re.search(r'^(\d{7})', raw_title)
            project_code = f"TK-{code_m.group(1)}" if code_m else f"TK-2026-{no_str.zfill(5)}"

            client_m = re.search(r'\[(.*?)\]', raw_title)
            client_name = client_m.group(1).strip() if client_m else "미지정 발주처"

            scope_m = re.search(r'\(([^)]*(?:마감|구조|토목|조경|오승균|견적)[^)]*)\)$', raw_title)
            scope_text = scope_m.group(1) if scope_m else "마감,구조"

            departments = []
            if "마감" in scope_text:
                departments.append("마감팀")
            if "구조" in scope_text:
                departments.append("구조팀")
            if "토목" in scope_text or "조경" in scope_text or "오승균" in scope_text:
                departments.append("토목&조경팀")
            if not departments:
                departments = ["마감팀"]

            clean_name = raw_title
            if code_m:
                clean_name = re.sub(r'^\d{7}\.?\s*', '', clean_name)
            if client_m:
                clean_name = clean_name.replace(f"[{client_name}]", "").strip()
            if scope_m:
                clean_name = re.sub(r'\([^)]*\)$', '', clean_name).strip()

            display_name = f"[{client_name}] {clean_name}" if client_name != "미지정 발주처" else clean_name

            try:
                base_date = datetime.datetime.strptime(date_str.split()[0], "%y.%m.%d")
            except Exception:
                base_date = datetime.datetime.now()

            start_date = base_date.strftime("%Y-%m-%d")
            end_date = (base_date + datetime.timedelta(days=35)).strftime("%Y-%m-%d")

            # 세부 스펙 크롤링
            logger.info(f"[{doc_no}] {project_code} 세부내용(연면적/스펙) 조회 중...")
            detail = self.fetch_detail(doc_no)
            time.sleep(0.05) # 서버 부하 방지용 미세 딜레이

            item = {
                "id": f"intake_{no_str}",
                "no": doc_no,
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
                "status": "접수완료",
                "isScheduled": False,
                # 세부 스펙 필드
                "area": detail.get("area", ""),
                "usage": detail.get("usage", ""),
                "buildings": detail.get("buildings", ""),
                "floors": detail.get("floors", ""),
                "contacts": detail.get("contacts", []),
                "notes": detail.get("notes", ""),
                "request": detail.get("request", "")
            }
            items.append(item)

        logger.info(f"총 {len(items)}건 수주소식 및 세부스펙 파싱 완료")
        return items

    def save_to_json(self, items: List[Dict[str, Any]]) -> None:
        """프론트엔드 React 컴포넌트가 직접 읽을 수 있는 JSON 저장"""
        OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        existing_map: Dict[str, Any] = {}
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


def main() -> None:
    parser = argparse.ArgumentParser(description="CONCOST 그룹웨어 수주소식 크롤러")
    parser.add_argument("--once", action="store_true", default=True, help="1회 즉시 실행 후 종료")
    args = parser.parse_args()

    crawler = GroupwareSujuCrawler()
    items = crawler.crawl_suju_list()
    if items:
        crawler.save_to_json(items)
        print(f"완료! 총 {len(items)}건 저장됨. 예시(첫번째):")
        print(json.dumps(items[0], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
