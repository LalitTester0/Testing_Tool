/**
 * AI Service for XPath Refinement & Page Naming
 * Handles communication with LLMs (e.g., Gemini) to provide robust locators
 * and intelligent Page Object Model class names.
 */

export async function getRefinedXPath(aiContext) {
    const { elementHtml, parentHtml, closestLabel, ancestorHeading, role, candidates } = aiContext;

    // Load API Key from storage
    const result = await new Promise(resolve => chrome.storage.local.get(['apiKey'], resolve));
    const apiKey = result.apiKey;

    if (!apiKey) {
        console.warn('AI Service: API Key not found. Falling back to heuristic locators.');
        return null; // Fallback to heuristics
    }

    // Define multiple Gemini models to try in order (fallback mechanism)
    const models = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash-TTS',
        'gemini-2.5-flash'
    ];

    const prompt = `
        You are a Selenium Automation Expert. Your task is to select or refine the most stable AND unique XPath for a web element.
        
        ELEMENT CONTEXT:
        - Target Role: ${role}
        - Closest Label: "${closestLabel}"
        - Ancestor Heading: "${ancestorHeading}"
        - Target HTML: \`${elementHtml}\`
        - Parent HTML: \`${parentHtml}\`
        
        HEURISTIC CANDIDATES:
        ${candidates.join('\n')}
        
        STRICT ENGINEERING RULES:
        1. NEVER use full DOM paths (e.g., /html/body/... or //*[@id="app"]/div/...).
        2. NEVER use dynamic IDs (e.g., ht_*, rc-tabs-*, or random hex strings like b7232d84).
        3. PREFER Locators in this order: 
           - Visible Text: //*[normalize-space()='Text']
           - ARIA Label/Role: //*[@aria-label='Label']
           - Label-to-Target Axis: //label[.='Label']/following::input[1]
           - Static Data Attributes: //*[@data-testid='stable']
        4. LIMIT COMPLEXITY: XPath must have at most 3 '/' divisions and at most 1 index '[n]'.
        5. USE AXES & FUNCTIONS: Use normalize-space(), contains(), starts-with(), and axes (parent::, following::, descendant::) to create logical relationships.
        6.If target has no text or label, anchor using nearest meaningful parent or ancestor with text.
        7.For table cells, prefer row label + column header relationships over row/column indexes.
        
        If heuristic candidates violate these rules or are missing, INVENT a robust one using these rules.
        
        Return ONLY the XPath string itself. No explanation, no code blocks.
        
        STABLE XPATH:
    `.trim();

    // Try each model in sequence until one succeeds
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        console.log(`[AI Service] Attempting with model: ${model} (${i + 1}/${models.length})`);

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();

            // Check for valid response
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                const aiXPath = data.candidates[0].content.parts[0].text.trim();
                console.log(`[AI Service] SUCCESS with model: ${model}`);
                console.log('[AI Service] RAW AI RESPONSE:', aiXPath);
                return aiXPath;
            } else if (data.error) {
                console.warn(`[AI Service] Model ${model} returned error:`, data.error.message);
                // Continue to next model
            } else {
                console.warn(`[AI Service] Model ${model} returned unexpected format:`, data);
                // Continue to next model
            }
        } catch (error) {
            console.error(`[AI Service] Error with model ${model}:`, error.message);
            // Continue to next model if not the last one
            if (i === models.length - 1) {
                console.error('[AI Service] All models failed. Falling back to heuristics.');
            }
        }
    }

    return null;
}

