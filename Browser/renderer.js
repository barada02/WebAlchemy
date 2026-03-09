// DOM Elements
const webview = document.getElementById('webview');
const urlInput = document.getElementById('url-input');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');

// Helper Function: Format URL
function formatUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`;
    }
    return url;
}

// 1. Address Bar Navigation
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const targetUrl = formatUrl(urlInput.value);
        webview.src = targetUrl;

        // Remove focus from input after enter
        urlInput.blur();
    }
});

// Select entire text when clicking on the address bar
urlInput.addEventListener('focus', () => {
    urlInput.select();
});

// 2. Navigation Buttons
btnBack.addEventListener('click', () => {
    if (webview.canGoBack()) {
        webview.goBack();
    }
});

btnForward.addEventListener('click', () => {
    if (webview.canGoForward()) {
        webview.goForward();
    }
});

btnReload.addEventListener('click', () => {
    webview.reload();
});

// 3. Update UI based on Webview state
// Update the address bar when the webview successfully navigates to a new page
webview.addEventListener('did-navigate-in-page', (e) => {
    urlInput.value = e.url;
});

webview.addEventListener('did-navigate', (e) => {
    urlInput.value = e.url;
});

// Update window title based on web page title
webview.addEventListener('page-title-updated', (e) => {
    document.title = `${e.title} - WebAlchemy Browser`;
});

// Log loading events for debugging
webview.addEventListener('did-start-loading', () => {
    console.log('Started loading...');
});

webview.addEventListener('did-stop-loading', () => {
    console.log('Finished loading.');
});

console.log('Renderer process started and UI wired up successfully.');
