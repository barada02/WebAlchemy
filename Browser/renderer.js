// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const btnNewTab = document.getElementById('btn-new-tab');
const webviewsContainer = document.getElementById('webviews-container');
const urlInput = document.getElementById('url-input');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');

// State Management
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

// Helper: Format URL
function formatUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return `https://${url}`;
    }
    return url;
}

// Function: Create a new tab
function createNewTab(initialUrl = 'https://google.com') {
    const tabId = `tab-${tabCounter++}`;

    // 1. Create Webview Element
    const webview = document.createElement('webview');
    webview.id = `webview-${tabId}`;
    webview.setAttribute('src', initialUrl);
    webview.setAttribute('allowpopups', '');
    webviewsContainer.appendChild(webview);

    // 2. Create UI Tab Element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.id = `ui-${tabId}`;

    const tabTitle = document.createElement('span');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = 'Loading...';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close-tab';
    closeBtn.title = 'Close Tab';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    tabElement.appendChild(tabTitle);
    tabElement.appendChild(closeBtn);
    tabsContainer.appendChild(tabElement);

    // 3. Store in State
    tabs.push({
        id: tabId,
        webview: webview,
        ui: tabElement,
        titleEl: tabTitle,
        url: initialUrl
    });

    // 4. Bind Webview Events
    bindWebviewEvents(webview, tabId);

    // 5. Bind UI Tab Events
    tabElement.addEventListener('click', () => switchTab(tabId));
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent trigger tab switch
        closeTab(tabId);
    });

    // Switch to the new tab immediately
    switchTab(tabId);
}

// Function: Bind events to a newly spawned webview
function bindWebviewEvents(webview, tabId) {
    webview.addEventListener('did-navigate-in-page', (e) => updateTabState(tabId, e.url));
    webview.addEventListener('did-navigate', (e) => updateTabState(tabId, e.url));

    webview.addEventListener('page-title-updated', (e) => {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.titleEl.textContent = e.title;
            if (tabId === activeTabId) {
                document.title = `${e.title} - WebAlchemy Browser`;
            }
        }
    });

    webview.addEventListener('did-stop-loading', () => {
        if (tabId === activeTabId) {
            updateNavButtons();
        }
    });
}

// Function: Update internal state when URL changes
function updateTabState(tabId, newUrl) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.url = newUrl;
        if (tabId === activeTabId) {
            urlInput.value = newUrl;
            updateNavButtons();
        }
    }
}

// Function: Switch active tab
function switchTab(tabId) {
    activeTabId = tabId;

    tabs.forEach(tab => {
        if (tab.id === tabId) {
            tab.ui.classList.add('active');
            tab.webview.classList.add('active');
            urlInput.value = tab.url;
            document.title = `${tab.titleEl.textContent} - WebAlchemy Browser`;
        } else {
            tab.ui.classList.remove('active');
            tab.webview.classList.remove('active');
        }
    });

    updateNavButtons();
}

// Function: Close a tab
function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];

    // Remove Elements
    tab.ui.remove();
    tab.webview.remove();

    // Update state
    tabs.splice(tabIndex, 1);

    // Determine new active tab if we closed the currently active one
    if (tabs.length === 0) {
        // App must have at least one tab
        createNewTab();
    } else if (tabId === activeTabId) {
        // Switch to the previous tab or the first one available
        const newActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
        switchTab(tabs[newActiveIndex].id);
    }
}

// Function: Update Navigation Buttons state based on active webview history
function updateNavButtons() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview) {
        // Note: canGoBack/Forward might not be available immediately when webview boots up. Try catch avoids initial errors.
        try {
            btnBack.disabled = !activeTab.webview.canGoBack();
            btnForward.disabled = !activeTab.webview.canGoForward();
        } catch (e) {
            btnBack.disabled = true;
            btnForward.disabled = true;
        }
    }
}

// Global UI Event Listeners
btnNewTab.addEventListener('click', () => createNewTab());

urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            const targetUrl = formatUrl(urlInput.value);
            activeTab.webview.src = targetUrl;
            urlInput.blur();
        }
    }
});

urlInput.addEventListener('focus', () => urlInput.select());

btnBack.addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoBack()) activeTab.webview.goBack();
});

btnForward.addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoForward()) activeTab.webview.goForward();
});

btnReload.addEventListener('click', () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) activeTab.webview.reload();
});

// Initialize first tab
createNewTab();
console.log('Renderer initialized with multi-tab support.');
