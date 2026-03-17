import { getRefinedXPath, getPageClassName } from './ai_service.js';
import { generateJavaPOMClass, generateJavaTestRunner, generatePythonPOMClass, generatePythonTestRunner } from './pom_generator.js';

let events = [];
let isRecording = false;
let networkLog = [];
// Store requests that happen shortly after an even
let correlatedRequests = {};
let pendingAIRequests = 0;

// Page Detection State (for POM Generation)
let pages = [];
let currentPageId = null;
let pageCounter = 0;

// Setup network listener
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (isRecording) {
            // Filter out internal AI calls to prevent them appearing in generated scripts
            if (details.url.includes('generativelanguage.googleapis.com')) {
                return;
            }

            // Filter irrelevant types
            if (details.type === 'xmlhttprequest' || details.type === 'fetch' || details.method !== 'GET') {
                console.log('API Captured:', details.method, details.url, 'Timeout:', Date.now());
                // Store request details
                const reqData = {
                    requestId: details.requestId,
                    url: details.url,
                    method: details.method,
                    timestamp: Date.now()
                };

                // Capture Request Body if present
                if (details.requestBody) {
                    if (details.requestBody.raw && details.requestBody.raw[0]) {
                        try {
                            const decoder = new TextDecoder("utf-8");
                            const raw = details.requestBody.raw[0].bytes;
                            reqData.body = decoder.decode(raw);
                        } catch (e) { console.error('Error decoding body', e); }
                    } else if (details.requestBody.formData) {
                        reqData.body = JSON.stringify(details.requestBody.formData);
                    }
                }

                networkLog.push(reqData);
            }
        }
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (isRecording) {
            // Find matching request in log
            const req = networkLog.find(r => r.requestId === details.requestId);
            if (req) {
                req.statusCode = details.statusCode;
                // console.log('API Completed:', req.url, req.statusCode);
            }
        }
    },
    { urls: ["<all_urls>"] }
);

// Synchronize state with storage
function syncState() {
    chrome.storage.local.get(['events', 'recordingState'], (result) => {
        events = result.events || [];
        isRecording = result.recordingState === 'recording';
        console.log('State synced:', { isRecording, eventCount: events.length });
    });
}

syncState();

// Listen for storage changes to keep state in sync
chrome.storage.onChanged.addListener((changes) => {
    if (changes.recordingState) {
        isRecording = changes.recordingState.newValue === 'recording';
        console.log('isRecording changed:', isRecording);
    }
    if (changes.events) {
        events = changes.events.newValue || [];
    }
});

