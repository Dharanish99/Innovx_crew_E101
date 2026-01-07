// --- CONFIGURATION ---
const GROQ_API_KEY = "YourGroqAPIKey"; // ⚠️ SECURE KEY
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- ORCHESTRATOR & STATE MACHINE ---

// Initialize State
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ agentState: null });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ANALYZE_REQUEST") {
        handleGoal(request.payload)
            .then(sendResponse)
            .catch(err => sendResponse({ error: true, message: err.message }));
        return true;
    }
    if (request.type === "GET_STATE") {
        chrome.storage.local.get(['agentState'], (result) => {
            sendResponse(result.agentState);
        });
        return true;
    }
    if (request.type === "UPDATE_STEP") {
        updateStep(request.payload).then(sendResponse);
        return true;
    }
    if (request.type === "RESET_TASK") {
        chrome.storage.local.set({ agentState: null }, () => sendResponse({ success: true }));
        return true;
    }
});

async function handleGoal(payload) {
    const { userQuery, domSnapshot, isRecovery } = payload;

    // --- 1. Predictive Engine (Heuristic Layer) ---
    // If query is empty/generic, check for domain shortcuts
    let quickActions = [];
    const url = domSnapshot && domSnapshot.length > 0 ? "current_page" : "";
    // Ideally snapshot should include URL, but we'll use heuristics on the content if needed
    // For now, let's assume we rely on the LLM to deduce context or add URL to snapshot in content.js later.
    // We will inject common patterns into the prompt context.

    // --- 2. Advanced Prompt Engineering ---
    const systemPrompt = `
You are the "Cortex", an elite AI Agentic UX Architect living inside the browser.
Your goal is to navigate websites, automate tasks, and fill forms intelligently.

### CAPABILITIES:
1. **Analyze**: Read the DOM Snapshot (list of interactive elements).
2. **Plan**: Create a logical, linear "Roadmap" of steps to achieve the User's Goal.
3. **Reason**: Explain *why* you chose a specific element.
4. **Predict**: If the user's intent is vague, suggest logical actions based on the page context.

### OUTPUT FORMAT (Strict JSON):
{
  "thought_process": "Brief internal monologue analyzing the page state and user intent.",
  "roadmap": [
    { 
      "step_id": 1, 
      "action": "click" | "type" | "navigate", 
      "target_hint": "Visual description of element (e.g. 'Blue Sign In Button')", 
      "reasoning": "Necessary to access account.",
      "tool_invocations": [] 
    }
  ],
  "immediate_target_id": "The exact 'data-agent-id' from the snapshot for the current step. NULL if not found.",
  "guidance_text": "Conversational, short, and helpful message to the user.",
  "suggested_actions": ["Quick Action 1", "Quick Action 2"],
  "clarification_needed": boolean
}

### RULES:
- **Precision**: Only select elements that explicitly exist in the Snapshot.
- **Fail Gracefully**: If the target isn't visible, set "immediate_target_id" to null and explain in "guidance_text".
- **Recovery**: If "isRecovery" is true, assume the previous plan failed. Re-scan and find an alternative path.
- **Continuity**: If the User Goal is "Strictly find...", do NOT generate a new roadmap. Return the SAME roadmap but update the "immediate_target_id" for the active step.
`;

    const userMessage = `
--- CONTEXT ---
User Goal: "${userQuery || "What can I do here?"}"
Status: ${isRecovery ? "⚠️ RECOVERY MODE (Previous step failed)" : "Standard Mode"}

--- DOM SNAPSHOT (Interactive Elements) ---
${JSON.stringify(domSnapshot).substring(0, 15000)} 
// Truncated to safe token limit
`;

    // --- 3. Call LLM ---
    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.2, // Low temp for precision
                max_tokens: 1024,
                response_format: { type: "json_object" } // Force JSON mode if supported or rely on prompt
            })
        });

        if (!response.ok) throw new Error(`Groq API Error: ${response.statusText}`);

        const data = await response.json();
        let content = data.choices[0].message.content;

        // Sanitize Markdown if present
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        const plan = JSON.parse(content);

        // --- 4. State Persistence ---
        const newState = {
            isActive: !plan.clarification_needed,
            goal: userQuery,
            roadmap: plan.roadmap || [],
            currentStep: 0,
            lastUpdated: Date.now()
        };
        await chrome.storage.local.set({ agentState: newState });

        return plan;

    } catch (error) {
        console.error("Cortex Failure:", error);
        return {
            error: true,
            message: "I encountered a cognitive error. Please try again.",
            debug: error.message
        };
    }
}

async function updateStep(index) {
    const data = await chrome.storage.local.get(['agentState']);
    if (data.agentState) {
        data.agentState.currentStep = index;
        await chrome.storage.local.set({ agentState: data.agentState });
    }
    return { success: true };
}
