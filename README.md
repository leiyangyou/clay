# Clay

<!-- HERO IMAGE: media/hero.png (새로 촬영)
     촬영 가이드:
     - 정적 스크린샷, GIF 아님. 1400x900, 다크 테마.
     - 왼쪽 아이콘 스트립: 프로젝트 아이콘 2-3개 활성 상태
     - 사이드바: Mate 아바타들 (슈리, 마키, 아키 등) + 세션 리스트
     - 메인 영역: Claude가 코드 블록과 함께 답변 중인 채팅
     - 상단: "2 online" 같은 프레즌스 뱃지 보이게
     - 목적: "터미널이 아닌 앱", "혼자가 아닌 팀", "여러 프로젝트 동시" 세 가지를 한 장에
     - 촬영 후 이 주석 삭제하고 아래 img 태그 활성화
-->
<p align="center">
  <img src="media/hero.png" alt="Clay workspace" width="700">
</p>

<h3 align="center">Claude Code for your whole team.</h3>

[![npm version](https://img.shields.io/npm/v/clay-server)](https://www.npmjs.com/package/clay-server) [![npm downloads](https://img.shields.io/npm/dw/clay-server)](https://www.npmjs.com/package/clay-server) [![GitHub stars](https://img.shields.io/github/stars/chadbyte/clay)](https://github.com/chadbyte/clay) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/chadbyte/clay/blob/main/LICENSE)

Claude Code is powerful, but it's one person in one terminal. Clay turns it into a shared workspace where your whole team works together, from any browser. Developers, designers, PMs. Your server, your rules.

```bash
npx clay-server
# Scan the QR code to connect from any device
```

---

## What you get

### One workspace for everything

All your projects, sessions, and teammates in a single browser UI. Add a project and an agent attaches to it. Run backend, frontend, and docs simultaneously. Switch between them in the sidebar.

The server runs as a background daemon. Sessions persist through crashes, restarts, and network drops.

<!-- MULTI-PROJECT GIF: media/split.gif (기존 에셋 유지)
     현재 split.gif가 이 역할을 잘 하고 있음. 교체 불필요.
-->
<p align="center">
  <img src="media/split.gif" alt="split-screen workflow" width="700">
</p>

### Bring your whole team

Invite teammates with their own accounts. Set permissions per person, per project, per session. A designer reports a bug in plain language. A junior dev works with guardrails. If someone gets stuck, jump into their session to help in real time.

Add a CLAUDE.md and the AI operates within those rules: explains technical terms simply, escalates risky operations to seniors, summarizes changes in plain words.

Real-time presence shows who's where.

<!-- TEAM GIF: media/team.gif (새로 촬영)
     촬영 가이드 (20초):
     1. 유저 A가 세션에서 작업 중인 모습 (프레즌스 뱃지 "1 online")
     2. 유저 B가 접속 → 프레즌스가 "2 online"으로 바뀌는 순간
     3. 유저 B가 같은 세션에 들어와서 대화에 참여
     - 핵심: "혼자 쓰다가 팀원이 합류하는" 순간의 임팩트
     - 촬영 후 이 주석 삭제하고 아래 img 태그 활성화
-->
<p align="center">
  <img src="media/team.gif" alt="teammate joining a session" width="700">
</p>

### AI teammates you can @mention

Create AI personas through conversation. Give them a name, avatar, expertise, and communication style. They remember how you work together and carry context across sessions.

@mention them for code review, analysis, or architectural advice. Set up structured debates between them to stress-test decisions before committing.

They sit in your sidebar next to your human teammates. DM them, bring them into projects, create as many as you need. A code reviewer, a marketing lead, a writing partner.

<!-- MATES GIF: media/mates.gif (새로 촬영)
     촬영 가이드 (20초):
     1. 사이드바에서 Mate 목록이 보이는 상태
     2. 채팅에서 @마키 또는 @슈리 멘션 입력
     3. Mate가 코드를 읽고 분석 답변하는 모습
     - 핵심: "사이드바에 사람 팀원과 AI 팀원이 나란히 있다"는 느낌
     - Mate 아바타가 선명하게 보여야 함
     - 촬영 후 이 주석 삭제하고 아래 img 태그 활성화
-->
<p align="center">
  <img src="media/mates.gif" alt="mentioning an AI teammate" width="700">
</p>

### Runs as a service

Clay runs as a daemon on your server. Close your laptop, log out, go to sleep. Sessions keep running.

Schedule tasks with cron. Set up autonomous coding loops with Ralph Loop: define a task (`PROMPT.md`) and success criteria (`JUDGE.md`), and the agent iterates until the judge says PASS. Based on [Geoffrey Huntley's Ralph Wiggum technique](https://ghuntley.com/loop/).

Your phone buzzes when Claude needs approval, finishes a task, or hits an error. Install as a PWA for native-like push notifications.

<!-- RUNS AS SERVICE: 두 에셋 병렬 배치
     왼쪽: media/phone.gif (기존 에셋) - 폰에서 Clay 접속하는 모습
     오른쪽: media/push-notification.jpg (기존 에셋) - 푸시 알림
     데스크톱 hero에서 "이건 앱이구나" → 여기서 "폰에서도 되네" 1-2 펀치
-->
<p align="center">
  <img src="media/phone.gif" alt="Clay on phone" width="280">
  &nbsp;&nbsp;&nbsp;
  <img src="media/push-notification.jpg" alt="push notification" width="280">
</p>

---

## How a bug gets fixed

**Without Clay:**
Designer finds a bug → writes up a ticket on Asana → dev asks clarifying questions → PM prioritizes → dev opens terminal, fixes it → shares a preview → QA checks → deploy
<br>*7 steps. 3 people. 2 days.*

**With Clay:**
Designer opens Clay in the browser, describes the bug in plain language → senior joins the same session, reviews the fix together → merge
<br>*The designer never touched a terminal. The senior never left the workspace.*

---

## How Clay compares

*As of March 2026.*

| | CLI | Remote Control | Channels | **Clay** |
|---|---|---|---|---|
| Multi-user with roles | – | – | Platform-dependent | **Accounts + RBAC** |
| AI teammates (Mates) | – | – | – | **Yes** |
| Join teammate's session | – | – | – | **Yes** |
| Persistent daemon | – | Session-based | – | **Yes** |
| Native mobile app | – | **Yes** | **Platform app** | PWA |
| Official support | **Anthropic** | **Anthropic** | **Anthropic** | Community |

Clay is a community project, not affiliated with Anthropic. Official tools receive guaranteed support and updates.

---

## Getting Started

**Requirements:** Node.js 20+, Claude Code CLI (authenticated).

```bash
npx clay-server
```

On first run, it walks you through port and PIN setup.
Scan the QR code to connect from your phone instantly.

For remote access, use a VPN like Tailscale.

<!-- START GIF: media/start.gif (기존 에셋 유지, 교체 고려)
     현재 start.gif는 터미널에서 실행하는 모습만 보여줌.
     더 강한 버전: npx clay-server → QR 코드 → 폰에서 스캔 → 브라우저 열림 (15초)
     "한 줄 치면 끝"이라는 걸 시각적으로 증명.
     기존 것으로도 충분하면 유지. 교체하려면 위 흐름으로 재촬영.
-->
<p align="center">
  <img src="media/start.gif" alt="Clay starting from CLI" width="600">
</p>

---

## Security & Privacy

Your data flows directly from your machine to the Anthropic API, exactly as it does when you use the CLI. Clay adds a browser layer on top, not a middleman.

HTTPS is enabled by default with a builtin certificate. PIN authentication and per-project/session permissions are built in. For local network use, this is sufficient. For remote access, we recommend a VPN like Tailscale.

---

## FAQ

**"Is this just a terminal wrapper?"**
No. Clay runs on the Claude Agent SDK. It doesn't wrap terminal output. It communicates directly with the agent through the SDK.

**"Does my code leave my machine?"**
The Clay server runs locally. Files stay local. Only Claude API calls go out, which is the same as using the CLI.

**"Can I continue a CLI session?"**
Yes. Pick up a CLI session in the browser, or continue a browser session in the CLI.

**"Does my existing CLAUDE.md work?"**
Yes. If your project has a CLAUDE.md, it works in Clay as-is.

**"Does each teammate need their own API key?"**
No. Teammates share the Claude Code session logged in on the server. If needed, you can configure per-project environment variables to use different API keys.

**"Does it work with MCP servers?"**
Yes. MCP configurations from the CLI carry over as-is.

**"What are Mates?"**
AI teammates you create through a conversation. Each Mate has a name, avatar, personality, and persistent memory. They live in your sidebar alongside your human teammates. Create as many as you need: a code reviewer, a writing partner, a project manager.

---

## HTTPS

HTTPS is enabled by default using a builtin wildcard certificate for `*.d.clay.studio`. No setup required. Available from `v2.17.0-beta.2`. Your browser connects to a URL like:

```
https://192-168-1-50.d.clay.studio:2633
```

The domain resolves to your local IP. All traffic stays on your network. See [clay-dns](clay-dns/) for details on how this works.

Push notifications require HTTPS, so they work out of the box with this setup. Install Clay as a PWA on your device to receive them.

<details>
<summary><strong>Alternative: local certificate with mkcert</strong></summary>

If you prefer to use a locally generated certificate (e.g. air-gapped environments where DNS is unavailable):

```bash
brew install mkcert
mkcert -install
npx clay-server --local-cert
```

This generates a self-signed certificate trusted by your machine. The setup wizard will guide you through installing the CA on other devices.

</details>

---

## CLI Options

```bash
npx clay-server              # Default (port 2633)
npx clay-server -p 8080      # Specify port
npx clay-server --yes        # Skip interactive prompts (use defaults)
npx clay-server -y --pin 123456
                              # Non-interactive + PIN (for scripts/CI)
npx clay-server --no-https   # Disable HTTPS
npx clay-server --local-cert # Use local certificate (mkcert) instead of builtin
npx clay-server --no-update  # Skip update check
npx clay-server --debug      # Enable debug panel
npx clay-server --add .      # Add current directory to running daemon
npx clay-server --add /path  # Add project by path
npx clay-server --remove .   # Remove project
npx clay-server --list       # List registered projects
npx clay-server --shutdown   # Stop running daemon
npx clay-server --dangerously-skip-permissions
                              # Bypass all permission prompts (requires PIN at setup)
npx clay-server --dev        # Dev mode (foreground, auto-restart on lib/ changes, port 2635)
```

---

## Architecture

Clay drives Claude Code execution through the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) and streams it to the browser over WebSocket.

```mermaid
graph LR
    Browser["Browser<br/>(Phone / Desktop)"]
    WS["WebSocket"]
    Server["HTTP Server<br/>lib/server.js"]
    Project["Project Context<br/>lib/project.js"]
    SDK["Claude Agent SDK"]
    Claude["Claude Code<br/>Process"]
    Push["Push Service"]

    Browser <-->|Real time stream| WS
    WS <--> Server
    Server -->|slug routing| Project
    Project <-->|async iterable| SDK
    SDK <-->|Prompt / Response| Claude
    Project -->|Approval request| Push
    Push -->|Notification| Browser
```

For detailed sequence diagrams, daemon architecture, and design decisions, see [docs/architecture.md](docs/architecture.md).

---

## Contributors

<a href="https://github.com/chadbyte/clay/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=chadbyte/clay" />
</a>

## Contributing

Bug fixes and typo corrections are welcome. For feature suggestions, please open an issue first:
[https://github.com/chadbyte/clay/issues](https://github.com/chadbyte/clay/issues)

If you're using Clay, let us know how in Discussions:
[https://github.com/chadbyte/clay/discussions](https://github.com/chadbyte/clay/discussions)

## Disclaimer

This is an independent project and is not affiliated with Anthropic. Claude is a trademark of Anthropic.

Clay is provided "as is" without warranty of any kind. Users are responsible for complying with the terms of service of underlying AI providers (e.g., Anthropic, OpenAI) and all applicable terms of any third-party services. Features such as multi-user mode are experimental and may involve sharing access to API-based services. Before enabling such features, review your provider's usage policies regarding account sharing, acceptable use, and any applicable rate limits or restrictions. The authors assume no liability for misuse or violations arising from the use of this software.

## License

MIT