// COMMENTED OUT: AI is now only used for XPath generation, not for assertions
/*
export async function getSuggestedAssertion(stateChange, language = 'java') {
    const { pre, post } = stateChange;

    // Check if anything meaningful changed
    if (pre.title === post.title && pre.url === post.url && pre.visibleText === post.visibleText) {
        return null;
    }

    const result = await new Promise(resolve => chrome.storage.local.get(['apiKey'], resolve));
    const apiKey = result.apiKey;
    if (!apiKey) return null;

    // Define multiple Gemini models to try in order (fallback mechanism)
    const models = [
        'gemini-3-flash-preview',
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash',
        'gemini-1.5-pro'
    ];

    const langName = language === 'java' ? 'Selenium Java (TestNG)' : 'Selenium Python (Pytest)';

    const prompt = `
        You are a Selenium Automation Expert. Given the state of a web page before and after a user action, suggest a SINGLE meaningful assertion in ${langName} to verify the action's success.
        
        PRE-ACTION STATE:
        - Title: ${pre.title}
        - URL: ${pre.url}
        - Visible Text Snippet: "${pre.visibleText.substring(0, 500)}"
        
        POST-ACTION STATE:
        - Title: ${post.title}
        - URL: ${post.url}
        - Visible Text Snippet: "${post.visibleText.substring(0, 500)}"
        
        INSTRUCTIONS:
        1. If a new success message, alert, or element appeared, assert its presence or text.
        2. If the URL changed, assert the new URL.
        3. If the Title changed, assert the new Title.
        4. Return ONLY the ${language === 'java' ? 'Java' : 'Python'} code for the assertion.
        5. If no meaningful change is detected, return "null".
        
        SUGGESTED ASSERTION (${language.toUpperCase()}):
    `.trim();

    // Try each model in sequence until one succeeds
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        console.log(`[AI Assertion] Attempting with model: ${model} (${i + 1}/${models.length})`);

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            
            // Check for valid response
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                const assertion = data.candidates[0].content.parts[0].text.trim();
                console.log(`[AI Assertion] SUCCESS with model: ${model}`);
                console.log(`[AI Assertion] RAW ${language.toUpperCase()} RESPONSE:`, assertion);
                return assertion === "null" ? null : assertion;
            } else if (data.error) {
                console.warn(`[AI Assertion] Model ${model} returned error:`, data.error.message);
                // Continue to next model
            } else {
                console.warn(`[AI Assertion] Model ${model} returned unexpected format:`, data);
                // Continue to next model
            }
        } catch (error) {
            console.error(`[AI Assertion] Error with model ${model}:`, error.message);
            // Continue to next model if not the last one
            if (i === models.length - 1) {
                console.error('[AI Assertion] All models failed.');
            }
        }
    }

    return null;
}
*/

/**
 * AI Page Naming: Generates a PascalCase class name for a page suitable for POM generation.
 * e.g.  "https://app.com/user/login" + title "Sign In"  →  "LoginPage"
 *
 * @param {string} url       - Full URL of the page
 * @param {string} title     - Document title of the page
 * @param {string[]} [hints] - Optional text snippets from elements on the page
 * @returns {Promise<string>} - PascalCase class name, e.g. "LoginPage"
 */
export async function getPageClassName(url, title, hints = []) {

    // --- Heuristic fallback ---
    function heuristicName(url, title) {
        if (title && title.trim() && title.toLowerCase() !== 'untitled page') {
            const cleaned = title
                .replace(/[^a-zA-Z0-9\s]/g, ' ')
                .trim()
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join('');
            return cleaned ? `${cleaned}Page` : null;
        }
        try {
            const segments = new URL(url).pathname.split('/').filter(Boolean);
            if (segments.length > 0) {
                const last = segments[segments.length - 1]
                    .replace(/[^a-zA-Z0-9]/g, ' ').trim()
                    .split(/\s+/)
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join('');
                return last ? `${last}Page` : 'BasePage';
            }
        } catch (_) { }
        return 'BasePage';
    }

    // Load API Key
    const result = await new Promise(resolve => chrome.storage.local.get(['apiKey'], resolve));
    const apiKey = result.apiKey;

    if (!apiKey) {
        const name = heuristicName(url, title);
        console.log(`[Page Naming] No API key – heuristic: ${name}`);
        return name;
    }

    const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview'];
    const hintsText = hints.length > 0 ? `\nVisible element hints: ${hints.slice(0, 10).join(', ')}` : '';

    const prompt = `You are a Selenium Page Object Model expert.
Given the web page details below, respond with ONLY a single PascalCase class name for the Page Object.

Page URL: ${url}
Page Title: ${title}${hintsText}

Rules:
- PascalCase, ends with "Page" (e.g. LoginPage, UserDashboardPage)
- No spaces, no quotes, no explanation
- Max 4 words combined`;

    for (let i = 0; i < models.length; i++) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${models[i]}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
                    })
                }
            );
            if (!response.ok) {
                console.warn(`[Page Naming] Model ${models[i]} HTTP ${response.status}, trying next...`);
                continue;
            }
            const data = await response.json();
            const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
            if (/^[A-Z][a-zA-Z0-9]*Page$/.test(raw)) {
                console.log(`[Page Naming] AI name (${models[i]}): ${raw}`);
                return raw;
            }
            console.warn(`[Page Naming] Invalid AI response: "${raw}", using heuristic.`);
            break;
        } catch (e) {
            console.error(`[Page Naming] Error with ${models[i]}:`, e);
        }
    }

    const fallback = heuristicName(url, title);
    console.log(`[Page Naming] Fallback heuristic: ${fallback}`);
    return fallback;
}
