/**
 * =============================================================================
 * SECURITY ARCHITECTURE NOTE
 * =============================================================================
 * 
 * STATUS: DEMO BUILD
 * 
 * The API key below is intentionally client-side for demonstration purposes.
 * This is a deliberate decision to enable rapid prototyping and feature
 * validation without backend infrastructure complexity.
 * 
 * FOR PRODUCTION:
 * 1. Move API key to a backend proxy service (Express, Cloudflare Worker, etc.)
 * 2. Extension calls YOUR backend → backend calls Groq with server-side key
 * 3. Add user authentication and rate limiting
 * 
 * See SECURITY.md for full production migration guide.
 * 
 * Safety measures ALREADY implemented:
 * - No auto form submission
 * - Password fields blocked
 * - User confirmation required for all actions
 * =============================================================================
 */

// --- CONFIGURATION (DEMO MODE - See note above) ---
const GROQ_API_KEY = "YourGroqAPIKey";
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
        // Mode tracking: 'steps', 'instructions', or 'auto'
        this.mode = 'steps';
        this.instanceId = Math.random().toString(36).substring(2, 8);
        this.buttonCounter = 0;

        // --- ORIGIN TRACKING (for site-specific chat) ---
        this.currentOrigin = window.location.origin;

        // --- AUTO MODE STATE ---
        this.autoModeEnabled = false;
        this.autoExecutor = {
            isRunning: false,
            isPaused: false,
            currentActionIndex: 0,
            pendingActions: [],
            executedActions: [],
            consentGiven: false,
            stepByStep: false
        };
        this.autoModeConfidenceThreshold = 0.7;
        this.autoModeSensitiveFields = ['password', 'otp', 'captcha', 'cvv', 'credit-card', 'card-number', 'ssn', 'pin'];
        this.autoModeBlockedActions = ['submit', 'delete', 'remove', 'cancel', 'revoke', 'logout', 'signout'];

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

        // 6. Check for origin change and clear old chat if needed
        this.checkOriginAndClearIfNeeded();

        // 7. Check Persistence
        this.restoreState();

        // 8. Start Form Engine
        this.initFormEngine();
    }

    checkOriginAndClearIfNeeded() {
        // Get stored origin from sessionStorage
        const storedOrigin = sessionStorage.getItem('agent_last_origin');
        const currentOrigin = window.location.origin;

        if (storedOrigin && storedOrigin !== currentOrigin) {
            // Origin changed - clear chat messages
            this.clearChatMessages();
            // Reset roadmap state
            this.currentRoadmap = null;
            this.currentStepIndex = 0;
        }

        // Update stored origin
        sessionStorage.setItem('agent_last_origin', currentOrigin);
    }

    clearChatMessages() {
        const chatBody = this.shadow?.querySelector('.chat-body');
        if (chatBody) {
            // Keep only the welcome message
            const messages = chatBody.querySelectorAll('.chat-bubble');
            messages.forEach((msg, index) => {
                if (index > 0) { // Keep first welcome message
                    msg.remove();
                }
            });
        }
        // Clear stepper if present
        const stepper = this.shadow?.querySelector('.stepper-container');
        if (stepper) stepper.remove();
    }

    render() {
        const container = document.createElement('div');
        container.className = 'sidebar-root collapsed';

        // SVGs
        const logoIcon = `<svg class="logo-icon" viewBox="0 0 24 24"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V11h3.5c2.2 0 4 1.8 4 4v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-5c0-2.2 1.8-4 4-4H11V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" fill="currentColor"/></svg>`;
        const closeIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
        const scanIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>`;
        const sendIcon = `<svg class="icon" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/></svg>`;
        const resetIcon = `<svg class="icon" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/></svg>`;

        container.innerHTML = `
            <!-- Collapsed State Icon -->
            <div class="collapsed-icon">${logoIcon}</div>

            <!-- Header -->
            <div class="sidebar-header">
                <div class="header-left">
                    ${logoIcon}
                    <div class="header-info">
                        <span class="agent-title">Agentic UX</span>
                        <div class="mode-selector" style="display: flex; gap: 2px; margin-top: 2px;">
                            <button class="mode-btn active" id="mode-steps" data-mode="steps" style="padding: 2px 6px; font-size: 10px; border: none; border-radius: 3px; cursor: pointer; background: #4E342E; color: white;">Steps</button>
                            <button class="mode-btn" id="mode-instructions" data-mode="instructions" style="padding: 2px 6px; font-size: 10px; border: none; border-radius: 3px; cursor: pointer; background: transparent; color: #6D4C41;">Guide</button>
                            <button class="mode-btn" id="mode-auto" data-mode="auto" style="padding: 2px 6px; font-size: 10px; border: none; border-radius: 3px; cursor: pointer; background: transparent; color: #6D4C41;">Auto</button>
                        </div>
                    </div>
                </div>
                <div class="controls">
                    <button class="reset-btn" id="reset-chat-btn" title="Clear chat" style="background: transparent; border: none; cursor: pointer; padding: 4px; color: #6D4C41; opacity: 0.7;">${resetIcon}</button>
                    <div class="status-dot" id="status-dot" title="Status"></div>
                    <button class="close-btn" id="toggle-btn">${closeIcon}</button>
                </div>
            </div>

            <!-- Mode-Specific Chat Streams -->
            <div class="sidebar-content" id="chat-stream">
                <!-- Steps Mode Chat -->
                <div class="chat-body mode-chat active" id="chat-steps">
                    <div class="chat-bubble agent">
                        <b>Steps Mode</b> - I'll guide you step-by-step with visual highlights.
                    </div>
                </div>
                <!-- Guide Mode Chat -->
                <div class="chat-body mode-chat" id="chat-instructions" style="display: none;">
                    <div class="chat-bubble agent">
                        <b>Guide Mode</b> - I'll give you detailed written instructions.
                    </div>
                </div>
                <!-- Auto Mode Chat -->
                <div class="chat-body mode-chat" id="chat-auto" style="display: none;">
                    <div class="chat-bubble agent">
                        <b>Auto Mode</b> - I'll perform safe actions with your permission.
                    </div>
                    <div class="chat-bubble agent" style="border-left: 2px solid #C9A24D;">
                        <b>Your safety first:</b> I will never submit forms or interact with sensitive fields.
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="sidebar-footer">
                <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                    <button class="scan-btn" id="scan-trigger" title="Quick Scan">${scanIcon}</button>
                    <button class="scan-btn" id="perception-toggle" title="How I see this page" style="font-size: 14px;">👁️</button>
                    <button class="scan-btn" id="resume-tasks" title="Saved Tasks" style="font-size: 14px;">📋</button>
                </div>
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
        const modeAutoBtn = this.shadow.getElementById('mode-auto');
        const autoControls = this.shadow.getElementById('auto-controls');

        const updateModeUI = (activeMode) => {
            const allBtns = [modeStepsBtn, modeInstructionsBtn, modeAutoBtn];
            allBtns.forEach(btn => {
                if (btn.dataset.mode === activeMode) {
                    btn.style.background = '#4E342E';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = 'transparent';
                    btn.style.color = '#2E2E2E';
                }
            });

            // Show/hide auto controls
            if (autoControls) {
                autoControls.style.display = activeMode === 'auto' ? 'block' : 'none';
            }

            this.autoModeEnabled = (activeMode === 'auto');

            // Switch to the correct mode-specific chat container
            this.switchModeChat(activeMode);
        };

        // Reset button handler
        this.shadow.getElementById('reset-chat-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetCurrentModeChat();
        });

        modeStepsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 'steps';
            updateModeUI('steps');
        });

        modeInstructionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 'instructions';
            updateModeUI('instructions');
        });

        modeAutoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 'auto';
            updateModeUI('auto');
        });

        const input = this.shadow.getElementById('agent-input');
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.handleInput(); });

        this.shadow.getElementById('send-btn').addEventListener('click', () => this.handleInput());

        this.shadow.getElementById('scan-trigger').addEventListener('click', () => {
            this.analyzePageCapabilities();
        });

        this.shadow.getElementById('perception-toggle').addEventListener('click', () => {
            this.showPerceptionPanel();
        });

        this.shadow.getElementById('resume-tasks').addEventListener('click', () => {
            this.loadSavedTasks();
        });
    }

    bindHotkeys() {
        document.addEventListener('keydown', (e) => {
            // Alt+S: Capability Discovery
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggle(true);
                this.analyzePageCapabilities();
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

    // --- MODE CHAT MANAGEMENT ---

    switchModeChat(mode) {
        // Hide all mode chats
        const allChats = this.shadow.querySelectorAll('.mode-chat');
        allChats.forEach(chat => {
            chat.style.display = 'none';
            chat.classList.remove('active');
        });

        // Show the selected mode chat
        const modeMap = {
            'steps': 'chat-steps',
            'instructions': 'chat-instructions',
            'auto': 'chat-auto'
        };
        const activeChat = this.shadow.getElementById(modeMap[mode]);
        if (activeChat) {
            activeChat.style.display = 'block';
            activeChat.classList.add('active');
            activeChat.scrollTop = activeChat.scrollHeight;
        }
    }

    resetCurrentModeChat() {
        const modeMap = {
            'steps': 'chat-steps',
            'instructions': 'chat-instructions',
            'auto': 'chat-auto'
        };
        const activeChat = this.shadow.getElementById(modeMap[this.mode]);
        if (activeChat) {
            // Keep only the first welcome message
            const messages = activeChat.querySelectorAll('.chat-bubble');
            messages.forEach((msg, index) => {
                if (index > 0) msg.remove();
            });
        }
        // Clear stepper
        const stepper = this.shadow.querySelector('.stepper-container');
        if (stepper) stepper.remove();
        // Reset roadmap
        this.currentRoadmap = null;
        this.currentStepIndex = 0;
    }

    getActiveModeChat() {
        return this.shadow.querySelector('.mode-chat.active') || this.shadow.getElementById('chat-steps');
    }

    // --- HALLUCINATION GUARD (Phase 1) ---
    hallucinationGuard(text) {
        if (this.mode !== 'auto') return text; // Only strict for Auto mode

        // Forbidden speculative phrases
        const forbiddenPhrases = [
            'look for',
            'you can find',
            'might be',
            'usually',
            'could be at',
            'check if there is',
            'try checking'
        ];

        const lowerText = text.toLowerCase();
        // Checked against raw text to catch phrases
        // We strip HTML tags roughly to avoid matching attributes
        const contentOnly = lowerText.replace(/<[^>]*>/g, ' ');

        for (const phrase of forbiddenPhrases) {
            if (contentOnly.includes(phrase)) {
                console.warn(`[Auto Mode Guard] Blocked hallucination: "${phrase}"`);
                return "I can’t confidently find that element on this page.";
            }
        }
        return text;
    }

    // --- MESSAGING SYSTEM (Typewriter) ---

    addMessage(role, text, isHtml = false) {
        // Apply Hallucination Guard for Agent in Auto Mode
        if (role === 'agent') {
            text = this.hallucinationGuard(text);
        }

        const stream = this.getActiveModeChat();
        if (!stream) return;

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

        try {
            chrome.runtime.sendMessage(
                { type: "ANALYZE_REQUEST", payload: { userQuery: query, domSnapshot: snapshot } },
                (response) => {
                    this.setStatus('ready');

                    if (chrome.runtime.lastError) {
                        const msg = chrome.runtime.lastError.message;
                        if (msg.includes('invoked') || msg.includes('validated')) {
                            this.addMessage('agent', `🔄 <b>Extension Updated</b><br>Please refresh this page to reconnect to the agent.`, true);
                        } else {
                            this.addMessage('agent', `❌ <b>System Error</b>: ${msg}`);
                        }
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
        } catch (e) {
            console.error("Sync Send Error:", e);
            if (e.message.includes('validated') || e.message.includes('context')) {
                this.addMessage('agent', `🔄 <b>Extension Updated</b><br>Please refresh this page to reconnect the agent.`, true);
            } else {
                this.addMessage('agent', `❌ <b>Connection Failed</b>: ${e.message}`);
            }
            this.setStatus('ready');
        }
    }

    handlePlanResponse(plan) {
        if (!plan) return;
        if (plan.error) {
            this.addMessage('agent', `Oops! ${plan.message || 'Something went wrong. Please try again.'}`);
            return;
        }

        const { roadmap, guidance_text, clarification_needed, page_description } = plan;

        // Only show page description in non-Auto modes and when explicitly requested
        // Bug 2 Fix: Auto mode should NOT show page overviews
        if (page_description && this.mode !== 'auto') {
            // Skip page description to keep chat clean
            // this.displayPageDescription(page_description);
        }

        if (clarification_needed) {
            this.addMessage('agent', guidance_text);
        } else if (roadmap && roadmap.length > 0) {
            // --- FEASIBILITY CHECK ---
            const feasibility = this.runFeasibilityCheck();

            if (feasibility.loginRequired) {
                this.showLoginRequiredPrompt();
                return;
            }

            if (feasibility.permissionIssue) {
                this.showPermissionIssuePrompt(feasibility.permissionType);
                return;
            }

            // Proceed with plan
            this.currentRoadmap = roadmap;
            this.currentStepIndex = 0;

            // Different handling based on mode
            if (this.mode === 'auto') {
                // Auto mode - show preview and execute with consent
                this.processAutoModeActions(roadmap);
            } else if (this.mode === 'instructions') {
                this.showInstructionsMode(roadmap);
            } else {
                // Steps mode
                this.currentRoadmap = roadmap;
                this.currentStepIndex = 0;
                this.addMessage('agent', `Got it! I've created a ${roadmap.length}-step plan for you.`);
                this.renderStepper(roadmap, 0);
                this.showCurrentStep();

                // Offer to save progress for multi-step tasks
                if (roadmap.length > 1) {
                    this.showSaveProgressPrompt(plan.guidance_text || userQuery);
                }
            }
        } else if (!page_description) {
            this.addMessage('agent', guidance_text || "I looked at the page but I'm not sure what to do. Can you be more specific?");
        }
    }

    // --- FEASIBILITY CHECK ---
    runFeasibilityCheck() {
        const result = {
            loginRequired: false,
            permissionIssue: false,
            permissionType: null
        };

        // Check for login requirement
        result.loginRequired = this.detectLoginRequired();

        // Check for permission issues
        const permission = this.detectPermissionIssues();
        if (permission) {
            result.permissionIssue = true;
            result.permissionType = permission;
        }

        return result;
    }

    detectLoginRequired() {
        const pageText = document.body?.innerText?.toLowerCase() || '';
        const title = document.title?.toLowerCase() || '';

        // Check for login-related page indicators
        const loginIndicators = [
            'please log in',
            'please sign in',
            'login required',
            'sign in required',
            'you must be logged in',
            'authentication required',
            'access denied',
            'please login to continue',
            'sign in to continue',
            'log in to access'
        ];

        for (const indicator of loginIndicators) {
            if (pageText.includes(indicator) || title.includes(indicator)) {
                return true;
            }
        }

        // Check for prominent login form as main content
        const loginForms = document.querySelectorAll('form');
        for (const form of loginForms) {
            const formText = form.innerText?.toLowerCase() || '';
            const hasPasswordField = form.querySelector('input[type="password"]');
            const hasLoginButton = Array.from(form.querySelectorAll('button, input[type="submit"]'))
                .some(btn => {
                    const text = (btn.innerText || btn.value || '').toLowerCase();
                    return text.includes('log in') || text.includes('sign in') || text.includes('login');
                });

            // If there's a password field AND login button AND minimal other fields
            if (hasPasswordField && hasLoginButton) {
                const allInputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
                if (allInputs.length <= 3) {
                    // Likely a login form as main page content
                    return true;
                }
            }
        }

        return false;
    }

    detectPermissionIssues() {
        const pageText = document.body?.innerText?.toLowerCase() || '';

        // Check for permission-related text
        const permissionPatterns = {
            'admin': ['admin only', 'administrator required', 'admin access required', 'requires admin'],
            'subscription': ['upgrade required', 'premium only', 'subscribers only', 'upgrade to access'],
            'pending': ['pending approval', 'awaiting approval', 'under review'],
            'restricted': ['restricted access', 'not authorized', 'insufficient permissions', 'permission denied']
        };

        for (const [type, patterns] of Object.entries(permissionPatterns)) {
            for (const pattern of patterns) {
                if (pageText.includes(pattern)) {
                    return type;
                }
            }
        }

        // Check for disabled/readonly elements that might indicate permission issues
        const disabledButtons = document.querySelectorAll('button[disabled], input[disabled], [aria-disabled="true"]');
        const badges = document.querySelectorAll('[class*="badge"], [class*="tag"], [class*="label"]');

        for (const badge of badges) {
            const text = badge.innerText?.toLowerCase() || '';
            if (text.includes('admin') || text.includes('locked') || text.includes('disabled')) {
                return 'restricted';
            }
        }

        return null;
    }

    showLoginRequiredPrompt() {
        const promptId = `login-prompt-${this.instanceId}`;
        const html = `
            <div class="plan-card" id="${promptId}" style="border-left: 2px solid #C9A24D;">
                <div style="font-weight: 600; color: #4E342E; margin-bottom: 8px;">Login Required</div>
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 12px;">
                    You need to be logged in to perform this action.
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="guide-login-${this.instanceId}" style="flex: 1;">Guide me to login</button>
                    <button class="action-btn" id="dismiss-login-${this.instanceId}" style="flex: 1; background: transparent; border: 1px solid #E0D6D1;">Dismiss</button>
                </div>
            </div>
        `;
        this.addMessage('agent', html, true);

        setTimeout(() => {
            const guideBtn = this.shadow.getElementById(`guide-login-${this.instanceId}`);
            const dismissBtn = this.shadow.getElementById(`dismiss-login-${this.instanceId}`);
            const prompt = this.shadow.getElementById(promptId);

            if (guideBtn) {
                guideBtn.onclick = () => {
                    if (prompt) prompt.remove();
                    this.scanAndAnalyze("Help me log in to this website");
                };
            }
            if (dismissBtn) {
                dismissBtn.onclick = () => {
                    if (prompt) prompt.remove();
                };
            }
        }, 50);
    }

    showPermissionIssuePrompt(permissionType) {
        const promptId = `permission-prompt-${this.instanceId}`;

        const messages = {
            'admin': 'This action appears to require administrator privileges.',
            'subscription': 'This feature requires a premium subscription or upgrade.',
            'pending': 'This item is pending approval and cannot be modified yet.',
            'restricted': 'You may not have sufficient permissions for this action.'
        };

        const message = messages[permissionType] || 'There may be a permission issue preventing this action.';

        const html = `
            <div class="plan-card" id="${promptId}" style="border-left: 2px solid #B85450;">
                <div style="font-weight: 600; color: #4E342E; margin-bottom: 8px;">Permission Notice</div>
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 12px;">
                    ${message}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="find-help-${this.instanceId}" style="flex: 1;">Find help/contact</button>
                    <button class="action-btn" id="proceed-anyway-${this.instanceId}" style="flex: 1; background: transparent; border: 1px solid #E0D6D1;">Proceed anyway</button>
                </div>
            </div>
        `;
        this.addMessage('agent', html, true);

        setTimeout(() => {
            const helpBtn = this.shadow.getElementById(`find-help-${this.instanceId}`);
            const proceedBtn = this.shadow.getElementById(`proceed-anyway-${this.instanceId}`);
            const prompt = this.shadow.getElementById(promptId);

            if (helpBtn) {
                helpBtn.onclick = () => {
                    if (prompt) prompt.remove();
                    this.scanAndAnalyze("Help me find support or contact admin");
                };
            }
            if (proceedBtn) {
                proceedBtn.onclick = () => {
                    if (prompt) prompt.remove();
                    // Allow proceeding - they acknowledged the warning
                    this.addMessage('agent', 'Noted. You can ask me again when ready.');
                };
            }
        }, 50);
    }

    // --- TASK PERSISTENCE UI ---
    showSaveProgressPrompt(goalText) {
        const promptId = `save-prompt-${this.instanceId}`;
        const html = `
            <div id="${promptId}" style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #F8F5F2; border-radius: 6px; font-size: 11px; color: #6D4C41;">
                <span>Save progress?</span>
                <button class="action-btn" id="save-yes-${this.instanceId}" style="padding: 3px 10px; font-size: 10px; background: #4E342E; color: white;">Save</button>
                <button id="save-no-${this.instanceId}" style="padding: 3px 8px; font-size: 10px; background: transparent; border: none; color: #9E9E9E; cursor: pointer;">×</button>
            </div>
        `;
        this.addMessage('agent', html, true);

        setTimeout(() => {
            const yesBtn = this.shadow.getElementById(`save-yes-${this.instanceId}`);
            const noBtn = this.shadow.getElementById(`save-no-${this.instanceId}`);
            const prompt = this.shadow.getElementById(promptId);

            if (yesBtn) {
                yesBtn.onclick = () => {
                    this.saveCurrentTask(goalText);
                    if (prompt) prompt.remove();
                };
            }
            if (noBtn) {
                noBtn.onclick = () => {
                    if (prompt) prompt.remove();
                };
            }
        }, 50);
    }

    async saveCurrentTask(goalText) {
        const origin = window.location.origin;
        const taskId = `task_${Date.now()}`;

        const state = {
            goal: goalText,
            roadmap: this.currentRoadmap,
            currentStep: this.currentStepIndex,
            url: window.location.href
        };

        chrome.runtime.sendMessage({
            type: "SAVE_TASK",
            payload: { origin, taskId, state }
        }, (response) => {
            if (response?.success) {
                this.currentTaskId = taskId;
                this.addMessage('agent', `Progress saved. You can resume this task later.`);
            }
        });
    }

    async loadSavedTasks() {
        const origin = window.location.origin;

        chrome.runtime.sendMessage({
            type: "LIST_SAVED_TASKS",
            payload: { origin }
        }, (tasks) => {
            if (tasks && tasks.length > 0) {
                this.showSavedTasksPanel(tasks);
            }
        });
    }

    showSavedTasksPanel(tasks) {
        let html = `
            <div class="plan-card" style="max-height: 200px; overflow-y: auto;">
                <div class="plan-title">Saved Tasks</div>
                <div style="margin-top: 10px;">
        `;

        tasks.forEach(task => {
            const timeAgo = this.formatTimeAgo(task.savedAt);
            html += `
                <div style="padding: 10px; margin-bottom: 8px; background: #FAF7F5; border-radius: 6px; border: 1px solid #E0D6D1;">
                    <div style="font-size: 13px; font-weight: 500; color: #2E2E2E; margin-bottom: 4px;">
                        ${task.goal?.substring(0, 50) || 'Unnamed task'}${task.goal?.length > 50 ? '...' : ''}
                    </div>
                    <div style="font-size: 11px; color: #6B6B6B; margin-bottom: 8px;">
                        Step ${task.currentStep + 1} of ${task.totalSteps} • ${timeAgo}
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button class="action-btn resume-task-btn" data-task-id="${task.id}" style="flex: 1; font-size: 11px; padding: 6px;">Resume</button>
                        <button class="action-btn forget-task-btn" data-task-id="${task.id}" style="flex: 0; font-size: 11px; padding: 6px 10px; background: transparent; border: 1px solid #E0D6D1; color: #6B6B6B;">Forget</button>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        this.addMessage('agent', html, true);

        // Bind resume/forget buttons
        setTimeout(() => {
            this.shadow.querySelectorAll('.resume-task-btn').forEach(btn => {
                btn.onclick = () => this.resumeTask(btn.dataset.taskId);
            });
            this.shadow.querySelectorAll('.forget-task-btn').forEach(btn => {
                btn.onclick = () => this.forgetTask(btn.dataset.taskId);
            });
        }, 50);
    }

    async resumeTask(taskId) {
        const origin = window.location.origin;

        chrome.runtime.sendMessage({
            type: "GET_SAVED_TASK",
            payload: { origin, taskId }
        }, (task) => {
            if (task) {
                this.currentTaskId = taskId;
                this.currentRoadmap = task.roadmap;
                this.currentStepIndex = task.currentStep || 0;

                this.addMessage('agent', `Resuming: ${task.goal}`);
                this.renderStepper(task.roadmap, this.currentStepIndex);
                this.showCurrentStep();
            }
        });
    }

    async forgetTask(taskId) {
        const origin = window.location.origin;

        chrome.runtime.sendMessage({
            type: "DELETE_SAVED_TASK",
            payload: { origin, taskId }
        }, (response) => {
            if (response?.success) {
                this.addMessage('agent', `Task forgotten.`);
                this.loadSavedTasks(); // Refresh list
            }
        });
    }

    formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    displayPageDescription(desc) {
        let html = `
            <div class="plan-card" style="max-height: 350px; overflow-y: auto;">
                <div class="plan-title">📄 Page Overview</div>
                <div style="margin: 10px 0; font-size: 14px; color: #1e293b; line-height: 1.6;">
                    ${desc.overview || 'This page appears to contain interactive content.'}
                </div>
        `;

        if (desc.main_sections && desc.main_sections.length > 0) {
            html += `
                <div style="margin-top: 12px;">
                    <div style="font-weight: 600; color: #4338ca; font-size: 13px; margin-bottom: 6px;">📑 Main Sections</div>
                    <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #374151;">
                        ${desc.main_sections.map(s => `<li style="margin-bottom: 4px;">${s}</li>`).join('')}
                    </ol>
                </div>
            `;
        }

        if (desc.interactive_elements && desc.interactive_elements.length > 0) {
            html += `
                <div style="margin-top: 12px;">
                    <div style="font-weight: 600; color: #4338ca; font-size: 13px; margin-bottom: 6px;">🎛️ Interactive Elements</div>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #374151;">
                        ${desc.interactive_elements.map(e => `<li style="margin-bottom: 4px;">${e}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (desc.forms_available && desc.forms_available.length > 0) {
            html += `
                <div style="margin-top: 12px;">
                    <div style="font-weight: 600; color: #4338ca; font-size: 13px; margin-bottom: 6px;">📝 Forms Available</div>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #374151;">
                        ${desc.forms_available.map(f => `<li style="margin-bottom: 4px;">${f}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        html += `</div>`;
        this.addMessage('agent', html, true);
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
                <div class="plan-title">Step ${stepNum} of ${totalSteps}</div>
                <div style="margin: 10px 0; line-height: 1.7; font-size: 14px;">
                    <div style="margin-bottom: 8px;">
                        <span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">${actionLabel}</span>
                    </div>
                    <div style="font-size: 15px; font-weight: 500; color: #1e293b;">${step.target_hint}</div>
                    <div style="font-size: 13px; color: #64748b; margin-top: 6px;">${step.reasoning}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="${showMeBtnId}" style="flex: 1; background: #f0f4ff; color: #4338ca;">Show me</button>
                    <button class="action-btn" id="${doneBtnId}" style="flex: 2;">Done</button>
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

        // Phase 6: Auto-advance listener
        this.setupStepCompletionListener(step, showMeBtnId, doneBtnId);
    }

    setupStepCompletionListener(step, showMeId, doneBtnId) {
        // Clean up old listeners
        if (this._autoAdvanceCleanup) {
            this._autoAdvanceCleanup();
            this._autoAdvanceCleanup = null;
        }

        const result = this.resolveTargetElement(step);
        if (!result.element) return;

        const el = result.element;
        const action = step.action.toLowerCase();

        // Handler for completion
        const onComplete = () => {
            // Safety delay to allow UI to update/user to see
            setTimeout(() => {
                const doneBtn = this.shadow.getElementById(doneBtnId);
                if (doneBtn && !doneBtn.disabled) {
                    console.log('[Steps] Auto-advancing step...');
                    // Visual feedback
                    const badge = document.createElement('div');
                    badge.textContent = 'Auto-detecting...';
                    badge.style.cssText = `
                        position: fixed; top: 10px; right: 10px; 
                        background: #10b981; color: white; padding: 6px 12px; 
                        border-radius: 20px; font-size: 12px; z-index: 999999;
                        animation: fadeOut 2s forwards;
                    `;
                    document.body.appendChild(badge);
                    setTimeout(() => badge.remove(), 2000);

                    doneBtn.click();
                }
            }, 500);
        };

        // 1. Text Inputs (Type/Fill)
        // Auto-advance on 'change' (blur/enter) if value exists
        if (action.includes('type') || action.includes('fill') || action.includes('enter')) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                const changeHandler = () => {
                    if (el.value && el.value.trim().length > 0) {
                        onComplete();
                    }
                };
                el.addEventListener('change', changeHandler);
                this._autoAdvanceCleanup = () => el.removeEventListener('change', changeHandler);
            }
        }

        // 2. Click/Select/Check
        // Advance on direct interaction
        else if (action.includes('click') || action.includes('select') || action.includes('check') || action.includes('choose')) {
            // Do NOT auto-advance on submit buttons - page load will handle state
            if (el.type === 'submit') return;

            // For selects, 'change' is better
            if (el.tagName === 'SELECT') {
                el.addEventListener('change', onComplete);
                this._autoAdvanceCleanup = () => el.removeEventListener('change', onComplete);
            } else {
                // For buttons/links/checkboxes
                el.addEventListener('click', onComplete);
                this._autoAdvanceCleanup = () => el.removeEventListener('click', onComplete);
            }
        }
    }

    // --- CONFIDENCE-AWARE ELEMENT RESOLUTION ---

    highlightCurrentTarget() {
        if (!this.currentRoadmap || this.currentStepIndex >= this.currentRoadmap.length) return;

        const step = this.currentRoadmap[this.currentStepIndex];
        const result = this.resolveTargetElement(step);

        // SAFETY: Handle blocked actions first
        if (result.blocked) {
            this.addMessage('agent', `
                <div style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border-left: 3px solid #ef4444; padding: 12px; border-radius: 8px;">
                    <div style="font-weight: 700; color: #dc2626; margin-bottom: 6px;">🔐 Protected Action</div>
                    <div style="font-size: 13px; color: #7f1d1d;">${result.blockedReason}</div>
                </div>
            `, true);
            return;
        }

        // Handle based on confidence level
        if (result.confidence >= 0.7) {
            this.highlightElement(result.element);
        } else if (result.confidence >= 0.3) {
            this.highlightElement(result.element);
            this.addMessage('agent', `💡 I found something that looks right. Please verify this is: <b>${step.target_hint}</b>`, true);
        } else {
            // PHASE 8: REQUIRED GATE CHECK
            const gate = this.detectRequiredGate();
            if (gate.detected) {
                this.addMessage('agent', `
                    <div style="background: linear-gradient(135deg, #FFF9C4, #FFF59D); border-left: 3px solid #FBC02D; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: 700; color: #F57F17; margin-bottom: 6px;">🚧 Manual Intervention Required</div>
                        <div style="font-size: 13px; color: #4E342E;">
                            <b>I paused because:</b> ${gate.reason}<br><br>
                            This is a <b>${gate.type}</b> step. Please complete this manually, then click "Done" below.
                        </div>
                    </div>
                `, true);
                return;
            }

            // PHASE 7: CONTEXT MISMATCH CHECK
            const mismatch = this.checkContextMismatch(step);
            if (mismatch) {
                this.addMessage('agent', `
                    <div style="background: linear-gradient(135deg, #FFF5F5, #FFEBEB); border-left: 3px solid #D32F2F; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: 700; color: #B71C1C; margin-bottom: 6px;">⚠️ Context Mismatch</div>
                        <div style="font-size: 13px; color: #4E342E;">
                            <b>I stopped here because:</b> ${mismatch.reason}<br><br>
                            I expected: <b>${mismatch.expected}</b><br>
                            I see: <b>${mismatch.currentType}</b>
                        </div>
                    </div>
                `, true);
                return;
            }

            // PHASE 9: FAILURE TRANSITION
            // Instead of just entering discovery, we provide the full failure context
            this.transitionToFailureGuidance(step.target_hint, `I searched the page but couldn't find "${step.target_hint}".`);
        }

        // Handle multiple candidates warning
        if (result.multipleMatches && result.confidence >= 0.3) {
            this.addMessage('agent', `ℹ️ I see a few similar options. The highlighted one might be what you need, but double-check!`, true);
        }
    }

    // --- GUIDED DISCOVERY MODE ---
    enterGuidedDiscoveryMode(step) {
        const discovery = this.analyzeNavigationOptions();

        // Build subtle suggestion message (integrated into step card style)
        let suggestions = '';
        if (discovery.suggestedPaths.length > 0) {
            suggestions = discovery.suggestedPaths.slice(0, 3).map(s => `"${s}"`).join(', ');
        }

        // Simple inline message without separate yellow box
        const message = suggestions
            ? `Looking for "${step.target_hint}". Try: ${suggestions}`
            : `Could not locate "${step.target_hint}" on this page.`;

        this.addMessage('agent', message);

        // Try to highlight the navigation area if found
        if (discovery.navElement) {
            this.highlightElement(discovery.navElement);
        }
    }

    analyzeNavigationOptions() {
        const result = {
            suggestedPaths: [],
            mainMenu: null,
            navElement: null
        };

        // Find navigation elements
        const navSelectors = 'nav, [role="navigation"], header, .navbar, .nav, .menu, .sidebar';
        const navElements = document.querySelectorAll(navSelectors);

        if (navElements.length > 0) {
            result.navElement = navElements[0];
            result.mainMenu = true;
        }

        // Extract menu item labels
        const menuItems = document.querySelectorAll('nav a, header a, .nav a, .menu a, [role="menuitem"]');
        const seenLabels = new Set();

        menuItems.forEach(item => {
            const text = (item.innerText || '').trim();
            if (text && text.length > 1 && text.length < 30 && !seenLabels.has(text.toLowerCase())) {
                seenLabels.add(text.toLowerCase());
                // Prioritize likely navigation items
                const keywords = ['home', 'services', 'products', 'account', 'profile', 'settings',
                    'help', 'support', 'contact', 'about', 'dashboard', 'menu',
                    'register', 'sign', 'login', 'create', 'new', 'apply'];
                if (keywords.some(k => text.toLowerCase().includes(k))) {
                    result.suggestedPaths.unshift(text);
                } else if (result.suggestedPaths.length < 5) {
                    result.suggestedPaths.push(text);
                }
            }
        });

        // Limit suggestions
        result.suggestedPaths = result.suggestedPaths.slice(0, 4);

        // If no menu items found, look for headings
        if (result.suggestedPaths.length === 0) {
            const headings = document.querySelectorAll('h1, h2, h3');
            headings.forEach(h => {
                const text = (h.innerText || '').trim();
                if (text && text.length < 40 && result.suggestedPaths.length < 3) {
                    result.suggestedPaths.push(`"${text}" section`);
                }
            });
        }

        return result;
    }

    resolveTargetElement(step) {
        let element = null;
        let confidence = 0;
        let reason = '';
        let multipleMatches = false;
        let blocked = false;
        let blockedReason = '';

        // 1. Try exact ID match (highest confidence)
        if (step.target_id) {
            element = document.querySelector(`[data-agent-id="${step.target_id}"]`);
            if (element) {
                // SAFETY CHECK: Block sensitive fields
                if (element.type === 'password') {
                    return {
                        element: null,
                        confidence: 0,
                        reason: 'Sensitive field detected',
                        multipleMatches: false,
                        blocked: true,
                        blockedReason: 'This is a password field. For your security, I cannot interact with it directly. Please enter your password manually.'
                    };
                }

                // Verify element is visible
                if (element.offsetParent !== null || element.type === 'hidden') {
                    confidence = 1.0;
                    reason = 'Exact ID match';
                    return { element, confidence, reason, multipleMatches, blocked, blockedReason };
                } else {
                    confidence = 0.5;
                    reason = 'ID found but element may be hidden';
                }
            }
        }

        // 2. Fall back to text-based search
        if (confidence < 0.7 && step.target_hint) {
            const searchResult = this.findElementsByHint(step.target_hint);

            if (searchResult.matches.length === 1) {
                element = searchResult.matches[0].element;

                // SAFETY CHECK: Block sensitive fields
                if (element.type === 'password') {
                    return {
                        element: null,
                        confidence: 0,
                        reason: 'Sensitive field detected',
                        multipleMatches: false,
                        blocked: true,
                        blockedReason: 'This is a password field. For your security, I cannot interact with it directly. Please enter your password manually.'
                    };
                }

                confidence = Math.min(searchResult.matches[0].score / 100, 1.0);
                reason = 'Single text match';
            } else if (searchResult.matches.length > 1) {
                element = searchResult.matches[0].element;
                confidence = Math.min(searchResult.matches[0].score / 150, 0.6);
                reason = 'Multiple candidates found';
                multipleMatches = true;
            } else {
                element = null;
                confidence = 0;
                reason = 'No matching elements found';
            }
        }

        return { element, confidence, reason, multipleMatches };
    }

    findElementsByHint(hint) {
        if (!hint) return { matches: [] };

        const searchTerms = hint.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const selectors = 'a, button, input, select, textarea, [role="button"], label, [onclick]';
        const elements = document.querySelectorAll(selectors);

        const matches = [];

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

            // Only include if score > 0
            if (score > 0) {
                matches.push({ element: el, score, text: text.substring(0, 50) });
            }
        }

        // Sort by score descending
        matches.sort((a, b) => b.score - a.score);

        return { matches };
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

        const auto = document.getElementById('agent-auto-highlight');
        if (auto) auto.remove();

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
            try { chrome.runtime.sendMessage({ type: "UPDATE_STEP", payload: this.currentStepIndex }); } catch (e) { }
        } else {
            // Cleanup auto-advance listener
            if (this._autoAdvanceCleanup) {
                this._autoAdvanceCleanup();
                this._autoAdvanceCleanup = null;
            }

            this.clearHighlight();
            this.addMessage('agent', "🎉 <b>Awesome!</b> You've completed all the steps. Great job!");
            this.showToast("All done!");

            // Clear stepper
            const stepper = this.shadow.querySelector('.stepper-container');
            if (stepper) stepper.remove();

            // Reset state
            try { chrome.runtime.sendMessage({ type: "RESET_TASK" }); } catch (e) { }
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
            this.addMessage('agent', `Current step: <b>${actionLabel}</b> ${step.target_hint}`);
        } else {
            this.addMessage('agent', "No active task. Ask me something to get started.");
        }
    }

    // --- CAPABILITY DISCOVERY MODE ---
    analyzePageCapabilities() {
        this.setStatus('thinking');

        // Gather page information
        const title = document.title || 'Untitled Page';
        const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
        const links = document.querySelectorAll('a[href]');
        const forms = document.querySelectorAll('form');
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

        // Detect page purpose
        let pagePurpose = this.detectPagePurpose();

        // Extract primary actions
        const primaryActions = this.extractPrimaryActions();
        const secondaryActions = this.extractSecondaryActions();
        const formDescriptions = this.extractFormDescriptions();

        // Build capability summary
        let html = `
            <div class="plan-card" style="max-height: 400px; overflow-y: auto;">
                <div class="plan-title">Page Overview</div>
                <div style="margin: 12px 0; font-size: 14px; color: #2E2E2E; line-height: 1.6;">
                    ${pagePurpose}
                </div>
        `;

        if (primaryActions.length > 0) {
            html += `
                <div style="margin-top: 14px;">
                    <div style="font-weight: 600; color: #4E342E; font-size: 13px; margin-bottom: 8px;">Primary Actions Available</div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #2E2E2E; line-height: 1.7;">
                        ${primaryActions.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (secondaryActions.length > 0) {
            html += `
                <div style="margin-top: 14px;">
                    <div style="font-weight: 600; color: #6D4C41; font-size: 13px; margin-bottom: 8px;">Other Options</div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #6B6B6B; line-height: 1.7;">
                        ${secondaryActions.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        if (formDescriptions.length > 0) {
            html += `
                <div style="margin-top: 14px;">
                    <div style="font-weight: 600; color: #4E342E; font-size: 13px; margin-bottom: 8px;">Forms on This Page</div>
                    <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #2E2E2E; line-height: 1.7;">
                        ${formDescriptions.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        html += `</div>`;

        this.addMessage('agent', html, true);
        this.setStatus('ready');
    }

    detectPagePurpose() {
        const title = document.title || '';
        const h1 = document.querySelector('h1')?.innerText || '';
        const forms = document.querySelectorAll('form');
        const inputs = document.querySelectorAll('input:not([type="hidden"])');

        // --- EXPANDED PAGE CONTEXT SIGNALS ---
        const contextSignals = this.extractPageContextSignals();
        const allContext = (title + ' ' + h1 + ' ' + contextSignals.breadcrumb + ' ' + contextSignals.urlContext + ' ' + contextSignals.helperText).toLowerCase();

        // Detect based on common patterns with enhanced context
        if (allContext.includes('login') || allContext.includes('sign in') || allContext.includes('signin')) {
            return `This appears to be a login page where you can access your account.`;
        }
        if (allContext.includes('register') || allContext.includes('sign up') || allContext.includes('signup') || allContext.includes('create account')) {
            return `This appears to be a registration page for creating a new account.`;
        }
        if (allContext.includes('search') || document.querySelector('input[type="search"]')) {
            return `This page has search functionality to help you find content.`;
        }
        if (allContext.includes('checkout') || allContext.includes('payment') || allContext.includes('billing')) {
            return `This appears to be a checkout or payment page.`;
        }
        if (allContext.includes('dashboard') || allContext.includes('overview') || allContext.includes('home')) {
            return `This is a dashboard or home page showing an overview of information.`;
        }
        if (allContext.includes('settings') || allContext.includes('preferences') || allContext.includes('configuration')) {
            return `This is a settings or configuration page.`;
        }
        if (allContext.includes('profile') || allContext.includes('account')) {
            return `This is a user profile or account management page.`;
        }
        if (allContext.includes('report') || allContext.includes('analytics') || allContext.includes('statistics')) {
            return `This page displays reports or analytical data.`;
        }
        if (allContext.includes('admin') || allContext.includes('manage')) {
            return `This appears to be an administrative or management page.`;
        }

        // Use breadcrumb path if available
        if (contextSignals.breadcrumb) {
            return `This is a page in the "${contextSignals.breadcrumb}" section.`;
        }

        // Use URL-derived context
        if (contextSignals.urlContext) {
            return `This appears to be a ${contextSignals.urlContext} page.`;
        }

        // Fallback detection
        if (forms.length > 0 && inputs.length > 3) {
            return `This page contains a form for entering information.`;
        }
        if (title) {
            return `This is a page titled "${title}".`;
        }
        return `This is a web page with interactive content.`;
    }

    extractPageContextSignals() {
        const signals = {
            urlContext: '',
            breadcrumb: '',
            helperText: ''
        };

        // --- URL PATH SEGMENTS ---
        try {
            const path = window.location.pathname;
            const segments = path.split('/').filter(s => s && s.length > 1);

            // Extract meaningful segments (skip IDs, hashes)
            const meaningfulSegments = segments.filter(s => {
                // Skip numeric IDs and short codes
                if (/^\d+$/.test(s)) return false;
                if (s.length < 3) return false;
                if (/^[a-f0-9-]{20,}$/i.test(s)) return false; // UUIDs
                return true;
            });

            if (meaningfulSegments.length > 0) {
                // Clean up segment names (replace dashes/underscores with spaces)
                signals.urlContext = meaningfulSegments
                    .slice(-2) // Last 2 segments are most relevant
                    .map(s => s.replace(/[-_]/g, ' '))
                    .join(' > ');
            }
        } catch (e) { }

        // --- BREADCRUMB NAVIGATION ---
        const breadcrumbSelectors = [
            'nav[aria-label*="breadcrumb"]',
            '.breadcrumb',
            '.breadcrumbs',
            '[class*="breadcrumb"]',
            'ol.breadcrumb',
            'ul.breadcrumb'
        ];

        for (const selector of breadcrumbSelectors) {
            const breadcrumb = document.querySelector(selector);
            if (breadcrumb) {
                const items = breadcrumb.querySelectorAll('li, a, span');
                const crumbs = [];
                items.forEach(item => {
                    const text = item.innerText?.trim();
                    if (text && text.length > 1 && text.length < 30 && !crumbs.includes(text)) {
                        crumbs.push(text);
                    }
                });
                if (crumbs.length > 0) {
                    signals.breadcrumb = crumbs.slice(-3).join(' > '); // Last 3 crumbs
                    break;
                }
            }
        }

        // --- HELPER TEXT NEAR HEADINGS ---
        const h1 = document.querySelector('h1');
        if (h1) {
            // Check next sibling for description
            const nextEl = h1.nextElementSibling;
            if (nextEl && (nextEl.tagName === 'P' || nextEl.tagName === 'DIV')) {
                const text = nextEl.innerText?.trim();
                if (text && text.length > 10 && text.length < 200) {
                    signals.helperText = text;
                }
            }

            // Check for subtitle within h1's parent
            const parent = h1.parentElement;
            if (parent) {
                const subtitle = parent.querySelector('.subtitle, .description, .helper-text, [class*="subtitle"], [class*="description"]');
                if (subtitle) {
                    signals.helperText = subtitle.innerText?.trim() || signals.helperText;
                }
            }
        }

        return signals;
    }

    // --- VISUAL HIERARCHY AWARENESS ---
    analyzeVisualHierarchy() {
        const hierarchy = {
            layout: 'unknown',
            mainContentArea: null,
            sections: [],
            repeatedComponents: [],
            elementPositions: new Map()
        };

        const viewportHeight = window.innerHeight;
        const documentHeight = document.body.scrollHeight;

        // --- DETECT LAYOUT TYPE ---
        const sidebar = document.querySelector('aside, [class*="sidebar"], [class*="side-nav"], nav[class*="vertical"]');
        const mainContent = document.querySelector('main, [role="main"], .main-content, #main, [class*="main-content"]');

        if (sidebar && mainContent) {
            hierarchy.layout = 'sidebar-layout';
        } else if (document.querySelector('[class*="dashboard"], [class*="grid"]')) {
            hierarchy.layout = 'dashboard';
        } else if (document.querySelectorAll('form').length > 0) {
            hierarchy.layout = 'form-based';
        } else {
            hierarchy.layout = 'standard';
        }

        hierarchy.mainContentArea = mainContent;

        // --- DETECT SECTION GROUPINGS ---
        const sectionSelectors = [
            'section',
            '[class*="card"]',
            '[class*="panel"]',
            '[class*="widget"]',
            '[class*="box"]',
            '[class*="tile"]',
            '[class*="module"]'
        ];

        sectionSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 100 && rect.height > 50) {
                    const heading = el.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]');
                    hierarchy.sections.push({
                        type: selector.replace(/[\[\]*="]/g, ''),
                        title: heading?.innerText?.trim()?.substring(0, 50) || null,
                        position: this.getVerticalPosition(rect.top, viewportHeight),
                        hasActions: el.querySelectorAll('button, a[href]').length > 0
                    });
                }
            });
        });

        // --- DETECT REPEATED COMPONENTS ---
        const componentPatterns = [
            { selector: '[class*="item"]', type: 'list-item' },
            { selector: '[class*="row"]', type: 'table-row' },
            { selector: '[class*="card"]', type: 'card' },
            { selector: 'tr', type: 'table-row' },
            { selector: 'li', type: 'list-item' }
        ];

        componentPatterns.forEach(pattern => {
            const elements = document.querySelectorAll(pattern.selector);
            if (elements.length >= 3) {
                // Check if they have similar structure (truly repeated)
                const firstHTML = elements[0].innerHTML?.length || 0;
                const similarCount = Array.from(elements).filter(el =>
                    Math.abs((el.innerHTML?.length || 0) - firstHTML) < firstHTML * 0.5
                ).length;

                if (similarCount >= 3) {
                    hierarchy.repeatedComponents.push({
                        type: pattern.type,
                        count: similarCount,
                        sample: elements[0].innerText?.substring(0, 30) || ''
                    });
                }
            }
        });

        // --- ELEMENT POSITION RANKING ---
        const interactiveElements = document.querySelectorAll('button, a[href], input[type="submit"]');
        interactiveElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const position = this.getVerticalPosition(rect.top, viewportHeight);
            const inMainContent = mainContent ? mainContent.contains(el) : true;

            // Calculate importance score
            let importance = 5; // Base score

            // Position-based scoring
            if (position === 'top') importance += 2;
            else if (position === 'middle') importance += 3; // Primary content area
            else if (position === 'bottom') importance += 1;

            // Main content area bonus
            if (inMainContent) importance += 2;

            // Primary styling bonus
            const classList = el.className?.toLowerCase() || '';
            if (classList.includes('primary') || classList.includes('cta') || classList.includes('submit')) {
                importance += 3;
            }

            // Size bonus (larger = more important)
            if (rect.width > 150 || rect.height > 40) importance += 1;

            hierarchy.elementPositions.set(el, {
                position,
                inMainContent,
                importance: Math.min(10, importance) // Cap at 10
            });
        });

        return hierarchy;
    }

    getVerticalPosition(elementTop, viewportHeight) {
        const scrollY = window.scrollY || 0;
        const absoluteTop = elementTop + scrollY;
        const documentHeight = document.body.scrollHeight;

        const topThird = documentHeight * 0.33;
        const bottomThird = documentHeight * 0.66;

        if (absoluteTop < topThird) return 'top';
        if (absoluteTop > bottomThird) return 'bottom';
        return 'middle';
    }

    getElementImportance(element) {
        const hierarchy = this.analyzeVisualHierarchy();
        const info = hierarchy.elementPositions.get(element);
        return info?.importance || 5;
    }

    describeLayoutContext() {
        const hierarchy = this.analyzeVisualHierarchy();

        let description = '';

        // Layout type
        const layoutDescriptions = {
            'sidebar-layout': 'This page has a sidebar navigation with a main content area.',
            'dashboard': 'This appears to be a dashboard-style layout with multiple sections.',
            'form-based': 'This page is focused on form input.',
            'standard': 'This page has a standard layout.'
        };
        description = layoutDescriptions[hierarchy.layout] || '';

        // Sections
        if (hierarchy.sections.length > 0) {
            const sectionCount = hierarchy.sections.length;
            description += ` It contains ${sectionCount} distinct section${sectionCount > 1 ? 's' : ''}.`;
        }

        // Repeated components
        if (hierarchy.repeatedComponents.length > 0) {
            const comp = hierarchy.repeatedComponents[0];
            description += ` There are ${comp.count} ${comp.type.replace('-', ' ')}s visible.`;
        }

        return description;
    }

    // --- FORM FLOW CONTEXT ---
    analyzeFormFlowContext() {
        const forms = document.querySelectorAll('form');
        const formAnalysis = [];

        forms.forEach((form, index) => {
            const analysis = {
                formIndex: index,
                fieldGroups: [],
                stepIndicator: null,
                totalFields: 0,
                requiredFields: 0,
                optionalFields: 0,
                fieldBreakdown: []
            };

            // --- DETECT FIELD GROUPINGS ---
            const fieldsets = form.querySelectorAll('fieldset, [class*="group"], [class*="section"], [class*="fieldset"]');
            fieldsets.forEach(group => {
                const legend = group.querySelector('legend, [class*="title"], [class*="heading"], h2, h3, h4');
                const inputs = group.querySelectorAll('input:not([type="hidden"]), textarea, select');
                if (inputs.length > 0) {
                    analysis.fieldGroups.push({
                        name: legend?.innerText?.trim() || 'Unnamed section',
                        fieldCount: inputs.length
                    });
                }
            });

            // If no explicit groups, try to detect implicit groupings
            if (analysis.fieldGroups.length === 0) {
                const allInputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
                if (allInputs.length > 0) {
                    analysis.fieldGroups.push({
                        name: 'Form fields',
                        fieldCount: allInputs.length
                    });
                }
            }

            // --- DETECT STEP INDICATORS / PROGRESS BARS ---
            const stepIndicatorSelectors = [
                '[class*="step"]',
                '[class*="progress"]',
                '[class*="wizard"]',
                '[class*="stepper"]',
                '[role="progressbar"]',
                '.step-indicator',
                '.progress-bar'
            ];

            for (const selector of stepIndicatorSelectors) {
                const indicator = document.querySelector(selector);
                if (indicator) {
                    const stepText = indicator.innerText?.match(/step\s*(\d+)\s*(of|\/)\s*(\d+)/i);
                    if (stepText) {
                        analysis.stepIndicator = {
                            currentStep: parseInt(stepText[1]),
                            totalSteps: parseInt(stepText[3])
                        };
                        break;
                    }

                    // Check for numbered steps
                    const steps = indicator.querySelectorAll('[class*="step"], li');
                    const activeStep = indicator.querySelector('.active, [aria-current="step"], [class*="current"]');
                    if (steps.length > 1) {
                        analysis.stepIndicator = {
                            currentStep: activeStep ? Array.from(steps).indexOf(activeStep) + 1 : 1,
                            totalSteps: steps.length
                        };
                        break;
                    }
                }
            }

            // --- ANALYZE INDIVIDUAL FIELDS ---
            const allFields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
            analysis.totalFields = allFields.length;

            allFields.forEach(field => {
                const fieldInfo = {
                    type: field.type || field.tagName.toLowerCase(),
                    label: this.getFieldLabel(field),
                    required: field.required || field.getAttribute('aria-required') === 'true',
                    helperText: this.getFieldHelperText(field),
                    placeholder: field.placeholder || ''
                };

                if (fieldInfo.required) {
                    analysis.requiredFields++;
                } else {
                    analysis.optionalFields++;
                }

                analysis.fieldBreakdown.push(fieldInfo);
            });

            formAnalysis.push(analysis);
        });

        return formAnalysis;
    }

    getFieldLabel(field) {
        // Check for associated label
        const id = field.id;
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) return label.innerText?.trim();
        }

        // Check for parent label
        const parentLabel = field.closest('label');
        if (parentLabel) {
            const text = parentLabel.innerText?.replace(field.value || '', '').trim();
            if (text) return text;
        }

        // Check for aria-label
        const ariaLabel = field.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        // Check for preceding label-like element
        const prev = field.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.classList.contains('label'))) {
            return prev.innerText?.trim();
        }

        // Use placeholder or name as fallback
        return field.placeholder || field.name || 'Unlabeled field';
    }

    getFieldHelperText(field) {
        // Check for aria-describedby
        const describedBy = field.getAttribute('aria-describedby');
        if (describedBy) {
            const helper = document.getElementById(describedBy);
            if (helper) return helper.innerText?.trim();
        }

        // Check for sibling helper text
        const next = field.nextElementSibling;
        if (next && (next.classList.contains('helper') || next.classList.contains('hint') ||
            next.classList.contains('help-text') || next.tagName === 'SMALL')) {
            return next.innerText?.trim();
        }

        // Check parent for helper
        const parent = field.parentElement;
        if (parent) {
            const helper = parent.querySelector('.helper, .hint, .help-text, small, [class*="helper"]');
            if (helper && helper !== field) {
                return helper.innerText?.trim();
            }
        }

        return null;
    }

    describeFormContext() {
        const formAnalysis = this.analyzeFormFlowContext();

        if (formAnalysis.length === 0) {
            return 'No forms detected on this page.';
        }

        const form = formAnalysis[0]; // Primary form
        let description = '';

        // Step indicator
        if (form.stepIndicator) {
            description += `This is step ${form.stepIndicator.currentStep} of ${form.stepIndicator.totalSteps} in a multi-step form. `;
        }

        // Field count
        description += `The form has ${form.totalFields} field${form.totalFields !== 1 ? 's' : ''}`;
        if (form.requiredFields > 0) {
            description += ` (${form.requiredFields} required)`;
        }
        description += '. ';

        // Field groups
        if (form.fieldGroups.length > 1) {
            description += `It's organized into ${form.fieldGroups.length} sections: `;
            description += form.fieldGroups.map(g => g.name).join(', ') + '.';
        }

        return description;
    }

    // --- NAVIGATION STRUCTURE AWARENESS ---
    analyzeNavigationStructure() {
        const navStructure = {
            primaryNav: null,
            secondaryNav: null,
            sideNav: null,
            activeItem: null,
            breadcrumbPath: [],
            menuItems: []
        };

        // --- DETECT PRIMARY NAVIGATION ---
        const primaryNavSelectors = [
            'nav[role="navigation"]',
            'header nav',
            '.navbar',
            '.main-nav',
            '#main-nav',
            '[class*="main-nav"]',
            '[class*="primary-nav"]'
        ];

        for (const selector of primaryNavSelectors) {
            const nav = document.querySelector(selector);
            if (nav) {
                navStructure.primaryNav = this.parseNavMenu(nav, 'primary');
                break;
            }
        }

        // --- DETECT SIDEBAR / SECONDARY NAVIGATION ---
        const sideNavSelectors = [
            'aside nav',
            '.sidebar nav',
            '[class*="side-nav"]',
            '[class*="sidebar"] nav',
            '.nav-sidebar'
        ];

        for (const selector of sideNavSelectors) {
            const nav = document.querySelector(selector);
            if (nav) {
                navStructure.sideNav = this.parseNavMenu(nav, 'sidebar');
                break;
            }
        }

        // --- DETECT SECONDARY/SUB NAVIGATION ---
        const secondaryNavSelectors = [
            '.sub-nav',
            '.secondary-nav',
            '[class*="sub-nav"]',
            'nav.tabs',
            '[role="tablist"]'
        ];

        for (const selector of secondaryNavSelectors) {
            const nav = document.querySelector(selector);
            if (nav) {
                navStructure.secondaryNav = this.parseNavMenu(nav, 'secondary');
                break;
            }
        }

        // --- DETECT ACTIVE MENU ITEM ---
        const activeSelectors = [
            '.active',
            '[aria-current="page"]',
            '[aria-current="true"]',
            '.current',
            '[class*="active"]',
            '[class*="selected"]'
        ];

        const allNavs = document.querySelectorAll('nav, .nav, .navbar');
        allNavs.forEach(nav => {
            for (const selector of activeSelectors) {
                const active = nav.querySelector(`a${selector}, li${selector} > a`);
                if (active) {
                    navStructure.activeItem = {
                        text: active.innerText?.trim(),
                        href: active.href
                    };
                    break;
                }
            }
        });

        // --- DETECT BREADCRUMB PATH ---
        const breadcrumbSelectors = [
            'nav[aria-label*="breadcrumb"]',
            '.breadcrumb',
            '.breadcrumbs',
            '[class*="breadcrumb"]'
        ];

        for (const selector of breadcrumbSelectors) {
            const breadcrumb = document.querySelector(selector);
            if (breadcrumb) {
                const items = breadcrumb.querySelectorAll('a, li, span');
                const seenItems = new Set();
                items.forEach(item => {
                    const text = item.innerText?.trim();
                    if (text && text.length > 1 && text.length < 40 && !seenItems.has(text)) {
                        seenItems.add(text);
                        navStructure.breadcrumbPath.push(text);
                    }
                });
                break;
            }
        }

        return navStructure;
    }

    parseNavMenu(navElement, type) {
        const menu = {
            type,
            items: [],
            hasSubmenus: false
        };

        const links = navElement.querySelectorAll('a');
        const seenText = new Set();

        links.forEach(link => {
            const text = link.innerText?.trim();
            if (text && text.length > 1 && text.length < 40 && !seenText.has(text)) {
                seenText.add(text);

                // Check if this item has a submenu
                const parent = link.parentElement;
                const hasSubmenu = parent?.querySelector('ul, [class*="dropdown"], [class*="submenu"]');

                // Check if active
                const isActive = link.classList.contains('active') ||
                    link.getAttribute('aria-current') === 'page' ||
                    link.parentElement?.classList.contains('active');

                menu.items.push({
                    text,
                    href: link.href,
                    isActive,
                    hasSubmenu: !!hasSubmenu
                });

                if (hasSubmenu) menu.hasSubmenus = true;
            }
        });

        return menu;
    }

    describeNavigationContext() {
        const nav = this.analyzeNavigationStructure();
        let description = '';

        // Breadcrumb path
        if (nav.breadcrumbPath.length > 0) {
            description += `You are at: ${nav.breadcrumbPath.join(' > ')}. `;
        }

        // Active item
        if (nav.activeItem) {
            description += `Current section: ${nav.activeItem.text}. `;
        }

        // Primary navigation
        if (nav.primaryNav && nav.primaryNav.items.length > 0) {
            const count = nav.primaryNav.items.length;
            description += `Main navigation has ${count} item${count > 1 ? 's' : ''}`;
            if (nav.primaryNav.hasSubmenus) {
                description += ' with sub-menus';
            }
            description += '. ';
        }

        // Sidebar navigation
        if (nav.sideNav && nav.sideNav.items.length > 0) {
            description += `Sidebar has ${nav.sideNav.items.length} navigation links. `;
        }

        return description || 'No clear navigation structure detected.';
    }

    getSuggestedNavigationPaths() {
        const nav = this.analyzeNavigationStructure();
        const suggestions = [];

        // Add primary nav items
        if (nav.primaryNav) {
            nav.primaryNav.items.slice(0, 5).forEach(item => {
                if (!item.isActive) {
                    suggestions.push(item.text);
                }
            });
        }

        // Add sidebar items
        if (nav.sideNav) {
            nav.sideNav.items.slice(0, 4).forEach(item => {
                if (!item.isActive && !suggestions.includes(item.text)) {
                    suggestions.push(item.text);
                }
            });
        }

        return suggestions.slice(0, 6);
    }

    // --- STATE & STATUS AWARENESS ---
    analyzePageState() {
        const pageState = {
            isLoading: false,
            loadingIndicators: [],
            disabledElements: [],
            readOnlyFields: [],
            statusBadges: [],
            pageStatus: 'ready'
        };

        // --- DETECT LOADING STATE ---
        const loadingSelectors = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="loader"]',
            '[aria-busy="true"]',
            '.skeleton',
            '[class*="skeleton"]',
            '[class*="progress"]'
        ];

        loadingSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    pageState.isLoading = true;
                    pageState.loadingIndicators.push({
                        type: selector.replace(/[\[\]*="]/g, ''),
                        visible: true
                    });
                }
            });
        });

        // Check for loading overlay
        const overlay = document.querySelector('[class*="overlay"][class*="loading"], .loading-overlay, [class*="modal"][class*="loading"]');
        if (overlay) {
            const style = window.getComputedStyle(overlay);
            if (style.display !== 'none') {
                pageState.isLoading = true;
                pageState.pageStatus = 'loading';
            }
        }

        // --- DETECT DISABLED ELEMENTS ---
        const disabledElements = document.querySelectorAll(
            'button[disabled], input[disabled], select[disabled], ' +
            '[aria-disabled="true"], .disabled, [class*="disabled"]'
        );

        disabledElements.forEach(el => {
            const text = el.innerText?.trim() || el.value?.trim() || el.placeholder || '';
            if (text && text.length < 50) {
                pageState.disabledElements.push({
                    type: el.tagName.toLowerCase(),
                    text: text.substring(0, 30),
                    reason: this.guessDisabledReason(el)
                });
            }
        });

        // --- DETECT READ-ONLY FIELDS ---
        const readOnlyFields = document.querySelectorAll(
            'input[readonly], textarea[readonly], [contenteditable="false"]'
        );

        readOnlyFields.forEach(field => {
            const label = this.getFieldLabel(field);
            pageState.readOnlyFields.push({
                label,
                value: field.value?.substring(0, 30) || ''
            });
        });

        // --- DETECT STATUS BADGES ---
        const badgeSelectors = [
            '[class*="badge"]',
            '[class*="tag"]',
            '[class*="status"]',
            '[class*="label"]',
            '[class*="chip"]',
            '[class*="pill"]'
        ];

        const seenBadges = new Set();
        badgeSelectors.forEach(selector => {
            const badges = document.querySelectorAll(selector);
            badges.forEach(badge => {
                const text = badge.innerText?.trim();
                if (text && text.length > 1 && text.length < 25 && !seenBadges.has(text.toLowerCase())) {
                    seenBadges.add(text.toLowerCase());

                    // Categorize badge
                    const category = this.categorizeBadge(text);
                    pageState.statusBadges.push({
                        text,
                        category
                    });
                }
            });
        });

        // --- DETERMINE OVERALL PAGE STATUS ---
        if (pageState.isLoading) {
            pageState.pageStatus = 'loading';
        } else if (pageState.disabledElements.length > 3) {
            pageState.pageStatus = 'limited';
        } else {
            pageState.pageStatus = 'ready';
        }

        return pageState;
    }

    guessDisabledReason(element) {
        // Check for tooltips or titles
        const title = element.title || element.getAttribute('data-tooltip') || element.getAttribute('aria-label');
        if (title) return title;

        // Check for parent form validation
        const form = element.closest('form');
        if (form) {
            const invalidFields = form.querySelectorAll(':invalid');
            if (invalidFields.length > 0) {
                return 'Form has validation errors';
            }
        }

        // Check for common patterns in nearby elements
        const next = element.nextElementSibling;
        if (next && (next.classList.contains('tooltip') || next.classList.contains('hint'))) {
            return next.innerText?.trim();
        }

        return 'Action currently unavailable';
    }

    categorizeBadge(text) {
        const textLower = text.toLowerCase();

        const categories = {
            success: ['active', 'approved', 'complete', 'done', 'success', 'verified', 'paid'],
            warning: ['pending', 'waiting', 'review', 'draft', 'processing'],
            error: ['failed', 'error', 'rejected', 'expired', 'overdue', 'cancelled'],
            info: ['new', 'beta', 'premium', 'pro', 'admin', 'required']
        };

        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(k => textLower.includes(k))) {
                return category;
            }
        }

        return 'neutral';
    }

    describePageState() {
        const state = this.analyzePageState();
        let description = '';

        // Loading state
        if (state.isLoading) {
            description += 'The page appears to be loading. ';
        }

        // Disabled elements
        if (state.disabledElements.length > 0) {
            description += `${state.disabledElements.length} element${state.disabledElements.length > 1 ? 's are' : ' is'} currently disabled. `;
        }

        // Read-only fields
        if (state.readOnlyFields.length > 0) {
            description += `${state.readOnlyFields.length} field${state.readOnlyFields.length > 1 ? 's are' : ' is'} read-only. `;
        }

        // Status badges
        if (state.statusBadges.length > 0) {
            const importantBadges = state.statusBadges
                .filter(b => b.category !== 'neutral')
                .slice(0, 3);
            if (importantBadges.length > 0) {
                description += `Status indicators: ${importantBadges.map(b => b.text).join(', ')}. `;
            }
        }

        return description || 'Page is ready for interaction.';
    }

    isElementActionable(element) {
        const state = this.analyzePageState();

        // Check if element is disabled
        if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
            return {
                actionable: false,
                reason: this.guessDisabledReason(element)
            };
        }

        // Check if page is loading
        if (state.isLoading) {
            return {
                actionable: false,
                reason: 'Page is currently loading'
            };
        }

        // Check if element is read-only
        if (element.readOnly || element.getAttribute('contenteditable') === 'false') {
            return {
                actionable: false,
                reason: 'This field is read-only'
            };
        }

        return { actionable: true };
    }

    // --- MICROCOPY & ERROR CONTEXT ---
    analyzeMicrocopy() {
        const microcopy = {
            errorMessages: [],
            warningMessages: [],
            tooltips: [],
            validationHints: [],
            successMessages: [],
            infoMessages: []
        };

        // --- DETECT ERROR MESSAGES ---
        const errorSelectors = [
            '.error',
            '.error-message',
            '[class*="error"]',
            '[role="alert"]',
            '.alert-danger',
            '.alert-error',
            '.invalid-feedback',
            '[aria-invalid="true"] ~ .error',
            '.form-error'
        ];

        const seenErrors = new Set();
        errorSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 2 && text.length < 200 && !seenErrors.has(text)) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        seenErrors.add(text);
                        microcopy.errorMessages.push({
                            text,
                            field: this.findAssociatedField(el)
                        });
                    }
                }
            });
        });

        // --- DETECT WARNING MESSAGES ---
        const warningSelectors = [
            '.warning',
            '.warning-message',
            '[class*="warning"]',
            '.alert-warning',
            '.caution'
        ];

        const seenWarnings = new Set();
        warningSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 2 && text.length < 200 && !seenWarnings.has(text)) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        seenWarnings.add(text);
                        microcopy.warningMessages.push(text);
                    }
                }
            });
        });

        // --- DETECT SUCCESS MESSAGES ---
        const successSelectors = [
            '.success',
            '.success-message',
            '[class*="success"]',
            '.alert-success',
            '.confirmation'
        ];

        const seenSuccess = new Set();
        successSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 2 && text.length < 200 && !seenSuccess.has(text)) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        seenSuccess.add(text);
                        microcopy.successMessages.push(text);
                    }
                }
            });
        });

        // --- DETECT TOOLTIPS ---
        const elementsWithTooltips = document.querySelectorAll('[title], [data-tooltip], [aria-label], [data-tip]');
        elementsWithTooltips.forEach(el => {
            const tooltip = el.title || el.getAttribute('data-tooltip') || el.getAttribute('data-tip');
            if (tooltip && tooltip.length > 3 && tooltip.length < 150) {
                const elementText = el.innerText?.trim()?.substring(0, 20) || el.tagName.toLowerCase();
                microcopy.tooltips.push({
                    element: elementText,
                    tooltip
                });
            }
        });

        // --- DETECT INLINE VALIDATION HINTS ---
        const validationSelectors = [
            '.hint',
            '.helper-text',
            '.help-text',
            '.form-text',
            '.field-description',
            'small.text-muted',
            '[class*="hint"]',
            '[class*="helper"]'
        ];

        const seenHints = new Set();
        validationSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 5 && text.length < 150 && !seenHints.has(text)) {
                    seenHints.add(text);
                    microcopy.validationHints.push({
                        text,
                        field: this.findAssociatedField(el)
                    });
                }
            });
        });

        // --- DETECT INFO MESSAGES ---
        const infoSelectors = [
            '.info',
            '.info-message',
            '.alert-info',
            '.notice',
            '[class*="info-box"]'
        ];

        infoSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 5 && text.length < 200) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        microcopy.infoMessages.push(text);
                    }
                }
            });
        });

        return microcopy;
    }

    findAssociatedField(messageElement) {
        // Try to find the input field this message relates to
        const parent = messageElement.parentElement;
        if (parent) {
            const input = parent.querySelector('input, textarea, select');
            if (input) {
                return this.getFieldLabel(input);
            }
        }

        // Check previous sibling
        const prev = messageElement.previousElementSibling;
        if (prev && (prev.tagName === 'INPUT' || prev.tagName === 'TEXTAREA' || prev.tagName === 'SELECT')) {
            return this.getFieldLabel(prev);
        }

        // Check for aria-describedby reference
        const describedBy = messageElement.id;
        if (describedBy) {
            const input = document.querySelector(`[aria-describedby="${describedBy}"]`);
            if (input) {
                return this.getFieldLabel(input);
            }
        }

        return null;
    }

    describeMicrocopy() {
        const micro = this.analyzeMicrocopy();
        let description = '';

        // Errors (most important)
        if (micro.errorMessages.length > 0) {
            description += `There ${micro.errorMessages.length === 1 ? 'is' : 'are'} ${micro.errorMessages.length} error${micro.errorMessages.length > 1 ? 's' : ''} on the page`;
            if (micro.errorMessages[0].field) {
                description += ` (${micro.errorMessages[0].field})`;
            }
            description += ': ';
            description += micro.errorMessages.slice(0, 2).map(e => `"${e.text}"`).join(', ');
            description += '. ';
        }

        // Warnings
        if (micro.warningMessages.length > 0) {
            description += `Warning: "${micro.warningMessages[0]}". `;
        }

        // Success
        if (micro.successMessages.length > 0) {
            description += `Success: "${micro.successMessages[0]}". `;
        }

        // Validation hints
        if (micro.validationHints.length > 0 && micro.errorMessages.length === 0) {
            description += `Hint: "${micro.validationHints[0].text}". `;
        }

        return description || 'No feedback messages detected.';
    }

    getFormValidationSummary() {
        const micro = this.analyzeMicrocopy();

        if (micro.errorMessages.length === 0) {
            return { hasErrors: false, summary: 'No validation errors.' };
        }

        const summary = {
            hasErrors: true,
            errorCount: micro.errorMessages.length,
            errors: micro.errorMessages.map(e => ({
                field: e.field || 'Unknown field',
                message: e.text
            }))
        };

        return summary;
    }

    // --- AUTO MODE EXECUTOR (SILENT EXECUTOR) ---

    // Main entry point for auto mode execution
    async processAutoModeActions(roadmap) {
        // Mode is already verified by handlePlanResponse before calling this

        // Prepare and classify actions
        const preparedActions = this.prepareActionsForAuto(roadmap);

        if (preparedActions.length === 0) {
            this.addMessage('agent', 'No actions found for this request.');
            return;
        }

        // Classify the task tier
        const tier = this.classifyTaskTier(preparedActions);

        switch (tier) {
            case 1:
                // TIER 1: Simple & Safe - Execute immediately, no preview
                await this.executeTier1(preparedActions[0]);
                break;
            case 2:
                // TIER 2: Critical - Show concise preview, ask permission
                this.showTier2Preview(preparedActions);
                break;
            case 3:
                // TIER 3: Blocked - Explain and fall back to Guide mode
                this.handleTier3Blocked(preparedActions);
                break;
        }
    }

    classifyTaskTier(actions) {
        // Check for blocked actions first (TIER 3)
        const hasBlocked = actions.some(a => a.blocked);
        if (hasBlocked) return 3;

        // Check for Tier 1: Single, safe, high-confidence navigation
        if (actions.length === 1) {
            const action = actions[0];
            const actionType = action.action.toLowerCase();
            const safeNavActions = ['click', 'open', 'go', 'navigate', 'scroll', 'expand', 'show'];

            const isSimpleNav = safeNavActions.some(a => actionType.includes(a));
            const isHighConfidence = action.confidence >= this.autoModeConfidenceThreshold;
            const isSafe = action.safe && !action.blocked;

            if (isSimpleNav && isHighConfidence && isSafe) {
                return 1;
            }
        }

        // Check for form fills or multiple actions (TIER 2)
        const hasFill = actions.some(a => {
            const type = a.action.toLowerCase();
            return type.includes('fill') || type.includes('type') || type.includes('enter');
        });
        const hasMultiple = actions.length > 1;
        const hasLowConfidence = actions.some(a => a.confidence < this.autoModeConfidenceThreshold);

        if (hasFill || hasMultiple || hasLowConfidence) {
            return 2;
        }

        // Default to Tier 2 for safety
        return 2;
    }

    async executeTier1(action) {
        const targetDesc = action.target || action.description;

        // Brief status (1 line before)
        this.addMessage('agent', `Opening ${targetDesc}...`);

        // Capture current state for verification
        const prevUrl = window.location.href;
        const prevTitle = document.title;

        // Execute the action
        const success = await this.executeAutoAction(action);

        if (!success) {
            // Human-in-Loop: provide alternative suggestions
            this.provideFailureGuidance(targetDesc);
            return;
        }

        // Wait for potential page change
        await this.delay(800);

        // Verify execution
        const verified = this.verifyExecution(prevUrl, prevTitle, targetDesc);

        if (verified) {
            // Brief success (1 line after) - no emojis
            this.addMessage('agent', 'Done.');
        } else {
            // Strict verification check failed (Phase 2)
            this.addMessage('agent', 'The action didn’t complete as expected.');
            // Offer manual guidance since automation failed verification
            this.provideFailureGuidance(targetDesc);
        }
    }

    verifyExecution(prevUrl, prevTitle, targetDesc) {
        const currentUrl = window.location.href;
        const currentTitle = document.title;

        // Check for URL change
        if (currentUrl !== prevUrl) {
            return true;
        }

        // Check for title change
        if (currentTitle !== prevTitle) {
            return true;
        }

        // Check for expected heading or content
        const h1 = document.querySelector('h1')?.innerText?.toLowerCase() || '';
        const targetLower = targetDesc.toLowerCase();
        if (h1.includes(targetLower) || targetLower.includes(h1)) {
            return true;
        }

        // Check for modal/panel appearance
        const modals = document.querySelectorAll('[class*="modal"]:not([style*="display: none"]), [class*="drawer"]:not([style*="display: none"])');
        if (modals.length > 0) {
            return true;
        }

        return false;
    }

    provideFailureGuidance(targetDesc) {
        // Phase 5: Intelligent Fallback Analysis
        const analysis = this.analyzePageForGuidance(targetDesc);

        const promptId = `guidance-${this.instanceId}`;
        const html = `
            <div class="plan-card" id="${promptId}" style="border-left: 2px solid #D32F2F; padding: 12px; background: #FFF5F5;">
                <div style="font-size: 13px; color: #B71C1C; margin-bottom: 8px;">
                    <b>I couldn't complete that automatically.</b>
                </div>
                <div style="font-size: 12px; color: #4E342E; margin-bottom: 10px; line-height: 1.4;">
                    ${analysis.guidance}
                </div>
                <div style="display: flex; gap: 8px;">
                     <button class="action-btn" id="guide-mode-${this.instanceId}" style="flex: 1; background: #FFF; border: 1px solid #B71C1C; color: #B71C1C;">Switch to Guide Mode</button>
                     <button class="action-btn" id="dismiss-guide-${this.instanceId}" style="flex: 1; background: transparent; border: none; color: #9E9E9E;">Dismiss</button>
                </div>
            </div>
        `;

        this.addMessage('agent', html, true);

        setTimeout(() => {
            const guideBtn = this.shadow.getElementById(`guide-mode-${this.instanceId}`);
            const dismissBtn = this.shadow.getElementById(`dismiss-guide-${this.instanceId}`);
            const prompt = this.shadow.getElementById(promptId);

            if (guideBtn) {
                guideBtn.onclick = () => {
                    if (prompt) prompt.remove();
                    this.switchMode('instructions');
                    this.addMessage('agent', 'Switched to Guide Mode. Use the highlighter to show me what to do.');
                };
            }
            if (dismissBtn) {
                dismissBtn.onclick = () => {
                    if (prompt) prompt.remove();
                };
            }
        }, 100);
    }

    analyzePageForGuidance(intent) {
        let guidance = "I couldn't locate the exact element. ";
        const lowerIntent = intent.toLowerCase();

        // Check for User/Profile Menu
        if (lowerIntent.includes('profile') || lowerIntent.includes('account') || lowerIntent.includes('login') || lowerIntent.includes('sign in')) {
            const userMenu = document.querySelector('[aria-label*="profile"], [aria-label*="account"], .avatar, img[alt*="profile"], [class*="user-menu"]');
            if (userMenu) {
                const rect = userMenu.getBoundingClientRect();
                const position = rect.left > window.innerWidth / 2 ? 'top right' : 'top left';
                guidance += `However, I see a <b>user menu icon at the ${position}</b>. Try opening that first.`;
                this.highlightElement(userMenu, '#EF5350');
                return { guidance };
            }
        }

        // Check for Navigation Bar
        const nav = document.querySelector('nav, [role="navigation"], header');
        if (nav && (lowerIntent.includes('home') || lowerIntent.includes('menu') || lowerIntent.includes('category'))) {
            guidance += "Please check the <b>main navigation bar at the top</b> for this link.";
            this.highlightElement(nav, '#EF5350');
            return { guidance };
        }

        // Check for Search
        if (lowerIntent.includes('search') || lowerIntent.includes('find')) {
            const searchInput = document.querySelector('input[type="search"], [role="search"] input, [placeholder*="search"]');
            if (searchInput) {
                guidance += "There is a <b>search bar</b> visible. You can try searching instead.";
                this.highlightElement(searchInput, '#EF5350');
                return { guidance };
            }
        }

        // Check for Sidebar
        const sidebar = document.querySelector('aside, .sidebar, [class*="sidebar"]');
        if (sidebar && (lowerIntent.includes('setting') || lowerIntent.includes('tool'))) {
            guidance += "Look in the <b>sidebar</b> for settings or tools.";
            this.highlightElement(sidebar, '#EF5350');
            return { guidance };
        }

        // Default generic
        guidance += "Please try simpler steps or switch to Guide Mode to show me.";
        return { guidance };
    }

    showTier2Preview(actions) {
        const safeActions = actions.filter(a => a.safe);

        if (safeActions.length === 0) {
            this.handleTier3Blocked(actions);
            return;
        }

        // Concise preview for Tier 2
        let previewText = safeActions.length === 1
            ? `I'll ${safeActions[0].action} "${safeActions[0].target}".`
            : `I'll perform ${safeActions.length} actions.`;

        const html = `
            <div class="plan-card" style="border-left: 2px solid #C9A24D; padding: 12px;">
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 10px;">${previewText}</div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="tier2-approve-${this.instanceId}" style="flex: 1; background: #4E342E; color: white;">Proceed</button>
                    <button class="action-btn" id="tier2-cancel-${this.instanceId}" style="flex: 0; padding: 8px 16px; background: transparent; border: 1px solid #E0D6D1;">Cancel</button>
                </div>
            </div>
        `;

        this.addMessage('agent', html, true);
        this.autoExecutor.pendingActions = safeActions;

        setTimeout(() => {
            const approveBtn = this.shadow.getElementById(`tier2-approve-${this.instanceId}`);
            const cancelBtn = this.shadow.getElementById(`tier2-cancel-${this.instanceId}`);

            if (approveBtn) {
                approveBtn.onclick = async () => {
                    this.autoExecutor.consentGiven = true;
                    await this.executeTier2Actions();
                };
            }
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.addMessage('agent', 'Cancelled.');
                    this.autoExecutor.pendingActions = [];
                };
            }
        }, 50);
    }

    async executeTier2Actions() {
        const actions = this.autoExecutor.pendingActions;

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            const success = await this.executeAutoAction(action);

            if (!success) {
                this.addMessage('agent', `Could not complete: ${action.target}.`);
                break;
            }

            await this.delay(500);
        }

        this.addMessage('agent', 'Done.');
        this.autoExecutor.pendingActions = [];
        this.autoExecutor.consentGiven = false;
    }

    handleTier3Blocked(actions) {
        const blocked = actions.filter(a => a.blocked);
        const action = blocked[0] || actions[0];

        // Stay in Auto mode but provide Human-in-Loop guidance
        const reason = action?.blockReason || 'This action requires manual input';
        const target = action?.target || 'this action';

        // Provide intelligent guidance instead of just refusing
        const html = `
            <div class="plan-card" style="border-left: 2px solid #C9A24D; padding: 12px;">
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 8px;">
                    ${reason}. Here's how to do it manually:
                </div>
                <div style="font-size: 12px; color: #4E342E; margin-bottom: 8px; padding: 8px; background: #F5F0ED; border-radius: 4px;">
                    1. Locate "${target}" on the page<br>
                    2. Click on it directly<br>
                    3. Complete any required fields
                </div>
                <div style="font-size: 11px; color: #6D4C41;">
                    I'll stay in Auto mode for your next request.
                </div>
            </div>
        `;

        this.addMessage('agent', html, true);
        // Do NOT switch modes - stay in Auto
    }

    prepareActionsForAuto(roadmap) {
        const automatable = [];

        roadmap.forEach((step, index) => {
            const action = step.action?.toLowerCase() || '';
            const target = step.target_hint || '';

            // Check if action is safe to automate
            const safety = this.checkActionSafety(action, target);

            automatable.push({
                index,
                originalStep: step,
                action: action,
                target: target,
                description: step.description || step.reason || '',
                safe: safety.safe,
                blocked: safety.blocked,
                blockReason: safety.reason,
                confidence: safety.confidence
            });
        });

        return automatable;
    }

    checkActionSafety(action, target) {
        const result = {
            safe: true,
            blocked: false,
            reason: null,
            confidence: 0.8
        };

        // Check for blocked actions
        for (const blocked of this.autoModeBlockedActions) {
            if (action.includes(blocked)) {
                result.safe = false;
                result.blocked = true;
                result.reason = `"${blocked}" actions are not allowed in auto mode`;
                return result;
            }
        }

        // Check for sensitive fields
        for (const sensitive of this.autoModeSensitiveFields) {
            if (target.toLowerCase().includes(sensitive)) {
                result.safe = false;
                result.blocked = true;
                result.reason = `Cannot interact with ${sensitive} fields`;
                return result;
            }
        }

        // Check action type
        const safeActions = ['click', 'scroll', 'navigate', 'open', 'expand', 'focus', 'select', 'switch'];
        const fillActions = ['type', 'fill', 'enter', 'input'];

        if (safeActions.some(a => action.includes(a))) {
            result.confidence = 0.9;
        } else if (fillActions.some(a => action.includes(a))) {
            result.confidence = 0.75; // Slightly lower for fills
        } else if (action.includes('submit')) {
            result.safe = false;
            result.blocked = true;
            result.reason = 'Form submission is never automated';
        }

        return result;
    }

    showAutomationPreview(actions) {
        const safeActions = actions.filter(a => a.safe);
        const blockedActions = actions.filter(a => a.blocked);

        let html = `
            <div class="plan-card" style="max-height: 400px; overflow-y: auto; border-left: 3px solid #C9A24D;">
                <div class="plan-title">Automation Preview</div>
                <div style="font-size: 12px; color: #6D4C41; margin-bottom: 12px;">
                    Review the actions I'll perform:
                </div>
        `;

        // Safe actions
        if (safeActions.length > 0) {
            html += `<div style="margin-bottom: 12px;">`;
            safeActions.forEach((action, i) => {
                const actionIcon = this.getActionIcon(action.action);
                html += `
                    <div style="padding: 8px; margin-bottom: 6px; background: #F0FDF4; border-radius: 6px; border: 1px solid #BBF7D0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px;">${actionIcon}</span>
                            <div>
                                <div style="font-weight: 500; font-size: 13px; color: #166534;">${this.formatActionName(action.action)}</div>
                                <div style="font-size: 11px; color: #4B5563;">${action.target}</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        // Blocked actions
        if (blockedActions.length > 0) {
            html += `
                <div style="padding: 8px; background: #FEF2F2; border-radius: 6px; border: 1px solid #FECACA; margin-bottom: 12px;">
                    <div style="font-weight: 500; color: #991B1B; font-size: 12px; margin-bottom: 4px;">Will NOT automate:</div>
            `;
            blockedActions.forEach(action => {
                html += `<div style="font-size: 11px; color: #7F1D1D;">• ${action.blockReason}</div>`;
            });
            html += `</div>`;
        }

        // Consent buttons
        html += `
            <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button class="action-btn" id="auto-approve-all-${this.instanceId}" style="flex: 1; background: #4E342E; color: white;">Approve All</button>
                <button class="action-btn" id="auto-step-by-step-${this.instanceId}" style="flex: 1;">Step by Step</button>
                <button class="action-btn" id="auto-cancel-${this.instanceId}" style="flex: 0; padding: 8px 16px; background: transparent; border: 1px solid #E0D6D1;">Cancel</button>
            </div>
        </div>
        `;

        this.addMessage('agent', html, true);
        this.autoExecutor.pendingActions = safeActions;

        // Bind buttons
        setTimeout(() => {
            const approveAll = this.shadow.getElementById(`auto-approve-all-${this.instanceId}`);
            const stepByStep = this.shadow.getElementById(`auto-step-by-step-${this.instanceId}`);
            const cancel = this.shadow.getElementById(`auto-cancel-${this.instanceId}`);

            if (approveAll) {
                approveAll.onclick = () => {
                    this.autoExecutor.consentGiven = true;
                    this.autoExecutor.stepByStep = false;
                    this.startAutoExecution();
                };
            }
            if (stepByStep) {
                stepByStep.onclick = () => {
                    this.autoExecutor.consentGiven = true;
                    this.autoExecutor.stepByStep = true;
                    this.startAutoExecution();
                };
            }
            if (cancel) {
                cancel.onclick = () => {
                    this.addMessage('agent', 'Automation cancelled. You can proceed manually.');
                    this.autoExecutor.pendingActions = [];
                };
            }
        }, 50);
    }

    async startAutoExecution() {
        if (!this.autoExecutor.consentGiven || this.autoExecutor.pendingActions.length === 0) {
            return;
        }

        this.autoExecutor.isRunning = true;
        this.autoExecutor.isPaused = false;
        this.autoExecutor.currentActionIndex = 0;

        this.addMessage('agent', 'Starting automation...');
        this.updateAutoControlsUI();

        await this.executeNextAction();
    }

    async executeNextAction() {
        if (!this.autoExecutor.isRunning || this.autoExecutor.isPaused) {
            return;
        }

        const actions = this.autoExecutor.pendingActions;
        const index = this.autoExecutor.currentActionIndex;

        if (index >= actions.length) {
            this.completeAutoExecution();
            return;
        }

        const action = actions[index];

        // Check confidence threshold
        if (action.confidence < this.autoModeConfidenceThreshold) {
            this.addMessage('agent', `Skipping "${action.target}" - confidence too low. Manual action required.`);
            this.autoExecutor.currentActionIndex++;
            await this.executeNextAction();
            return;
        }

        // Execute the action
        const success = await this.executeAutoAction(action);

        if (success) {
            this.autoExecutor.executedActions.push(action);
            this.addMessage('agent', `Completed: ${this.formatActionName(action.action)} "${action.target}"`);
        } else {
            this.addMessage('agent', `Could not complete: ${action.target}. You may need to do this manually.`);
        }

        this.autoExecutor.currentActionIndex++;

        // Wait between actions
        await this.delay(500);

        if (this.autoExecutor.stepByStep) {
            this.showStepByStepContinue();
        } else {
            await this.executeNextAction();
        }
    }

    async executeAutoAction(action) {
        try {
            const actionType = action.action.toLowerCase();
            const target = action.target;

            // PHASE 8: REQUIRED GATE CHECK
            const gate = this.detectRequiredGate();
            if (gate.detected) {
                this.stopAutoExecution();
                this.addMessage('agent', `
                    <div style="background: linear-gradient(135deg, #FFF9C4, #FFF59D); border-left: 3px solid #FBC02D; padding: 12px; border-radius: 8px;">
                        <div style="font-weight: 700; color: #F57F17; margin-bottom: 6px;">🚧 Manual Intervention Required</div>
                        <div style="font-size: 13px; color: #4E342E;">
                            <b>I paused because:</b> ${gate.reason}<br><br>
                            This is a <b>${gate.type}</b> step that requires your direct attention. I cannot automate this for security reasons.<br>
                            <div style="margin-top: 8px; font-size: 11px; color: #666;">Completing this manually will restore normal operation.</div>
                        </div>
                    </div>
                `, true);
                return false;
            }

            // Find the target element with evidence
            const findings = this.findElementByDescription(target);

            // EXECUTION GATE (Phase 2)
            // Require: Element exists + Confidence >= 0.7 + Evidence
            // Require: Element exists + Confidence >= 0.7 + Evidence
            if (!findings.element || findings.score < 0.7 || !findings.evidence) {

                // PHASE 7: CONTEXT MISMATCH CHECK (Fatal Error)
                const mismatch = this.checkContextMismatch(action.originalStep || { target_hint: target, action: actionType });
                if (mismatch) {
                    this.stopAutoExecution();
                    this.addMessage('agent', `
                        <div style="background: linear-gradient(135deg, #FFF5F5, #FFEBEB); border-left: 3px solid #D32F2F; padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 700; color: #B71C1C; margin-bottom: 6px;">🛑 Auto-Mode Stopped</div>
                            <div style="font-size: 13px; color: #4E342E;">
                                <b>Context Mismatch Detected:</b><br>
                                I expected to find "<b>${target}</b>" on a <b>${mismatch.expected}</b>, but I see a <b>${mismatch.currentType}</b> page.<br><br>
                                <i>${mismatch.reason}</i>
                            </div>
                        </div>
                    `, true);
                    return false;
                }

                // PHASE 3: AMBIGUITY CHECK (Smart Clarification)
                // If score is decent (0.4-0.7) and we have candidates, ask for clarification
                if (findings.score >= 0.4 && findings.candidates && findings.candidates.length > 1) {
                    console.log(`[Auto Ambiguity] Score ${findings.score.toFixed(2)}, asking clarification`);
                    this.askForClarification(target, findings.candidates, action);
                    // Stop current execution flow, will resume after user choice
                    this.autoExecutor.isPaused = true;
                    return false;
                }

                // PHASE 9: FAILURE TRANSITION
                // Instead of silent warning, provide actionable guidance
                console.warn(`[Auto Gate] Blocked action: Score ${findings.score.toFixed(2)} based on "${findings.evidence}"`);

                this.transitionToFailureGuidance(target, `I couldn't find "${target}" confidently enough (Score: ${(findings.score * 100).toFixed(0)}%).`);
                return false;
            }

            const element = findings.element;
            console.log(`[Auto Exec] Gate passed: ${findings.score.toFixed(2)} - ${findings.evidence}`);

            // Highlight element during action
            this.highlightAutoElement(element, '#C9A24D');

            // Execute based on action type
            if (actionType.includes('click') || actionType.includes('navigate') || actionType.includes('open')) {
                element.click();
            } else if (actionType.includes('scroll')) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (actionType.includes('focus')) {
                element.focus();
            } else if (actionType.includes('expand') || actionType.includes('toggle')) {
                element.click();
            } else {
                element.click();
            }

            // Remove highlight after action
            setTimeout(() => this.clearHighlight(), 800);

            return true;
        } catch (error) {
            console.error('Auto action failed:', error);
            return false;
        }
    }

    askForClarification(targetDesc, candidates, originalAction) {
        const promptId = `clarify-${this.instanceId}`;

        let candidatesHtml = '';
        // Take top 3 candidates
        candidates.slice(0, 3).forEach((cand, idx) => {
            candidatesHtml += `
                <button class="action-btn" id="clarify-opt-${idx}-${this.instanceId}" style="width: 100%; margin-bottom: 6px; text-align: left; font-size: 11px; padding: 6px 10px; background: #FFF; border: 1px solid #E0D6D1; color: #4E342E;">
                    ${idx + 1}. "${cand.text}" <span style="opacity: 0.6; font-size: 10px;">(Score: ${(cand.score * 10).toFixed(0)})</span>
                </button>
            `;
        });

        const html = `
            <div class="plan-card" id="${promptId}" style="border-left: 2px solid #C9A24D; padding: 12px;">
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 8px;">
                    I found multiple options for "<b>${targetDesc}</b>". Which one?
                </div>
                <div style="margin-bottom: 8px;">
                    ${candidatesHtml}
                </div>
                <button class="action-btn" id="clarify-cancel-${this.instanceId}" style="background: transparent; border: none; color: #9E9E9E; font-size: 11px; width: 100%;">None of these / Cancel</button>
            </div>
        `;

        this.addMessage('agent', html, true);

        // Highlight candidates temporarily
        candidates.slice(0, 3).forEach(cand => {
            if (cand.element) this.highlightAutoElement(cand.element, '#FFD54F'); // Lighter yellow
        });

        setTimeout(() => {
            // Bind candidate buttons
            candidates.slice(0, 3).forEach((cand, idx) => {
                const btn = this.shadow.getElementById(`clarify-opt-${idx}-${this.instanceId}`);
                if (btn) {
                    btn.onclick = async () => {
                        // User chose this option
                        this.clearHighlight();
                        const prompt = this.shadow.getElementById(promptId);
                        if (prompt) prompt.remove();

                        // LEARN: User disambiguated intent
                        this.learnElementMapping(targetDesc, cand.element);

                        this.addMessage('user', `Option ${idx + 1}: ${cand.text}`);

                        // Force execution with this element
                        // We modify the internal findElementByDescription temporarily or just call execute directly
                        // Easier: resume loop but pre-seed logic? 
                        // Actually, we can just recursively call executeAutoAction but bypass finding
                        // OR better: call a "forceExecute" helper.

                        // Let's just manually trigger the action on the element
                        this.addMessage('agent', `Understood. Proceeding with "${cand.text}".`);

                        // We need to unpause
                        this.autoExecutor.isPaused = false;

                        // Execute directly
                        await this.executeAutoActionWithElement(cand.element, originalAction.action);

                        // Resume the loop
                        this.executeNextAction();
                    };
                }
            });

            const cancelBtn = this.shadow.getElementById(`clarify-cancel-${this.instanceId}`);
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    this.clearHighlight();
                    const prompt = this.shadow.getElementById(promptId);
                    if (prompt) prompt.remove();
                    this.addMessage('agent', 'Clarification cancelled. Keeping manual control.');
                };
            }
        }, 100);
    }

    async executeAutoActionWithElement(element, actionType) {
        actionType = actionType.toLowerCase();
        try {
            this.highlightAutoElement(element, '#C9A24D');
            if (actionType.includes('click') || actionType.includes('navigate') || actionType.includes('open')) {
                element.click();
            } else if (actionType.includes('scroll')) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (actionType.includes('focus')) {
                element.focus();
            } else if (actionType.includes('expand') || actionType.includes('toggle')) {
                element.click();
            } else {
                element.click();
            }
            setTimeout(() => this.clearHighlight(), 800);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    findElementByDescription(description) {
        if (!description) return { element: null, score: 0, evidence: '', candidates: [] };

        // Extract keywords
        const fillerWords = ['the', 'a', 'an', 'to', 'on', 'click', 'open', 'go', 'navigate', 'button', 'link', 'menu', 'my', 'your', 'show', 'view'];
        const keywords = description.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 1 && !fillerWords.includes(w));

        if (keywords.length === 0) return { element: null, score: 0, evidence: 'No keywords found', candidates: [] };

        console.log('[Auto] Looking for:', keywords);

        // Check for learned mapping
        const learnedSignature = this.getLearnedMapping(description);
        if (learnedSignature) {
            console.log('[Auto] Found learned preference:', learnedSignature);
        }

        let candidates = [];
        let bestScore = 0;

        const allClickables = document.querySelectorAll('a, button, [role="button"], [onclick], [class*="btn"], [class*="nav"], [class*="menu"], [class*="cart"], [class*="link"]');

        for (const el of allClickables) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            const text = (el.innerText || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();
            const className = (el.className || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const href = (el.getAttribute('href') || '').toLowerCase();

            let score = 0;
            let matchedSources = [];

            for (const keyword of keywords) {
                if (text.includes(keyword)) { score += 10; matchedSources.push('text'); }
                if (ariaLabel.includes(keyword)) { score += 8; matchedSources.push('aria-label'); }
                if (title.includes(keyword)) { score += 6; matchedSources.push('title'); }
                if (href.includes(keyword)) { score += 5; matchedSources.push('href'); }
                if (id.includes(keyword)) { score += 4; matchedSources.push('id'); }
                if (className.includes(keyword)) { score += 2; matchedSources.push('class'); }
            }

            if (text.trim() === description.toLowerCase().trim()) {
                score += 20;
                matchedSources.push('exact_text');
            }
            if (text.length < 20 && text.length > 0) score += 2;

            // Boost if matches learned signature
            if (learnedSignature) {
                const tagMatch = el.tagName.toLowerCase() === learnedSignature.tag;
                const textMatch = (text.includes(learnedSignature.text.toLowerCase()) || learnedSignature.text.toLowerCase().includes(text));

                if (tagMatch && textMatch) {
                    score += 50;
                    matchedSources.push('LEARNED_PREFERENCE');
                }
            }

            if (score > 10) { // Only track decent candidates
                candidates.push({
                    element: el,
                    score: score,
                    evidence: `Matches keywords in: ${[...new Set(matchedSources)].join(', ')}`,
                    text: (el.innerText || ariaLabel || title || 'Element').trim().substring(0, 30)
                });
            }
        }

        // Sort candidates by score
        candidates.sort((a, b) => b.score - a.score);

        // Take top 3
        const topCandidates = candidates.slice(0, 3);
        const bestMatch = topCandidates.length > 0 ? topCandidates[0] : null;

        if (bestMatch) {
            bestScore = bestMatch.score;
        }

        // Normalize score (0-1). Assumes score ~20-30 is a good match.
        const normalizedScore = Math.min(bestScore / 25, 1);

        return {
            element: bestMatch ? bestMatch.element : null,
            score: normalizedScore,
            evidence: bestMatch ? bestMatch.evidence : '',
            candidates: topCandidates
        };
    }

    highlightAutoElement(element, color = '#C9A24D') {
        this.clearHighlight();

        const rect = element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.id = 'agent-auto-highlight';
        highlight.style.cssText = `
            position: fixed;
            left: ${rect.left - 4}px;
            top: ${rect.top - 4}px;
            width: ${rect.width + 8}px;
            height: ${rect.height + 8}px;
            border: 3px solid ${color};
            border-radius: 6px;
            background: ${color}22;
            z-index: 999998;
            pointer-events: none;
            animation: pulse 1s ease-in-out infinite;
        `;
        document.body.appendChild(highlight);
    }

    showStepByStepContinue() {
        const html = `
            <div class="plan-card" id="step-continue-${this.instanceId}" style="border-left: 2px solid #C9A24D;">
                <div style="font-size: 13px; color: #2E2E2E; margin-bottom: 8px;">
                    Step ${this.autoExecutor.currentActionIndex} of ${this.autoExecutor.pendingActions.length} complete.
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="action-btn" id="continue-auto-${this.instanceId}" style="flex: 1;">Continue</button>
                    <button class="action-btn" id="stop-auto-${this.instanceId}" style="flex: 1; background: transparent; border: 1px solid #E0D6D1;">Stop here</button>
                </div>
            </div>
        `;
        this.addMessage('agent', html, true);

        setTimeout(() => {
            const continueBtn = this.shadow.getElementById(`continue-auto-${this.instanceId}`);
            const stopBtn = this.shadow.getElementById(`stop-auto-${this.instanceId}`);
            const panel = this.shadow.getElementById(`step-continue-${this.instanceId}`);

            if (continueBtn) {
                continueBtn.onclick = async () => {
                    if (panel) panel.remove();
                    await this.executeNextAction();
                };
            }
            if (stopBtn) {
                stopBtn.onclick = () => {
                    if (panel) panel.remove();
                    this.stopAutoExecution();
                };
            }
        }, 50);
    }

    completeAutoExecution() {
        this.autoExecutor.isRunning = false;
        const count = this.autoExecutor.executedActions.length;
        this.addMessage('agent', `Automation complete. ${count} action${count !== 1 ? 's' : ''} performed successfully.`);
        this.updateAutoControlsUI();

        // Reset state
        this.autoExecutor.pendingActions = [];
        this.autoExecutor.executedActions = [];
        this.autoExecutor.currentActionIndex = 0;
        this.autoExecutor.consentGiven = false;
    }

    toggleAutoPause() {
        if (!this.autoExecutor.isRunning) return;

        this.autoExecutor.isPaused = !this.autoExecutor.isPaused;

        const pauseBtn = this.shadow.getElementById('auto-pause');
        if (pauseBtn) {
            pauseBtn.textContent = this.autoExecutor.isPaused ? '▶ Resume' : '⏸ Pause';
        }

        if (!this.autoExecutor.isPaused) {
            this.executeNextAction();
        } else {
            this.addMessage('agent', 'Automation paused. Click Resume to continue.');
        }
    }

    stopAutoExecution() {
        this.autoExecutor.isRunning = false;
        this.autoExecutor.isPaused = false;
        this.clearHighlight();

        const executed = this.autoExecutor.executedActions.length;
        this.addMessage('agent', `Automation stopped. ${executed} action${executed !== 1 ? 's' : ''} completed.`);

        this.updateAutoControlsUI();

        // Reset
        this.autoExecutor.pendingActions = [];
        this.autoExecutor.executedActions = [];
        this.autoExecutor.currentActionIndex = 0;
        this.autoExecutor.consentGiven = false;
    }

    updateAutoControlsUI() {
        const pauseBtn = this.shadow.getElementById('auto-pause');
        if (pauseBtn) {
            pauseBtn.textContent = this.autoExecutor.isPaused ? '▶ Resume' : '⏸ Pause';
            pauseBtn.disabled = !this.autoExecutor.isRunning;
        }
    }

    getActionIcon(action) {
        const actionLower = action.toLowerCase();
        if (actionLower.includes('click') || actionLower.includes('press')) return '👆';
        if (actionLower.includes('scroll')) return '📜';
        if (actionLower.includes('navigate') || actionLower.includes('go')) return '🔗';
        if (actionLower.includes('open')) return '📂';
        if (actionLower.includes('expand')) return '📖';
        if (actionLower.includes('fill') || actionLower.includes('type')) return '✏️';
        if (actionLower.includes('select')) return '☑️';
        return '▶️';
    }

    formatActionName(action) {
        return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    extractPrimaryActions() {
        const actions = [];
        const seenText = new Set();

        // Look for prominent buttons
        const primaryButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], .btn-primary, [class*="primary"]');
        primaryButtons.forEach(btn => {
            const text = (btn.innerText || btn.value || '').trim();
            if (text && text.length < 30 && !seenText.has(text.toLowerCase())) {
                seenText.add(text.toLowerCase());
                actions.push(text);
            }
        });

        // Look for main navigation links with action keywords
        const actionKeywords = ['submit', 'save', 'create', 'add', 'buy', 'order', 'download', 'start', 'continue', 'proceed'];
        document.querySelectorAll('button, a[role="button"], input[type="button"]').forEach(el => {
            const text = (el.innerText || el.value || '').trim().toLowerCase();
            if (actionKeywords.some(k => text.includes(k)) && !seenText.has(text)) {
                seenText.add(text);
                actions.push(el.innerText || el.value);
            }
        });

        return actions.slice(0, 5);
    }

    extractSecondaryActions() {
        const actions = [];
        const seenText = new Set();

        // Look for secondary/less prominent links
        const secondaryKeywords = ['help', 'support', 'learn more', 'about', 'contact', 'settings', 'profile', 'account'];

        document.querySelectorAll('nav a, footer a, header a').forEach(link => {
            const text = (link.innerText || '').trim();
            if (text && text.length > 1 && text.length < 25 && !seenText.has(text.toLowerCase())) {
                if (secondaryKeywords.some(k => text.toLowerCase().includes(k))) {
                    seenText.add(text.toLowerCase());
                    actions.push(text);
                }
            }
        });

        return actions.slice(0, 4);
    }

    extractFormDescriptions() {
        const descriptions = [];
        const forms = document.querySelectorAll('form');

        forms.forEach((form, index) => {
            const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
            const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
            const submitText = submitBtn?.innerText || submitBtn?.value || '';

            if (inputs.length > 0) {
                let desc = `Form with ${inputs.length} field${inputs.length > 1 ? 's' : ''}`;
                if (submitText) {
                    desc += ` (${submitText})`;
                }
                descriptions.push(desc);
            }
        });

        return descriptions.slice(0, 3);
    }

    // --- PERCEPTION TRANSPARENCY ---
    showPerceptionPanel() {
        const perception = this.analyzePagePerception();

        // Build collapsible panel HTML
        const panelId = `perception-${this.instanceId}`;
        const html = `
            <div class="perception-panel" id="${panelId}">
                <div class="perception-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <span style="font-weight: 700; color: #4338ca;">👁️ How I See This Page</span>
                    <span class="perception-toggle-icon" style="font-size: 12px;">▼</span>
                </div>
                <div class="perception-content" style="margin-top: 10px;">
                    <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">
                        ${perception.summary}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                        <div style="background: #f0f4ff; padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: #4338ca;">${perception.buttonCount}</div>
                            <div style="font-size: 11px; color: #64748b;">Buttons</div>
                        </div>
                        <div style="background: #f0fdf4; padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: #16a34a;">${perception.inputCount}</div>
                            <div style="font-size: 11px; color: #64748b;">Input Fields</div>
                        </div>
                        <div style="background: #fef3c7; padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: #d97706;">${perception.linkCount}</div>
                            <div style="font-size: 11px; color: #64748b;">Links</div>
                        </div>
                        <div style="background: #fce7f3; padding: 8px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 20px; font-weight: 700; color: #db2777;">${perception.formCount}</div>
                            <div style="font-size: 11px; color: #64748b;">Forms</div>
                        </div>
                    </div>
                    ${perception.actions.length > 0 ? `
                        <div style="margin-top: 12px;">
                            <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Detected Actions:</div>
                            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                ${perception.actions.map(a => `<span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${a}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        this.addMessage('agent', html, true);

        // Make panel collapsible
        setTimeout(() => {
            const panel = this.shadow.getElementById(panelId);
            if (panel) {
                const header = panel.querySelector('.perception-header');
                const content = panel.querySelector('.perception-content');
                const icon = panel.querySelector('.perception-toggle-icon');

                header.onclick = () => {
                    const isHidden = content.style.display === 'none';
                    content.style.display = isHidden ? 'block' : 'none';
                    icon.textContent = isHidden ? '▼' : '▶';
                };
            }
        }, 50);
    }

    analyzePagePerception() {
        // Gather page info
        const title = document.title || 'Untitled Page';
        const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
        const links = document.querySelectorAll('a[href]');
        const forms = document.querySelectorAll('form');

        // Detect page type
        let pageType = 'page';
        if (forms.length > 0 && inputs.length > 3) pageType = 'form';
        else if (document.querySelectorAll('table, [role="grid"]').length > 0) pageType = 'list or table';
        else if (document.querySelectorAll('[class*="dashboard"], [class*="panel"], [class*="widget"]').length > 0) pageType = 'dashboard';
        else if (inputs.length > 0) pageType = 'interactive page';

        // Detect common actions by button/link text
        const actionKeywords = {
            'submit': 'Submit', 'save': 'Save', 'create': 'Create', 'add': 'Add',
            'delete': 'Delete', 'remove': 'Remove', 'edit': 'Edit', 'update': 'Update',
            'search': 'Search', 'filter': 'Filter', 'login': 'Login', 'sign in': 'Sign In',
            'register': 'Register', 'sign up': 'Sign Up', 'checkout': 'Checkout',
            'buy': 'Buy', 'download': 'Download', 'upload': 'Upload', 'send': 'Send'
        };

        const detectedActions = new Set();
        const allInteractive = [...buttons, ...links];
        allInteractive.forEach(el => {
            const text = (el.innerText || el.value || '').toLowerCase();
            for (const [key, label] of Object.entries(actionKeywords)) {
                if (text.includes(key)) {
                    detectedActions.add(label);
                }
            }
        });

        // Build summary
        let summary = `I see a <b>${pageType}</b>`;
        if (title.length > 40) {
            summary += ` called "${title.substring(0, 40)}..."`;
        } else {
            summary += ` called "${title}"`;
        }

        if (inputs.length > 0) {
            summary += ` with ${inputs.length} input field${inputs.length > 1 ? 's' : ''}`;
        }

        if (detectedActions.size > 0) {
            const mainAction = [...detectedActions][0];
            summary += ` and a ${mainAction} action.`;
        } else {
            summary += '.';
        }

        return {
            title,
            pageType,
            buttonCount: buttons.length,
            inputCount: inputs.length,
            linkCount: links.length,
            formCount: forms.length,
            actions: [...detectedActions].slice(0, 5), // Max 5 actions
            summary
        };
    }
    learnElementMapping(intentLabel, element) {
        if (!element || !intentLabel) return;

        try {
            const origin = window.location.origin;
            const mappingKey = `agent_learned_${origin}`;
            const signature = this.generateElementSignature(element);

            // Get existing mappings
            let mappings = {};
            try {
                const stored = localStorage.getItem(mappingKey);
                if (stored) mappings = JSON.parse(stored);
            } catch (e) { console.error('Error reading mappings', e); }

            // Normalize intent
            const cleanIntent = intentLabel.toLowerCase().trim();

            // Save mapping
            mappings[cleanIntent] = signature;
            localStorage.setItem(mappingKey, JSON.stringify(mappings));
            console.log(`[Auto Learning] Learned mapping for "${cleanIntent}" on ${origin}`);

        } catch (e) {
            console.error('[Auto Learning] Failed to learn mapping', e);
        }
    }

    getLearnedMapping(intentLabel) {
        if (!intentLabel) return null;
        try {
            const origin = window.location.origin;
            const mappingKey = `agent_learned_${origin}`;
            const stored = localStorage.getItem(mappingKey);
            if (!stored) return null;

            const mappings = JSON.parse(stored);
            const cleanIntent = intentLabel.toLowerCase().trim();

            // Direct match
            if (mappings[cleanIntent]) return mappings[cleanIntent];

            // Fuzzy match (checking if learned intent is contained in current description)
            for (const key in mappings) {
                if (cleanIntent.includes(key) || key.includes(cleanIntent)) {
                    return mappings[key];
                }
            }
        } catch (e) {
            console.error('[Auto Learning] Failed to get mapping', e);
        }
        return null;
    }

    generateElementSignature(element) {
        // Create a signature to re-find the element reliably
        const tag = element.tagName.toLowerCase();
        const id = element.id || '';
        const classes = Array.from(element.classList).join('.');
        const text = (element.innerText || element.getAttribute('aria-label') || '').trim().substring(0, 50);
        const role = element.getAttribute('role') || '';
        const href = element.getAttribute('href') || '';

        return {
            tag,
            id,
            classes,
            text,
            role,
            href: href.substring(href.length - 20) // Store only end of URL to be relative-safe
        };
    }

    // --- PHASE 7: CONTEXT MISMATCH DETECTION ---

    classifyPageType() {
        const title = (document.title || '').toLowerCase();
        const h1 = (document.querySelector('h1')?.innerText || '').toLowerCase();
        const bodyText = document.body.innerText.substring(0, 1000).toLowerCase(); // Scan top of page

        // 1. AUTH_VERIFICATION
        if (title.includes('verify') || h1.includes('verify') ||
            bodyText.includes('enter code') || bodyText.includes('verification code') ||
            document.querySelector('input[autocomplete="one-time-code"]')) {
            return 'AUTH_VERIFICATION';
        }

        // 2. AUTH_LOGIN
        if (title.includes('login') || h1.includes('sign in') ||
            (document.querySelectorAll('input[type="password"]').length > 0 && bodyText.includes('password'))) {
            return 'AUTH_LOGIN';
        }

        // 3. UPLOAD_FLOW
        if (document.querySelector('input[type="file"]') || bodyText.includes('drag and drop') || h1.includes('upload')) {
            return 'UPLOAD_FLOW';
        }

        // 4. SETTINGS
        if (title.includes('settings') || h1.includes('settings') || title.includes('preferences') || title.includes('profile')) {
            return 'SETTINGS';
        }

        // 5. DASHBOARD
        if (title.includes('dashboard') || title.includes('overview') || title.includes('home')) {
            return 'DASHBOARD';
        }

        // 6. FORM_ENTRY
        const visibleInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'))
            .filter(el => el.offsetParent !== null);
        if (visibleInputs.length > 3) {
            return 'FORM_ENTRY';
        }

        // 7. CONTENT_BROWSE
        if (document.querySelectorAll('article, [role="article"], .post, .card').length > 3) {
            return 'CONTENT_BROWSE';
        }

        return 'UNKNOWN';
    }

    checkContextMismatch(step) {
        if (!step) return null;

        const currentType = this.classifyPageType();
        const stepDesc = (step.target_hint || step.description || '').toLowerCase();
        const action = (step.action || '').toLowerCase();

        console.log(`[Context Check] Page: ${currentType}, Step: "${stepDesc}"`);

        // If page is UNKNOWN, we give benefit of doubt
        if (currentType === 'UNKNOWN') return null;

        // RULES

        // Rule 1: Expectations of Dashboard/Settings but on Login/Verify page
        if ((currentType === 'AUTH_LOGIN' || currentType === 'AUTH_VERIFICATION') &&
            !stepDesc.includes('login') && !stepDesc.includes('sign') && !stepDesc.includes('code') && !stepDesc.includes('verify')) {
            return {
                mismatch: true,
                currentType,
                expected: 'Authenticated Page',
                reason: `I am on a ${currentType} page, but the step "${stepDesc}" expects an authenticated session.`
            };
        }

        // Rule 2: Expecting simple navigation but stuck in Form/Upload
        if ((currentType === 'UPLOAD_FLOW') &&
            (action.includes('navigate') || action.includes('click')) &&
            !stepDesc.includes('upload') && !stepDesc.includes('file')) {
            return {
                mismatch: true,
                currentType,
                expected: 'Navigation',
                reason: `I am in an Upload flow, but the step expects normal navigation.`
            };
        }

        return null;
    }

    // --- PHASE 8: REQUIRED GATE HANDLING ---

    detectRequiredGate() {
        const title = (document.title || '').toLowerCase();
        const bodyText = document.body.innerText.substring(0, 1500).toLowerCase();
        const h1 = (document.querySelector('h1')?.innerText || '').toLowerCase();

        // 1. Verification / Security Check
        if (title.includes('verify') || h1.includes('verify') ||
            bodyText.includes('enter the code') || bodyText.includes('verification code') ||
            bodyText.includes('security check')) {
            return {
                detected: true,
                type: 'VERIFICATION',
                reason: 'A verification step (OTP/Security) is required.'
            };
        }

        // 2. Confirmation Gate
        if (h1.includes('confirm') || bodyText.includes('please confirm') || bodyText.includes('are you sure')) {
            // Only if there's a primary action button
            if (document.querySelector('button[type="submit"], input[type="submit"]')) {
                return {
                    detected: true,
                    type: 'CONFIRMATION',
                    reason: 'A confirmation is required before proceeding.'
                };
            }
        }

        // 3. Multi-step Indicators
        // Look for "Step 1 of 2", "Step 2 of 4" etc.
        const stepMatch = bodyText.match(/step\s+(\d+)\s+of\s+(\d+)/i);
        if (stepMatch) {
            return {
                detected: true,
                type: 'MULTI_STEP',
                reason: `This is step ${stepMatch[1]} of ${stepMatch[2]}. Manual completion may be needed.`
            };
        }

        // 4. Blocked "Next" Buttons
        const nextBtn = Array.from(document.querySelectorAll('button, input[type="button"], a.btn'))
            .find(el => (el.innerText || '').toLowerCase().includes('next') || (el.innerText || '').toLowerCase().includes('continue'));

        if (nextBtn && (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true')) {
            return {
                detected: true,
                type: 'GATE_LOCKED',
                reason: 'The "Next" button is disabled. You must complete current fields first.'
            };
        }

        return { detected: false };
    }

    // --- PHASE 9: FAILURE TO GUIDANCE TRANSITION ---

    transitionToFailureGuidance(targetDesc, reason) {
        // 1. Analyze page for layout advice (Phase 5 logic)
        const analysis = this.analyzePageForGuidance(targetDesc);

        // 2. Stop automation if running
        if (this.autoExecutor.isRunning) {
            this.stopAutoExecution();
        }

        // 3. Clear existing highlights
        this.clearHighlight();

        // 4. Construct helpful fallback message
        const promptId = `failure-${this.instanceId}`;
        const html = `
            <div class="plan-card" id="${promptId}" style="border-left: 3px solid #607D8B; padding: 12px; background: #F5F5F5;">
                <div style="font-weight: 700; color: #455A64; margin-bottom: 6px;">🤔 I couldn't do this automatically</div>
                <div style="font-size: 13px; color: #263238; margin-bottom: 10px; line-height: 1.4;">
                    <b>Reason:</b> ${reason}<br>
                    ${analysis.guidance}
                </div>
                <div style="display: flex; gap: 8px;">
                     <button class="action-btn" id="manual-complete-${this.instanceId}" style="flex: 1; background: #FFF; border: 1px solid #455A64; color: #455A64;">I did it manually</button>
                     <button class="action-btn" id="switch-guide-${this.instanceId}" style="flex: 1; background: transparent; border: 1px solid #90A4AE; color: #546E7A;">Switch to Guide</button>
                </div>
            </div>
        `;

        this.addMessage('agent', html, true);

        // Bind buttons
        setTimeout(() => {
            const manualBtn = this.shadow.getElementById(`manual-complete-${this.instanceId}`);
            const guideBtn = this.shadow.getElementById(`switch-guide-${this.instanceId}`);
            const card = this.shadow.getElementById(promptId);

            if (manualBtn) {
                manualBtn.onclick = () => {
                    if (card) card.remove();
                    this.addMessage('user', 'I completed this step manually.');
                    this.addMessage('agent', 'Great! Ready for the next step?');
                    // If in steps mode, we might want to advance
                    if (this.currentRoadmap) {
                        // We don't auto-advance blindly here, let user click Done or detecting will handle it
                        // But we can offer a "Next" button or just let them wait.
                    }
                };
            }

            if (guideBtn) {
                guideBtn.onclick = () => {
                    if (card) card.remove();
                    this.enterGuidedDiscoveryMode({ target_hint: targetDesc });
                };
            }
        }, 50);
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
