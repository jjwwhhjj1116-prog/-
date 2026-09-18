/**
 * Pixel Agent Office Engine
 * 2D Canvas Procedural Pixel Art & Multi-Agent Simulator
 */

// 오피스 캔버스 설정
const canvas = document.getElementById('office-canvas');
const ctx = canvas.getContext('2d');

// 오디오 신시사이저 (8비트 사운드)
let soundEnabled = true;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(freq, type = 'square', duration = 0.08) {
  if (!soundEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // 오디오 컨텍스트 자동재생 정책 대응
  }
}

function playSuccessChime() {
  if (!soundEnabled) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    setTimeout(() => playBeep(f, 'triangle', 0.12), i * 90);
  });
}

// 오피스 가구 및 앵커 포인트 정의
const OFFICE_FURNITURE = {
  desks: [
    { x: 120, y: 150, label: "ARCHITECT" },
    { x: 280, y: 150, label: "TDD CODER" },
    { x: 440, y: 150, label: "BUG HUNTER" },
    { x: 600, y: 150, label: "REVIEWER" },
    { x: 120, y: 330, label: "SECURITY" },
    { x: 280, y: 330, label: "TEST LAB" },
    { x: 440, y: 330, label: "WEB PERF" },
    { x: 600, y: 330, label: "DEVOPS" }
  ],
  coffeeMachine: { x: 50, y: 240 },
  meetingTable: { x: 380, y: 240 },
  serverRack: { x: 740, y: 240 }
};

// 8인 에이전트 캐릭터 상태 정의
const AGENTS = [
  {
    id: "system-architect",
    name: "Archie",
    role: "System Architect",
    skills: "spec-driven, api-design, task-breakdown",
    x: 120, y: 140,
    targetX: 120, targetY: 140,
    deskX: 120, deskY: 140,
    color: "#818cf8",
    hairColor: "#3b82f6",
    status: "THINKING",
    task: "프로젝트 기능 명세서(Spec) 및 데이터 모델 설계 중",
    bubble: "📝",
    animFrame: 0
  },
  {
    id: "tdd-developer",
    name: "Devin",
    role: "TDD Developer",
    skills: "test-driven, incremental-impl, source-driven",
    x: 280, y: 140,
    targetX: 280, targetY: 140,
    deskX: 280, deskY: 140,
    color: "#34d399",
    hairColor: "#10b981",
    status: "CODING",
    task: "Red-Green-Refactor 루프로 신규 모달 컴포넌트 구현",
    bubble: "💻",
    animFrame: 0
  },
  {
    id: "bug-hunter",
    name: "Hunter",
    role: "Bug Hunter",
    skills: "debugging-and-error-recovery, observability",
    x: 440, y: 140,
    targetX: 440, targetY: 140,
    deskX: 440, deskY: 140,
    color: "#f87171",
    hairColor: "#ef4444",
    status: "IDLE",
    task: "시스템 예외 및 런타임 콜스택 감시 대기 중",
    bubble: "🔍",
    animFrame: 0
  },
  {
    id: "code-reviewer",
    name: "Reviewer",
    role: "Code Reviewer",
    skills: "code-review-and-quality, code-simplification",
    x: 600, y: 140,
    targetX: 600, targetY: 140,
    deskX: 600, deskY: 140,
    color: "#fbbf24",
    hairColor: "#f59e0b",
    status: "REVIEWING",
    task: "5축(가독성/보안/성능/아키텍처/테스트) 심층 코드 검토",
    bubble: "🧐",
    animFrame: 0
  },
  {
    id: "security-auditor",
    name: "Sentinel",
    role: "Security Auditor",
    skills: "security-and-hardening",
    x: 120, y: 320,
    targetX: 120, targetY: 320,
    deskX: 120, deskY: 320,
    color: "#a78bfa",
    hairColor: "#8b5cf6",
    status: "AUDITING",
    task: "OWASP Top 10 점검 및 시크릿 키 누출 감사",
    bubble: "🛡️",
    animFrame: 0
  },
  {
    id: "test-engineer",
    name: "Tester",
    role: "Test Engineer",
    skills: "browser-testing, e2e-automation",
    x: 280, y: 320,
    targetX: 280, targetY: 320,
    deskX: 280, deskY: 320,
    color: "#38bdf8",
    hairColor: "#0284c7",
    status: "TESTING",
    task: "Chrome DevTools MCP 연동 실시간 브라우저 렌더 검증",
    bubble: "🧪",
    animFrame: 0
  },
  {
    id: "web-performance-auditor",
    name: "Flash",
    role: "Web Perf Auditor",
    skills: "performance-optimization",
    x: 440, y: 320,
    targetX: 440, targetY: 320,
    deskX: 440, deskY: 320,
    color: "#fb923c",
    hairColor: "#ea580c",
    status: "IDLE",
    task: "Core Web Vitals 및 React 리렌더링 최적화 대기",
    bubble: "⚡",
    animFrame: 0
  },
  {
    id: "devops-engineer",
    name: "Atlas",
    role: "DevOps Engineer",
    skills: "ci-cd-and-automation, shipping-and-launch",
    x: 600, y: 320,
    targetX: 600, targetY: 320,
    deskX: 600, deskY: 320,
    color: "#ec4899",
    hairColor: "#db2777",
    status: "DEPLOYING",
    task: "CI 파이프라인 자동 빌드 및 배포 사전 점검 완료",
    bubble: "🚀",
    animFrame: 0
  }
];

