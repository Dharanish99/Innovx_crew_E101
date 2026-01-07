// --- CONFIGURATION ---
const GROQ_API_KEY = "YourGroqAPIKey"; // ⚠️ REPLACE THIS
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- AGENT INTERFACE V4 (Elite UX) ---

class AgentSidebar {
    constructor() {
        this.host = null;
        this.shadow = null;
        this.sidebar = null;
        this.isTyping = false;
        this.demoMode = false;
        this.messageQueue = [];
        // NEW: Mode and instance tracking
        this.mode = 'steps'; // 'steps' or 'instructions'
        this.instanceId = Math.random().toString(36).substring(2, 8); // Unique per tab
        this.buttonCounter = 0; // For unique button IDs
        this.init();
    }

    init() {
        // 1. Create Shadow Host
        this.host = document.createElement('div');
        this.host.id = 'agent-shadow-host';
        document.body.appendChild(this.host);

        // 2. Attach Shadow Root
        this.shadow = this.host.attachShadow({ mode: 'open' });

        // 3. Inject Styles
        const linkElem = document.createElement('link');
        linkElem.setAttribute('rel', 'stylesheet');
        linkElem.setAttribute('href', chrome.runtime.getURL('sidebar.css'));
        this.shadow.appendChild(linkElem);

        // 4. Build Structure
        this.render();

        // 5. Bind Events
        this.bindEvents();
        this.bindHotkeys();

        // 6. Check Persistence
        this.restoreState();

        // 7. Start Form Engine
        this.initFormEngine();
    }

    render() {
        const container = document.createElement('div');
        container.className = 'sidebar-root collapsed';

        // SVGs
        const logoIcon = `<svg class="logo-icon" viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V11h3.5c2.2 0 4 1.8 4 4v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-5c0-2.2 1.8-4 4-4H11V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" fill="currentColor"/></svg>`;
        const closeIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
        const scanIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>`;
        const sendIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/></svg>`;

        container.innerHTML = `
            <!-- Collapsed State Icon -->
            <div class="collapsed-icon">${logoIcon}</div>

            <!-- Header -->
            <div class="sidebar-header">
                <div class="header-left">
                    ${logoIcon}
                    <div class="header-info">
                        <span class="agent-title">Agentic UX</span>
                        <div class="mode-selector">
                            <button class="mode-btn active" id="mode-steps">📍 Steps</button>
                            <button class="mode-btn" id="mode-instructions">📝 Instructions</button>
                        </div>
                    </div>
                </div>
                <div class="controls">
                    <div class="status-dot" id="status-dot" title="Status"></div>
                    <button class="close-btn" id="toggle-btn">${closeIcon}</button>
                </div>
            </div>

            <!-- Chat Stream -->
            <div class="sidebar-content" id="chat-stream">
                <div class="chat-bubble agent">
                    Ready to help. (Alt+S to Scan)
                </div>
            </div>

            <!-- Footer -->
            <div class="sidebar-footer">
                <button class="scan-btn" id="scan-trigger" title="Quick Scan">${scanIcon}</button>
                <div class="input-group">
                    <input type="text" class="chat-input" id="agent-input" placeholder="Ask or Alt+S...">
                    <span class="send-icon" id="send-btn">${sendIcon}</span>
                </div>
            </div>
        `;
        this.shadow.appendChild(container); // Add container first
        this.sidebar = container;

        // Add Toast Container to Shadow Root
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.id = 'agent-toast';
        toast.innerText = 'Success!';
        this.shadow.appendChild(toast);
    }

