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
                // Store request details
                networkLog.push({
                    requestId: details.requestId,
                    url: details.url,
                    method: details.method,
                    timestamp: Date.now()
                });
            }
        }
    },
    { urls: ["<all_urls>"] }
);

chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (isRecording) {
            // Find matching request in log
            const req = networkLog.find(r => r.requestId === details.requestId);
            if (req) {
                req.statusCode = details.statusCode;
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

                // Correlate recent network requests (last 500ms) with this event
                const recentReqs = networkLog.filter(req =>
                    req.timestamp >= event.timestamp - 500 &&
                    req.timestamp <= event.timestamp + 2000 // Allow some delay for API to fire after click
                );

                if (recentReqs.length > 0) {
                    // attach to event or store in map
                    event.apiCalls = recentReqs;
                }

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
        const recordedEvents = result.events || [];
        const initialUrl = result.initialUrl || 'https://example.com';

        if (recordedEvents.length === 0 && !initialUrl) return;

        // We'll call the generator here. 
        // Since we are in a background worker (ESM or Service Worker), we might need to import the mapper.
        // For MVP Phase 1 simplicity, I'll implement a basic version here and refactor later if needed.

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
    let steps = events.map(event => {
        const locator = getBestLocator(event.locators, strategy);
        let actionCode = "";

        if (event.type === 'click') {
            actionCode = `        driver.findElement(${locator}).click();`;
        } else if (event.type === 'input') {
            actionCode = `        driver.findElement(${locator}).sendKeys("${event.value}");`;
        } else if (event.type === 'change') {
            actionCode = `        new Select(driver.findElement(${locator})).selectByVisibleText("${event.value}");`;
        } else {
            actionCode = `        // Action: ${event.type} on ${locator}`;
        }

        // Add API Validation Logic (Hybrid Test)
        if (event.apiCalls && event.apiCalls.length > 0) {
            const apiTests = event.apiCalls.map(api => {
                return `
        // API Validation for: ${api.method} ${api.url}
        given()
            .baseUri("${new URL(api.url).origin}")
            .when()
            .${api.method.toLowerCase()}("${new URL(api.url).pathname}")
            .then()
            .statusCode(${api.statusCode || 200});`;
            }).join('\n');

            return actionCode + "\n" + apiTests;
        }

        return actionCode;
    }).join('\n');

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
${steps}
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
    // Strategy: 'xpath', 'css', 'smart' (default)

    if (strategy === 'xpath' && locators.xpath) {
        return `By.xpath("${locators.xpath}")`;
    }

    if (strategy === 'css') {
        if (locators.css) return `By.cssSelector("${locators.css}")`;
        // Fallback for css strategy if no CSS found (rare)
        if (locators.id) return `By.id("${locators.id}")`;
    }

    // Smart / Default priority
    if (locators.id) return `By.id("${locators.id}")`;
    if (locators.name) return `By.name("${locators.name}")`;
    if (locators.dataTest) return `By.cssSelector("[data-test='${locators.dataTest}']")`;
    if (locators.css) return `By.cssSelector("${locators.css}")`;
    return `By.xpath("${locators.xpath}")`;
}

function getBestLocatorPython(locators, strategy) {
    if (strategy === 'xpath' && locators.xpath) {
        return `By.XPATH, "${locators.xpath}"`;
    }

    if (strategy === 'css') {
        if (locators.css) return `By.CSS_SELECTOR, "${locators.css}"`;
        if (locators.id) return `By.ID, "${locators.id}"`;
    }

    if (locators.id) return `By.ID, "${locators.id}"`;
    if (locators.name) return `By.NAME, "${locators.name}"`;
    if (locators.dataTest) return `By.CSS_SELECTOR, "[data-test='${locators.dataTest}']"`;
    if (locators.css) return `By.CSS_SELECTOR, "${locators.css}"`;
    return `By.XPATH, "${locators.xpath}"`;
}
