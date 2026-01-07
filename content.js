// --- CONFIGURATION ---
const GROQ_API_KEY = "YOUR_GROQ_API_KEY"; // ⚠️ REPLACE THIS
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- PART A: CREATE THE UI ---
const agentUI = document.createElement('div');
agentUI.id = 'my-ai-agent';
agentUI.innerHTML = `
    <div style="padding: 10px; background: #2563eb; color: white; font-weight: bold; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
        <span>AI Web Navigator</span>
        <span id="agent-status" style="font-size: 10px; opacity: 0.8;">Idle</span>
    </div>
    <div id="agent-display" style="padding: 10px; height: 120px; overflow-y: auto; font-size: 13px; color: #333; background: #f9fafb;">
        Hi! Ask me to navigate or find something.
    </div>
    <input type="text" id="agent-input" placeholder="What should I do?" 
           style="width: 100%; border: none; border-top: 1px solid #ccc; padding: 10px; box-sizing: border-box; outline: none; border-radius: 0 0 8px 8px;">
`;

Object.assign(agentUI.style, {
    position: 'fixed', bottom: '20px', right: '20px', width: '300px',
    backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px',
    zIndex: '2147483647', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', fontFamily: 'Inter, system-ui, sans-serif'
});

document.body.appendChild(agentUI);

// --- PART B: DOM SNAPSHOT (Perception) ---
function getCleanSnapshot() {
    const semanticSelectors = 'a, button, input, select, textarea, h1, h2, h3, [role="button"]';
    const elements = document.querySelectorAll(semanticSelectors);
    const snapshot = [];

    elements.forEach((el, index) => {
        // Filter out invisible or irrelevant elements to save tokens
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';

        if (isVisible) {
            let text = (el.innerText || el.value || el.ariaLabel || el.placeholder || "").trim();
            // Cap very long text
            if (text.length > 50) text = text.substring(0, 50) + "...";

            if (text) { // Only include if it has semantic meaning
                // Assign a temporary unique ID for the LLM to reference if needed, 
                // though we mainly rely on text matching for this version as requested.
                // We'll store a reference to the DOM element in a parallel array or just search later.
                // For this implementation, we will perform text search on the "clean" text.
                snapshot.push({
                    tag: el.tagName.toLowerCase(),
                    text: text,
                    type: el.type || undefined,
                    id: el.id || undefined
                });
            }
        }
    });
    return snapshot;
}

// --- PART C: SAFETY LAYER ---
function isSafeAction(targetText, actionDescription) {
    const sensitiveKeywords = ['password', 'cvv', 'credit card', 'ssn', 'social security'];
    const lowerText = (targetText + " " + actionDescription).toLowerCase();

    // 1. Check Keywords
    if (sensitiveKeywords.some(kw => lowerText.includes(kw))) {
        return { safe: false, reason: "Sensitive data handling detected." };
    }

    // 2. Double check active element if we were about to interact with a specific field (runtime check)
    // This is handled in the execution phase, but good to have a policy here.

    return { safe: true };
}

// --- PART D: GROQ API INTEGRATION (Brain) ---
async function askGroq(userQuery, snapshot) {
    const systemPrompt = `
You are an Agentic UX Navigator. You receive a list of DOM elements from the user's current page.
Your goal is to map the User's Request to a specific element on the page.

Output purely JSON in this format:
{
  "page_intent": "Brief description of page context",
  "recommended_action": "The specific functional task (e.g. 'Click the Login Button')",
  "target_element_text": "The EXACT text from the snapshot of the element to interact with",
  "explanation": "Why this is the correct next step"
}

IMPORTANT: Do not output any markdown formatting (like \`\`\`json). Output ONLY the raw JSON string.
`;

    const userMessage = `
User Query: "${userQuery}"
Page Snapshot (JSON):
${JSON.stringify(snapshot)}
`;

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b", // Switched to stable model ID
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.1
                // Removed response_format to avoid 400 errors on some customized models
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;

        // Clean up Markdown if present
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(content);
        } catch (parseError) {
            console.error("JSON Parse Error. Raw content:", content);
            throw new Error("Failed to parse LLM response");
        }

    } catch (e) {
        console.error("Groq API Failed", e);
        return { error: true, message: e.message };
    }
}

// --- PART E: EXECUTION (Action) ---
const inputField = agentUI.querySelector('#agent-input');
const displayArea = agentUI.querySelector('#agent-display');
const statusBadge = agentUI.querySelector('#agent-status');

function setThinking(isThinking) {
    if (isThinking) {
        statusBadge.textContent = "Thinking...";
        statusBadge.style.color = "orange";
        displayArea.innerHTML = "<i>Analyzing page structure...</i>";
    } else {
        statusBadge.textContent = "Idle";
        statusBadge.style.color = "white";
    }
}

inputField.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = inputField.value.trim();
        if (!query) return;

        inputField.value = "";
        setThinking(true);

        // 1. Snapshot
        const snapshot = getCleanSnapshot();

        // 2. LLM Decision
        const decision = await askGroq(query, snapshot);
        setThinking(false);

        if (decision.error) {
            displayArea.innerHTML = `<span style="color:red">Error:</span> ${decision.message}. (Check API Key)`;
            return;
        }

        // 3. Safety Check
        const safety = isSafeAction(decision.target_element_text, decision.recommended_action);
        if (!safety.safe) {
            displayArea.innerHTML = `⚠️ <b>Blocked:</b> ${safety.reason}`;
            return;
        }

        // 4. Find & Highlight Element
        // We look for the element in the DOM again that matches the text.
        // In a more robust version, we'd use better heuristics or strict indexing.
        const allElements = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'));
        const target = allElements.find(el => {
            const t = (el.innerText || el.value || el.ariaLabel || "").trim();
            // Fuzzy match or exact match from LLM
            return t.includes(decision.target_element_text) || decision.target_element_text.includes(t);
        });

        if (target) {
            // Final runtime safety check on the physical element
            if (target.type === 'password') {
                displayArea.innerHTML = `⚠️ <b>Blocked:</b> Interaction with password field prevented.`;
                return;
            }

            target.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight effect
            const originalBorder = target.style.border;
            const originalBoxShadow = target.style.boxShadow;
            target.style.transition = "all 0.5s";
            target.style.border = "2px solid #2563eb";
            target.style.boxShadow = "0 0 15px rgba(37, 99, 235, 0.5)";

            displayArea.innerHTML = `
                <b>Found it!</b><br>
                Action: ${decision.recommended_action}<br>
                <span style="color:#666; font-size:11px;">${decision.explanation}</span>
            `;

            // Reset style after 3 seconds
            setTimeout(() => {
                target.style.border = originalBorder;
                target.style.boxShadow = originalBoxShadow;
            }, 3000);

        } else {
            displayArea.innerHTML = `
                <b>Hypothesis:</b> ${decision.recommended_action}<br>
                but I couldn't locate the element: "<i>${decision.target_element_text}</i>" definitively.
            `;
        }
    }
});