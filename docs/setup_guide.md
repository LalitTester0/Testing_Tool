# Setup & Execution Guide - Phase 1

Follow these steps to load the extension and run your generated automation scripts.

## 1. Load the Extension in your Browser

1. Open **Google Chrome** or **Microsoft Edge**.
2. Navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top right corner).
4. Click the **Load unpacked** button.
5. Browse to the project folder: 
   `c:\Users\Admin\Documents\Flairminds\Testing Tool\extension`
6. Selected this folder. You should now see the "AI Automation Recorder" extension in your list.

---

## 2. Open the Project in Visual Studio Code

1. Open **Visual Studio Code**.
2. Go to `File` -> `Open Folder...`.
3. Select the root project directory: 
   `c:\Users\Admin\Documents\Flairminds\Testing Tool`
4. You can now see the extension source code and the `generator` logic.

---

## 3. Record a Test Script

1. Open a website (e.g., [https://www.google.com](https://www.google.com) or any test site).
2. Click the **Extensions icon** (puzzle piece) in your browser and pin **AI Automation Recorder**.
3. Click the extension icon to open the popup.
4. Click **⏺ Record**.
5. Perform actions on the page (type in search, click buttons).
6. Go back to the extension popup and click **⏹ Stop**.
7. Select **Selenium Java** or **Selenium Python** from the dropdown.
8. Click **Download Script**.

---

## 4. Run the Generated Script

### For Java (Selenium + TestNG)
1. In VS Code, create a new Maven project or use an existing one.
2. Add the following dependencies to your `pom.xml`:
   - `selenium-java`
   - `testng`
   - `webdrivermanager`
3. Paste the generated code into a new `.java` file.
4. Run the test using the TestNG runner.

### For Python (Selenium + Pytest)
1. Install dependencies via terminal:
   ```bash
   pip install selenium pytest
   ```
2. Save the generated code as `test_script.py`.
3. Run the test:
   ```bash
   pytest test_script.py
   ```

---

## Troubleshooting
- **No events captured?** Ensure you refreshed the page after loading the extension for the first time.
- **Icon not showing?** Check if `manifest.json` correctly points to the `images` folder.
