r"""픽셀 에이전트 오피스 로컬 서버 및 실시간 상태 관리 백엔드.

Python 3.11+ 표준 라이브러리(http.server, json, pathlib, dataclasses)만을 사용합니다.
- 정적 웹 대시보드(index.html, app.js, style.css) 서빙
- 에이전트 상태 조회 (/api/status)
- 외부 CLI/스크립트의 작업 상태 업데이트 이벤트 수신 (/api/event)
- 글로벌 에이전트 페르소나 메타데이터 조회 (/api/agents)
"""

from dataclasses import asdict, dataclass
import http.server
import json
from pathlib import Path
import socketserver
import sys
from typing import Any

PORT: int = 8765
BASE_DIR: Path = Path(__file__).resolve().parent
GLOBAL_AGENTS_DIR: Path = Path(r"C:\Users\user-owner\.gemini\config\agents")


@dataclass
class AgentState:
    """에이전트 런타임 상태 정의."""

    id: str
    name: str
    role: str
    status: str  # IDLE, THINKING, CODING, TESTING, REVIEWING, DEPLOYING, COFFEE
    current_task: str
    desk_x: int
    desk_y: int
    color: str


# 기본 등록 에이전트 8종 초기 상태
DEFAULT_AGENTS: dict[str, AgentState] = {
    "system-architect": AgentState(
        id="system-architect",
        name="Archie",
        role="System Architect",
        status="IDLE",
        current_task="대기 중 - 새 아키텍처 설계 준비",
        desk_x=120,
        desk_y=160,
        color="#818cf8",
    ),
    "tdd-developer": AgentState(
        id="tdd-developer",
        name="Devin",
        role="TDD Developer",
        status="CODING",
        current_task="테스트 코드 작성 및 컴포넌트 구현",
        desk_x=280,
        desk_y=160,
        color="#34d399",
    ),
    "bug-hunter": AgentState(
        id="bug-hunter",
        name="Hunter",
        role="Bug Hunter",
        status="IDLE",
        current_task="대기 중 - 에러 로그 감시",
        desk_x=440,
        desk_y=160,
        color="#f87171",
    ),
    "code-reviewer": AgentState(
        id="code-reviewer",
        name="Reviewer",
        role="Code Reviewer",
        status="REVIEWING",
        current_task="PR 변경 사항 5축 품질 검토 중",
        desk_x=600,
        desk_y=160,
        color="#fbbf24",
    ),
    "security-auditor": AgentState(
        id="security-auditor",
        name="Sentinel",
        role="Security Auditor",
        status="IDLE",
        current_task="보안 스캐닝 대기 중",
        desk_x=120,
        desk_y=340,
        color="#a78bfa",
    ),
    "test-engineer": AgentState(
        id="test-engineer",
        name="Tester",
        role="Test Engineer",
        status="TESTING",
        current_task="통합 E2E 브라우저 테스트 구동",
        desk_x=280,
        desk_y=340,
        color="#38bdf8",
    ),
    "web-performance-auditor": AgentState(
        id="web-performance-auditor",
        name="Flash",
        role="Web Perf Auditor",
        status="IDLE",
        current_task="Core Web Vitals 모니터링",
        desk_x=440,
        desk_y=340,
        color="#fb923c",
    ),
    "devops-engineer": AgentState(
        id="devops-engineer",
        name="Atlas",
        role="DevOps Engineer",
        status="IDLE",
        current_task="CI/CD 파이프라인 대기 중",
        desk_x=600,
        desk_y=340,
        color="#ec4899",
    ),
}

EVENT_LOGS: list[dict[str, Any]] = [
    {"time": "09:00", "agent": "system-architect", "text": "오피스 가동 시작. 글로벌 스킬 장착 완료."}
]


class PixelOfficeRequestHandler(http.server.SimpleHTTPRequestHandler):
    """픽셀 오피스 커스텀 HTTP 요청 핸들러."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self) -> None:
        """GET 요청 라우팅."""
        if self.path == "/api/status":
            self._send_json(
                {
                    "agents": {k: asdict(v) for k, v in DEFAULT_AGENTS.items()},
                    "logs": EVENT_LOGS[-30:],
                }
            )
            return

        if self.path == "/api/agents":
            agents_info = []
            if GLOBAL_AGENTS_DIR.exists():
                for md in sorted(GLOBAL_AGENTS_DIR.glob("*.md")):
                    agents_info.append({"id": md.stem, "path": str(md)})
            self._send_json({"global_agents": agents_info})
            return

        super().do_GET()

    def do_POST(self) -> None:
        """POST 이벤트 수신 라우팅."""
        if self.path == "/api/event":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")

            try:
                data = json.loads(body)
                agent_id = data.get("agent_id")
                new_status = data.get("status")
                task = data.get("task", "")

                if agent_id in DEFAULT_AGENTS:
                    if new_status:
                        DEFAULT_AGENTS[agent_id].status = new_status
                    if task:
                        DEFAULT_AGENTS[agent_id].current_task = task

                    log_entry = {
                        "time": data.get("time", "NOW"),
                        "agent": agent_id,
                        "text": f"[{new_status or 'UPDATE'}] {task or DEFAULT_AGENTS[agent_id].current_task}",
                    }
                    EVENT_LOGS.append(log_entry)

                self._send_json({"success": True, "agent": asdict(DEFAULT_AGENTS.get(agent_id, DEFAULT_AGENTS["tdd-developer"]))})
            except Exception as e:
                self._send_json({"error": str(e)}, status=400)
            return

        self.send_error(404, "Endpoint not found")

    def _send_json(self, data: dict[str, Any], status: int = 200) -> None:
        """JSON 형식의 응답을 전송합니다."""
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response_bytes)


def run_server() -> None:
    """픽셀 오피스 서버를 구동합니다."""
    # 포트 재사용 허용
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), PixelOfficeRequestHandler) as httpd:
        print(f"============================================================")
        print(f"[PIXEL AGENT OFFICE] 가동 시작!")
        print(f"- 브라우저 접속 주소 : http://localhost:{PORT}")
        print(f"- 실시간 API 엔드포인트: http://localhost:{PORT}/api/status")
        print(f"============================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")


if __name__ == "__main__":
    run_server()