    bindEvents() {
        this.sidebar.addEventListener('click', (e) => {
            if (this.sidebar.classList.contains('collapsed')) this.toggle(true);
        });

        const toggleBtn = this.shadow.getElementById('toggle-btn');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle(false);
        });

        // Mode toggle handlers
        const modeStepsBtn = this.shadow.getElementById('mode-steps');
        const modeInstructionsBtn = this.shadow.getElementById('mode-instructions');

        modeStepsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 'steps';
            modeStepsBtn.classList.add('active');
            modeInstructionsBtn.classList.remove('active');
            this.addMessage('agent', "📍 <b>Steps Mode</b>: I'll guide you step-by-step with visual highlights.");
        });

        modeInstructionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 'instructions';
            modeInstructionsBtn.classList.add('active');
            modeStepsBtn.classList.remove('active');
            this.addMessage('agent', "📝 <b>Instructions Mode</b>: I'll give you detailed written instructions.");
        });

        const input = this.shadow.getElementById('agent-input');
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.handleInput(); });

        this.shadow.getElementById('send-btn').addEventListener('click', () => this.handleInput());

        this.shadow.getElementById('scan-trigger').addEventListener('click', () => {
            this.scanAndAnalyze("Analyze this page and tell me what I can do here");
        });
    }

    bindHotkeys() {
        document.addEventListener('keydown', (e) => {
            // Alt+S: Scan
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggle(true);
                this.scanAndAnalyze("Analyze this page and find productivity shortcuts");
            }
            // Alt+G: Guide (Highlight Next Step)
            if (e.altKey && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                this.guideNextStep();
            }
            // Esc: Close
            if (e.key === 'Escape') {
                this.toggle(false);
                // Remove highlights
                const overlay = document.getElementById('agent-highlight-overlay');
                if (overlay) overlay.remove();
            }
        });
    }

    initFormEngine() {
        // Simple delegator for focus events
        document.addEventListener('focus', (e) => {
            const el = e.target;
            if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
                this.checkFieldAssist(el);
            }
        }, true);

        // Validation check on navigation/submit
        document.addEventListener('submit', (e) => {
            this.validateForm(e.target, e);
        });
    }

    checkFieldAssist(el) {
        // Security Check
        if (el.type === 'password' || el.type === 'hidden') return;

        // Label heuristic
        let label = el.placeholder || el.getAttribute('aria-label') || '';
        if (!label && el.id) {
            const labelEl = document.querySelector(`label[for="${el.id}"]`);
            if (labelEl) label = labelEl.innerText;
        }

        // Suggestion Logic
        if (label.toLowerCase().includes('date')) {
            this.showTooltip(el, "Insert Today's Date?");
        }
    }

    showTooltip(targetEl, text) {
        let tooltip = document.getElementById('agent-tooltip-el');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'agent-tooltip-el';
            tooltip.className = 'agent-tooltip';
            // Style needs to be global since it's attaching to body
            Object.assign(tooltip.style, {
                position: 'absolute', background: '#333', color: '#fff',
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                zIndex: '2147483647', pointerEvents: 'none', transition: 'opacity 0.2s', opacity: '0'
            });
            document.body.appendChild(tooltip);
        }

        const rect = targetEl.getBoundingClientRect();
        tooltip.innerText = `💡 ${text}`;
        tooltip.style.top = (window.scrollY + rect.top - 30) + 'px';
        tooltip.style.left = (window.scrollX + rect.left) + 'px';
        tooltip.style.opacity = '1';

        setTimeout(() => { tooltip.style.opacity = '0'; }, 3000);
    }

    validateForm(form, event) {
        const required = form.querySelectorAll('[required], [aria-required="true"]');
        let missing = [];
        required.forEach(el => {
            if (!el.value.trim()) missing.push(el.name || el.placeholder || "Unknown Field");
        });

        if (missing.length > 0) {
            event.preventDefault();
            this.toggle(true);
            this.addMessage('agent', `⚠️ Hold on! You missed required fields: <b>${missing.join(', ')}</b>.`);

            // Highlight them
            missing.forEach(name => {
                const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`[placeholder="${name}"]`);
                if (el) el.style.border = "2px solid red";
            });
        }
    }

    toggle(expand) {
        if (expand) this.sidebar.classList.remove('collapsed');
        else this.sidebar.classList.add('collapsed');
    }

    // --- MESSAGING SYSTEM (Typewriter) ---

    addMessage(role, text, isHtml = false) {
        const stream = this.shadow.getElementById('chat-stream');
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;

        if (role === 'user' || isHtml) {
            // Immediate render for user or complex HTML
            bubble.innerHTML = text;
            stream.appendChild(bubble);
            stream.scrollTop = stream.scrollHeight;
        } else {
            // Typewriter for Agent text
            bubble.classList.add('typewriter-cursor');
            stream.appendChild(bubble);
            this.typewriter(bubble, text);
        }
    }

    typewriter(element, text, index = 0) {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            element.scrollTop = element.scrollHeight;
            this.shadow.getElementById('chat-stream').scrollTop = this.shadow.getElementById('chat-stream').scrollHeight;

            // Randomize typing speed for human feel (10-30ms)
            setTimeout(() => this.typewriter(element, text, index + 1), Math.random() * 20 + 10);
        } else {
            element.classList.remove('typewriter-cursor');
        }
    }

    showToast(message) {
        const toast = this.shadow.getElementById('agent-toast');
        toast.innerHTML = `✅ ${message}`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // --- LOGIC ---

    async scanAndAnalyze(query) {
        this.setStatus('scanning');
        this.addMessage('agent', "Scanning page structure...");

        const snapshot = getCleanSnapshot();
        this.handleInput(query, snapshot);
    }

    async handleInput(forceQuery = null, snapshotDef = null) {
        const input = this.shadow.getElementById('agent-input');
        const query = forceQuery || input.value.trim();
        if (!query) return;

        if (!forceQuery) input.value = '';
        if (!forceQuery) this.addMessage('user', query); // Don't verify own auto-messages

        this.setStatus('thinking');

        const snapshot = snapshotDef || getCleanSnapshot();

        chrome.runtime.sendMessage(
            { type: "ANALYZE_REQUEST", payload: { userQuery: query, domSnapshot: snapshot } },
            (response) => {
                this.setStatus('ready');

                if (chrome.runtime.lastError) {
                    this.addMessage('agent', `❌ <b>System Error</b>: ${chrome.runtime.lastError.message}`);
                    console.error("Agent Runtime Error:", chrome.runtime.lastError);
                    return;
                }

                // Guard against missing response
                if (!response) {
                    this.addMessage('agent', "❌ <b>No response</b> from background – extension may have crashed.");
                    console.warn("Empty response from background.");
                    return;
                }

                if (this.demoMode) {
                    this.addMessage('agent',
                        `<div class="debug-log">${JSON.stringify(response, null, 2)}</div>`, true);
                }

                this.handlePlanResponse(response);
            }
        );
    }

    handlePlanResponse(plan) {
        if (!plan) return;
        if (plan.error) {
            this.addMessage('agent', `❌ <b>Oops!</b> ${plan.message || 'Something went wrong. Please try again.'}`);
            return;
        }

        const { roadmap, guidance_text, clarification_needed } = plan;

        if (clarification_needed) {
            this.addMessage('agent', `🤔 ${guidance_text}`);
        } else if (roadmap && roadmap.length > 0) {
            this.currentRoadmap = roadmap;
            this.currentStepIndex = 0;

            // Different handling based on mode
            if (this.mode === 'instructions') {
                this.showInstructionsMode(roadmap);
            } else {
                // Steps mode
                this.addMessage('agent', `📋 <b>Got it!</b> I've created a ${roadmap.length}-step plan for you.`);
                this.renderStepper(roadmap, 0);
                this.showCurrentStep();
            }
        } else {
            this.addMessage('agent', guidance_text || "I looked at the page but I'm not sure what to do. Can you be more specific?");
        }
    }

    // --- INSTRUCTIONS MODE: Text-only detailed guide ---
    showInstructionsMode(roadmap) {
        let instructionsHtml = `
            <div class="plan-card" style="max-height: 400px; overflow-y: auto;">
                <div class="plan-title">📝 Complete Instructions</div>
                <div style="margin-top: 12px;">
        `;

        roadmap.forEach((step, index) => {
            const actionLabel = this.formatAction(step.action);
            instructionsHtml += `
                <div style="padding: 12px; margin-bottom: 10px; background: ${index % 2 === 0 ? '#f8fafc' : '#fff'}; border-radius: 8px; border-left: 3px solid #6366f1;">
                    <div style="font-weight: 700; color: #4338ca; margin-bottom: 6px;">Step ${index + 1}: ${actionLabel}</div>
                    <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;"><b>What to do:</b> ${step.target_hint}</div>
                    <div style="font-size: 13px; color: #64748b;">💡 ${step.reasoning}</div>
                </div>
            `;
        });

        instructionsHtml += `
                </div>
                <div style="margin-top: 12px; padding: 10px; background: #f0fdf4; border-radius: 8px; font-size: 13px; color: #166534;">
                    ✨ Follow these steps in order. Take your time!
                </div>
            </div>
        `;

        this.addMessage('agent', instructionsHtml, true);
    }

    // --- STEPS MODE: Interactive step-by-step guidance ---
    showCurrentStep() {
        if (!this.currentRoadmap || this.currentStepIndex >= this.currentRoadmap.length) return;

        const step = this.currentRoadmap[this.currentStepIndex];
        const stepNum = this.currentStepIndex + 1;
        const totalSteps = this.currentRoadmap.length;
        const actionLabel = this.formatAction(step.action);

        // Generate unique button IDs for this instance and step
        this.buttonCounter++;
        const showMeBtnId = `show-${this.instanceId}-${this.buttonCounter}`;
        const doneBtnId = `done-${this.instanceId}-${this.buttonCounter}`;

        const html = `
            <div class="plan-card">
                <div class="plan-title">📍 Step ${stepNum} of ${totalSteps}</div>
                <div style="margin: 10px 0; line-height: 1.7; font-size: 14px;">
                    <div style="margin-bottom: 8px;">
                        <span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${actionLabel}</span>
                    </div>
                    <div style="font-size: 15px; font-weight: 500; color: #1e293b;">${step.target_hint}</div>
                    <div style="font-size: 13px; color: #64748b; margin-top: 6px;">💡 ${step.reasoning}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="${showMeBtnId}" style="flex: 1; background: #f0f4ff; color: #4338ca;">🔍 Show me</button>
                    <button class="action-btn" id="${doneBtnId}" style="flex: 2;">✓ Done - Next</button>
                </div>
            </div>
        `;
        this.addMessage('agent', html, true);

        // Bind with unique IDs (setTimeout ensures DOM is ready)
        setTimeout(() => {
            const showMeBtn = this.shadow.getElementById(showMeBtnId);
            const doneBtn = this.shadow.getElementById(doneBtnId);

            if (showMeBtn) {
                showMeBtn.onclick = () => this.highlightCurrentTarget();
            }

            if (doneBtn) {
                doneBtn.onclick = () => {
                    doneBtn.innerText = "✓ Done!";
                    doneBtn.disabled = true;
                    doneBtn.style.background = "#10b981";
                    this.clearHighlight();
                    this.advanceStep();
                };
            }
        }, 50);

        // Auto-highlight the target
        this.highlightCurrentTarget();
    }

    highlightCurrentTarget() {
        if (!this.currentRoadmap || this.currentStepIndex >= this.currentRoadmap.length) return;

        const step = this.currentRoadmap[this.currentStepIndex];
        let element = null;

        // 1. Try to find by exact ID from LLM (most accurate)
        if (step.target_id) {
            element = document.querySelector(`[data-agent-id="${step.target_id}"]`);
        }

        // 2. Fall back to text-based search if ID not found
        if (!element && step.target_hint) {
            element = this.findElementByHint(step.target_hint);
        }

        if (element) {
            this.highlightElement(element);
        } else {
            this.showToast("Element not visible. Look for: " + step.target_hint);
        }
    }

    findElementByHint(hint) {
        if (!hint) return null;

        const searchTerms = hint.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const selectors = 'a, button, input, select, textarea, [role="button"], label, [onclick]';
        const elements = document.querySelectorAll(selectors);

        let bestMatch = null;
        let bestScore = 0;

        for (const el of elements) {
            // Skip hidden elements
            if (el.offsetParent === null && el.type !== 'hidden') continue;

            // Get searchable text
            const text = (el.innerText || el.placeholder || el.ariaLabel || el.name || el.value || '').toLowerCase();

            // Calculate match score
            let score = 0;
            for (const term of searchTerms) {
                if (text.includes(term)) score += 10;
            }

            // Bonus for exact matches
            if (text.includes(hint.toLowerCase())) score += 50;

            // Bonus for visible, interactive elements
            if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.type === 'submit') score += 5;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = el;
            }
        }

        return bestMatch;
    }

    highlightElement(element) {
        // Clear any existing highlight
        this.clearHighlight();

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Create highlight overlay
        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.id = 'agent-highlight-overlay';
        overlay.innerHTML = `
            <div class="agent-highlight-box"></div>
            <div class="agent-highlight-label">Here!</div>
        `;

        // Inject styles if not already present
        if (!document.getElementById('agent-highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'agent-highlight-styles';
            style.textContent = `
                #agent-highlight-overlay {
                    position: fixed;
                    pointer-events: none;
                    z-index: 2147483647;
                    transition: all 0.3s ease;
                }
                .agent-highlight-box {
                    position: absolute;
                    border: 3px solid #6366f1;
                    border-radius: 8px;
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3), 0 0 20px rgba(99, 102, 241, 0.4);
                    animation: agent-pulse 1.5s ease-in-out infinite;
                }
                .agent-highlight-label {
                    position: absolute;
                    top: -35px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
                    white-space: nowrap;
                }
                @keyframes agent-pulse {
                    0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3), 0 0 20px rgba(99, 102, 241, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.2), 0 0 30px rgba(99, 102, 241, 0.6); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        // Position the overlay
        const updatePosition = () => {
            const r = element.getBoundingClientRect();
            overlay.style.top = (r.top - 4) + 'px';
            overlay.style.left = (r.left - 4) + 'px';

            const box = overlay.querySelector('.agent-highlight-box');
            box.style.width = (r.width + 8) + 'px';
            box.style.height = (r.height + 8) + 'px';
        };
        updatePosition();

        // Update position on scroll/resize
        this.highlightUpdateHandler = updatePosition;
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);

        // Auto-remove after 10 seconds
        this.highlightTimeout = setTimeout(() => this.clearHighlight(), 10000);
    }

    clearHighlight() {
        const overlay = document.getElementById('agent-highlight-overlay');
        if (overlay) overlay.remove();

        if (this.highlightUpdateHandler) {
            window.removeEventListener('scroll', this.highlightUpdateHandler, true);
            window.removeEventListener('resize', this.highlightUpdateHandler);
        }

        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
        }
    }

    formatAction(action) {
        const actions = {
            'click': '👆 Click',
            'type': '⌨️ Type',
            'scroll': '📜 Scroll',
            'wait': '⏳ Wait',
            'navigate': '🔗 Go to',
            'select': '📋 Select',
            'check': '☑️ Check'
        };
        return actions[action?.toLowerCase()] || `▶️ ${action || 'Do'}`;
    }

    advanceStep() {
        this.currentStepIndex++;

        if (this.currentStepIndex < this.currentRoadmap.length) {
            this.renderStepper(this.currentRoadmap, this.currentStepIndex);
            this.showToast(`Step ${this.currentStepIndex} done! Moving to next...`);
            this.showCurrentStep();

            // Update backend state
            chrome.runtime.sendMessage({ type: "UPDATE_STEP", payload: this.currentStepIndex });
        } else {
            this.clearHighlight();
            this.addMessage('agent', "🎉 <b>Awesome!</b> You've completed all the steps. Great job!");
            this.showToast("All done!");

            // Clear stepper
            const stepper = this.shadow.querySelector('.stepper-container');
            if (stepper) stepper.remove();

            // Reset state
            chrome.runtime.sendMessage({ type: "RESET_TASK" });
        }
    }

    renderStepper(roadmap, currentStepIndex) {
        const existing = this.shadow.querySelector('.stepper-container');
        if (existing) existing.remove();

        if (!roadmap || roadmap.length === 0) return;

        const stepperDetails = document.createElement('div');
        stepperDetails.className = 'stepper-container';
        stepperDetails.style.cssText = 'padding: 12px 16px; background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%); border-bottom: 1px solid #c7d2fe;';

        stepperDetails.innerHTML = `
            <div style="font-size: 11px; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: 0.5px;">
                Progress: Step ${currentStepIndex + 1} of ${roadmap.length}
            </div>
            <div style="display: flex; gap: 4px; height: 6px; margin-top: 8px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${((currentStepIndex + 1) / roadmap.length) * 100}%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 3px; transition: width 0.3s ease;"></div>
            </div>
        `;
        const header = this.shadow.querySelector('.sidebar-header');
        header.insertAdjacentElement('afterend', stepperDetails);
    }
    setStatus(state) {
        const dot = this.shadow.getElementById('status-dot');
        if (dot) dot.className = `status-dot ${state}`;
    }

    // --- PERSISTENCE: Remember mission across page loads ---
    async restoreState() {
        chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
            if (chrome.runtime.lastError) return;

            if (state && state.isActive && state.roadmap && state.roadmap.length > 0) {
                this.toggle(true);
                this.currentRoadmap = state.roadmap;
                this.currentStepIndex = state.currentStep || 0;

                if (this.currentStepIndex < this.currentRoadmap.length) {
                    this.addMessage('agent', `🔄 <b>Welcome back!</b> Continuing from Step ${this.currentStepIndex + 1} of ${state.roadmap.length}.`);
                    this.addMessage('agent', `🎯 Goal: <b>${state.goal}</b>`);
                    this.renderStepper(state.roadmap, this.currentStepIndex);
                    this.showCurrentStep();
                }
            }
        });
    }

    guideNextStep() {
        if (this.currentRoadmap && this.currentStepIndex < this.currentRoadmap.length) {
            const step = this.currentRoadmap[this.currentStepIndex];
            const actionLabel = this.formatAction(step.action);
            this.addMessage('agent', `👉 Current: <b>${actionLabel}</b> ${step.target_hint}`);
        } else {
            this.addMessage('agent', "No active mission. Ask me something to get started!");
        }
    }
}

// --- UTILS ---
function getCleanSnapshot() {
    const selectors = ['a', 'button', 'input', 'select', 'label', '[role="button"]'];
    const elements = document.querySelectorAll(selectors.join(','));
    const tree = [];

    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5 || window.getComputedStyle(el).visibility === 'hidden') return;

        let agentId = el.getAttribute('data-agent-id');
        if (!agentId) {
            agentId = Math.random().toString(36).substring(2, 10);
            el.setAttribute('data-agent-id', agentId);
        }

        let label = el.innerText || el.ariaLabel || el.placeholder || el.name || "";
        label = label.trim().substring(0, 100);

        if (label) {
            tree.push({
                id: agentId,
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                text: label
            });
        }
    });
    return tree;
}

function smoothFocus(targetId) {
    const target = document.querySelector(`[data-agent-id="${targetId}"]`);
    if (!target) return false;
    if (target.type === 'password') return false;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let overlay = document.getElementById('agent-highlight-overlay');
    if (overlay) overlay.remove();

    const rect = target.getBoundingClientRect();
    overlay = document.createElement('div');
    overlay.id = 'agent-highlight-overlay';
    Object.assign(overlay.style, {
        position: 'absolute',
        top: (rect.top + window.scrollY) + 'px',
        left: (rect.left + window.scrollX) + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        border: '2px solid #2563eb',
        borderRadius: '4px',
        boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)',
        pointerEvents: 'none',
        zIndex: '2147483646',
        transition: 'all 0.3s ease'
    });
    document.body.appendChild(overlay);

    setTimeout(() => overlay.remove(), 4000);
    return true;
}

window.addEventListener('load', () => {
    new AgentSidebar();
});
