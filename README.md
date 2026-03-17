# AI Automation Recorder

AI Automation Recorder is a powerful browser extension that records user interactions on web pages and leverages Generative AI to generate robust Selenium scripts in both Java and Python. It automatically captures UI interactions and API network calls, generating hybrid test scripts with intelligent locators and assertions.

## 🚀 Key Features

### Current Capabilities
- **Smart Event Capture**: Records clicks, typing, dropdowns, and navigation with intelligent locator extraction.
- **AI-Powered Code Generation**: Automatically generate Selenium scripts for:
  - **Java** (TestNG with Rest Assured for API validation)
  - **Python** (Pytest)
- **AI XPath Refinement**: During recording, AI analyzes DOM context to generate stable, semantic locators that resist UI changes.
- **Natural Language Assertions**: Describe your test assertions in plain English and let AI convert them to executable code.
- **Network Monitoring**: Captures API calls (XHR/Fetch) triggered by user actions.
- **Hybrid Test Generation**: Combines UI interactions with API validation in a single test flow.
- **UI-API Correlation**: Automatically links API calls to the UI actions that triggered them.
- **Multiple Locator Strategies**: Choose between XPath, CSS, or Smart (auto-selecting the best locator).

### 🔮 Roadmap
- **AI Wait Logic**: Smart explicit waits based on observed element load times (planned).
- **Page Object Model (POM) Generation**: Multi-file test architecture with reusable page classes (planned).
- **Runtime Self-Healing**: AI-powered locator repair during test execution (future).

## 📁 Project Structure

```text
├── docs/               # Documentation (Architecture, Setup Guide)
├── extension/          # Browser extension source code
│   ├── manifest.json       # Extension configuration
│   ├── background.js       # Background service worker, network monitoring, code generation
│   ├── content.js          # Page interaction logic, locator extraction
│   ├── popup.html/js       # Extension UI and control logic
│   ├── ai_service.js       # AI XPath refinement with Gemini
│   └── assertion_service.js# Natural language to assertion code generation
└── README.md               # Project overview
```

## 🛠️ Setup Instructions

### 1. Load the Extension
1. Open Chrome or Edge and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `/extension` folder in this project.

### 2. Configure AI (Optional but Recommended)
1. Click the **AI Automation Recorder** icon.
2. Click the **Settings** dropdown (⚙️).
3. Enter your **Gemini API Key** (get one from [Google AI Studio](https://aistudio.google.com/)).
4. Click **Save Settings**.

### 3. Record a Script
1. Click **⏺ Record** and interact with the web page.
2. (Optional) Add natural language assertions using the assertion panel.
3. Click **⏹ Stop** when finished.
4. Wait for AI processing to complete (status shown in UI).
5. Select your preferred language (Java/Python) and locator strategy.
6. Click **Download Script**.

### 4. Run the Generated Script
**Java (with Rest Assured for API validation):**
```bash
# Add to pom.xml:
# selenium-java, testng, webdrivermanager, rest-assured
mvn test
```

**Python:**
```bash
pip install selenium pytest
pytest test_generated.py
```

## 🧠 AI Architecture

The tool uses a hybrid approach combining heuristic logic with AI enhancement:

1. **Heuristic Locator Extraction**: `content.js` builds multiple XPath candidates using text, ARIA labels, data attributes, and structural relationships.
2. **AI Refinement Layer**: `ai_service.js` sends DOM context to Gemini models, which select or generate the most stable locator based on semantic understanding.
3. **Validation Loop**: Generated XPaths are validated in the live DOM to ensure uniqueness before being stored.
4. **Assertion AI**: `assertion_service.js` converts natural language (e.g., "check login button is visible") into framework-specific assertion code.
5. **Fallback Mechanism**: If AI fails or API key is missing, the tool gracefully falls back to heuristic-only mode.

**Supported Models**: Gemini 2.0 Flash, Gemini 1.5 Flash/Pro (with automatic fallback).

For detailed architecture diagrams and future AI capabilities, see the [AI Architecture Document](docs/AI_ARCHITECURE.md).

## 📚 Learn More

- **[Setup Guide](docs/setup_guide.md)**: Detailed installation and usage instructions.
- **[AI Architecture](docs/AI_ARCHITECURE.md)**: Deep dive into AI integration strategy.

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns in `background.js`, `content.js`, and `ai_service.js`.
- AI prompts are well-documented with examples.
- Test any changes against complex web applications.

## 📄 License

This project is provided as-is for educational and internal use.
