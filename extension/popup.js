let recordingState = 'idle';

const recordBtn = document.getElementById('record-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const statusBadge = document.getElementById('status-badge');
const eventCountSpan = document.getElementById('event-count');
const languageSelect = document.getElementById('language-select');
const locatorStrategySelect = document.getElementById('locator-strategy');

// Load initial state
chrome.storage.local.get(['recordingState', 'events', 'locatorStrategy'], (result) => {
  if (result.recordingState) {
    recordingState = result.recordingState;
    updateUI();
  }
  if (result.events) {
    eventCountSpan.textContent = result.events.length;
    if (result.events.length > 0 && recordingState === 'idle') {
      downloadBtn.disabled = false;
    }
  }
  if (result.locatorStrategy) {
    locatorStrategySelect.value = result.locatorStrategy;
  }
});

// Update UI based on state
function updateUI() {
  statusBadge.textContent = recordingState;
  statusBadge.className = `badge ${recordingState}`;

  if (recordingState === 'recording') {
    recordBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    downloadBtn.disabled = true;
  } else if (recordingState === 'paused') {
    recordBtn.disabled = false;
    recordBtn.innerHTML = '<span>⏺</span> Resume';
    pauseBtn.disabled = true;
    stopBtn.disabled = false;
    downloadBtn.disabled = true;
  } else {
    recordBtn.disabled = false;
    recordBtn.innerHTML = '<span>⏺</span> Record';
    pauseBtn.disabled = true;
    stopBtn.disabled = true;

    chrome.storage.local.get(['events'], (res) => {
      downloadBtn.disabled = !res.events || res.events.length === 0;
    });
  }
}

recordBtn.addEventListener('click', () => {
  recordingState = 'recording';
  chrome.storage.local.set({ recordingState });
  chrome.runtime.sendMessage({ action: 'startRecording' });
  updateUI();
});

pauseBtn.addEventListener('click', () => {
  recordingState = 'paused';
  chrome.storage.local.set({ recordingState });
  chrome.runtime.sendMessage({ action: 'pauseRecording' });
  updateUI();
});

stopBtn.addEventListener('click', () => {
  recordingState = 'idle';
  chrome.storage.local.set({ recordingState });
  chrome.runtime.sendMessage({ action: 'stopRecording' });
  updateUI();
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.set({ events: [], recordingState: 'idle' }, () => {
    recordingState = 'idle';
    eventCountSpan.textContent = '0';
    updateUI();
  });
});

downloadBtn.addEventListener('click', () => {
  const language = languageSelect.value;
  const strategy = locatorStrategySelect.value;
  chrome.runtime.sendMessage({ action: 'generateCode', language, strategy });
});

locatorStrategySelect.addEventListener('change', () => {
  chrome.storage.local.set({ locatorStrategy: locatorStrategySelect.value });
});

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateEventCount') {
    eventCountSpan.textContent = message.count;
  }
});
