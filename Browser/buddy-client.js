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

    buddySocket.onopen = () => {
        console.log('Connected to AI Buddy (Python Backend)');
        buddyStatus.textContent = 'Connected';
        buddyStatus.className = 'status-connected';
        btnConnectBuddy.textContent = 'Disconnect AI Buddy';
        btnConnectBuddy.style.background = '#f44336';
        
        // Enable chat inputs for echo test
        buddyChatInput.disabled = false;
        btnSendBuddy.disabled = false;
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
            buddySocket.send(message);
            buddyChatInput.value = '';
        }
    }
}

// Event Listeners
btnConnectBuddy.addEventListener('click', connectBuddy);
btnSendBuddy.addEventListener('click', sendTestMessage);
buddyChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTestMessage();
});
