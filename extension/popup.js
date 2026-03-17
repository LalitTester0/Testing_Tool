import { generateAssertion } from './assertion_service.js';

let recordingState = 'idle';
let pendingAIRequests = 0;
let recordedEvents = [];
let assertions = [];

const recordBtn = document.getElementById('record-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const downloadBtn = document.getElementById('download-btn');
const downloadPomBtn = document.getElementById('download-pom-btn');
const clearBtn = document.getElementById('clear-btn');
const statusBadge = document.getElementById('status-badge');
const eventCountSpan = document.getElementById('event-count');
const languageSelect = document.getElementById('language-select');
const locatorStrategySelect = document.getElementById('locator-strategy');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const toggleIcon = document.getElementById('toggle-icon');
const aiStatusSpan = document.getElementById('ai-status');

// Assertion UI Elements
const assertionStepSelect = document.getElementById('assertion-step-select');
const assertionInput = document.getElementById('assertion-input');
const generateAssertionBtn = document.getElementById('generate-assertion-btn');
const assertionsList = document.getElementById('assertions-list');

// Load initial state
chrome.storage.local.get(['recordingState', 'events', 'locatorStrategy', 'apiKey', 'assertions'], (result) => {
  if (result.recordingState) {
    recordingState = result.recordingState;
    updateUI();
  }
  if (result.events) {
    recordedEvents = result.events;
    eventCountSpan.textContent = result.events.length;
    if (result.events.length > 0 && recordingState === 'idle') {
      downloadBtn.disabled = false;
    }
    updateAssertionControls();
  }
  if (result.assertions) {
    assertions = result.assertions;
    renderAssertions();
  }
  if (result.locatorStrategy) {
    locatorStrategySelect.value = result.locatorStrategy;
  }
  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
    updateAiStatus(true);
  } else {
    updateAiStatus(false);
  }

  // Fetch initial AI status
  chrome.runtime.sendMessage({ action: 'getAIStatus' }, (response) => {
    if (response && typeof response.pendingCount === 'number') {
      pendingAIRequests = response.pendingCount;
      updateUI();
    }
  });
});

function updateAiStatus(isLive) {
  if (isLive) {
    aiStatusSpan.textContent = '● AI Live';
    aiStatusSpan.style.color = '#2ecc71';
  } else {
    aiStatusSpan.textContent = '○ AI Offline';
    aiStatusSpan.style.color = '#888';
  }
}

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
      const hasEvents = res.events && res.events.length > 0;
      if (pendingAIRequests > 0) {
        downloadBtn.disabled = true;
        downloadBtn.textContent = `Processing AI (${pendingAIRequests})...`;
        downloadPomBtn.disabled = true;
        downloadPomBtn.textContent = `Processing AI...`;
      } else {
        downloadBtn.disabled = !hasEvents;
        downloadBtn.textContent = 'Download Script';
        downloadPomBtn.disabled = !hasEvents;
        downloadPomBtn.textContent = 'Download POM (Multi-file)';
      }
    });
  }
  updateAssertionControls();
}

function updateAssertionControls() {
  const hasEvents = recordedEvents && recordedEvents.length > 0;

  assertionStepSelect.disabled = !hasEvents;
  assertionInput.disabled = !hasEvents;
  generateAssertionBtn.disabled = !hasEvents || !assertionInput.value.trim();

  // Populate dropdown
  if (hasEvents) {
    const currentValue = assertionStepSelect.value;
    assertionStepSelect.innerHTML = '<option value="">Select a step...</option>';
    recordedEvents.forEach((event, index) => {
      const option = document.createElement('option');
      option.value = index;

      let label = `${index + 1}. ${event.type.toUpperCase()}`;
      if (event.text) label += `: "${event.text.substring(0, 15)}..."`;
      else if (event.locators?.xpath) label += `: ${event.locators.xpath.substring(0, 15)}...`;

      option.textContent = label;
      assertionStepSelect.appendChild(option);
    });
    if (currentValue && currentValue < recordedEvents.length) {
      assertionStepSelect.value = currentValue;
    }
  } else {
    assertionStepSelect.innerHTML = '<option value="">No steps recorded yet</option>';
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
  chrome.storage.local.set({ events: [], assertions: [], recordingState: 'idle' }, () => {
    recordingState = 'idle';
    recordedEvents = [];
    assertions = [];
    eventCountSpan.textContent = '0';
    updateUI();
    renderAssertions();
  });
});

downloadBtn.addEventListener('click', () => {
  const language = languageSelect.value;
  const strategy = locatorStrategySelect.value;
  chrome.runtime.sendMessage({ action: 'generateCode', language, strategy });
});

