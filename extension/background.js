let events = [];
let isRecording = false;
let networkLog = [];
// Store requests that happen shortly after an even
let correlatedRequests = {};

// Setup network listener
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (isRecording) {
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message.action);
    switch (message.action) {
        case 'startRecording':
            isRecording = true;
            networkLog = []; // Reset logs for new session
            correlatedRequests = {};
            console.log('Recording started. Network log cleared.');
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                    chrome.storage.local.set({
                        recordingState: 'recording',
                        initialUrl: tabs[0].url
                    });
                } else {
                    chrome.storage.local.set({ recordingState: 'recording' });
                }
            });
            break;
        case 'pauseRecording':
            isRecording = false;
            chrome.storage.local.set({ recordingState: 'paused' });
            break;
        case 'stopRecording':
            isRecording = false;
            chrome.storage.local.set({ recordingState: 'idle' });
            // Clean up network log when stopped or handle it
            break;
        case 'recordEvent':
            if (isRecording) {
                const event = message.event;
                events.push(event);

                console.log('Processing Event:', event.type, 'Timestamp:', event.timestamp);

                // Note: We defer correlation to the Generation step to ensure we capture
                // API calls that happen slightly AFTER the UI event (race condition fix)

                chrome.storage.local.set({ events });
                // Notify popup if it's open
                chrome.runtime.sendMessage({ action: 'updateEventCount', count: events.length }).catch(() => {
                    // Popup might be closed, ignore error
                });
            } else {
                console.log('Skipping event: not in recording state');
            }
            break;
        case 'generateCode':
            generateAndDownload(message.language, message.strategy);
            break;
    }
});

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
            code = generateJavaCode(recordedEvents, initialUrl, strategy);
            fileName = "GeneratedTest.java";
        } else {
            code = generatePythonCode(recordedEvents, initialUrl, strategy);
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
}

const restAssuredImports = `
import static io.restassured.RestAssured.*;
import static org.hamcrest.Matchers.*;
import io.restassured.http.ContentType;`;

function generateJavaCode(events, initialUrl, strategy) {
    let uiSteps = [];
    let apiSteps = [];

    events.forEach(event => {
        const locator = getBestLocator(event.locators, strategy);

        // Generate UI Step
        if (event.type === 'click') {
            uiSteps.push(`        driver.findElement(${locator}).click();`);
        } else if (event.type === 'input') {
            uiSteps.push(`        driver.findElement(${locator}).sendKeys("${event.value}");`);
        } else if (event.type === 'change') {
            uiSteps.push(`        new Select(driver.findElement(${locator})).selectByVisibleText("${event.value}");`);
        } else {
            uiSteps.push(`        // Action: ${event.type} on ${locator}`);
        }

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
    });

    return `
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;
import org.testng.annotations.Test;
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

function generatePythonCode(events, initialUrl, strategy) {
    let steps = events.map(event => {
        const locator = getBestLocatorPython(event.locators, strategy);
        if (event.type === 'click') {
            return `    driver.find_element(${locator}).click()`;
        } else if (event.type === 'input') {
            return `    driver.find_element(${locator}).send_keys("${event.value}")`;
        }
        return `    # Action: ${event.type} on ${locator}`;
    }).join('\n');

    return `
from selenium import webdriver
from selenium.webdriver.common.by import By
import pytest

def test_flow():
    driver = webdriver.Chrome()
    driver.maximize_window()
    
    try:
        driver.get("${initialUrl}")
${steps}
    finally:
        driver.quit()
`;
}

function getBestLocator(locators, strategy) {
    const esc = (s) => s ? s.replace(/"/g, '\\"') : '';
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
