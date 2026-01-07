// --- CONFIGURATION ---
const GROQ_API_KEY = "YourGroqAPIKey"; // ⚠️ SECURE KEY
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- STORAGE MANAGER (Robust Fallback) ---
const RAM_STORE = { agentState: null }; // Fallback if chrome.storage fails

const Storage = {
    async get(keys) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return await chrome.storage.local.get(keys);
        }
        console.warn("Storage API missing. Using RAM fallback.");
        return { agentState: RAM_STORE.agentState };
    },
    async set(items) {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set(items);
            }
        } catch (e) {
            console.warn("Storage write failed (non-fatal):", e);
        }
        // Always keep RAM fallback up‑to‑date
        if (items.agentState !== undefined) RAM_STORE.agentState = items.agentState;
    }
};
// --- ORCHESTRATOR & STATE MACHINE ---

// Initialize State
chrome.runtime.onInstalled.addListener(() => {
    Storage.set({ agentState: null });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            // Ensure any storage operation never throws
            // (Storage.set already catches its own errors)

            if (request.type === "ANALYZE_REQUEST") {
                const result = await handleGoal(request.payload);
                sendResponse(result);
            } else if (request.type === "GET_STATE") {
                const result = await Storage.get(['agentState']);
                sendResponse(result.agentState);
            } else if (request.type === "UPDATE_STEP") {
                await updateStep(request.payload);
                sendResponse({ success: true });
            } else if (request.type === "RESET_TASK") {
                await Storage.set({ agentState: null });
                sendResponse({ success: true });
            } else {
                // Unknown request – still reply to avoid channel closure
                sendResponse({ error: true, message: "Unsupported request type." });
            }
        } catch (error) {
            console.error("Background Message Handler Error:", error);
            // Always reply, even on unexpected failures
            sendResponse({ error: true, message: error.message || "Unknown background error" });
        }
    })();
    // Must return true to keep the channel open for async reply
    return true;
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

    // --- 2. Smart Guidance Prompt ---
    const systemPrompt = `
You are a helpful browser assistant that guides users step-by-step to complete tasks on websites.

### YOUR JOB:
1. Understand what the user wants to accomplish.
2. Analyze the DOM SNAPSHOT - each element has a unique "id" field.
3. Create steps that reference SPECIFIC elements from the snapshot.
4. For EACH step, include the element's "id" so we can highlight it.

### OUTPUT FORMAT (JSON):
{
  "roadmap": [
    {
      "step_id": 1,
      "action": "click" | "type" | "scroll" | "wait",
      "target_id": "THE EXACT 'id' VALUE FROM THE SNAPSHOT (e.g., 'abc123')",
      "target_hint": "Human-readable description (e.g., 'the First Name input field')",
      "reasoning": "Brief explanation of why this step is needed"
    }
  ],
  "guidance_text": "Friendly message explaining the plan to the user",
  "clarification_needed": false
}

### CRITICAL RULES:
- target_id MUST match an "id" from the DOM snapshot exactly
- If you can't find a matching element, set target_id to null
- Be specific in target_hint (describe by text, position, or appearance)
- Maximum 10 steps per roadmap
`;

    const userMessage = `
--- CONTEXT ---
User Goal: "${userQuery || "What can I do here?"}"
Status: ${isRecovery ? "⚠️ RECOVERY MODE (Previous step failed)" : "Standard Mode"}

--- DOM SNAPSHOT (Interactive Elements) ---
${JSON.stringify(domSnapshot).substring(0, 10000)} 
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

        // --- 4. Save State (via Robust Storage) ---
        const newState = {
            isActive: !plan.clarification_needed,
            goal: userQuery,
            roadmap: plan.roadmap || [],
            currentStep: 0,
            lastUpdated: Date.now()
        };
        await Storage.set({ agentState: newState });

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
    const data = await Storage.get(['agentState']);
    if (data.agentState) {
        data.agentState.currentStep = index;
        await Storage.set({ agentState: data.agentState });
    }
    return { success: true };
}