// Page Detection Function (async - resolves AI class name in background)
async function detectPageChange(url, title) {
    // First page of the session
    if (pages.length === 0) {
        const pageId = `page_${pageCounter++}`;
        const pageEntry = {
            id: pageId,
            url: url,
            title: title || 'Untitled Page',
            className: null,  // Will be set by AI after detection
            timestamp: Date.now()
        };
        pages.push(pageEntry);
        currentPageId = pageId;
        console.log(`📄 New Page Detected: ${pageId} - ${title || url}`);

        // Resolve class name asynchronously - doesn't block recording
        getPageClassName(url, title || 'Untitled Page').then(name => {
            pageEntry.className = name;
            chrome.storage.local.set({ pages: pages });
            console.log(`🏷️ Page Class Name: ${name} (for ${pageId})`);
        });

        return pageId;
    }

    const lastPage = pages[pages.length - 1];

    try {
        // Extract pathname (ignore query params and hash)
        const currentPath = new URL(url).pathname;
        const lastPath = new URL(lastPage.url).pathname;

        // Same page if paths match
        if (currentPath === lastPath) {
            return currentPageId;
        }

        // Different page - create new entry
        const pageId = `page_${pageCounter++}`;
        const pageEntry = {
            id: pageId,
            url: url,
            title: title || 'Untitled Page',
            className: null,  // Will be set by AI after detection
            timestamp: Date.now()
        };
        pages.push(pageEntry);
        currentPageId = pageId;
        console.log(`📄 Page Transition: ${lastPage.id} → ${pageId}`);
        console.log(`   From: ${lastPage.className || lastPage.title}`);
        console.log(`   To: ${title || url}`);

        // Resolve class name asynchronously
        getPageClassName(url, title || 'Untitled Page').then(name => {
            pageEntry.className = name;
            chrome.storage.local.set({ pages: pages });
            console.log(`🏷️ Page Class Name: ${name} (for ${pageId})`);
        });

        return pageId;
    } catch (e) {
        console.error('Error parsing URL for page detection:', e);
        return currentPageId || 'page_0';
    }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('Background received message:', message.action);
    switch (message.action) {
        case 'startRecording':
            isRecording = true;
            networkLog = []; // Reset logs for new session
            correlatedRequests = {};
            pages = []; // Reset page tracking
            currentPageId = null;
            pageCounter = 0;
            console.log('Recording started. Network log and page tracking cleared.');
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                    chrome.storage.local.set({
                        recordingState: 'recording',
                        initialUrl: tabs[0].url,
                        pages: [],
                        pageCounter: 0
                    });
                } else {
                    chrome.storage.local.set({ recordingState: 'recording', pages: [], pageCounter: 0 });
                }
            });
            break;
        case 'pauseRecording':
            isRecording = false;
            chrome.storage.local.set({ recordingState: 'paused' });
            break;
        case 'stopRecording':
            isRecording = false;
            chrome.storage.local.set({ recordingState: 'idle', pages: pages });
            console.log(`Recording stopped. Captured ${pages.length} page(s).`);
            break;
        case 'getAIStatus':
            sendResponse({ pendingCount: pendingAIRequests });
            break;
        case 'recordEvent':
            if (isRecording) {
                const event = message.event;

                // Page Detection: Add page ID to event
                const pageTitle = event.stateChange?.post?.title || 'Untitled Page';
                const pageId = await detectPageChange(event.url, pageTitle);
                event.pageId = pageId;

                events.push(event);

                console.log('Processing Event:', event.type, 'Timestamp:', event.timestamp, 'Page:', pageId);

                // --- AI Refinement & Validation Loop ---
                if (event.locators && event.locators.aiContext) {
                    pendingAIRequests++;
                    notifyAIStatus();
                    processAIXPath(event, sender.tab.id);
                } else {
                    // If no AI processing, save immediately
                    chrome.storage.local.set({ events });
                    // Notify popup if it's open
                    chrome.runtime.sendMessage({ action: 'updateEventCount', count: events.length }).catch(() => { });
                }
            }
            break;
        case 'generateCode':
            generateAndDownload(message.language, message.strategy);
            break;
        case 'generatePOM':
            generateAndDownloadPOM(message.language, message.strategy);
            break;
    }
});

async function processAIXPath(event, tabId) {
    try {
        // 1. Refine XPath
        const aiXPath = await getRefinedXPath(event.locators.aiContext);
        if (aiXPath) {
            const response = await chrome.tabs.sendMessage(tabId, { action: 'validateXPath', xpath: aiXPath });
            if (response && response.matchCount === 1) {
                console.log('✅ AI REFINEMENT SUCCESS:', aiXPath);
                // Store in dedicated field to give it priority in code generation
                event.locators.aiXPath = aiXPath;
                console.log('📦 STORED aiXPath in event.locators:', event.locators);
            } else {
                console.log('⚠️ AI SUGGESTION REJECTED (Non-unique or invalid). Using Heuristic.');
            }
        } else {
            console.log('ℹ️ AI Bypassed (using heuristics).');
        }

        // AI-based assertions have been disabled - AI is now only used for XPath generation
        // Assertions can be added manually if needed


        chrome.storage.local.set({ events });
        // Notify popup if it's open
        chrome.runtime.sendMessage({ action: 'updateEventCount', count: events.length }).catch(() => { });
    } catch (e) {
        console.error('Error in AI processing loop:', e);
        // Even if AI fails, save the event and notify
        chrome.storage.local.set({ events });
        chrome.runtime.sendMessage({ action: 'updateEventCount', count: events.length }).catch(() => { });
    } finally {
        pendingAIRequests = Math.max(0, pendingAIRequests - 1);
        notifyAIStatus();
    }
}

function notifyAIStatus() {
    chrome.runtime.sendMessage({ action: 'aiStatusUpdate', pendingCount: pendingAIRequests }).catch(() => { });
}

