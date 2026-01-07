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
                        <div class="dev-toggle-wrapper">
                            <span>Dev Mode</span>
                            <div class="switch" id="dev-toggle"></div>
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

        const devToggle = this.shadow.getElementById('dev-toggle');
        devToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.demoMode = !this.demoMode;
            devToggle.classList.toggle('on', this.demoMode);
            this.addMessage('agent', `Developer Logs: ${this.demoMode ? 'ON' : 'OFF'}`);
        });

        const input = this.shadow.getElementById('agent-input');
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.handleInput(); });

        this.shadow.getElementById('send-btn').addEventListener('click', () => this.handleInput());

        this.shadow.getElementById('scan-trigger').addEventListener('click', () => {
            this.scanAndAnalyze("Analyze this page and find productivity shortcuts");
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

        chrome.runtime.sendMessage({
            type: "ANALYZE_REQUEST",
            payload: { userQuery: query, domSnapshot: snapshot }
        }, (response) => {
            this.setStatus('ready');
            if (chrome.runtime.lastError) return;

            if (this.demoMode) {
                this.addMessage('agent', `<div class="debug-log">${JSON.stringify(response, null, 2)}</div>`, true);
            }

            this.handlePlanResponse(response);
        });
    }

    handlePlanResponse(plan) {
        const { roadmap, immediate_target_id, guidance_text, clarification_needed } = plan;

        if (clarification_needed) {
            this.addMessage('agent', `🤔 ${guidance_text}`);
        } else {
            this.renderStepper(roadmap, 0);
            if (immediate_target_id) {
                this.addPlan(roadmap[0].reasoning, immediate_target_id, roadmap[0].step_id);
                this.addMessage('agent', guidance_text);
            } else {
                this.addMessage('agent', "Plan created. I'll guide you step-by-step.");
            }
        }
    }

    renderStepper(roadmap, currentStepIndex) {
        const existing = this.shadow.querySelector('.stepper-container');
        if (existing) existing.remove();

        const stepperDetails = document.createElement('div');
        stepperDetails.className = 'stepper-container';
        stepperDetails.style.padding = '10px 16px';
        stepperDetails.style.background = 'rgba(0,0,0,0.02)';
        stepperDetails.style.borderBottom = '1px solid var(--glass-border)';
        stepperDetails.innerHTML = `
            <div style="font-size:11px; font-weight:700; color:var(--primary-color); text-transform:uppercase; margin-bottom:4px;">
                Mission Progress: Step ${currentStepIndex + 1}/${roadmap.length}
            </div>
            <div style="display:flex; gap:4px; height:4px; margin-top:4px;">
                ${roadmap.map((step, i) => `
                    <div style="flex:1; border-radius:2px; background: ${i <= currentStepIndex ? 'var(--primary-color)' : '#e2e8f0'}"></div>
                `).join('')}
            </div>
            <div style="font-size:12px; margin-top:6px; color:var(--text-main);">
                Current: <b>${roadmap[currentStepIndex].action} ${roadmap[currentStepIndex].target_hint}</b>
            </div>
        `;
        const header = this.shadow.querySelector('.sidebar-header');
        header.insertAdjacentElement('afterend', stepperDetails);
    }

    addPlan(reasoning, targetId, stepId) {
        const html = `
            <div class="plan-card">
                <div class="plan-title">Step Logic</div>
                <div>${reasoning}</div>
                ${targetId ? `<button class="action-btn" data-target="${targetId}">Confirm & Execute</button>` : ''}
            </div>
        `;
        this.addMessage('agent', html, true);

        const btn = this.shadow.querySelector(`button[data-target="${targetId}"]`);
        if (btn) {
            btn.addEventListener('click', () => {
                this.executeAction(targetId);
                btn.innerText = "Executing...";
                btn.disabled = true;
                chrome.runtime.sendMessage({ type: "UPDATE_STEP", payload: stepId });
                this.showToast(`Step ${stepId} Completed!`);
            });
        }
    }

    executeAction(targetId) {
        const success = smoothFocus(targetId);
        if (!success) this.addMessage('agent', "⚠️ Element lost. Rescan required.");
    }

    setStatus(state) {
        const dot = this.shadow.getElementById('status-dot');
        dot.className = `status-dot ${state}`;
    }

    async restoreState() {
        chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
            if (state && state.isActive && state.roadmap) {
                this.toggle(true);
                this.renderStepper(state.roadmap, state.currentStep);

                // --- CONTINUITY ENGINE ---
                const current = state.roadmap[state.currentStep];
                if (current) {
                    this.addMessage('agent', `🔄 <b>Page Refreshed</b>. Resuming Step ${state.currentStep + 1}: ${current.action} ${current.target_hint}...`);

                    // Auto-Trigger Scan specifically to find the next target
                    // We artificially inject the query to "find" the next step
                    this.scanAndAnalyze(`Strictly find the element for this step: ${current.target_hint}. Reason: ${current.reasoning}`);
                }
            }
        });
    }

    guideNextStep() {
        // Trigger highlight for current step if available
        chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
            if (state && state.roadmap) {
                this.addMessage('agent', `Guiding to: ${state.roadmap[state.currentStep].target_hint}`);
                // In a real scenario, we'd need to re-find the ID or have a robust way to map the hint to the DOM
                // This requires re-scan if ID is stale.
                this.scanAndAnalyze(`Find the ${state.roadmap[state.currentStep].target_hint} button`);
            } else {
                this.addMessage('agent', "No active plan to guide.");
            }
        });
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