// 자동 시뮬레이션 상태
let autoSimEnabled = true;
let simCycle = 0;
let selectedAgent = null;

// ==========================================
// 렌더링 엔진 (Canvas 2D)
// ==========================================

function drawOffice() {
  // 1. 바닥 타일
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 체커보드 패턴
  ctx.fillStyle = "#172033";
  const tileSize = 40;
  for (let x = 0; x < canvas.width; x += tileSize) {
    for (let y = 0; y < canvas.height; y += tileSize) {
      if ((x / tileSize + y / tileSize) % 2 === 0) {
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // 벽면 상단
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, 40);
  ctx.fillStyle = "#334155";
  ctx.fillRect(0, 38, canvas.width, 2);

  // 창문
  ctx.fillStyle = "#0284c7";
  ctx.fillRect(200, 8, 80, 24);
  ctx.fillRect(520, 8, 80, 24);
  ctx.fillStyle = "#bae6fd";
  ctx.fillRect(204, 12, 34, 16);
  ctx.fillRect(242, 12, 34, 16);
  ctx.fillRect(524, 12, 34, 16);
  ctx.fillRect(562, 12, 34, 16);

  // 벽시계
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(400, 20, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.stroke();

  // 2. 가구 렌더링
  drawFurniture();
}

function drawFurniture() {
  // 책상 8개
  OFFICE_FURNITURE.desks.forEach((desk, idx) => {
    // 그림자
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(desk.x - 32, desk.y + 16, 64, 8);

    // 책상 테이블
    ctx.fillStyle = "#475569";
    ctx.fillRect(desk.x - 30, desk.y, 60, 24);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(desk.x - 30, desk.y, 60, 4);

    // 듀얼 모니터
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(desk.x - 24, desk.y - 14, 20, 14);
    ctx.fillRect(desk.x + 4, desk.y - 14, 20, 14);

    // 모니터 화면 빛
    const agent = AGENTS[idx];
    const isWorking = agent && agent.status !== "IDLE" && agent.status !== "COFFEE";
    ctx.fillStyle = isWorking ? (agent ? agent.color : "#38bdf8") : "#1e293b";
    ctx.fillRect(desk.x - 22, desk.y - 12, 16, 10);
    ctx.fillRect(desk.x + 6, desk.y - 12, 16, 10);

    // 키보드 & 마우스
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(desk.x - 12, desk.y + 4, 16, 6);
    ctx.fillRect(desk.x + 8, desk.y + 5, 4, 4);

    // 책상 이름 태그
    ctx.fillStyle = "#94a3b8";
    ctx.font = "8px 'Pretendard', monospace";
    ctx.textAlign = "center";
    ctx.fillText(desk.label, desk.x, desk.y + 34);
  });

  // 커피 머신 휴게존
  const cm = OFFICE_FURNITURE.coffeeMachine;
  ctx.fillStyle = "#7c2d12";
  ctx.fillRect(cm.x - 20, cm.y - 10, 40, 30);
  ctx.fillStyle = "#b45309";
  ctx.fillRect(cm.x - 16, cm.y - 8, 32, 8);
  ctx.fillStyle = "#fef08a"; // 커피머신 디스플레이
  ctx.fillRect(cm.x - 6, cm.y + 4, 12, 8);
  ctx.fillStyle = "#f97316";
  ctx.font = "9px monospace";
  ctx.fillText("☕ COFFEE", cm.x, cm.y + 32);

  // 중앙 회의 라운드 테이블
  const mt = OFFICE_FURNITURE.meetingTable;
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(mt.x, mt.y, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.arc(mt.x, mt.y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#38bdf8";
  ctx.font = "8px 'Press Start 2P'";
  ctx.fillText("HQ", mt.x, mt.y + 3);

  // 서버 랙 (LED 깜빡임)
  const sr = OFFICE_FURNITURE.serverRack;
  ctx.fillStyle = "#090d16";
  ctx.fillRect(sr.x - 18, sr.y - 30, 36, 60);
  ctx.strokeStyle = "#334155";
  ctx.strokeRect(sr.x - 18, sr.y - 30, 36, 60);
  // 서버 슬롯 및 깜빡이는 LED
  for (let i = 0; i < 5; i++) {
    const yOff = sr.y - 24 + i * 11;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(sr.x - 14, yOff, 28, 8);
    // LED
    const ledColor = (Math.floor(Date.now() / 300) + i) % 2 === 0 ? "#22c55e" : "#38bdf8";
    ctx.fillStyle = ledColor;
    ctx.fillRect(sr.x - 10, yOff + 2, 4, 4);
    ctx.fillStyle = (Math.floor(Date.now() / 400) + i) % 3 === 0 ? "#ef4444" : "#eab308";
    ctx.fillRect(sr.x - 4, yOff + 2, 4, 4);
  }
}

function drawAgents() {
  AGENTS.forEach((agent) => {
    // 1. 이동 보간 (Lerp)
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const dist = Math.hypot(dx, dy);

    const isMoving = dist > 2;
    if (isMoving) {
      agent.x += (dx / dist) * 2.2;
      agent.y += (dy / dist) * 2.2;
      agent.animFrame = (agent.animFrame + 0.2) % 4;
    } else {
      agent.x = agent.targetX;
      agent.y = agent.targetY;
      agent.animFrame = 0;
    }

    const px = Math.round(agent.x);
    const py = Math.round(agent.y);

    // 2. 그림자
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(px, py + 14, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. 픽셀 캐릭터 몸체 (16x24 픽셀 도트 스타일)
    // 다리 / 걸음 모션
    const legOffset = isMoving ? Math.sin(agent.animFrame * Math.PI) * 3 : 0;
    ctx.fillStyle = "#1e293b"; // 바지
    ctx.fillRect(px - 5, py + 6 + legOffset, 4, 7);
    ctx.fillRect(px + 1, py + 6 - legOffset, 4, 7);

    // 몸통 (옷)
    ctx.fillStyle = agent.color;
    ctx.fillRect(px - 7, py - 4, 14, 11);

    // 타이핑 중일 때 손 흔들림
    if (agent.status === "CODING" && !isMoving) {
      const typeHand = (Math.floor(Date.now() / 150) % 2) * 2;
      ctx.fillStyle = "#fed7aa"; // 손
      ctx.fillRect(px - 9, py + 2 - typeHand, 3, 3);
      ctx.fillRect(px + 6, py + 2 + typeHand, 3, 3);
    }

    // 머리 / 얼굴
    ctx.fillStyle = "#fed7aa"; // 피부
    ctx.fillRect(px - 6, py - 14, 12, 10);

    // 머리카락
    ctx.fillStyle = agent.hairColor;
    ctx.fillRect(px - 7, py - 17, 14, 5);
    ctx.fillRect(px - 7, py - 15, 3, 6);

    // 눈 (깜빡임 효과)
    const blink = Math.floor(Date.now() / 2500) % 10 === 0;
    ctx.fillStyle = blink ? "#fed7aa" : "#0f172a";
    ctx.fillRect(px - 4, py - 10, 2, 2);
    ctx.fillRect(px + 2, py - 10, 2, 2);

    // 4. 머리 위 말풍선 & 상태 뱃지
    drawSpeechBubble(agent, px, py - 24);

    // 5. 이름 라벨
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 9px 'Pretendard', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(agent.name, px, py + 24);
  });
}

function drawSpeechBubble(agent, x, y) {
  // 말풍선 배경
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(x - 12, y - 8, 24, 16, 4);
  ctx.fill();
  ctx.stroke();

  // 꼬리
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 8);
  ctx.lineTo(x, y + 11);
  ctx.lineTo(x + 2, y + 8);
  ctx.fill();

  // 이모지 / 아이콘
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(agent.bubble, x, y);
}

// ==========================================
// 메인 애니메이션 루프
// ==========================================

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawOffice();
  drawAgents();
  requestAnimationFrame(gameLoop);
}

// ==========================================
// 오토 시뮬레이션 로직 (개발 스프린트 루프)
// ==========================================

const SIM_STEPS = [
  {
    agent: "system-architect",
    status: "THINKING",
    bubble: "📝",
    task: "요구사항 분석 및 Spec-Driven 문서 작성",
    move: null,
    log: "Archie: 새로운 피처 명세서(Spec) 작성을 시작합니다."
  },
  {
    agent: "system-architect",
    status: "WALKING",
    bubble: "🚶",
    task: "TDD 개발자 자리로 이동하여 Spec 전달",
    move: { x: 250, y: 150 },
    log: "Archie -> Devin에게 구현 명세서를 인계합니다."
  },
  {
    agent: "tdd-developer",
    status: "CODING",
    bubble: "⌨️",
    task: "실패하는 테스트(Red) 작성 후 통과 코드 작성",
    move: { x: 280, y: 140 },
    log: "Devin: TDD 루프 가동! 단위 테스트 통과 중."
  },
  {
    agent: "test-engineer",
    status: "TESTING",
    bubble: "🧪",
    task: "통합 브라우저 렌더링 및 엣지 케이스 검증",
    move: { x: 280, y: 320 },
    log: "Tester: E2E 테스트 12종 전원 통과 확인 (Green)."
  },
  {
    agent: "code-reviewer",
    status: "REVIEWING",
    bubble: "🔍",
    task: "PR 코드 리뷰 및 불필요한 복잡도 제거 제안",
    move: { x: 600, y: 140 },
    log: "Reviewer: 5축 코드리뷰 승인 완료 (LGTM)."
  },
  {
    agent: "security-auditor",
    status: "AUDITING",
    bubble: "🛡️",
    task: "OWASP Top 10 보안 감사 및 취약점 0건 확인",
    move: { x: 120, y: 320 },
    log: "Sentinel: 보안 스캔 완료. 위험 요소 없음."
  },
  {
    agent: "devops-engineer",
    status: "DEPLOYING",
    bubble: "🚀",
    task: "서버 랙으로 이동하여 프로덕션 배포 파이프라인 트리거",
    move: { x: 700, y: 240 },
    log: "Atlas: 프로덕션 배포 성공! 무중단 서비스 갱신."
  },
  {
    agent: "tdd-developer",
    status: "COFFEE",
    bubble: "☕",
    task: "스프린트 성공 기념 커피 머신에서 휴식",
    move: { x: 80, y: 240 },
    log: "Devin: 커피 한 잔 마시며 다음 스프린트 준비."
  }
];

function runSimStep() {
  if (!autoSimEnabled) return;

  const step = SIM_STEPS[simCycle % SIM_STEPS.length];
  const target = AGENTS.find(a => a.id === step.agent);

  if (target) {
    target.status = step.status;
    target.bubble = step.bubble;
    target.task = step.task;

    if (step.move) {
      target.targetX = step.move.x;
      target.targetY = step.move.y;
    } else {
      target.targetX = target.deskX;
      target.targetY = target.deskY;
    }

    addTerminalLog(step.log);
    playBeep(440 + (simCycle % 4) * 110, 'sine', 0.05);

    if (step.status === "DEPLOYING") {
      playSuccessChime();
    }
  }

  updateSquadUI();
  simCycle++;
}

setInterval(runSimStep, 3500);

// ==========================================
// UI 제어 및 이벤트 핸들러
// ==========================================

function updateSquadUI() {
  const container = document.getElementById('agent-cards-container');
  if (!container) return;

  container.innerHTML = AGENTS.map(agent => `
    <div class="agent-card" onclick="openAgentModal('${agent.id}')">
      <div class="card-avatar" style="border-color: ${agent.color}">${agent.bubble}</div>
      <div class="card-details">
        <div class="card-header-row">
          <span class="card-name">${agent.name}</span>
          <span class="status-badge status-${agent.status}">${agent.status}</span>
        </div>
        <div class="card-task">${agent.task}</div>
      </div>
    </div>
  `).join('');
}

function addTerminalLog(message, type = "") {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${timeStr}] ${message}`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

// 캔버스 클릭 시 캐릭터 선택
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const clicked = AGENTS.find(a => Math.hypot(a.x - clickX, a.y - clickY) < 25);
  if (clicked) {
    playBeep(600, 'triangle', 0.1);
    openAgentModal(clicked.id);
  }
});

// 모달 제어
window.openAgentModal = function(agentId) {
  selectedAgent = AGENTS.find(a => a.id === agentId);
  if (!selectedAgent) return;

  document.getElementById('modal-agent-name').textContent = `${selectedAgent.name} (${selectedAgent.role})`;
  document.getElementById('modal-avatar').textContent = selectedAgent.bubble;
  document.getElementById('modal-agent-role').textContent = selectedAgent.role;
  document.getElementById('modal-agent-status').textContent = selectedAgent.status;
  document.getElementById('modal-agent-task').textContent = selectedAgent.task;
  document.getElementById('modal-agent-skills').textContent = selectedAgent.skills;

  document.getElementById('agent-modal').classList.remove('hidden');
};

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('agent-modal').classList.add('hidden');
});

document.getElementById('btn-force-work').addEventListener('click', () => {
  if (selectedAgent) {
    selectedAgent.status = "CODING";
    selectedAgent.bubble = "⚡";
    selectedAgent.targetX = selectedAgent.deskX;
    selectedAgent.targetY = selectedAgent.deskY;
    selectedAgent.task = "사용자 긴급 지시 작업 수행 중";
    addTerminalLog(`${selectedAgent.name}: 긴급 작업 지시 수신 완료!`, 'alert');
    playBeep(880, 'square', 0.15);
    updateSquadUI();
    document.getElementById('agent-modal').classList.add('hidden');
  }
});

document.getElementById('btn-force-coffee').addEventListener('click', () => {
  if (selectedAgent) {
    selectedAgent.status = "COFFEE";
    selectedAgent.bubble = "☕";
    selectedAgent.targetX = OFFICE_FURNITURE.coffeeMachine.x + Math.random() * 20;
    selectedAgent.targetY = OFFICE_FURNITURE.coffeeMachine.y + Math.random() * 20;
    selectedAgent.task = "커피 마시며 리프레시 중";
    addTerminalLog(`${selectedAgent.name}: 커피 브레이크 출발.`);
    playBeep(330, 'sine', 0.1);
    updateSquadUI();
    document.getElementById('agent-modal').classList.add('hidden');
  }
});

// 빠른 디스패치 버튼
document.querySelectorAll('.dispatch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    playBeep(520, 'square', 0.08);

    if (action === "SPEC") {
      const archie = AGENTS.find(a => a.id === "system-architect");
      archie.status = "THINKING";
      archie.bubble = "📝";
      archie.targetX = archie.deskX;
      archie.targetY = archie.deskY;
      archie.task = "긴급 Spec-Driven 요구사항 재분석 중";
      addTerminalLog("MISSION: 신규 요구사항 명세화 시작", "system");
    } else if (action === "CODE") {
      const devin = AGENTS.find(a => a.id === "tdd-developer");
      devin.status = "CODING";
      devin.bubble = "💻";
      devin.targetX = devin.deskX;
      devin.targetY = devin.deskY;
      devin.task = "TDD 모듈 구현 집중 모드";
      addTerminalLog("MISSION: TDD 핵심 컴포넌트 개발 착수", "system");
    } else if (action === "TEST") {
      const tester = AGENTS.find(a => a.id === "test-engineer");
      tester.status = "TESTING";
      tester.bubble = "🧪";
      tester.targetX = 350;
      tester.targetY = 240;
      tester.task = "전체 테스트 스위트 일괄 실행";
      addTerminalLog("MISSION: 전 스위트 단위/통합 테스트 시작", "system");
    } else if (action === "REVIEW") {
      const reviewer = AGENTS.find(a => a.id === "code-reviewer");
      reviewer.status = "REVIEWING";
      reviewer.bubble = "🔍";
      reviewer.targetX = 320;
      reviewer.targetY = 150;
      reviewer.task = "TDD 개발자 화면에서 코드 페어 리뷰";
      addTerminalLog("MISSION: 5축 코드 리뷰 가동", "system");
    } else if (action === "AUDIT") {
      const sec = AGENTS.find(a => a.id === "security-auditor");
      sec.status = "AUDITING";
      sec.bubble = "🛡️";
      sec.targetX = sec.deskX;
      sec.targetY = sec.deskY;
      sec.task = "취약점 전수 조사 및 시크릿 스캔";
      addTerminalLog("MISSION: 전사 보안 감사 시작", "alert");
    } else if (action === "DEPLOY") {
      const devops = AGENTS.find(a => a.id === "devops-engineer");
      devops.status = "DEPLOYING";
      devops.bubble = "🚀";
      devops.targetX = OFFICE_FURNITURE.serverRack.x - 20;
      devops.targetY = OFFICE_FURNITURE.serverRack.y;
      devops.task = "클라우드 서비스 릴리스 배포";
      playSuccessChime();
      addTerminalLog("MISSION: 프로덕션 배포 파이프라인 트리거!", "system");
    } else if (action === "COFFEE") {
      AGENTS.forEach((a, i) => {
        a.status = "COFFEE";
        a.bubble = "☕";
        a.targetX = OFFICE_FURNITURE.coffeeMachine.x + (i % 3) * 20;
        a.targetY = OFFICE_FURNITURE.coffeeMachine.y + Math.floor(i / 3) * 20;
        a.task = "휴게실에서 티타임";
      });
      addTerminalLog("EVENT: 전원 커피 브레이크!", "system");
    } else if (action === "RESET") {
      AGENTS.forEach(a => {
        a.status = "IDLE";
        a.bubble = "💤";
        a.targetX = a.deskX;
        a.targetY = a.deskY;
        a.task = "자리 복귀 및 대기";
      });
      addTerminalLog("EVENT: 전원 지정석 복귀.", "system");
    }

    updateSquadUI();
  });
});

// 사운드 및 오토 시뮬 토글
document.getElementById('btn-sound').addEventListener('click', (e) => {
  soundEnabled = !soundEnabled;
  e.target.textContent = soundEnabled ? "🔊 SFX ON" : "🔇 SFX OFF";
  e.target.classList.toggle('active', soundEnabled);
});

document.getElementById('btn-auto-sim').addEventListener('click', (e) => {
  autoSimEnabled = !autoSimEnabled;
  e.target.textContent = autoSimEnabled ? "🤖 AUTO SIM: ON" : "⏸️ AUTO SIM: OFF";
  e.target.classList.toggle('active', autoSimEnabled);
  addTerminalLog(`Auto Simulation: ${autoSimEnabled ? 'RESUMED' : 'PAUSED'}`);
});

// 시계 업데이트
setInterval(() => {
  const clock = document.getElementById('clock-display');
  if (clock) {
    const now = new Date();
    clock.textContent = now.toTimeString().split(' ')[0];
  }
}, 1000);

// 초기화
updateSquadUI();
requestAnimationFrame(gameLoop);
addTerminalLog("Pixel Agent Office 엔진 가동 완료. 8인 스쿼드 배치 완료.");