function generateAndDownload(language, strategy = 'smart') {
    // We'll implement the actual generator logic in a separate file or inline here for Phase 1
    // For now, let's just trigger a placeholder download
    chrome.storage.local.get(['events', 'initialUrl'], (result) => {
        let recordedEvents = result.events || [];
        const initialUrl = result.initialUrl || 'https://example.com';

        if (recordedEvents.length === 0 && !initialUrl) return;

        // Perform Late Binding Correlation here
        // This ensures strictly that we check ALL network logs against ALL events
        // after the fact, so timing race conditions are irrelevant.
        chrome.storage.local.get(['events', 'initialUrl', 'assertions', 'pages'], (result) => {
            let recordedEvents = result.events || [];
            const initialUrl = result.initialUrl || 'https://example.com';
            const assertions = result.assertions || [];
            const sessionPages = result.pages || [];

            if (recordedEvents.length === 0 && !initialUrl) return;

            recordedEvents = recordedEvents.map(event => {
                const matchedReqs = networkLog.filter(req =>
                    req.timestamp >= event.timestamp - 500 && // 500ms before
                    req.timestamp <= event.timestamp + 5000   // 5s after (generous window)
                );
                if (matchedReqs.length > 0) {
                    return { ...event, apiCalls: matchedReqs };
                }
                return event;
            });

            let code = "";
            let fileName = "";

            if (language === 'java') {
                code = generateJavaCode(recordedEvents, initialUrl, strategy, assertions, sessionPages);
                fileName = "GeneratedTest.java";
            } else {
                code = generatePythonCode(recordedEvents, initialUrl, strategy, assertions, sessionPages);
                fileName = "test_generated.py";
            }

            const blob = new Blob([code], { type: 'text/plain' });
            const reader = new FileReader();
            reader.onload = function () {
                chrome.downloads.download({
                    url: reader.result,
                    filename: fileName
                });
            };
            reader.readAsDataURL(blob);
        });
    });
}

/**
 * Generates Page Object Model files and downloads them one by one.
 * For Java: one .java file per page + GeneratedPOMTest.java
 * For Python: one .py file per page + test_generated_pom.py
 */