downloadPomBtn.addEventListener('click', () => {
  downloadPomBtn.disabled = true;
  downloadPomBtn.textContent = 'Generating POM...';
  chrome.runtime.sendMessage({
    action: 'generatePOM',
    language: languageSelect.value,
    strategy: locatorStrategySelect.value
  });
});

locatorStrategySelect.addEventListener('change', () => {
  chrome.storage.local.set({ locatorStrategy: locatorStrategySelect.value });
});

// Assertion Handlers
assertionInput.addEventListener('input', () => {
  generateAssertionBtn.disabled = !assertionInput.value.trim() || !recordedEvents.length;
});

generateAssertionBtn.addEventListener('click', async () => {
  console.log('=== ASSERTION GENERATION STARTED ===');
  const text = assertionInput.value.trim();
  const stepIndex = assertionStepSelect.value;

  console.log('User input:', text);
  console.log('Selected step index:', stepIndex);

  if (!text) {
    console.warn('No text entered, aborting');
    return;
  }

  generateAssertionBtn.disabled = true;
  generateAssertionBtn.textContent = 'Generating...';
  console.log('Button disabled, calling generateAssertion...');

  try {
    const selectedEvent = stepIndex !== "" ? recordedEvents[parseInt(stepIndex)] : null;
    const language = languageSelect.value;

    console.log('Language:', language);
    console.log('Selected event:', selectedEvent);

    const generatedCode = await generateAssertion(text, {
      language: language,
      selectedEvent: selectedEvent
    });

    if (generatedCode) {
      const newAssertion = {
        id: Date.now().toString(),
        stepIndex: stepIndex !== "" ? parseInt(stepIndex) : -1,
        userInput: text,
        generatedCode: generatedCode,
        language: language
      };

      assertions.push(newAssertion);
      chrome.storage.local.set({ assertions });
      renderAssertions();
      assertionInput.value = '';
    } else {
      // Check if API key exists
      chrome.storage.local.get(['apiKey'], (result) => {
        if (!result.apiKey) {
          alert('Failed to generate assertion. Please check your API key.');
        } else {
          alert('Failed to generate assertion. The AI service may be unavailable. Check browser console for details.');
        }
      });
    }
  } catch (error) {
    console.error('Assertion generation error:', error);
    alert('Error generating assertion: ' + error.message);
  } finally {
    generateAssertionBtn.disabled = false;
    generateAssertionBtn.textContent = 'Generate Assertion';
  }
});

function renderAssertions() {
  if (assertions.length === 0) {
    assertionsList.innerHTML = '<div class="no-assertions">No assertions added yet</div>';
    return;
  }

  assertionsList.innerHTML = '';
  assertions.forEach((assertion, index) => {
    const item = document.createElement('div');
    item.className = 'assertion-item';

    const stepLabel = assertion.stepIndex !== -1
      ? `Step ${assertion.stepIndex + 1}`
      : 'General Assertion';

    item.innerHTML = `
      <div class="assertion-item-header">
        <span class="assertion-step-label">${stepLabel}</span>
        <div class="assertion-actions">
          <button class="delete-btn" data-id="${assertion.id}">🗑️</button>
        </div>
      </div>
      <div class="assertion-user-input">"${assertion.userInput}"</div>
      <div class="assertion-code">${assertion.generatedCode}</div>
    `;

    item.querySelector('.delete-btn').addEventListener('click', () => {
      assertions = assertions.filter(a => a.id !== assertion.id);
      chrome.storage.local.set({ assertions });
      renderAssertions();
    });

    assertionsList.appendChild(item);
  });
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateEventCount') {
    eventCountSpan.textContent = message.count;
    chrome.storage.local.get(['events'], (res) => {
      recordedEvents = res.events || [];
      updateUI();
    });
  } else if (message.action === 'aiStatusUpdate') {
    pendingAIRequests = message.pendingCount;
    updateUI();
  } else if (message.action === 'pomReady') {
    downloadPomBtn.textContent = 'Download POM (Multi-file)';
    downloadPomBtn.disabled = false;
    alert(`Successfully generated POM structure: ${message.fileCount} files downloaded.`);
  } else if (message.action === 'pomError') {
    downloadPomBtn.textContent = 'Download POM (Multi-file)';
    downloadPomBtn.disabled = false;
    alert(`POM Generation Error: ${message.message}`);
  }
});

// Settings Logic
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('active');
  toggleIcon.textContent = settingsPanel.classList.contains('active') ? '▲' : '▼';
});

saveSettingsBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  chrome.storage.local.set({ apiKey }, () => {
    alert('Settings saved successfully!');
    updateAiStatus(!!apiKey);
    settingsPanel.classList.remove('active');
    toggleIcon.textContent = '▼';
  });
});
