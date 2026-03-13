// AI Buddy Client Logic
const btnConnectBuddy = document.getElementById('btn-connect-buddy');
const buddyStatus = document.getElementById('buddy-status');
const buddyChatInput = document.getElementById('buddy-chat-input');
const btnSendBuddy = document.getElementById('btn-send-buddy');

let buddySocket = null;

function connectBuddy() {
    if (buddySocket && buddySocket.readyState === WebSocket.OPEN) {
        buddySocket.close();
        return;
    }

    buddyStatus.textContent = 'Connecting...';
    buddyStatus.className = 'status-disconnected';
    
    // Connect to the local Python AgentService
    buddySocket = new WebSocket('ws://localhost:8000');
    buddySocket.binaryType = 'arraybuffer'; // Setup for receiving binary Agent audio later

    buddySocket.onopen = async () => {
        console.log('Connected to AI Buddy (Python Backend)');
        buddyStatus.textContent = 'Connected';
        buddyStatus.className = 'status-connected';
        btnConnectBuddy.textContent = 'Disconnect AI Buddy';
        btnConnectBuddy.style.background = '#f44336';
        
        // Enable chat inputs for echo test
        buddyChatInput.disabled = false;
        btnSendBuddy.disabled = false;

        // Start streaming video immediately upon connection
        await startVideoStream();
    };

    buddySocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Buddy says:', data);
        
        if (data.type === 'echo') {
            alert(`Buddy Echo: ${data.message}`);
        } else if (data.type === 'agent_text') {
            // Display What the AI says
            console.log(`%c[AI Buddy]%c ${data.data}`, "color: #4CAF50; font-weight: bold", "color: inherit");
            
            // For MVP display, we'll prefix it in the chat input placeholder or a simple alert 
            // Better to show in a custom div, but alert is fine for sanity check of Phase 3
            // We'll use a small floating notification instead of alert to not block the thread
            showNotification(data.data);
        } else if (data.type === 'agent_audio') {
            // Incoming PCM Audio from Gemini
            playAgentAudio(data.data);
        } else if (data.type === 'error') {
            alert(`Buddy Error: ${data.message}`);
            stopVideoStream();
            stopAudioStream();
        }
    };

    // Helper to show a temporary notification on screen
    function showNotification(text) {
        let notif = document.getElementById('buddy-notification');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'buddy-notification';
            notif.style.position = 'fixed';
            notif.style.bottom = '10px';
            notif.style.right = '10px';
            notif.style.backgroundColor = '#333';
            notif.style.color = '#fff';
            notif.style.padding = '15px';
            notif.style.borderRadius = '8px';
            notif.style.zIndex = '9999';
            notif.style.maxWidth = '300px';
            notif.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
            document.body.appendChild(notif);
        }
        notif.textContent = text;
        
        // Hide after 5 seconds
        if (notif.timeoutId) clearTimeout(notif.timeoutId);
        notif.timeoutId = setTimeout(() => { notif.remove(); }, 5000);
    }

    buddySocket.onclose = () => {
        console.log('Disconnected from AI Buddy');
        buddyStatus.textContent = 'Disconnected';
        buddyStatus.className = 'status-disconnected';
        btnConnectBuddy.textContent = 'Connect AI Buddy';
        btnConnectBuddy.style.background = '#4CAF50';
        
        // Disable chat inputs
        buddyChatInput.disabled = true;
        btnSendBuddy.disabled = true;
        
        // Hide mic indicator
        const micIndicator = document.getElementById('mic-indicator');
        if (micIndicator) micIndicator.style.display = 'none';

        // Stop streaming
        stopVideoStream();
        stopAudioStream();
        
        buddySocket = null;
    };

    buddySocket.onerror = (error) => {
        console.error('Buddy WebSocket Error:', error);
        buddyStatus.textContent = 'Connection Error';
    };
}

// Send Test Message
function sendTestMessage() {
    if (buddySocket && buddySocket.readyState === WebSocket.OPEN) {
        const message = buddyChatInput.value;
        if (message.trim() !== '') {
            buddySocket.send(JSON.stringify({ type: 'text', data: message }));
            buddyChatInput.value = '';
        }
    }
}

// -------------------------------------------------------------------
// VIDEO STREAMING LOGIC
// -------------------------------------------------------------------
let videoElement = null;
let mediaStream = null;
let captureInterval = null;
const FPS_TARGET = 1; // Strict 1 FPS limit per Gemini API requirements