function generateAndDownloadPOM(language = 'java', strategy = 'smart') {
    chrome.storage.local.get(['events', 'initialUrl', 'pages'], (result) => {
        const recordedEvents = result.events || [];
        const initialUrl = result.initialUrl || 'https://example.com';
        const sessionPages = result.pages || [];

        if (sessionPages.length === 0) {
            console.warn('[POM] No pages detected. Record a session first.');
            chrome.runtime.sendMessage({ action: 'pomError', message: 'No pages detected in this session. Please record a multi-page flow first.' }).catch(() => { });
            return;
        }

        console.log(`[POM] Generating POM for ${sessionPages.length} page(s) in ${language}...`);
        const filesToDownload = [];

        if (language === 'java') {
            // One class file per page
            sessionPages.forEach(page => {
                const pageEvents = recordedEvents.filter(e => e.pageId === page.id);
                const code = generateJavaPOMClass(page, pageEvents, strategy);
                const fname = `${page.className || 'BasePage'}.java`;
                filesToDownload.push({ name: fname, content: code });
            });
            // Test runner
            const runner = generateJavaTestRunner(sessionPages, recordedEvents, initialUrl, strategy);
            filesToDownload.push({ name: 'GeneratedPOMTest.java', content: runner });
        } else {
            // One module file per page
            sessionPages.forEach(page => {
                const pageEvents = recordedEvents.filter(e => e.pageId === page.id);
                const code = generatePythonPOMClass(page, pageEvents, strategy);
                const cls = page.className || 'BasePage';
                const fname = cls.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') + '.py';
                filesToDownload.push({ name: fname, content: code });
            });
            // Test runner
            const runner = generatePythonTestRunner(sessionPages, recordedEvents, initialUrl, strategy);
            filesToDownload.push({ name: 'test_generated_pom.py', content: runner });
        }

        // Trigger downloads sequentially with a small delay
        filesToDownload.forEach((file, index) => {
            setTimeout(() => {
                const blob = new Blob([file.content], { type: 'text/plain' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    chrome.downloads.download({ url: reader.result, filename: file.name, saveAs: false });
                };
                reader.readAsDataURL(blob);
                console.log(`[POM] Downloading: ${file.name}`);
            }, index * 400); // 400ms gap between files
        });

        chrome.runtime.sendMessage({
            action: 'pomReady',
            fileCount: filesToDownload.length,
            fileNames: filesToDownload.map(f => f.name)
        }).catch(() => { });
    });
}

const restAssuredImports = `
import static io.restassured.RestAssured.*;
import static org.hamcrest.Matchers.*;
import io.restassured.http.ContentType;`;

function generateJavaCode(events, initialUrl, strategy, assertions = [], pages = []) {
    let uiSteps = [];
    let apiSteps = [];

    // Group events by page for future POM generation
    const eventsByPage = events.reduce((acc, event) => {
        const pageId = event.pageId || 'page_0';
        if (!acc[pageId]) acc[pageId] = [];
        acc[pageId].push(event);
        return acc;
    }, {});

    // Iterate page-by-page, inserting boundary comments with AI class names
    Object.entries(eventsByPage).forEach(([pageId, pageEvents]) => {
        const page = pages.find(p => p.id === pageId);
        const className = page?.className || null;
        const pageTitle = page?.title || 'Unknown Page';
        const pageUrl = page?.url || '';

        uiSteps.push(`\n        // ================================================`);
        uiSteps.push(`        // Page: ${pageTitle}`);
        if (className) uiSteps.push(`        // Page Object: ${className}`);
        if (pageUrl) uiSteps.push(`        // URL: ${pageUrl}`);
        uiSteps.push(`        // ================================================`);

        pageEvents.forEach((event) => {
            const globalIndex = events.indexOf(event);
            console.log('🔍 CODE GEN - Event locators:', event.locators);
            const locator = getBestLocator(event.locators, strategy);
            const isAiRefined = event.locators && event.locators.aiXPath;
            console.log('🏷️ CODE GEN - Selected locator:', locator, '| Has aiXPath:', !!isAiRefined);

            // Generate UI Step
            let stepCode = "";
            if (event.type === 'click') {
                stepCode = `        ${isAiRefined ? '// AI-Refined Locator\n        ' : ''}driver.findElement(${locator}).click();`;
            } else if (event.type === 'input') {
                stepCode = `        ${isAiRefined ? '// AI-Refined Locator\n        ' : ''}driver.findElement(${locator}).sendKeys("${event.value}");`;
            } else if (event.type === 'change') {
                stepCode = `        ${isAiRefined ? '// AI-Refined Locator\n        ' : ''}new Select(driver.findElement(${locator})).selectByVisibleText("${event.value}");`;
            } else {
                stepCode = `        // Action: ${event.type} on ${locator}`;
            }

            uiSteps.push(stepCode);

            // Assertions for this step
            const stepAssertions = assertions.filter(a => a.stepIndex === globalIndex);
            stepAssertions.forEach(assertion => {
                uiSteps.push(`        // AI Assertion: ${assertion.userInput}\n        ${assertion.generatedCode}`);
            });

            // Collect API Validation Logic
            if (event.apiCalls && event.apiCalls.length > 0) {
                event.apiCalls.forEach(api => {
                    let apiBlock = `
        // API Validation for: ${api.method} ${api.url}`;

                    // Add Body if present
                    if (api.body) {
                        // Simple check if it's JSON to set ContentType
                        const isJson = api.body.trim().startsWith('{') || api.body.trim().startsWith('[');
                        const escapedBody = api.body.replace(/"/g, '\\"');

                        apiBlock += `
        String requestBody${api.requestId} = "${escapedBody}";
        given()
            .baseUri("${new URL(api.url).origin}")
            ${isJson ? '.contentType(ContentType.JSON)\n            .accept(ContentType.JSON)' : ''}
            .body(requestBody${api.requestId})
        .when()
            .${api.method.toLowerCase()}("${new URL(api.url).pathname}")
        .then()
            .statusCode(${api.statusCode || 200});`;
                    } else {
                        apiBlock += `
        given()
            .baseUri("${new URL(api.url).origin}")
        .when()
            .${api.method.toLowerCase()}("${new URL(api.url).pathname}")
        .then()
            .statusCode(${api.statusCode || 200});`;
                    }
                    apiSteps.push(apiBlock);
                });
            }
        });  // end pageEvents.forEach
    });  // end eventsByPage.forEach

    // Add general assertions (those not linked to a specific step)
    const generalAssertions = assertions.filter(a => a.stepIndex === -1);
    if (generalAssertions.length > 0) {
        uiSteps.push("\n        // --- General Assertions ---");
        generalAssertions.forEach(assertion => {
            uiSteps.push(`        // AI Assertion: ${assertion.userInput}\n        ${assertion.generatedCode}`);
        });
    }

    return `
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;
import org.testng.annotations.Test;
import org.testng.Assert;
import static org.testng.Assert.*;
import io.github.bonigarcia.wdm.WebDriverManager;
${restAssuredImports}

public class GeneratedTest {
    @Test
    public void testFlow() {
        WebDriverManager.chromedriver().setup();
        WebDriver driver = new ChromeDriver();
        driver.manage().window().maximize();
        
        try {
            driver.get("${initialUrl}");

            // --- UI Interactions ---
${uiSteps.join('\n')}

            // --- API Verifications ---
            // Validating backend calls triggered by above actions
${apiSteps.join('\n')}

        } finally {
            driver.quit();
        }
    }
}
`;
}

function generatePythonCode(events, initialUrl, strategy, assertions = [], pages = []) {
    let steps = [];

    // Group events by page for future POM generation
    const eventsByPage = events.reduce((acc, event) => {
        const pageId = event.pageId || 'page_0';
        if (!acc[pageId]) acc[pageId] = [];
        acc[pageId].push(event);
        return acc;
    }, {});

    // Iterate page-by-page, inserting boundary comments with AI class names
    Object.entries(eventsByPage).forEach(([pageId, pageEvents]) => {
        const page = pages.find(p => p.id === pageId);
        const className = page?.className || null;
        const pageTitle = page?.title || 'Unknown Page';
        const pageUrl = page?.url || '';

        steps.push(`\n    # ================================================`);
        steps.push(`    # Page: ${pageTitle}`);
        if (className) steps.push(`    # Page Object: ${className}`);
        if (pageUrl) steps.push(`    # URL: ${pageUrl}`);
        steps.push(`    # ================================================`);

        pageEvents.forEach((event) => {
            const globalIndex = events.indexOf(event);
            const locator = getBestLocatorPython(event.locators, strategy);
            const isAiRefined = event.locators && event.locators.aiXPath;
            let stepCode = "";

            if (event.type === 'click') {
                stepCode = `    ${isAiRefined ? '# AI-Refined Locator\n    ' : ''}driver.find_element(${locator}).click()`;
            } else if (event.type === 'input') {
                stepCode = `    ${isAiRefined ? '# AI-Refined Locator\n    ' : ''}driver.find_element(${locator}).send_keys("${event.value}")`;
            } else {
                stepCode = `    # Action: ${event.type} on ${locator}`;
            }

            steps.push(stepCode);

            const stepAssertions = assertions.filter(a => a.stepIndex === globalIndex);
            stepAssertions.forEach(assertion => {
                steps.push(`    # AI Assertion: ${assertion.userInput}\n    ${assertion.generatedCode}`);
            });
        });  // end pageEvents.forEach
    });  // end eventsByPage.forEach

    // Add general assertions
    const generalAssertions = assertions.filter(a => a.stepIndex === -1);
    if (generalAssertions.length > 0) {
        steps.push("\n    # --- General Assertions ---");
        generalAssertions.forEach(assertion => {
            steps.push(`    # AI Assertion: ${assertion.userInput}\n    ${assertion.generatedCode}`);
        });
    }

    const stepsCode = steps.join('\n');

    return `
from selenium import webdriver
from selenium.webdriver.common.by import By
import pytest

def test_flow():
    driver = webdriver.Chrome()
    driver.maximize_window()
    
    try:
        driver.get("${initialUrl}")
${stepsCode}
    finally:
        driver.quit()
`;
}

function getBestLocator(locators, strategy) {
    const esc = (s) => s ? s.replace(/"/g, '\\"') : '';

    // PRIORITY 1: AI-Refined XPath (takes precedence over all heuristics)
    if (locators.aiXPath) {
        return `By.xpath("${esc(locators.aiXPath)}")`;
    }

    // Strategy: 'xpath', 'css', 'smart' (default)
    if (strategy === 'xpath' && locators.xpath) {
        return `By.xpath("${esc(locators.xpath)}")`;
    }

    if (strategy === 'css') {
        if (locators.css) return `By.cssSelector("${esc(locators.css)}")`;
        // Fallback for css strategy if no CSS found (rare)
        if (locators.id) return `By.id("${esc(locators.id)}")`;
    }

    // Smart / Default priority
    if (locators.id) return `By.id("${esc(locators.id)}")`;
    if (locators.name) return `By.name("${esc(locators.name)}")`;
    if (locators.dataTest) return `By.cssSelector("[data-test='${esc(locators.dataTest)}']")`;
    if (locators.css) return `By.cssSelector("${esc(locators.css)}")`;
    return `By.xpath("${esc(locators.xpath)}")`;
}

function getBestLocatorPython(locators, strategy) {
    const esc = (s) => s ? s.replace(/"/g, '\\"') : '';

    // PRIORITY 1: AI-Refined XPath (takes precedence over all heuristics)
    if (locators.aiXPath) {
        return `By.XPATH, "${esc(locators.aiXPath)}"`;
    }

    if (strategy === 'xpath' && locators.xpath) {
        return `By.XPATH, "${esc(locators.xpath)}"`;
    }

    if (strategy === 'css') {
        if (locators.css) return `By.CSS_SELECTOR, "${esc(locators.css)}"`;
        if (locators.id) return `By.ID, "${esc(locators.id)}"`;
    }

    if (locators.id) return `By.ID, "${esc(locators.id)}"`;
    if (locators.name) return `By.NAME, "${esc(locators.name)}"`;
    if (locators.dataTest) return `By.CSS_SELECTOR, "[data-test='${esc(locators.dataTest)}']"`;
    if (locators.css) return `By.CSS_SELECTOR, "${esc(locators.css)}"`;
    return `By.XPATH, "${esc(locators.xpath)}"`;
}
