/**
 * AI Service for Assertion Generation
 * Handles communication with LLMs (e.g., Gemini) to generate test assertions from natural language.
 */

export async function generateAssertion(userInput, context = {}) {
    console.log('=== generateAssertion FUNCTION CALLED ===');
    console.log('User input:', userInput);
    console.log('Context:', context);

    const { language = 'java', selectedEvent = null } = context;

    // Load API Key from storage
    const result = await new Promise(resolve => chrome.storage.local.get(['apiKey'], resolve));
    const apiKey = result.apiKey;

    console.log('API Key exists:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);

    if (!apiKey) {
        console.warn('AI Assertion Service: API Key not found. Cannot generate assertion.');
        return null;
    }

    // Define multiple Gemini models to try in order (fallback mechanism)
    // Using same models as ai_service.js for consistency
    const models = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash-TTS',
        'gemini-2.5-flash'
    ];

    // Build context information for better assertion generation
    let contextInfo = '';
    if (selectedEvent) {
        contextInfo = `
        CONTEXT FROM RECORDED ACTION:
        - Action Type: ${selectedEvent.type}
        - Target Element: ${selectedEvent.locators?.xpath || 'N/A'}
        - Element Text: ${selectedEvent.text || 'N/A'}
        - Input Value: ${selectedEvent.value || 'N/A'}
        - Timestamp: ${selectedEvent.timestamp}
        `;
    }

    const langName = language === 'java' ? 'Selenium Java (TestNG)' : 'Selenium Python (Pytest)';

    const prompt = `
        You are a Selenium Test Automation Expert. Generate a precise assertion statement based on the user's natural language request.
        
        USER REQUEST: "${userInput}"
        ${contextInfo}
        
        TARGET LANGUAGE: ${langName}
        
        INSTRUCTIONS:
        1. Generate ONLY the assertion code statement, no explanation or markdown formatting
        2. For Java, use TestNG assertions (Assert.assertTrue(), Assert.assertEquals(), etc.)
        3. For Python, use pytest assertions (assert statement)
        4. Use appropriate WebDriver methods (isDisplayed(), getText(), getAttribute(), etc.)
        5. Include proper element locator syntax
        6. Make assertions specific and meaningful
        7. If the user mentions checking element presence/visibility, use isDisplayed()
        8. If the user mentions text verification, use getText() and assertEquals()
        9. If the user mentions URL/title, use driver.getCurrentUrl() or driver.getTitle()
        10. Return exactly one line of code, no extra text
        
        EXAMPLES:
        User: "check that login button is visible"
        Java: Assert.assertTrue(driver.findElement(By.id("login")).isDisplayed());
        
        User: "verify error message says Invalid credentials"
        Java: Assert.assertEquals(driver.findElement(By.className("error")).getText(), "Invalid credentials");
        
        User: "check we are on dashboard page"
        Java: Assert.assertTrue(driver.getCurrentUrl().contains("dashboard"));
        
        GENERATED ASSERTION (${language.toUpperCase()}):
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

            if (!response.ok) {
                console.error(`[AI Assertion] HTTP error! status: ${response.status}`);
                const errorText = await response.text();
                console.error(`[AI Assertion] Error response:`, errorText);
                continue; // Try next model
            }

            const data = await response.json();
            console.log(`[AI Assertion] Full API response:`, data);

            // Check for valid response
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                let assertion = data.candidates[0].content.parts[0].text.trim();

                // Clean up any markdown code blocks or extra formatting
                assertion = assertion.replace(/```[\w]*\n?/g, '').trim();
                assertion = assertion.replace(/^["'`]|["'`]$/g, '').trim();

                console.log(`[AI Assertion] SUCCESS with model: ${model}`);
                console.log('[AI Assertion] Generated:', assertion);
                return assertion;
            } else if (data.error) {
                console.error(`[AI Assertion] Model ${model} returned error:`, data.error);
                // Continue to next model
            } else {
                console.warn(`[AI Assertion] Model ${model} returned unexpected format:`, data);
                // Continue to next model
            }
        } catch (error) {
            console.error(`[AI Assertion] Error with model ${model}:`, error);
            console.error(`[AI Assertion] Error stack:`, error.stack);
            // Continue to next model if not the last one
            if (i === models.length - 1) {
                console.error('[AI Assertion] All models failed.');
            }
        }
    }

    return null;
}
