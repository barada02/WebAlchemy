# WebAlchemy

WebAlchemy is a local desktop browser + AI copilot stack:
- **Browser/**: Electron-based tabbed browser UI.
- **LiveAgent_exp/**: FastAPI + Google ADK live backend (text, audio, image streaming).

The Browser is integrated with LiveAgent backend so your AI buddy can:
- watch your browser window feed at **1 FPS**,
- listen and respond with **live voice**,
- chat with **typed text**,
- act like a sidekick while you keep control of the mouse/navigation.

---

## Project Structure

```text
WebAlchemy/
├─ Browser/              # Electron browser app + Live Buddy client
└─ LiveAgent_exp/        # FastAPI ADK streaming backend + optional web demo UI
```

---

## LiveAgent Capabilities

`LiveAgent_exp` exposes a versioned backend API with bidirectional streaming:

### Endpoints
- `GET /` → backend status and endpoint map
- `GET /v1/root` → health/info
- `WS /v1/ws/{user_id}/{session_id}` → primary streaming websocket
- `GET /v1/ui` → optional built-in demo UI
- Legacy compatibility: `/ui`, `/ws/{user_id}/{session_id}`

### Supported Inputs (Client → Server)
1. **Text** (JSON frame)
   ```json
   {"type":"text","text":"Hello"}
   ```
2. **Framed binary media** (`LG + type + payload`)
   - `0x01` = PCM16 audio (`audio/pcm;rate=16000`)
   - `0x02` = JPEG image (`image/jpeg`)

### Outputs (Server → Client)
ADK event JSON frames, including:
- `content.parts.text`
- `content.parts.inlineData` (audio)
- `inputTranscription`
- `outputTranscription`
- `turnComplete`
- `interrupted`
- `usageMetadata`

---

## Browser Integration (Current)

The Electron Browser live buddy mode is wired to LiveAgent protocol:
- Connects to `ws://localhost:8000/v1/ws/browser-user/{session_id}`
- Sends browser-window frames as JPEG at **1 FPS** using `LG` framed binary
- Sends mic audio as PCM16 (`16kHz`) using `LG` framed binary
- Sends typed text as `{ "type": "text", "text": "..." }`
- Parses ADK downstream events for transcript and audio playback

UI flow in Browser:
- **Start Live Buddy** button (single toggle for live mode)
- typed chat input + send
- transcript panel for system/user/agent lines

---

## Local Setup

## 1) Backend (`LiveAgent_exp`)

From `WebAlchemy/LiveAgent_exp`:

1. Create virtual environment (if needed):
   ```powershell
   python -m venv venv
   ```
2. Activate venv:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install fastapi uvicorn python-dotenv google-adk google-genai
   ```
4. Create/update `.env`:
   ```env
   GOOGLE_API_KEY=your_new_key_here
   DEMO_AGENT_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
   ```
5. Start backend:
   ```powershell
   python main.py
   ```

Backend should be available at `http://localhost:8000`.

## 2) Browser (`Browser`)

From `WebAlchemy/Browser`:

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Start Electron app:
   ```powershell
   npm start
   ```

---

## How to Use Live Buddy

1. Start backend (`python main.py`) in `LiveAgent_exp`.
2. Start Browser (`npm start`) in `Browser`.
3. Click **Start Live Buddy**.
4. Grant microphone/screen capture permissions if prompted.
5. Talk naturally or type messages in the buddy input.
6. Keep browsing; buddy sees browser context via 1 FPS feed and responds in voice/text.

---

## Troubleshooting

### API key policy error (`1008` leaked key)
If you see:
- `Your API key was reported as leaked. Please use another API key.`

Do this:
1. Generate a new Google API key.
2. Replace `GOOGLE_API_KEY` in `LiveAgent_exp/.env`.
3. Revoke the leaked key in Google Cloud/AI Studio.
4. Restart backend process.

### Browser connects but no model response
- Confirm backend is running on port `8000`.
- Confirm key/model are valid.
- Verify Browser is connecting to `/v1/ws/{user_id}/{session_id}`.

### No audio or video streaming
- Re-check mic and screen capture permissions for Electron.
- Ensure live mode is connected and not blocked by OS privacy settings.

---

## Notes

- Current backend session store is in-memory (`InMemorySessionService`).
- For production, add auth, persistent session store (Redis/DB), and stricter CORS/security.
