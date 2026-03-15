const btnConnectBuddy = document.getElementById('btn-connect-buddy');
const buddyStatus = document.getElementById('buddy-status');
const micIndicator = document.getElementById('mic-indicator');
const aiTranscriptionBox = document.getElementById('ai-transcription-box');
const aiMessageText = document.getElementById('ai-message-text');
const buddyChatInput = document.getElementById('buddy-chat-input');
const btnSendBuddy = document.getElementById('btn-send-buddy');

const BACKEND_WS_BASE = 'ws://localhost:8000';
const BINARY_MAGIC_1 = 0x4C; // L
const BINARY_MAGIC_2 = 0x47; // G
const BINARY_FRAME_TYPE_AUDIO_PCM16 = 0x01;
const BINARY_FRAME_TYPE_IMAGE_JPEG = 0x02;
const FPS_TARGET = 1;

let buddySocket = null;
let sessionId = null;
let hasOutputTranscriptionInTurn = false;

let videoElement = null;
let mediaStream = null;
let captureInterval = null;

let audioContext = null;
let audioInputProcess = null;
let userAudioStream = null;

let playbackContext = null;
let nextPlaybackTime = 0;

const partialLineMap = new Map();

function buildWebSocketUrl() {
    const userId = 'browser-user';
    sessionId = sessionId || `browser-session-${Math.random().toString(36).slice(2, 10)}`;
    return `${BACKEND_WS_BASE}/v1/ws/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`;
}

function setLiveUiConnected(isConnected) {
    buddyStatus.textContent = isConnected ? 'Connected' : 'Disconnected';
    buddyStatus.className = isConnected ? 'status-connected' : 'status-disconnected';
    btnConnectBuddy.textContent = isConnected ? 'Stop Live Buddy' : 'Start Live Buddy';
    btnConnectBuddy.classList.toggle('live', isConnected);
    buddyChatInput.disabled = !isConnected;
    btnSendBuddy.disabled = !isConnected;
    micIndicator.style.display = isConnected ? 'inline-block' : 'none';
}

function addBuddyLine(text, type = 'system', key = null) {
    if (key && partialLineMap.has(key)) {
        const existingLine = partialLineMap.get(key);
        existingLine.className = `buddy-line ${type}`;
        existingLine.textContent = text;
        aiTranscriptionBox.scrollTop = aiTranscriptionBox.scrollHeight;
        return;
    }

    const line = document.createElement('div');
    line.className = `buddy-line ${type}`;
    line.textContent = text;
    aiMessageText.appendChild(line);

    if (key) {
        partialLineMap.set(key, line);
    }

    aiTranscriptionBox.scrollTop = aiTranscriptionBox.scrollHeight;
}

function finalizePartialLine(key) {
    partialLineMap.delete(key);
}

async function connectBuddy() {
    if (buddySocket && buddySocket.readyState === WebSocket.OPEN) {
        buddySocket.close();
        return;
    }

    buddyStatus.textContent = 'Connecting...';
    buddyStatus.className = 'status-disconnected';

    const wsUrl = buildWebSocketUrl();
    buddySocket = new WebSocket(wsUrl);
    buddySocket.binaryType = 'arraybuffer';

    buddySocket.onopen = async () => {
        setLiveUiConnected(true);
        aiTranscriptionBox.style.display = 'block';
        addBuddyLine('Live mode started: browser view + mic are streaming.', 'system');

        try {
            await startAudioStream();
            await startBrowserVideoStream();
        } catch (error) {
            console.error('Failed to start live streams:', error);
            addBuddyLine(`System: ${error.message || 'Failed to start live streams'}`, 'system');
        }
    };

    buddySocket.onmessage = (event) => {
        try {
            const adkEvent = JSON.parse(event.data);
            handleAdkEvent(adkEvent);
        } catch (error) {
            console.error('Invalid event payload from backend:', error);
        }
    };

    buddySocket.onclose = () => {
        setLiveUiConnected(false);
        addBuddyLine('Live mode stopped.', 'system');
        stopBrowserVideoStream();
        stopAudioStream();
        partialLineMap.clear();
        hasOutputTranscriptionInTurn = false;
        buddySocket = null;
    };

    buddySocket.onerror = () => {
        buddyStatus.textContent = 'Connection Error';
        buddyStatus.className = 'status-disconnected';
    };
}

function handleAdkEvent(adkEvent) {
    if (adkEvent.type === 'error') {
        addBuddyLine(`System: ${adkEvent.message || 'Live backend error.'}`, 'system');
        return;
    }

    if (adkEvent.inputTranscription && adkEvent.inputTranscription.text) {
        const text = adkEvent.inputTranscription.text;
        const key = 'input-transcription';
        addBuddyLine(`You (voice): ${text}`, 'user', key);
        if (adkEvent.inputTranscription.finished) {
            finalizePartialLine(key);
        }
    }

    if (adkEvent.outputTranscription && adkEvent.outputTranscription.text) {
        const text = adkEvent.outputTranscription.text;
        const key = 'output-transcription';
        hasOutputTranscriptionInTurn = true;
        addBuddyLine(`Buddy (voice): ${text}`, 'agent', key);
        if (adkEvent.outputTranscription.finished) {
            finalizePartialLine(key);
        }
    }

    if (adkEvent.turnComplete) {
        finalizePartialLine('input-transcription');
        finalizePartialLine('output-transcription');
        hasOutputTranscriptionInTurn = false;
    }

    if (adkEvent.interrupted) {
        addBuddyLine('System: response interrupted.', 'system');
        finalizePartialLine('output-transcription');
    }

    if (!adkEvent.content || !adkEvent.content.parts) {
        return;
    }

    for (const part of adkEvent.content.parts) {
        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/pcm')) {
            playAgentAudio(part.inlineData.data);
            continue;
        }

        if (part.text && !part.thought) {
            if (!adkEvent.partial && hasOutputTranscriptionInTurn) {
                continue;
            }
            addBuddyLine(`Buddy: ${part.text}`, 'agent');
        }
    }
}

