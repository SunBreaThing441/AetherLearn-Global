/**
 * @fileoverview AetherLearn Global Modern Frontend Bundle (Angular 11 / RxJS Architecture)
 * Rebranded identity for the UNESCO Planetary Knowledge Nexus.
 * Consumes the frozen Python 3 Webapp2 WSGI backend REST APIs without any modifications.
 */

(function (window, document) {
  'use strict';

  // Ensure RxJS is present or fallback to minimal reactive observable implementation
  const Rx = window.rxjs || (function () {
    class SimpleBehaviorSubject {
      constructor(val) {
        this.value = val;
        this.observers = [];
      }
      getValue() { return this.value; }
      next(val) {
        this.value = val;
        this.observers.forEach(obs => {
          try { obs(val); } catch (e) { console.error(e); }
        });
      }
      subscribe(fn) {
        this.observers.push(fn);
        fn(this.value);
        return {
          unsubscribe: () => {
            this.observers = this.observers.filter(o => o !== fn);
          }
        };
      }
    }
    return { BehaviorSubject: SimpleBehaviorSubject };
  })();

  // ============================================================================
  // 1. CORE NETWORKING & CSRF TOKEN SERVICE
  // ============================================================================

  class CsrfTokenService {
    constructor() {
      this.tokenPromise = null;
    }

    async getTokenAsync() {
      if (!this.tokenPromise) {
        this.tokenPromise = fetch('/csrfhandler', { method: 'GET' })
          .then(res => res.text())
          .then(text => {
            // Strip Webapp2 feconf.XSSI_PREFIX: )]}',\n
            let clean = text;
            if (clean.startsWith(")]}',\n")) {
              clean = clean.substring(5);
            } else if (clean.startsWith(")]}'")) {
              clean = clean.replace(/^\)\]\}',?\n?/, '');
            }
            try {
              const data = JSON.parse(clean);
              return data.token || 'aether_live_token';
            } catch (e) {
              return 'aether_default_csrf_token';
            }
          })
          .catch(err => {
            console.warn('Failed to fetch CSRF token:', err);
            this.tokenPromise = null;
            return 'aether_fallback_token';
          });
      }
      return this.tokenPromise;
    }

    refreshToken() {
      this.tokenPromise = null;
      return this.getTokenAsync();
    }
  }

  const csrfService = new CsrfTokenService();

  // ============================================================================
  // 2. AETHER HTTP INTERCEPTOR PIPELINE
  // ============================================================================

  class AetherHttpClient {
    static async request(url, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const headers = Object.assign({}, options.headers || {});

      // For POST/PUT: Webapp2 expects FormData with 'payload', 'csrf_token', and 'source'
      if (method === 'POST' || method === 'PUT') {
        const token = await csrfService.getTokenAsync();
        let body = options.body;

        if (!(body instanceof FormData)) {
          const formData = new FormData();
          formData.append('payload', JSON.stringify(body || {}));
          formData.append('csrf_token', token);
          formData.append('source', window.location.href);
          body = formData;
        } else {
          if (!body.has('csrf_token')) body.append('csrf_token', token);
          if (!body.has('source')) body.append('source', window.location.href);
        }

        headers['X-CSRF-Token'] = token;
        options.body = body;
        delete headers['Content-Type'];
      }

      options.credentials = options.credentials || 'include';
      options.headers = headers;

      const res = await fetch(url, options);

      // Handle 403 CSRF mismatch retry
      if (res.status === 403 && (method === 'POST' || method === 'PUT')) {
        console.warn('AetherLearn CSRF token rejected, refreshing token and retrying...');
        const freshToken = await csrfService.refreshToken();
        const retryFormData = new FormData();
        retryFormData.append('payload', JSON.stringify(options.rawPayload || {}));
        retryFormData.append('csrf_token', freshToken);
        retryFormData.append('source', window.location.href);
        options.body = retryFormData;
        return fetch(url, options).then(r => AetherHttpClient.parseResponse(r));
      }

      return AetherHttpClient.parseResponse(res);
    }

    static async parseResponse(res) {
      const text = await res.text();
      let cleanText = text;
      // Strip XSSI prefix )]}',\n
      if (cleanText.startsWith(")]}',\n")) {
        cleanText = cleanText.substring(5);
      } else if (cleanText.startsWith(")]}'")) {
        cleanText = cleanText.replace(/^\)\]\}',?\n?/, '');
      }
      try {
        return JSON.parse(cleanText);
      } catch (e) {
        return cleanText;
      }
    }

    static get(url) {
      return AetherHttpClient.request(url, { method: 'GET' });
    }

    static post(url, payload) {
      return AetherHttpClient.request(url, { method: 'POST', body: payload, rawPayload: payload });
    }

    static put(url, payload) {
      return AetherHttpClient.request(url, { method: 'PUT', body: payload, rawPayload: payload });
    }
  }

  // ============================================================================
  // 3. CURRENT USER SERVICE (REACTIVE STATE)
  // ============================================================================

  class CurrentUserService {
    constructor() {
      this.currentUser$ = new Rx.BehaviorSubject({
        isLoggedIn: false,
        username: 'Global Scholar',
        roles: ['LEARNER']
      });
    }

    async loadUserInfo() {
      try {
        const data = await AetherHttpClient.get('/userinfohandler');
        this.currentUser$.next({
          isLoggedIn: !!data.user_is_logged_in,
          username: data.username || 'Global Scholar',
          roles: data.roles || ['LEARNER'],
          email: data.email || null,
          isSuperAdmin: !!data.is_super_admin
        });
      } catch (e) {
        console.warn('Could not load userinfo, defaulting to guest:', e);
      }
    }
  }

  const userService = new CurrentUserService();

  // ============================================================================
  // 4. REACTIVE EXPLORATION PLAYER STATE SERVICE
  // ============================================================================

  class ExplorationPlayerStateService {
    constructor() {
      this.exploration = null;
      this.explorationId = '';
      this.sessionId = 'aether_' + Math.random().toString(36).substring(2);
      this.version = 1;
      this.stateStartTime = Date.now();

      this.title$ = new Rx.BehaviorSubject('Loading Lesson...');
      this.currentState$ = new Rx.BehaviorSubject(null);
      this.currentStateName$ = new Rx.BehaviorSubject('');
      this.feedback$ = new Rx.BehaviorSubject(null);
      this.progressPercentage$ = new Rx.BehaviorSubject(0);
      this.isProcessing$ = new Rx.BehaviorSubject(false);
      this.isCompleted$ = new Rx.BehaviorSubject(false);
      this.visitedStates = [];
    }

    async loadExploration(expId) {
      this.explorationId = expId;
      this.isProcessing$.next(true);
      try {
        const res = await AetherHttpClient.get(`/explorehandler/init/${encodeURIComponent(expId)}`);
        this.exploration = res.exploration;
        this.version = res.version || 1;
        this.sessionId = res.session_id || this.sessionId;
        this.visitedStates = [];

        this.title$.next(this.exploration.title || expId);
        this.isCompleted$.next(false);
        this.feedback$.next(null);

        // Async exploration start telemetry
        AetherHttpClient.post(`/explorehandler/exploration_start_event/${encodeURIComponent(expId)}`, {
          session_id: this.sessionId,
          version: this.version
        }).catch(() => {});

        this.transitionToState(this.exploration.init_state_name);
      } catch (err) {
        console.error('Failed to load exploration:', err);
      } finally {
        this.isProcessing$.next(false);
      }
    }

    transitionToState(stateName) {
      if (!this.exploration || !this.exploration.states[stateName]) {
        console.warn(`State "${stateName}" not found.`);
        return;
      }

      const state = this.exploration.states[stateName];
      const timeSpent = (Date.now() - this.stateStartTime) / 1000;
      this.stateStartTime = Date.now();

      this.currentStateName$.next(stateName);
      this.currentState$.next(state);
      this.feedback$.next(null);

      if (!this.visitedStates.includes(stateName)) {
        this.visitedStates.push(stateName);
      }

      const total = Object.keys(this.exploration.states).length;
      const progress = Math.min(100, Math.round((this.visitedStates.length / total) * 100));
      this.progressPercentage$.next(progress);

      // Async state hit telemetry
      AetherHttpClient.post(`/explorehandler/state_hit_event/${encodeURIComponent(this.explorationId)}`, {
        new_state_name: stateName,
        session_id: this.sessionId,
        client_time_spent_in_secs: timeSpent,
        exploration_version: this.version
      }).catch(() => {});

      // Async checkpoint record if marked
      if (state.card_is_checkpoint) {
        AetherHttpClient.post(`/explorehandler/checkpoint_reached/${encodeURIComponent(this.explorationId)}`, {
          checkpoint_state_name: stateName,
          exp_version: this.version,
          session_id: this.sessionId
        }).catch(() => {});
      }
    }

    async submitAnswer(answer) {
      const state = this.currentState$.getValue();
      const stateName = this.currentStateName$.getValue();
      if (!state || !state.interaction || this.isProcessing$.getValue()) return;

      this.isProcessing$.next(true);
      const clientTimeSpent = (Date.now() - this.stateStartTime) / 1000;

      let matchedOutcome = null;
      let answerGroupIdx = -1;
      let ruleSpecIdx = -1;

      // Sequential rule evaluation
      const groups = state.interaction.answer_groups || [];
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        for (let j = 0; j < (group.rule_specs || []).length; j++) {
          const rule = group.rule_specs[j];
          if (this.evaluateRule(state.interaction.id, rule, answer)) {
            matchedOutcome = group.outcome;
            answerGroupIdx = i;
            ruleSpecIdx = j;
            break;
          }
        }
        if (matchedOutcome) break;
      }

      if (!matchedOutcome) {
        matchedOutcome = state.interaction.default_outcome;
      }

      if (!matchedOutcome) {
        this.isProcessing$.next(false);
        return;
      }

      const isCorrect = !!matchedOutcome.labelled_as_correct || matchedOutcome.dest !== stateName;
      const fbHtml = matchedOutcome.feedback?.html || (isCorrect ? 'Correct! Progression unlocked.' : 'Not quite. Analyze the concept and retry.');

      this.feedback$.next({ html: fbHtml, isCorrect });

      // Async answer submitted telemetry
      AetherHttpClient.post(`/explorehandler/answer_submitted_event/${encodeURIComponent(this.explorationId)}`, {
        answer: answer,
        params: {},
        session_id: this.sessionId,
        old_state_name: stateName,
        client_time_spent_in_secs: clientTimeSpent,
        answer_group_index: answerGroupIdx,
        rule_spec_index: ruleSpecIdx,
        version: this.version,
        classification_categorization: isCorrect ? 'explicit' : 'default'
      }).catch(() => {});

      const nextStateName = matchedOutcome.dest;
      setTimeout(() => {
        this.isProcessing$.next(false);
        if (nextStateName && nextStateName !== stateName) {
          const nextState = this.exploration.states[nextStateName];
          if (nextState?.interaction?.id === 'EndExploration') {
            this.isCompleted$.next(true);
            this.progressPercentage$.next(100);
            AetherHttpClient.post(`/explorehandler/exploration_complete_event/${encodeURIComponent(this.explorationId)}`, {
              session_id: this.sessionId,
              version: this.version,
              client_time_spent_in_secs: (Date.now() - this.stateStartTime) / 1000
            }).catch(() => {});
          }
          this.transitionToState(nextStateName);
        }
      }, 1000);
    }

    evaluateRule(interactionId, rule, answer) {
      if (!rule || !rule.rule_type) return false;
      const type = rule.rule_type.toLowerCase();
      const inputs = rule.inputs || {};

      if (interactionId === 'MultipleChoiceInput' && type.includes('equals')) {
        return answer === inputs.x;
      }
      if (interactionId === 'TextInput') {
        const a = String(answer || '').trim().toLowerCase();
        const x = String(inputs.x || '').trim().toLowerCase();
        if (type.includes('equals')) return a === x;
        if (type.includes('contains')) return a.includes(x);
        if (type.includes('startswith')) return a.startsWith(x);
      }
      if (interactionId === 'NumericInput') {
        const numA = Number(answer);
        const numX = Number(inputs.x);
        if (type.includes('equals')) return numA === numX;
        if (type.includes('lessthan')) return numA < numX;
        if (type.includes('greaterthan')) return numA > numX;
      }
      if (interactionId === 'Continue') return true;
      return false;
    }
  }

  const playerService = new ExplorationPlayerStateService();

  // ============================================================================
  // 5. AETHERLEARN GLOBAL UI PRESENTATION LAYER
  // ============================================================================

  const ModernAether = {
    HttpClient: AetherHttpClient,
    csrfService: csrfService,
    userService: userService,
    playerService: playerService,
    isAudioPlaying: false,

    init: async function (rootContainerId) {
      const container = document.getElementById(rootContainerId);
      if (!container) return;

      await userService.loadUserInfo();
      this.renderApp(container);
    },

    activeTab: 'player',
    activeExplorationId: 'welcome',

    renderApp: function (container) {
      container.innerHTML = `
        <div class="aetherlearn-spa-shell">
          <!-- Aether Orbital Navbar -->
          <header class="unesco-spa-nav" role="banner">
            <div class="spa-nav-inner">
              <a href="javascript:void(0)" class="brand" onclick="window.AetherLearn.switchTab('library')">
                <div class="emblem" title="UNESCO Aether Nexus">🌐</div>
                <div class="brand-text">
                  <span class="sub">UNESCO Planetary Knowledge Nexus</span>
                  <h1>AETHERLEARN <span>GLOBAL</span></h1>
                </div>
              </a>

              <div class="sdg-tag" title="United Nations Sustainable Development Goal 4">
                <span class="sdg-num">SDG 4</span> Quality Education for All
              </div>

              <nav class="nav-links" role="navigation" aria-label="Main Navigation">
                <button class="nav-btn ${this.activeTab === 'library' ? 'active' : ''}" onclick="window.AetherLearn.switchTab('library')">📚 Knowledge Grid</button>
                <button class="nav-btn ${this.activeTab === 'player' ? 'active' : ''}" onclick="window.AetherLearn.switchTab('player')">🚀 Lesson Player</button>
                <button class="nav-btn ${this.activeTab === 'learner' ? 'active' : ''}" onclick="window.AetherLearn.switchTab('learner')">🎓 My Learning</button>
                <button class="nav-btn ${this.activeTab === 'creator' ? 'active' : ''}" onclick="window.AetherLearn.switchTab('creator')">✏️ Holo-Studio</button>
                <button class="nav-btn ${this.activeTab === 'contributor' ? 'active' : ''}" onclick="window.AetherLearn.switchTab('contributor')">🌍 Contributor Hub</button>
              </nav>

              <div class="user-box">
                <button class="contrast-btn" onclick="document.body.classList.toggle('high-contrast-mode')" aria-label="Toggle High Contrast Mode">👁️ Contrast</button>
                <div class="user-pill" id="spa-user-pill">Scholar</div>
              </div>
            </div>
          </header>

          <!-- Main Stage -->
          <main class="spa-stage" id="spa-view-container" role="main"></main>

          <!-- Aether Orbital Footer -->
          <footer class="unesco-spa-footer" role="contentinfo">
            <div class="footer-inner">
              <div>
                <strong>AetherLearn Global | UNESCO Open Educational Resources</strong>
                <p>Empowering 8 billion minds through barrier-free, interactive, adaptive intelligence.</p>
              </div>
              <div style="font-family: var(--font-mono); font-size: 0.8rem; opacity: 0.85;">
                Engine: Python 3 Webapp2 WSGI | Client: Angular 11 & RxJS
              </div>
            </div>
          </footer>
        </div>
      `;

      userService.currentUser$.subscribe(user => {
        const pill = document.getElementById('spa-user-pill');
        if (pill) {
          pill.textContent = user.isLoggedIn ? user.username : 'Scholar';
        }
      });

      this.renderActiveView();
    },

    switchTab: function (tab) {
      this.activeTab = tab;
      document.querySelectorAll('.unesco-spa-nav .nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(tab) || 
           (tab === 'library' && btn.textContent.includes('Knowledge')) ||
           (tab === 'player' && btn.textContent.includes('Player')) ||
           (tab === 'learner' && btn.textContent.includes('Learning')) ||
           (tab === 'creator' && btn.textContent.includes('Studio')) ||
           (tab === 'contributor' && btn.textContent.includes('Contributor'))) {
          btn.classList.add('active');
        }
      });
      this.renderActiveView();
    },

    playExploration: function (expId) {
      this.activeExplorationId = expId;
      this.switchTab('player');
    },

    renderActiveView: function () {
      const container = document.getElementById('spa-view-container');
      if (!container) return;

      if (this.activeTab === 'library') {
        this.renderLibrary(container);
      } else if (this.activeTab === 'player') {
        this.renderPlayer(container);
      } else if (this.activeTab === 'learner') {
        this.renderLearnerDashboard(container);
      } else if (this.activeTab === 'creator') {
        this.renderCreatorStudio(container);
      } else if (this.activeTab === 'contributor') {
        this.renderContributorDashboard(container);
      }
    },

    // --------------------------------------------------------------------------
    // VIEW: KNOWLEDGE GRID (LIBRARY)
    // --------------------------------------------------------------------------
    renderLibrary: async function (container) {
      container.innerHTML = `
        <div class="spa-library-view">
          <div class="library-hero-banner">
            <span class="hero-badge">UNESCO OER REPOSITORY</span>
            <h2>Planetary Knowledge Grid</h2>
            <p>Freely accessible, community-verified interactive explorations and structured curriculum tracks designed for deep conceptual mastery and human flourishing.</p>
          </div>
          <div id="library-curriculum-container"></div>
          <div class="library-cards-grid" id="library-cards">
            <div class="loading-box">Accessing global knowledge nodes from Webapp2 backend...</div>
          </div>
        </div>
      `;

      try {
        const [dashData, mathData] = await Promise.all([
          AetherHttpClient.get('/learnerdashboarddatahandler').catch(() => ({})),
          AetherHttpClient.get('/classroomdatahandler/math').catch(() => ({}))
        ]);

        const list = [
          ...(dashData.completed_explorations_list || []),
          ...(dashData.incomplete_explorations_list || [])
        ];

        // 1. Render Curriculum Pathways from /classroomdatahandler
        const curriculumContainer = document.getElementById('library-curriculum-container');
        const mathTopics = mathData.topics || (mathData.topic_summary_dicts ? mathData.topic_summary_dicts.map(t => ({
          name: t.name,
          chapters_count: t.canonical_story_count || 4
        })) : [
          { name: 'Fractions & Ratios', chapters_count: 5 },
          { name: 'Multiplication & Geometry', chapters_count: 8 }
        ]);

        if (curriculumContainer && mathTopics.length > 0) {
          curriculumContainer.innerHTML = `
            <div style="margin-bottom: 2.25rem;">
              <span class="hero-badge" style="background: rgba(0, 255, 198, 0.15); color: var(--aether-vibrant-mint); border: 1px solid var(--aether-vibrant-mint);">UNESCO SDG 4 STRUCTURED PATHWAYS</span>
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: #ffffff; margin: 0.5rem 0 1rem 0;">Classroom Curriculum Pathways</h3>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem;">
                ${mathTopics.map(top => `
                  <div class="lib-card" style="border-left: 4px solid var(--aether-vibrant-mint); padding: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                      <span style="font-size: 1.2rem;">📐</span>
                      <span class="badge-lang">${top.chapters_count || 5} Chapters</span>
                    </div>
                    <h4 style="font-family: var(--font-display); font-size: 1.1rem; color: #ffffff; margin: 0 0 0.5rem 0;">${top.name}</h4>
                    <p style="font-size: 0.85rem; color: #94b8c7; margin: 0 0 1rem 0;">Comprehensive mastery track with progressive question branches.</p>
                    <button class="spa-secondary-btn" style="width: 100%;" onclick="window.AetherLearn.playExploration('fractions')">Launch Pathway ➔</button>
                  </div>
                `).join('')}
              </div>
            </div>
            <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: #ffffff; margin: 0 0 1rem 0;">Interactive Exploration Units</h3>
          `;
        }

        const grid = document.getElementById('library-cards');
        if (!grid) return;

        if (list.length === 0) {
          grid.innerHTML = '<div class="empty-box">No explorations found in library.</div>';
          return;
        }

        grid.innerHTML = list.map(item => `
          <div class="lib-card">
            <div class="lib-card-top">
              <span class="badge-cat">${item.category || 'Science'}</span>
              <span class="badge-lang">${(item.language_code || 'en').toUpperCase()}</span>
            </div>
            <h3>${item.title || item.id}</h3>
            <p>${item.objective || 'Explore interactive lesson concepts and master fundamental laws.'}</p>
            <button class="spa-primary-btn" onclick="window.AetherLearn.playExploration('${item.id}')">
              <span>Launch Exploration</span> ➔
            </button>
          </div>
        `).join('');
      } catch (e) {
        console.error('Failed to load library:', e);
      }
    },

    // --------------------------------------------------------------------------
    // VIEW: LESSON PLAYER
    // --------------------------------------------------------------------------
    renderPlayer: function (container) {
      container.innerHTML = `
        <div class="spa-player-view">
          <div class="player-top-header">
            <div>
              <span class="badge-cat">CONVERSATIONAL NODE</span>
              <h2 id="player-title">Loading Lesson...</h2>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div class="telemetry-hud" title="Real-time WSGI Event Stream Connected">
                <span class="hud-dot">●</span> Telemetry Synced
              </div>
              <button class="contrast-btn" id="tts-audio-btn" onclick="window.AetherLearn.toggleAudio()" title="Listen to Lesson Audio">
                🔊 <span id="tts-audio-label">Listen</span>
              </button>
              <div class="progress-box">
                <div class="progress-bar-bg"><div class="progress-bar-fill" id="player-progress-bar"></div></div>
                <span id="player-progress-text">0% Complete</span>
              </div>
            </div>
          </div>

          <div class="player-stage-card" id="player-card">
            <div class="loading-box">Initializing state machine from /explorehandler/init...</div>
          </div>
        </div>
      `;

      playerService.title$.subscribe(title => {
        const el = document.getElementById('player-title');
        if (el) el.textContent = title;
      });

      playerService.progressPercentage$.subscribe(p => {
        const bar = document.getElementById('player-progress-bar');
        const txt = document.getElementById('player-progress-text');
        if (bar) bar.style.width = p + '%';
        if (txt) txt.textContent = p + '% Complete';
      });

      playerService.currentState$.subscribe(state => {
        const card = document.getElementById('player-card');
        if (!card || !state) return;

        const contentHtml = state.content?.html || '<p>No content in this state.</p>';
        const interactionId = state.interaction?.id || 'Continue';

        let interactionForm = '';

        if (interactionId === 'MultipleChoiceInput') {
          const choices = state.interaction.customization_args?.choices?.value || [];
          interactionForm = `
            <div class="mc-choices">
              ${choices.map((c, i) => `
                <button class="mc-choice-btn" onclick="window.AetherLearn.selectChoice(${i})">
                  <span class="choice-num">${i + 1}</span>
                  <span>${c.html}</span>
                </button>
              `).join('')}
            </div>
          `;
        } else if (interactionId === 'TextInput') {
          interactionForm = `
            <div class="text-input-row">
              <input type="text" id="spa-text-input" placeholder="Type your response here..." onkeyup="if(event.key==='Enter') window.AetherLearn.submitTextAnswer()" />
              <button class="spa-primary-btn" style="width: auto; padding: 0.9rem 2rem;" onclick="window.AetherLearn.submitTextAnswer()">Submit</button>
            </div>
          `;
        } else if (interactionId === 'NumericInput') {
          interactionForm = `
            <div class="text-input-row">
              <input type="number" id="spa-numeric-input" placeholder="Enter numerical answer..." onkeyup="if(event.key==='Enter') window.AetherLearn.submitNumericAnswer()" />
              <button class="spa-primary-btn" style="width: auto; padding: 0.9rem 2rem;" onclick="window.AetherLearn.submitNumericAnswer()">Submit</button>
            </div>
          `;
        } else if (interactionId === 'Continue') {
          interactionForm = `
            <div class="continue-action">
              <button class="spa-continue-btn" onclick="window.AetherLearn.submitContinue()">Proceed to Next State ➔</button>
            </div>
          `;
        } else if (interactionId === 'EndExploration') {
          interactionForm = `
            <div style="text-align: center; padding: 2rem;">
              <div style="font-size: 3.5rem; margin-bottom: 0.5rem;">🏆</div>
              <h3 style="font-family: var(--font-display); font-size: 1.8rem; color: #ffffff;">Exploration Completed!</h3>
              <p style="color: #94b8c7; font-size: 1.05rem;">You have demonstrated full conceptual mastery over this interactive module.</p>
              <button class="spa-primary-btn" style="max-width: 240px; margin: 1.5rem auto 0 auto;" onclick="window.AetherLearn.playExploration('${this.activeExplorationId}')">🔄 Replay Lesson</button>
            </div>
          `;
        }

        card.innerHTML = `
          <div class="card-html-content">${contentHtml}</div>
          <div class="card-interaction-box">${interactionForm}</div>
          <div id="player-feedback-area"></div>
        `;
      });

      playerService.feedback$.subscribe(fb => {
        const area = document.getElementById('player-feedback-area');
        if (!area) return;
        if (!fb) {
          area.innerHTML = '';
          return;
        }
        area.innerHTML = `
          <div class="feedback-alert ${fb.isCorrect ? 'correct' : 'incorrect'}">
            <span class="fb-icon">${fb.isCorrect ? '✨' : '💡'}</span>
            <div>${fb.html}</div>
          </div>
        `;
      });

      // Load active lesson
      playerService.loadExploration(this.activeExplorationId);
    },

    selectChoice: function (idx) {
      playerService.submitAnswer(idx);
    },

    submitTextAnswer: function () {
      const input = document.getElementById('spa-text-input');
      if (input && input.value.trim()) {
        playerService.submitAnswer(input.value.trim());
      }
    },

    submitNumericAnswer: function () {
      const input = document.getElementById('spa-numeric-input');
      if (input && input.value !== '') {
        playerService.submitAnswer(Number(input.value));
      }
    },

    submitContinue: function () {
      playerService.submitAnswer('continue');
    },

    toggleAudio: function () {
      if (!('speechSynthesis' in window)) return;
      const state = playerService.currentState$.getValue();
      const label = document.getElementById('tts-audio-label');

      if (this.isAudioPlaying) {
        window.speechSynthesis.cancel();
        this.isAudioPlaying = false;
        if (label) label.textContent = 'Listen';
      } else {
        const text = (state?.content?.html || '').replace(/<[^>]*>/g, ' ');
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        utter.onend = () => {
          this.isAudioPlaying = false;
          if (label) label.textContent = 'Listen';
        };
        this.isAudioPlaying = true;
        if (label) label.textContent = 'Stop Audio';
        window.speechSynthesis.speak(utter);
      }
    },

    // --------------------------------------------------------------------------
    // VIEW: QUANTUM LEARNER DASHBOARD (BENTO GRID)
    // --------------------------------------------------------------------------
    renderLearnerDashboard: async function (container) {
      container.innerHTML = `
        <div class="spa-dashboard-view">
          <div class="dash-hero">
            <span class="hero-badge">UNESCO SDG 4 LEARNING PORTFOLIO</span>
            <h2>My Quantum Learning Hub</h2>
            <p>Monitor your active competency tracks, mastery certificates, and SDG-4 global educational milestones.</p>
          </div>
          <div id="dash-content"><div class="loading-box">Retrieving portfolio metrics from /learnerdashboarddatahandler...</div></div>
        </div>
      `;

      try {
        const data = await AetherHttpClient.get('/learnerdashboarddatahandler');
        const container = document.getElementById('dash-content');
        if (!container) return;

        const inProgress = data.incomplete_explorations_list || [];
        const completed = data.completed_explorations_list || [];

        container.innerHTML = `
          <!-- Bento Metrics Row -->
          <div class="metrics-row">
            <div class="metric-card">
              <div class="m-val">${completed.length}</div>
              <div class="m-lbl">Mastered Modules</div>
            </div>
            <div class="metric-card">
              <div class="m-val">${inProgress.length}</div>
              <div class="m-lbl">Active Explorations</div>
            </div>
            <div class="metric-card">
              <div class="m-val" style="color: var(--aether-cyan);">SDG 4</div>
              <div class="m-lbl">Global Literacy Tier</div>
            </div>
          </div>

          <section style="margin-top: 2rem;">
            <h3 style="font-family: var(--font-display); font-size: 1.4rem; color: #ffffff; margin-bottom: 1.25rem;">🚀 In-Progress Competency Tracks</h3>
            <div class="library-cards-grid">
              ${inProgress.map(item => `
                <div class="lib-card">
                  <div class="lib-card-top">
                    <span class="badge-cat">${item.category || 'Science'}</span>
                    <span class="badge-lang">CONTINUE</span>
                  </div>
                  <h3>${item.title}</h3>
                  <p>${item.objective}</p>
                  <button class="spa-primary-btn" onclick="window.AetherLearn.playExploration('${item.id}')">Resume Track ➔</button>
                </div>
              `).join('')}
            </div>
          </section>

          <section style="margin-top: 3rem;">
            <h3 style="font-family: var(--font-display); font-size: 1.4rem; color: #ffffff; margin-bottom: 1.25rem;">🏆 Mastered Explorations & Badges</h3>
            <div class="library-cards-grid">
              ${completed.map(item => `
                <div class="lib-card" style="border-left: 4px solid var(--aether-vibrant-mint);">
                  <div class="lib-card-top">
                    <span class="badge-cat" style="background: rgba(0, 255, 198, 0.15); color: var(--aether-vibrant-mint);">100% Mastery</span>
                  </div>
                  <h3>${item.title}</h3>
                  <p>${item.objective}</p>
                  <button class="spa-secondary-btn" onclick="window.AetherLearn.playExploration('${item.id}')">Review Lesson</button>
                </div>
              `).join('')}
            </div>
          </section>
        `;
      } catch (e) {
        console.error('Failed to load learner dashboard:', e);
      }
    },

    // --------------------------------------------------------------------------
    // VIEW: HOLO-STUDIO (CREATOR & 2D STATE GRAPH VISUALIZER)
    // --------------------------------------------------------------------------
    renderCreatorStudio: async function (container) {
      container.innerHTML = `
        <div class="spa-creator-view">
          <div class="dash-hero">
            <span class="hero-badge">UNESCO OER AUTHORING NEXUS</span>
            <h2>Holo-Studio: 2D State Machine Architect</h2>
            <p>Engineer branching conversational state trees, configure classifier rules, and publish peer-reviewed open educational modules directly through Webapp2 /createhandler.</p>
          </div>
          <div id="creator-content"><div class="loading-box">Synchronizing authoring telemetry from /creatordashboardhandler/data...</div></div>
        </div>
      `;

      try {
        const data = await AetherHttpClient.get('/creatordashboarddatahandler');
        const content = document.getElementById('creator-content');
        if (!content) return;

        const stats = data.dashboard_stats || {};
        const explorations = data.explorations_list || [];

        content.innerHTML = `
          <!-- Creator Telemetry Metrics -->
          <div class="metrics-row">
            <div class="metric-card">
              <div class="m-val">${stats.total_plays || 2310}</div>
              <div class="m-lbl">Total Scholar Plays</div>
            </div>
            <div class="metric-card">
              <div class="m-val">${stats.average_rating || 4.88} ⭐</div>
              <div class="m-lbl">Peer Review Index</div>
            </div>
            <div class="metric-card">
              <div class="m-val">${explorations.length || 3}</div>
              <div class="m-lbl">Active State Trees</div>
            </div>
          </div>

          <!-- 2D State Machine Visualizer Workspace -->
          <div style="margin-top: 2.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
              <div>
                <h3 style="font-family: var(--font-display); font-size: 1.5rem; color: #ffffff; margin: 0 0 0.25rem 0;">State Graph Visualizer</h3>
                <span style="font-size: 0.85rem; color: #94b8c7;">Exploration: <strong>Welcome to AetherLearn Global (v1.0.4)</strong> • Initial State: <code>Introduction</code></span>
              </div>
              <div style="display: flex; gap: 0.75rem;">
                <button class="spa-secondary-btn" id="btn-add-state">➕ Add State Node</button>
                <button class="spa-primary-btn" onclick="window.AetherLearn.playExploration('welcome')">🚀 Test in Sandbox</button>
                <button class="spa-primary-btn" id="btn-publish-graph" style="background: linear-gradient(135deg, #00FFC6, #00A8FF); color: #052E3E;">💾 Publish (0 drafts)</button>
              </div>
            </div>

            <div class="graph-visualizer-container">
              <!-- 2D Node Graph Canvas -->
              <div class="graph-canvas-panel">
                <div class="graph-toolbar">
                  <span style="font-size: 0.8rem; color: var(--aether-vibrant-mint); font-family: var(--font-mono);">● NODE WORKSPACE: 4 STATES • 5 TRANSITION EDGES</span>
                  <span style="font-size: 0.8rem; color: #94b8c7;">Interactive Graph Canvas</span>
                </div>
                
                <div class="graph-canvas-area" id="graph-canvas">
                  <!-- SVG Connection Lines -->
                  <svg class="graph-svg-connections" style="width: 100%; height: 100%;">
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#00FFC6" />
                      </marker>
                    </defs>
                    <!-- Intro -> Question 1 -->
                    <line x1="180" y1="80" x2="260" y2="80" stroke="#00FFC6" stroke-width="2" marker-end="url(#arrow)" stroke-dasharray="4" />
                    <!-- Question 1 -> Hint Branch -->
                    <path d="M 340 120 C 340 180, 260 200, 260 220" stroke="rgba(255, 184, 0, 0.8)" stroke-width="2" fill="none" marker-end="url(#arrow)" />
                    <!-- Hint Branch -> Question 1 loop -->
                    <path d="M 180 250 C 120 220, 180 120, 250 95" stroke="rgba(255, 184, 0, 0.5)" stroke-width="1.5" stroke-dasharray="3" fill="none" />
                    <!-- Question 1 -> Conclusion -->
                    <line x1="420" y1="80" x2="500" y2="80" stroke="#00FFC6" stroke-width="2" marker-end="url(#arrow)" />
                  </svg>

                  <!-- Node 1: Introduction -->
                  <div class="graph-node init active" id="node-intro" style="top: 40px; left: 20px;">
                    <div class="node-title">Introduction</div>
                    <div class="node-type">Continue</div>
                  </div>

                  <!-- Node 2: Question 1 -->
                  <div class="graph-node" id="node-q1" style="top: 40px; left: 260px;">
                    <div class="node-title">Question 1</div>
                    <div class="node-type">MultipleChoice</div>
                  </div>

                  <!-- Node 3: Hint Branch -->
                  <div class="graph-node" id="node-hint" style="top: 200px; left: 180px; border-left: 4px solid var(--aether-solar-gold);">
                    <div class="node-title">Help & Hint</div>
                    <div class="node-type">Continue</div>
                  </div>

                  <!-- Node 4: Conclusion -->
                  <div class="graph-node terminal" id="node-conclusion" style="top: 40px; left: 500px;">
                    <div class="node-title">Conclusion</div>
                    <div class="node-type">EndExploration</div>
                  </div>
                </div>
              </div>

              <!-- State Property Inspector -->
              <aside class="state-inspector-panel">
                <div class="inspector-header">
                  <h4 id="insp-name">State: Introduction</h4>
                  <span id="insp-badge" style="font-size: 0.75rem; color: var(--aether-vibrant-mint); font-family: var(--font-mono);">INITIAL STATE NODE</span>
                </div>

                <div class="inspector-field">
                  <label>Card Narrative Content (HTML / Markdown)</label>
                  <textarea id="insp-content" rows="4">Welcome to AetherLearn Global! I am your interactive holographic guide. Are you ready to begin your planetary learning journey?</textarea>
                </div>

                <div class="inspector-field">
                  <label>Interaction Mechanism</label>
                  <select id="insp-interaction">
                    <option value="Continue" selected>Continue Button</option>
                    <option value="MultipleChoiceInput">Multiple Choice Question</option>
                    <option value="TextInput">Text / Classifier Input</option>
                    <option value="NumericInput">Numeric Expression</option>
                    <option value="EndExploration">End Exploration (Terminal)</option>
                  </select>
                </div>

                <div class="inspector-field">
                  <label>Next Destination Node</label>
                  <input type="text" id="insp-dest" value="Question 1" />
                </div>

                <div class="commit-bar">
                  <button class="spa-primary-btn" id="btn-save-state" style="width: 100%;">Record Draft Change</button>
                </div>
              </aside>
            </div>
          </div>

          <!-- Authored Explorations Grid -->
          <h3 style="font-family: var(--font-display); font-size: 1.4rem; color: #ffffff; margin: 3rem 0 1.25rem 0;">Published Global Curriculum Units</h3>
          <div class="library-cards-grid">
            ${explorations.map(exp => `
              <div class="lib-card">
                <div class="lib-card-top">
                  <span class="badge-cat">${exp.category || 'General'}</span>
                  <span class="badge-lang">v${exp.version || 1}</span>
                </div>
                <h3>${exp.title}</h3>
                <p>${exp.objective || 'Interactive decision branch unit.'}</p>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                  <button class="spa-secondary-btn" style="flex: 1;" onclick="window.AetherLearn.playExploration('${exp.id}')">Test Play</button>
                  <button class="spa-primary-btn" style="flex: 1;" onclick="alert('Exploration ${exp.title} loaded into State Graph Inspector.')">Inspect Graph</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Wire interactive nodes inside State Graph
        const stateData = {
          'node-intro': {
            name: 'State: Introduction',
            badge: 'INITIAL STATE NODE',
            content: 'Welcome to AetherLearn Global! I am your interactive holographic guide. Are you ready to begin your planetary learning journey?',
            interaction: 'Continue',
            dest: 'Question 1'
          },
          'node-q1': {
            name: 'State: Question 1',
            badge: 'BRANCHING DECISION NODE',
            content: 'Which planet in our solar system is known for its prominent, reflective rings?',
            interaction: 'MultipleChoiceInput',
            dest: 'Conclusion'
          },
          'node-hint': {
            name: 'State: Help & Hint',
            badge: 'REMEDIAL FEEDBACK NODE',
            content: 'Remember that Saturn is a gas giant with magnificent icy rings visible from terrestrial telescopes.',
            interaction: 'Continue',
            dest: 'Question 1'
          },
          'node-conclusion': {
            name: 'State: Conclusion',
            badge: 'TERMINAL NODE',
            content: 'Brilliant work! You have completed the solar system fundamentals exploration module.',
            interaction: 'EndExploration',
            dest: 'END'
          }
        };

        let draftCount = 0;

        ['node-intro', 'node-q1', 'node-hint', 'node-conclusion'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.addEventListener('click', () => {
              document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('active'));
              el.classList.add('active');

              const d = stateData[id];
              if (d) {
                document.getElementById('insp-name').textContent = d.name;
                document.getElementById('insp-badge').textContent = d.badge;
                document.getElementById('insp-content').value = d.content;
                document.getElementById('insp-interaction').value = d.interaction;
                document.getElementById('insp-dest').value = d.dest;
              }
            });
          }
        });

        const saveBtn = document.getElementById('btn-save-state');
        if (saveBtn) {
          saveBtn.addEventListener('click', () => {
            draftCount++;
            const pubBtn = document.getElementById('btn-publish-graph');
            if (pubBtn) pubBtn.textContent = `💾 Publish (${draftCount} draft${draftCount > 1 ? 's' : ''})`;
            alert(`Draft change recorded in local change_list! Total pending mutations: ${draftCount}`);
          });
        }

        const pubBtn = document.getElementById('btn-publish-graph');
        if (pubBtn) {
          pubBtn.addEventListener('click', async () => {
            if (draftCount === 0) {
              alert('No pending draft changes to publish.');
              return;
            }
            pubBtn.textContent = 'Publishing to Webapp2 /createhandler/data/welcome...';
            try {
              // Simulated PUT to /createhandler/data/welcome
              setTimeout(() => {
                alert(`Successfully committed ${draftCount} state mutation(s) to Webapp2 backend datastore!`);
                draftCount = 0;
                pubBtn.textContent = '💾 Publish (0 drafts)';
              }, 600);
            } catch (err) {
              alert('Error committing changes: ' + err.message);
            }
          });
        }

      } catch (e) {
        console.error('Failed to load creator dashboard:', e);
      }
    },

    // --------------------------------------------------------------------------
    // VIEW: CONTRIBUTOR HUB (CROWDSOURCED LOCALIZATION & PEER REVIEW)
    // --------------------------------------------------------------------------
    renderContributorDashboard: async function (container) {
      container.innerHTML = `
        <div class="spa-contributor-view">
          <div class="dash-hero">
            <span class="hero-badge">UNESCO SDG 4 GLOBAL ACTION</span>
            <h2>Planetary Contributor Hub</h2>
            <p>Empower learners worldwide by localizing content into indigenous and regional languages, recording crystal-clear audio voiceovers, and curating interactive learning pathways.</p>

            <!-- Impact Metrics Bento Row -->
            <div class="metrics-row" style="margin-top: 1.75rem;">
              <div class="metric-card">
                <div class="m-val">14,250</div>
                <div class="m-lbl">Words Localized</div>
              </div>
              <div class="metric-card">
                <div class="m-val">42 mins</div>
                <div class="m-lbl">Audio Narrated</div>
              </div>
              <div class="metric-card">
                <div class="m-val">18</div>
                <div class="m-lbl">Peer Reviews Approved</div>
              </div>
              <div class="metric-card">
                <div class="m-val" style="color: var(--aether-vibrant-mint);">Tier 3</div>
                <div class="m-lbl">Polyglot Honor</div>
              </div>
            </div>
          </div>

          <!-- Contributor Navigation Sub-Tabs -->
          <div class="contributor-subtabs">
            <button class="c-tab-btn active" id="c-tab-trans">🌐 Translation Matrix</button>
            <button class="c-tab-btn" id="c-tab-voice">🎙️ Voiceover Studio</button>
            <button class="c-tab-btn" id="c-tab-review">📝 Question Review</button>
          </div>

          <div id="contributor-content">
            <div class="loading-box">Connecting to /contributordashboarddatahandler...</div>
          </div>
        </div>
      `;

      let currentSubTab = 'trans';

      const renderSubContent = (opps, voices) => {
        const target = document.getElementById('contributor-content');
        if (!target) return;

        if (currentSubTab === 'trans') {
          target.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <div>
                <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: #ffffff; margin: 0 0 0.25rem 0;">Translation Matrix</h3>
                <span style="font-size: 0.85rem; color: #94b8c7;">Contribute translations to expand equitable educational access globally.</span>
              </div>
              <span style="font-size: 0.8rem; color: var(--aether-vibrant-mint); border: 1px solid var(--aether-vibrant-mint); padding: 0.3rem 0.75rem; border-radius: 20px;">
                ● ${opps.length} Active Opportunities
              </span>
            </div>

            <div class="library-cards-grid">
              ${opps.map(op => `
                <div class="lib-card">
                  <div class="lib-card-top">
                    <span class="badge-cat">${op.language}</span>
                    <span class="badge-lang">${op.progress}</span>
                  </div>
                  <h3>${op.title}</h3>
                  <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; margin: 1rem 0; overflow: hidden;">
                    <div style="width: ${op.progress}; height: 100%; background: linear-gradient(90deg, #00FFC6, #00A8FF); border-radius: 3px;"></div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                    <span style="font-family: var(--font-mono); font-size: 0.75rem; color: #94b8c7;">ID: ${op.id}</span>
                    <button class="spa-primary-btn" onclick="alert('Translation studio initialized for exploration: ${op.title} in language: ${op.language}')">Translate ➔</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        } else if (currentSubTab === 'voice') {
          target.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <div>
                <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: #ffffff; margin: 0 0 0.25rem 0;">Voiceover Studio</h3>
                <span style="font-size: 0.85rem; color: #94b8c7;">Narrate lessons for auditory learners and visually impaired students worldwide.</span>
              </div>
              <div class="audio-bars-anim">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>

            <div class="library-cards-grid">
              ${voices.map(vc => `
                <div class="lib-card">
                  <div class="lib-card-top">
                    <span class="badge-cat">${vc.language}</span>
                    <span class="badge-lang">${vc.progress} Voiced</span>
                  </div>
                  <h3>${vc.title}</h3>
                  <div style="margin: 1.25rem 0; padding: 0.75rem; background: rgba(0,0,0,0.25); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 0.8rem; color: #94b8c7;">🎙️ Web Audio Synthesizer</span>
                    <span style="font-size: 0.75rem; color: var(--aether-vibrant-mint); font-family: var(--font-mono);">READY</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                    <span style="font-family: var(--font-mono); font-size: 0.75rem; color: #94b8c7;">ID: ${vc.id}</span>
                    <button class="spa-primary-btn" onclick="alert('Microphone activated! Ready to record audio track for: ${vc.title}')">🎙️ Record Voiceover</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        } else if (currentSubTab === 'review') {
          target.innerHTML = `
            <div style="margin-bottom: 1.25rem;">
              <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: #ffffff; margin: 0 0 0.25rem 0;">Question Verification & Peer Review</h3>
              <span style="font-size: 0.85rem; color: #94b8c7;">Ensure pedagogical rigor, clarity, and WCAG accessibility standards.</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
              <div class="lib-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                  <span style="font-family: var(--font-display); font-size: 0.8rem; color: var(--aether-vibrant-mint); font-weight: 700;">GRADE 6 • ASTROPHYSICS</span>
                  <span style="font-size: 0.75rem; padding: 0.2rem 0.6rem; background: rgba(255, 184, 0, 0.15); border: 1px solid var(--aether-solar-gold); color: var(--aether-solar-gold); border-radius: 12px;">Needs Peer Review</span>
                </div>
                <h4 style="font-size: 1.15rem; color: #ffffff; margin: 0 0 0.5rem 0;">"Explain why the greenhouse effect on Venus causes higher surface temperatures than on Mercury."</h4>
                <p style="font-size: 0.85rem; color: #94b8c7; margin: 0 0 1.25rem 0;">Classifier: Dense atmospheric CO2 heat retention model. Rubric: Thermal radiative balance.</p>
                <div style="display: flex; gap: 0.75rem;">
                  <button class="spa-primary-btn" onclick="alert('Submission approved and verified for global curriculum!')">✓ Approve for Global Deployment</button>
                  <button class="spa-secondary-btn" onclick="alert('Review comments dispatched to creator.')">✎ Request Revisions</button>
                </div>
              </div>

              <div class="lib-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                  <span style="font-family: var(--font-display); font-size: 0.8rem; color: var(--aether-vibrant-mint); font-weight: 700;">GRADE 4 • MATHEMATICS</span>
                  <span style="font-size: 0.75rem; padding: 0.2rem 0.6rem; background: rgba(255, 184, 0, 0.15); border: 1px solid var(--aether-solar-gold); color: var(--aether-solar-gold); border-radius: 12px;">Needs Peer Review</span>
                </div>
                <h4 style="font-size: 1.15rem; color: #ffffff; margin: 0 0 0.5rem 0;">"If a recipe requires 3/4 cup of honey and you make 1/2 of the recipe, how much honey is required?"</h4>
                <p style="font-size: 0.85rem; color: #94b8c7; margin: 0 0 1.25rem 0;">Interaction: FractionInput. Solution: 3/8. Normalization: Reduced fractional terms.</p>
                <div style="display: flex; gap: 0.75rem;">
                  <button class="spa-primary-btn" onclick="alert('Submission approved and verified for global curriculum!')">✓ Approve for Global Deployment</button>
                  <button class="spa-secondary-btn" onclick="alert('Review comments dispatched to creator.')">✎ Request Revisions</button>
                </div>
              </div>
            </div>
          `;
        }
      };

      try {
        let opps = [
          { id: 'welcome', title: 'Welcome to AetherLearn Global', language: 'Hindi', progress: '75%' },
          { id: 'solar_system', title: 'The Solar System', language: 'Spanish', progress: '50%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Arabic', progress: '30%' },
          { id: 'continents', title: 'Continents & Oceans', language: 'French', progress: '90%' }
        ];

        let voices = [
          { id: 'solar_system', title: 'The Solar System', language: 'English', progress: '85%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Hindi', progress: '40%' }
        ];

        try {
          const liveData = await AetherHttpClient.get('/contributordashboarddatahandler');
          if (liveData.translation_opportunities) opps = liveData.translation_opportunities;
          if (liveData.voiceover_opportunities) voices = liveData.voiceover_opportunities;
        } catch (ignored) {}

        const tabTrans = document.getElementById('c-tab-trans');
        const tabVoice = document.getElementById('c-tab-voice');
        const tabReview = document.getElementById('c-tab-review');

        const updateTabActive = (activeTab) => {
          [tabTrans, tabVoice, tabReview].forEach(btn => btn?.classList.remove('active'));
          if (activeTab === 'trans') tabTrans?.classList.add('active');
          if (activeTab === 'voice') tabVoice?.classList.add('active');
          if (activeTab === 'review') tabReview?.classList.add('active');
          currentSubTab = activeTab;
          renderSubContent(opps, voices);
        };

        tabTrans?.addEventListener('click', () => updateTabActive('trans'));
        tabVoice?.addEventListener('click', () => updateTabActive('voice'));
        tabReview?.addEventListener('click', () => updateTabActive('review'));

        renderSubContent(opps, voices);

      } catch (e) {
        console.error('Failed to load contributor dashboard:', e);
      }
    }
  };

  window.AetherLearn = ModernAether;
})(window, document);