async function startVideoStream() {
    try {
        const { ipcRenderer } = require('electron');
        const sources = await ipcRenderer.invoke('get-desktop-sources');
        
        // Find the window source for our Electron App. 
        // We look for the source name containing 'WebAlchemy Browser' (from our index.html title)
        // If not found, fallback to the first 'window' type source.
        const appWindow = sources.find(s => s.name.includes('WebAlchemy Browser')) 
                       || sources.find(s => s.id.startsWith('window:'));

        if (!appWindow) {
            console.error("Could not find the browser window source to capture.");
            return;
        }

        // --- Start Phase 4 Audio Capture Here ---
        await startAudioStream();

        // --- Video Stream (Screen Capture) ---
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

        // Create a hidden video element to play the stream
        videoElement = document.createElement('video');
        videoElement.srcObject = mediaStream;
        videoElement.play();

        // Start capturing frames
        startFrameCapture();
        
    } catch (error) {
        console.error("Failed to start video stream:", error);
    }
}

function startFrameCapture() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Limit resolution to save bandwidth (Downscaled from 720p to 360p to prevent Gemini API keepalive timeouts)
    canvas.width = 640;
    canvas.height = 360;

    captureInterval = setInterval(() => {
        if (!videoElement || !buddySocket || buddySocket.readyState !== WebSocket.OPEN) return;

        // Draw video frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Send as pure binary (Blob -> ArrayBuffer)
        canvas.toBlob((blob) => {
            if (blob) {
                blob.arrayBuffer().then((buffer) => {
                    const uint8Data = new Uint8Array(buffer);
                    const payload = new Uint8Array(uint8Data.byteLength + 1);
                    payload[0] = 0; // Marker 0 for Video
                    payload.set(uint8Data, 1);
                    if (buddySocket && buddySocket.readyState === WebSocket.OPEN) {
                        buddySocket.send(payload);
                    }
                });
            }
        }, 'image/jpeg', 0.5);
        
    }, 1000 / FPS_TARGET);
}

function stopVideoStream() {
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

// -------------------------------------------------------------------
// AUDIO STREAMING LOGIC (PHASE 4)
// -------------------------------------------------------------------
let audioContext = null;
let audioInputProcess = null;
let userAudioStream = null;

// Playback queue variables
let playbackContext = null;
let nextPlaybackTime = 0;

async function startAudioStream() {
    try {
        // 1. Get User Microphone
        userAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 2. Initialize AudioContext at 16000Hz (Native Gemini Input Rate)
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        await audioContext.resume();

        // 3. Create graph: MediaStream -> Processor
        const source = audioContext.createMediaStreamSource(userAudioStream);
        
        // Use ScriptProcessor for MVP simplicity (deprecated but widespread support)
        // Buffer size 4096 is a good balance for latency vs performance
        audioInputProcess = audioContext.createScriptProcessor(4096, 1, 1);
        
        audioInputProcess.onaudioprocess = (e) => {
            if (!buddySocket || buddySocket.readyState !== WebSocket.OPEN) return;
            
            // Get Float32 array from microphone
            const float32Data = e.inputBuffer.getChannelData(0);
            
            // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
            const int16Buffer = new Int16Array(float32Data.length);
            for (let i = 0; i < float32Data.length; i++) {
                let s = Math.max(-1, Math.min(1, float32Data[i]));
                int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Ensure little-endian 
            const uint8Data = new Uint8Array(int16Buffer.buffer);
            
            // Fast Binary Sending
            const payload = new Uint8Array(uint8Data.byteLength + 1);
            payload[0] = 1; // Marker 1 for Audio
            payload.set(uint8Data, 1);
            
            if (buddySocket && buddySocket.readyState === WebSocket.OPEN) {
                buddySocket.send(payload);
            }
        };

        // Connect the nodes (Processor must connect to destination to work in Chrome, but we mute it)
        source.connect(audioInputProcess);
        audioInputProcess.connect(audioContext.destination);
        
        // Setup Playback Context for Agent Audio (Gemini outputs 24000Hz PCM)
        playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        await playbackContext.resume();
        nextPlaybackTime = playbackContext.currentTime;
        console.log("🎤 Audio capture and playback initialized.");
        
        const micIndicator = document.getElementById('mic-indicator');
        if (micIndicator) micIndicator.style.display = 'inline-block';

    } catch (err) {
        console.error("Failed to start audio stream:", err);
    }
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

// Playback Agent PCM chunks
function playAgentAudio(base64PcmString) {
    if (!playbackContext) return;

    try {
        // Decode Base64 to binary
        const binaryString = window.atob(base64PcmString);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Convert Int16 little-endian to Float32
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        // Create an AudioBuffer (1 channel, 24kHz)
        const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        // Schedule playback
        const source = playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(playbackContext.destination);

        // Ensure we don't schedule in the past
        if (nextPlaybackTime < playbackContext.currentTime) {
            nextPlaybackTime = playbackContext.currentTime;
        }

        source.start(nextPlaybackTime);
        // Advance the time block by the duration of this buffer
        nextPlaybackTime += audioBuffer.duration;

    } catch (e) {
        console.error("Error playing agent audio:", e);
    }
}

// Event Listeners
btnConnectBuddy.addEventListener('click', connectBuddy);
btnSendBuddy.addEventListener('click', sendTestMessage);
buddyChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTestMessage();
});
