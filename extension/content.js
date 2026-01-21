(function () {
    console.log('AI Automation Recorder: Content script initialized on', window.location.href);

    // Check if we should be recording or at least indicate activity
    chrome.storage.local.get(['recordingState'], (result) => {
        console.log('Current recording state:', result.recordingState);
    });

    document.addEventListener('click', (event) => {
        handleEvent(event, 'click');
    }, true);

    document.addEventListener('input', (event) => {
        // We only want to record input once it's finished or throttled
        // But for MVP, let's just record it
        handleEvent(event, 'input');
    });

    document.addEventListener('change', (event) => {
        if (event.target.tagName === 'SELECT') {
            handleEvent(event, 'change');
        }
    });

    function handleEvent(event, type) {
        const target = event.target;

        // Skip recording events on the extension popup itself or non-interactive elements if needed
        // But usually content scripts don't run on the popup anyway

        const eventData = {
            type: type,
            timestamp: Date.now(),
            url: window.location.href,
            value: target.value || target.innerText || '',
            locators: extractLocators(target)
        };

        console.log('Recorded Event:', eventData);

        // Check connection before sending
        if (!chrome.runtime || !chrome.runtime.id) {
            console.warn('AI Recorder: Extension disconnected. Please refresh the page.');
            // Optional: alert user only once to avoid spam
            if (!window._aiRecorderAlerted) {
                alert('Connection to extension lost. Please refresh the page to continue recording.');
                window._aiRecorderAlerted = true;
            }
            return;
        }

        try {
            chrome.runtime.sendMessage({ action: 'recordEvent', event: eventData }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('AI Recorder: Runtime error:', chrome.runtime.lastError.message);
                }
            });
        } catch (error) {
            console.error('AI Automation Recorder Error:', error);
            if (!window._aiRecorderAlerted) {
                alert('Connection to extension lost. Please refresh the page.');
                window._aiRecorderAlerted = true;
            }
        }
    }

    function extractLocators(element) {
        const locators = {};

        // 1. ID
        if (element.id) {
            locators.id = element.id;
        }

        // 2. Name
        if (element.name) {
            locators.name = element.name;
        }

        // 3. Data-test attributes (Common in modern apps)
        const dataAttributes = ['data-test', 'data-testid', 'data-cy', 'data-qa'];
        for (const attr of dataAttributes) {
            if (element.getAttribute(attr)) {
                locators.dataTest = element.getAttribute(attr);
                break;
            }
        }

        // 4. CSS Selector
        locators.css = getCssSelector(element);

        // 5. XPath (Relative & Robust)
        locators.xpath = getRelativeXPath(element);

        return locators;
    }

    function getCssSelector(el) {
        if (!(el instanceof Element)) return '';
        const path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
            } else {
                let sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += ":nth-of-type(" + nth + ")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    function getRelativeXPath(element) {
        // 1. Try Unique ID
        if (element.id && isUnique(`//*[@id='${element.id}']`)) {
            return `//*[@id='${element.id}']`;
        }

        // 2. Try Unique Name
        if (element.name && isUnique(`//*[@name='${element.name}']`)) {
            return `//*[@name='${element.name}']`;
        }

        // 3. Try Text Content (Exact Match) - Good for Buttons/Links
        const text = element.innerText?.trim();
        if (text && text.length < 20 && text.length > 0) {
            const textPath = `//*[text()='${text}']`;
            if (isUnique(textPath)) return textPath;

            // Try containing text
            const containsPath = `//*[contains(text(), '${text}')]`;
            if (isUnique(containsPath)) return containsPath;
        }

        // 4. Try Data Attributes (data-test, data-cy, etc.)
        const dataAttrs = ['data-test', 'data-testid', 'data-cy', 'data-qa', 'placeholder', 'title', 'aria-label', 'alt'];
        for (const attr of dataAttrs) {
            const val = element.getAttribute(attr);
            if (val) {
                const attrPath = `//*[@${attr}='${val}']`;
                if (isUnique(attrPath)) return attrPath;
            }
        }

        // 5. Class Name (Combined) - Be careful with multiple classes
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(/\s+/).filter(c => c.length > 0);
            if (classes.length > 0) {
                // Try first distinct class
                for (let cls of classes) {
                    const classPath = `//*[contains(@class, '${cls}')]`;
                    if (isUnique(classPath)) return classPath;
                }
            }
        }

        // 6. Relative Axes: Label -> Input
        // Find preceding label
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            const labelPath = `//label[text()='${findLabelText(element)}']/following-sibling::${element.tagName.toLowerCase()}`;
            if (isUnique(labelPath)) return labelPath;
        }

        // 7. Fallback: Absolute XPath
        return getAbsoluteXPath(element);
    }

    function findLabelText(element) {
        // Simple heuristic to find a preceding label or parent label
        // This is a placeholder for more complex label logic
        return '';
    }

    function isUnique(xpath) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return result.snapshotLength === 1;
        } catch (e) {
            return false;
        }
    }

    function getAbsoluteXPath(element) {
        if (element.id !== '') {
            return `//*[@id="${element.id}"]`;
        }
        if (element === document.body) {
            return '/html/body';
        }

        let ix = 0;
        const siblings = element.parentNode.childNodes;
        for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
                return getAbsoluteXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                ix++;
            }
        }
    }

})();
