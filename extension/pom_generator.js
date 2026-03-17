/**
 * POM Generator
 * Generates Page Object Model class files (Java & Python) from recorded page data.
 * Each page detected during recording becomes a separate class file.
 */

/**
 * Returns the best available locator string for a given strategy (Java format).
 */
function getBestLocatorForPOM(locators, strategy = 'smart') {
    if (!locators) return 'By.xpath("//unknown")';
    const esc = s => (s || '').replace(/"/g, '\\"');
    if (locators.aiXPath) return `By.xpath("${esc(locators.aiXPath)}")`;
    if (strategy === 'xpath' && locators.xpath) return `By.xpath("${esc(locators.xpath)}")`;
    if (strategy === 'css' && locators.css) return `By.cssSelector("${esc(locators.css)}")`;
    // Smart
    if (locators.id) return `By.id("${esc(locators.id)}")`;
    if (locators.name) return `By.name("${esc(locators.name)}")`;
    if (locators.css) return `By.cssSelector("${esc(locators.css)}")`;
    if (locators.xpath) return `By.xpath("${esc(locators.xpath)}")`;
    return 'By.xpath("//unknown")';
}

/**
 * Returns the best available locator string for Python POM (By.XXX, "value").
 */
function getBestLocatorForPOMPython(locators, strategy = 'smart') {
    if (!locators) return 'By.XPATH, "//unknown"';
    const esc = s => (s || '').replace(/"/g, '\\"');
    if (locators.aiXPath) return `By.XPATH, "${esc(locators.aiXPath)}"`;
    if (strategy === 'xpath' && locators.xpath) return `By.XPATH, "${esc(locators.xpath)}"`;
    if (strategy === 'css' && locators.css) return `By.CSS_SELECTOR, "${esc(locators.css)}"`;
    if (locators.id) return `By.ID, "${esc(locators.id)}"`;
    if (locators.name) return `By.NAME, "${esc(locators.name)}"`;
    if (locators.css) return `By.CSS_SELECTOR, "${esc(locators.css)}"`;
    if (locators.xpath) return `By.XPATH, "${esc(locators.xpath)}"`;
    return 'By.XPATH, "//unknown"';
}

/**
 * Converts an event into a descriptive method name.
 * e.g.  { type: 'click', value: '', locators: { id: 'login-btn' } }  →  "clickLoginBtn"
 */
function eventToMethodName(event, index) {
    const type = event.type === 'input' ? 'enter'
        : event.type === 'change' ? 'select'
            : 'click';

    // Try to derive a meaningful element name
    const locators = event.locators || {};
    let elementName = '';

    if (locators.ariaLabel) elementName = locators.ariaLabel;
    else if (locators.id) elementName = locators.id;
    else if (locators.name) elementName = locators.name;

    if (elementName) {
        // camelCase conversion
        const camel = elementName
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .trim()
            .split(/[\s_-]+/)
            .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('');
        return `${type}${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
    }

    return `${type}Element${index + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JAVA POM GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a single Java Page Object class file for a given page.
 * @param {object} page       - Page metadata { id, url, title, className }
 * @param {object[]} events   - Events belonging to this page
 * @param {string} strategy   - Locator strategy (smart | xpath | css)
 * @returns {string}          - Java source code string
 */
export function generateJavaPOMClass(page, events, strategy = 'smart') {
    const className = page.className || 'BasePage';
    const pageUrl = page.url || '';
    const pageTitle = page.title || '';

    // Build WebElement field declarations + method pairs
    const fields = [];
    const methods = [];

    events.forEach((event, i) => {
        const locator = getBestLocatorForPOM(event.locators, strategy);
        const methodName = eventToMethodName(event, i);
        const fieldName = `${methodName}Element`;
        const isAI = !!(event.locators && event.locators.aiXPath);

        // @FindBy annotation + field
        const findByType = locator.startsWith('By.id') ? 'id'
            : locator.startsWith('By.name') ? 'name'
                : locator.startsWith('By.cssSelector') ? 'css'
                    : 'xpath';
        const findByVal = (event.locators?.aiXPath
            || event.locators?.id
            || event.locators?.name
            || event.locators?.css
            || event.locators?.xpath
            || 'unknown').replace(/"/g, '\\"');

        fields.push(
            `    ${isAI ? '// AI-Refined Locator\n    ' : ''}@FindBy(${findByType} = "${findByVal}")\n    private WebElement ${fieldName};`
        );

        // Method body
        if (event.type === 'click') {
            methods.push(
                `    public void ${methodName}() {\n        ${fieldName}.click();\n    }`
            );
        } else if (event.type === 'input') {
            methods.push(
                `    public void ${methodName}(String value) {\n        ${fieldName}.clear();\n        ${fieldName}.sendKeys(value);\n    }`
            );
        } else if (event.type === 'change') {
            methods.push(
                `    public void ${methodName}(String visibleText) {\n        new Select(${fieldName}).selectByVisibleText(visibleText);\n    }`
            );
        } else {
            methods.push(
                `    // TODO: implement ${methodName}() for event type "${event.type}"`
            );
        }
    });

    // Deduplicate fields by field name
    const seen = new Set();
    const uniqueFields = fields.filter(f => {
        const match = f.match(/private WebElement (\w+);/);
        if (match && seen.has(match[1])) return false;
        if (match) seen.add(match[1]);
        return true;
    });

    return `package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.Select;

/**
 * Page Object: ${className}
 * Page Title : ${pageTitle}
 * Page URL   : ${pageUrl}
 * Auto-generated by AI Automation Recorder
 */
public class ${className} {

    private WebDriver driver;

    public ${className}(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }

    // ── Element Locators ──────────────────────────────────────
${uniqueFields.join('\n\n')}

    // ── Page Actions ──────────────────────────────────────────
${methods.join('\n\n')}
}
`;
}

/**
 * Generates a Java TestNG test class that instantiates and calls each POM.
 * @param {object[]} pages      - All page metadata
 * @param {object[]} allEvents  - All recorded events
 * @param {string} initialUrl   - Starting URL
 * @param {string} strategy     - Locator strategy
 * @returns {string}            - Java source code
 */
export function generateJavaTestRunner(pages, allEvents, initialUrl, strategy = 'smart') {
    const steps = [];

    pages.forEach(page => {
        const className = page.className || 'BasePage';
        const varName = className.charAt(0).toLowerCase() + className.slice(1);
        const pageEvents = allEvents.filter(e => e.pageId === page.id);

        steps.push(`\n        // ── ${className} ────────────────────────────`);
        steps.push(`        ${className} ${varName} = new ${className}(driver);`);

        pageEvents.forEach((event, i) => {
            const methodName = eventToMethodName(event, i);
            if (event.type === 'input') {
                steps.push(`        ${varName}.${methodName}("${(event.value || '').replace(/"/g, '\\"')}");`);
            } else {
                steps.push(`        ${varName}.${methodName}();`);
            }
        });
    });

    const pageImports = pages.map(p => `import pages.${p.className || 'BasePage'};`).join('\n');

    return `package tests;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;
import io.github.bonigarcia.wdm.WebDriverManager;
${pageImports}

/**
 * Test Runner - Auto-generated by AI Automation Recorder
 * Uses Page Object Model pattern
 */
public class GeneratedPOMTest {

    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        WebDriverManager.chromedriver().setup();
        driver = new ChromeDriver();
        driver.manage().window().maximize();
        driver.get("${initialUrl}");
    }

    @Test
    public void testFlow() {
${steps.join('\n')}
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PYTHON POM GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a single Python Page Object class file for a given page.
 */
export function generatePythonPOMClass(page, events, strategy = 'smart') {
    const className = page.className || 'BasePage';
    const pageUrl = page.url || '';
    const pageTitle = page.title || '';

    const methods = [];

    events.forEach((event, i) => {
        const locator = getBestLocatorForPOMPython(event.locators, strategy);
        const methodName = eventToMethodName(event, i);
        const isAI = !!(event.locators && event.locators.aiXPath);
        const aiComment = isAI ? '        # AI-Refined Locator\n' : '';

        if (event.type === 'click') {
            methods.push(
                `    def ${methodName}(self):\n${aiComment}        self.driver.find_element(${locator}).click()`
            );
        } else if (event.type === 'input') {
            methods.push(
                `    def ${methodName}(self, value):\n${aiComment}        el = self.driver.find_element(${locator})\n        el.clear()\n        el.send_keys(value)`
            );
        } else if (event.type === 'change') {
            methods.push(
                `    def ${methodName}(self, visible_text):\n${aiComment}        from selenium.webdriver.support.select import Select\n        Select(self.driver.find_element(${locator})).select_by_visible_text(visible_text)`
            );
        } else {
            methods.push(`    # TODO: implement ${methodName}() for event type "${event.type}"`);
        }
    });

    return `from selenium.webdriver.common.by import By


class ${className}:
    """
    Page Object: ${className}
    Page Title : ${pageTitle}
    Page URL   : ${pageUrl}
    Auto-generated by AI Automation Recorder
    """

    def __init__(self, driver):
        self.driver = driver

${methods.join('\n\n')}
`;
}

/**
 * Generates a Python Pytest test file that imports and uses each POM class.
 */
export function generatePythonTestRunner(pages, allEvents, initialUrl, strategy = 'smart') {
    const imports = pages.map(p => {
        const cls = p.className || 'BasePage';
        const mod = cls.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        return `from pages.${mod} import ${cls}`;
    }).join('\n');

    const steps = [];

    pages.forEach(page => {
        const className = page.className || 'BasePage';
        const varName = className.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        const pageEvents = allEvents.filter(e => e.pageId === page.id);

        steps.push(`\n    # ── ${className} ──────────────────────────────`);
        steps.push(`    ${varName} = ${className}(driver)`);

        pageEvents.forEach((event, i) => {
            const methodName = eventToMethodName(event, i);
            if (event.type === 'input') {
                steps.push(`    ${varName}.${methodName}("${(event.value || '').replace(/"/g, '\\"')}")`);
            } else {
                steps.push(`    ${varName}.${methodName}()`);
            }
        });
    });

    return `import pytest
from selenium import webdriver
${imports}


@pytest.fixture
def driver():
    d = webdriver.Chrome()
    d.maximize_window()
    d.get("${initialUrl}")
    yield d
    d.quit()


def test_flow(driver):
${steps.join('\n')}
`;
}