function sendBuddyText() {
    const message = buddyChatInput.value.trim();
    if (!message || !buddySocket || buddySocket.readyState !== WebSocket.OPEN) {
        return;
    }

    buddySocket.send(JSON.stringify({ type: 'text', text: message }));
    addBuddyLine(`You: ${message}`, 'user');
    buddyChatInput.value = '';
}

function createBinaryFrame(frameType, payloadBuffer) {
    const payloadBytes = payloadBuffer instanceof Uint8Array
        ? payloadBuffer
        : new Uint8Array(payloadBuffer);
    const framedBytes = new Uint8Array(payloadBytes.byteLength + 3);
    framedBytes[0] = BINARY_MAGIC_1;
    framedBytes[1] = BINARY_MAGIC_2;
    framedBytes[2] = frameType;
    framedBytes.set(payloadBytes, 3);
    return framedBytes.buffer;
}

async function startBrowserVideoStream() {
    const { ipcRenderer } = require('electron');
    const sources = await ipcRenderer.invoke('get-desktop-sources');

    const appWindow = sources.find(source => source.name.includes('WebAlchemy Browser'))
        || sources.find(source => source.id.startsWith('window:'))
        || sources[0];

    if (!appWindow) {
        throw new Error('No capturable browser window source found');
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: appWindow.id,
                minWidth: 1280,
                maxWidth: 1280,
                minHeight: 720,
                maxHeight: 720
            }
        }
    });

    videoElement = document.createElement('video');
    videoElement.srcObject = mediaStream;
    await videoElement.play();
    startFrameCapture();
}

function startFrameCapture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 360;

    captureInterval = setInterval(() => {
        if (!videoElement || !buddySocket || buddySocket.readyState !== WebSocket.OPEN) {
            return;
        }

        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async (blob) => {
            if (!blob || !buddySocket || buddySocket.readyState !== WebSocket.OPEN) {
                return;
            }
            const imageBuffer = await blob.arrayBuffer();
            const framedImage = createBinaryFrame(BINARY_FRAME_TYPE_IMAGE_JPEG, imageBuffer);
            buddySocket.send(framedImage);
        }, 'image/jpeg', 0.72);
    }, 1000 / FPS_TARGET);
}

function stopBrowserVideoStream() {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement = null;
    }
}

async function startAudioStream() {
    userAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(userAudioStream);
    audioInputProcess = audioContext.createScriptProcessor(4096, 1, 1);

    audioInputProcess.onaudioprocess = (event) => {
        if (!buddySocket || buddySocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const float32Data = event.inputBuffer.getChannelData(0);
        const int16Buffer = new Int16Array(float32Data.length);

        for (let index = 0; index < float32Data.length; index++) {
            const sample = Math.max(-1, Math.min(1, float32Data[index]));
            int16Buffer[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        const framedAudio = createBinaryFrame(
            BINARY_FRAME_TYPE_AUDIO_PCM16,
            new Uint8Array(int16Buffer.buffer)
        );
        buddySocket.send(framedAudio);
    };

    source.connect(audioInputProcess);
    audioInputProcess.connect(audioContext.destination);

    playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    await playbackContext.resume();
    nextPlaybackTime = playbackContext.currentTime;
}

function stopAudioStream() {
    if (audioInputProcess) {
        audioInputProcess.disconnect();
        audioInputProcess = null;
    }
    if (userAudioStream) {
        userAudioStream.getTracks().forEach(track => track.stop());
        userAudioStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (playbackContext) {
        playbackContext.close();
        playbackContext = null;
    }
}

function base64ToUint8Array(base64Data) {
    let normalized = (base64Data || '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) {
        normalized += '=';
    }

    const binary = window.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function playAgentAudio(base64PcmString) {
    if (!playbackContext) {
        return;
    }

    try {
        const bytes = base64ToUint8Array(base64PcmString);
        const samplesLength = Math.floor(bytes.byteLength / 2);
        const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, samplesLength);
        const float32Array = new Float32Array(int16Array.length);

        for (let index = 0; index < int16Array.length; index++) {
            float32Array[index] = int16Array[index] / 32768;
        }

        const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(playbackContext.destination);

        if (nextPlaybackTime < playbackContext.currentTime) {
            nextPlaybackTime = playbackContext.currentTime;
        }

        source.start(nextPlaybackTime);
        nextPlaybackTime += audioBuffer.duration;
    } catch (error) {
        console.error('Error playing agent audio:', error);
    }
}

btnConnectBuddy.addEventListener('click', connectBuddy);
btnSendBuddy.addEventListener('click', sendBuddyText);
buddyChatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        sendBuddyText();
    }
});
