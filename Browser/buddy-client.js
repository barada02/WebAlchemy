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
        }
    };

    buddySocket.onclose = () => {
        console.log('Disconnected from AI Buddy');
        buddyStatus.textContent = 'Disconnected';
        buddyStatus.className = 'status-disconnected';
        btnConnectBuddy.textContent = 'Connect AI Buddy';
        btnConnectBuddy.style.background = '#4CAF50';
        
        // Disable chat inputs
        buddyChatInput.disabled = true;
        btnSendBuddy.disabled = true;
        
        // Stop streaming
        stopVideoStream();
        
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
const FPS_TARGET = 2; // Keep it low for MVP / testing

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

        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: false, // Phase 4 will handle audio
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
    
    // Limit resolution to save bandwidth
    canvas.width = 1280;
    canvas.height = 720;

    captureInterval = setInterval(() => {
        if (!videoElement || !buddySocket || buddySocket.readyState !== WebSocket.OPEN) return;

        // Draw video frame to canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Get Base64 JPEG (Quality 0.7)
        const base64Jpeg = canvas.toDataURL('image/jpeg', 0.7);
        
        // Extract raw base64 payload
        const rawBase64 = base64Jpeg.split(',')[1];
        
        buddySocket.send(JSON.stringify({
            type: 'video_frame',
            data: rawBase64
        }));
        
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

// Event Listeners
btnConnectBuddy.addEventListener('click', connectBuddy);
btnSendBuddy.addEventListener('click', sendTestMessage);
buddyChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTestMessage();
});
