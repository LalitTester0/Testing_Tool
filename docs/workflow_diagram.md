```mermaid
flowchart TB
    Start([User Opens Extension]) --> Record[📹 Click Record Button]
    Record --> Interact[🖱️ User Interacts with Web Page<br/>Clicks, Types, Navigates]
    
    Interact --> Capture{Event Capture Layer}
    
    Capture --> DOMExtract[🔍 Extract Locators<br/>ID, Class, XPath, ARIA, Text]
    Capture --> NetworkMon[🌐 Monitor API Calls<br/>XHR/Fetch Requests]
    
    DOMExtract --> AIRefine{AI Enhancement?<br/>API Key Present?}
    
    AIRefine -->|Yes| GeminiAPI[🤖 Gemini AI Analysis<br/>Context: DOM, Parent, Labels]
    AIRefine -->|No| HeuristicOnly[Use Heuristic Locators]
    
    GeminiAPI --> Validate[✅ Validate XPath<br/>Check Uniqueness in DOM]
    Validate -->|Valid| StoreAI[Store AI-Refined XPath]
    Validate -->|Invalid| HeuristicOnly
    
    StoreAI --> EventStore[(📦 Event Storage<br/>Chrome Storage)]
    HeuristicOnly --> EventStore
    NetworkMon --> EventStore
    
    EventStore --> Continue{More Actions?}
    Continue -->|Yes| Interact
    Continue -->|No| Stop[⏹️ Stop Recording]
    
    Stop --> Assertions{Add Assertions?<br/>Optional}
    Assertions -->|Yes| NLAssertion[💬 Natural Language Input<br/>e.g., Check login button is visible]
    NLAssertion --> AIAssertion[🤖 AI Generates Code<br/>Assert.assertTrue(...)]
    AIAssertion --> AssertStore[(Store Assertions)]
    
    Assertions -->|No| Correlate
    AssertStore --> Correlate
    
    Correlate[🔗 Correlate UI Events<br/>with API Calls<br/>Time-based Matching]
    
    Correlate --> Generate{Select Language}
    Generate -->|Java| JavaGen[⚙️ Generate Java Code<br/>TestNG + Rest Assured]
    Generate -->|Python| PythonGen[⚙️ Generate Python Code<br/>Pytest]
    
    JavaGen --> Download[💾 Download Script]
    PythonGen --> Download
    
    Download --> Execute[▶️ Execute Test<br/>mvn test / pytest]
    
    style Start fill:#e1f5ff
    style Record fill:#fff9c4
    style AIRefine fill:#f3e5f5
    style GeminiAPI fill:#c8e6c9
    style Generate fill:#ffe0b2
    style Download fill:#c5e1a5
    style Execute fill:#80deea
```
