// VibeOS App Runtime: Handles dynamic HTML injection, state capture, and action event dispatch to LLM
class AppRuntime {
  constructor(windowManager, llmClient) {
    this.wm = windowManager;
    this.llm = llmClient;
  }

  // Extract all user input values currently in the app container
  extractFormValues(containerEl) {
    const values = {};
    const inputs = containerEl.querySelectorAll('input, select, textarea');
    inputs.forEach((input, idx) => {
      const key = input.name || input.id || `field_${idx}`;
      if (input.type === 'checkbox') {
        values[key] = input.checked;
      } else if (input.type === 'radio') {
        if (input.checked) {
          values[input.name || 'radio'] = input.value;
        }
      } else {
        values[key] = input.value;
      }
    });
    return values;
  }

  // Bind interactive handlers to elements in the rendered app HTML
  bindInteractiveHandlers(win) {
    const container = win.appRoot;

    // 1. Buttons & elements with data-vibe-action
    const actionElements = container.querySelectorAll('[data-vibe-action]');
    actionElements.forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        const action = el.getAttribute('data-vibe-action');
        const params = { ...el.dataset };
        delete params.vibeAction; // remove the action key itself

        await this.handleUserAction(win, action, params, el);
      });
    });

    // 2. Fallback for any standard button without data-vibe-action
    const standardButtons = container.querySelectorAll('button:not([data-vibe-action])');
    standardButtons.forEach(btn => {
      // Do not hijack client-side buttons
      if (
        btn.hasAttribute('onclick') ||
        btn.dataset.vibeLocal === 'true' ||
        btn.dataset.client === 'true' ||
        btn.classList.contains('xp-btn-local') ||
        btn.classList.contains('synth-key')
      ) {
        return; // Leave for client-side JS!
      }

      btn.addEventListener('click', async (e) => {
        if (e.defaultPrevented) return;
        const text = btn.innerText.trim();
        const action = `click_${text.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        await this.handleUserAction(win, action, { buttonText: text }, btn);
      });
    });

    // 3. Tab switching (instant visual feedback + action)
    const tabButtons = container.querySelectorAll('.xp-tab');
    tabButtons.forEach(tab => {
      tab.addEventListener('click', () => {
        tabButtons.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // 4. Form submissions
    const forms = container.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formAction = form.getAttribute('data-vibe-form') || form.name || 'form_submit';
        const formValues = this.extractFormValues(form);
        await this.handleUserAction(win, formAction, { formValues }, form);
      });
    });
  }

  getUsableDimensions(win) {
    const content = win.element.querySelector('.xp-window-content');
    const w = content && content.clientWidth > 0 ? content.clientWidth : (win.element.offsetWidth - 6);
    const h = content && content.clientHeight > 0 ? content.clientHeight : (win.element.offsetHeight - 56);
    return { width: Math.max(300, Math.round(w)), height: Math.max(180, Math.round(h)) };
  }

  // Apply fast partial updates targeting specific DOM elements
  applyPatches(win, html) {
    if (!html || !html.includes('<vibe-patch')) return false;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const patches = doc.querySelectorAll('vibe-patch');

      if (patches.length === 0) return false;

      let applied = 0;
      patches.forEach(patch => {
        const selector = patch.getAttribute('selector');
        const mode = patch.getAttribute('mode') || 'replace';
        if (!selector) return;

        const targets = win.appRoot.querySelectorAll(selector);
        if (targets.length === 0) {
          console.warn(`[VibeOS Patch] Selector not found: "${selector}"`);
          return;
        }

        const innerContent = patch.innerHTML;
        const textContent = patch.textContent;

        targets.forEach(target => {
          if (mode === 'replace') {
            target.innerHTML = innerContent;
            applied++;
          } else if (mode === 'append') {
            target.insertAdjacentHTML('beforeend', innerContent);
            applied++;
          } else if (mode === 'prepend') {
            target.insertAdjacentHTML('afterbegin', innerContent);
            applied++;
          } else if (mode === 'text') {
            target.textContent = textContent;
            applied++;
          } else if (mode === 'style') {
            const prop = patch.getAttribute('prop');
            if (prop) {
              target.style[prop] = textContent.trim();
              applied++;
            }
          } else if (mode === 'attr') {
            const attr = patch.getAttribute('attr');
            if (attr) {
              target.setAttribute(attr, textContent.trim());
              applied++;
            }
          }
        });
      });

      if (applied > 0) {
        // Rebind handlers on newly added or updated elements
        this.bindInteractiveHandlers(win);
        // Execute any new scripts in patches
        this.executeAppScripts(win, win.appRoot);
        // Save updated snapshot
        win.currentHtml = win.appRoot.innerHTML;
        win.history.push(win.currentHtml);
        if (win.history.length > 20) win.history.shift();
        return true;
      }
    } catch (e) {
      console.warn('[VibeOS Patch] Error applying patches:', e);
    }

    return false;
  }

  // Handle user interaction by triggering LLM state transition
  async handleUserAction(win, action, params = {}, triggerEl = null) {
    const formValues = this.extractFormValues(win.appRoot);
    const dimensions = this.getUsableDimensions(win);

    this.wm.setWindowLoading(win.id, true, `vLLM: Processing "${action}"...`);

    const result = await this.llm.transitionState({
      currentHtml: win.currentHtml,
      action: action,
      params: params,
      formValues: formValues,
      dimensions: dimensions,
      win: win
    });

    let statusText = 'vLLM: Done';
    if (result.source === 'vllm') {
      statusText = `vLLM (${result.model}): Done (${result.latencyMs}ms)`;
    } else if (result.source === 'local-synthesizer-fallback' || result.source === 'vibe-synthesizer-fallback') {
      statusText = `⚠️ Fallback (${result.latencyMs}ms)`;
    } else {
      statusText = `❌ Error (${result.latencyMs}ms)`;
    }

    this.wm.setWindowLoading(win.id, false, statusText);
    win.statusLatency.textContent = `Latency: ${result.latencyMs}ms`;

    this.wm.updateInspector(win.id, result);

    if (result.html) {
      // Check if partial patches are present
      const patched = this.applyPatches(win, result.raw || result.html);
      if (patched) {
        if (result.source === 'vllm') {
          this.wm.setWindowLoading(win.id, false, `vLLM (${result.model}): Patched (${result.latencyMs}ms)`);
        }
      } else {
        this.renderAppHtml(win, result.html, `Action: ${action}`);
      }
    }
  }

  // Adaptive re-render when window is resized
  async handleWindowResize(win, oldSize, newSize) {
    const formValues = this.extractFormValues(win.appRoot);
    const usableSize = this.getUsableDimensions(win);

    this.wm.setWindowLoading(win.id, true, `vLLM: Adapting to ${usableSize.width}x${usableSize.height}...`);

    const result = await this.llm.reRenderOnResize({
      currentHtml: win.currentHtml,
      formValues: formValues,
      oldSize: oldSize,
      newSize: usableSize,
      win: win
    });

    let statusText = 'vLLM: Done';
    if (result.source === 'vllm') {
      statusText = `vLLM (${result.model}): Done (${result.latencyMs}ms)`;
    } else if (result.source === 'local-synthesizer-fallback' || result.source === 'vibe-synthesizer-fallback') {
      statusText = `⚠️ Fallback (${result.latencyMs}ms)`;
    } else {
      statusText = `❌ Error (${result.latencyMs}ms)`;
    }

    this.wm.setWindowLoading(win.id, false, statusText);
    win.statusLatency.textContent = `Latency: ${result.latencyMs}ms`;

    this.wm.updateInspector(win.id, result);

    if (result.html) {
      const patched = this.applyPatches(win, result.raw || result.html);
      if (patched) {
        if (result.source === 'vllm') {
          this.wm.setWindowLoading(win.id, false, `vLLM (${result.model}): Patched (${result.latencyMs}ms)`);
        }
      } else {
        this.renderAppHtml(win, result.html, `Resized: ${usableSize.width}x${usableSize.height}`);
      }
    }
  }

  // Execute any <script> tags generated by the LLM or app developers
  executeAppScripts(win, container) {
    if (!container) return;
    const scripts = Array.from(container.querySelectorAll('script'));
    if (scripts.length === 0) return;

    // Initialize timers tracker if not present
    win.timers = win.timers || { intervals: new Set(), animationFrames: new Set(), timeouts: new Set() };
    win.activeScripts = win.activeScripts || [];

    // Ensure cleanup function is bound to window
    if (!win.cleanup) {
      win.cleanup = () => {
        if (win.timers) {
          win.timers.intervals.forEach(id => clearInterval(id));
          win.timers.intervals.clear();
          win.timers.animationFrames.forEach(id => cancelAnimationFrame(id));
          win.timers.animationFrames.clear();
          win.timers.timeouts.forEach(id => clearTimeout(id));
          win.timers.timeouts.clear();
        }
        if (win.activeScripts) {
          win.activeScripts.forEach(s => s.remove());
          win.activeScripts = [];
        }
      };
    }

    scripts.forEach((oldScript) => {
      const code = oldScript.textContent;
      if (!code.trim() && !oldScript.src) return;

      const newScript = document.createElement('script');
      newScript.type = oldScript.type || 'text/javascript';
      newScript.dataset.vibeWin = win.id;

      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = `
          (function() {
            window.currentApp = document.querySelector('#${win.id} .xp-app-container') || document.querySelector('.xp-app-container');
            window.currentWin = window.vibeOS ? window.vibeOS.wm.windows.get('${win.id}') : null;
          })();
          ${code}
        `;
      }

      win.activeScripts.push(newScript);
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  // Render HTML into window and attach hooks
  renderAppHtml(win, html, reason = 'Initial Render') {
    win.currentHtml = html;
    win.history.push(html);
    if (win.history.length > 20) win.history.shift(); // Limit history to 20

    // Cleanup previous timers and animations from this window
    if (win.cleanup) {
      try { win.cleanup(); } catch (e) { console.warn('[VibeOS] Window cleanup error:', e); }
    }

    // Inject HTML
    win.appRoot.innerHTML = html;

    // Defense-in-depth: Strip any duplicate .xp-titlebar or window controls that rendered inside appRoot
    const dupTitlebars = win.appRoot.querySelectorAll('.xp-titlebar');
    dupTitlebars.forEach(tb => {
      const titleEl = tb.querySelector('.xp-titlebar-title, .xp-titlebar-text');
      const titleText = titleEl ? titleEl.textContent.trim() : '';
      if (titleText) {
        win.title = titleText;
        const osTitleEl = win.element.querySelector('.xp-titlebar-title');
        if (osTitleEl) {
          osTitleEl.textContent = titleText;
          osTitleEl.title = titleText;
        }
        const tbTitleEl = win.taskbarItem.querySelector('.taskbar-item-title');
        if (tbTitleEl) tbTitleEl.textContent = titleText;
        win.taskbarItem.title = titleText;
      }
      tb.remove();
    });

    win.appRoot.querySelectorAll('.xp-titlebar-controls, .xp-titlebar-buttons, .xp-btn-ctrl.btn-close, .xp-btn-ctrl.btn-min, .xp-btn-ctrl.btn-max').forEach(el => el.remove());

    // Bind event handlers
    this.bindInteractiveHandlers(win);

    // Execute any <script> tags generated by LLM
    this.executeAppScripts(win, win.appRoot);

    // Attach callbacks to win object for WindowManager controls
    win.onWindowResized = (oldSize, newSize) => {
      this.handleWindowResize(win, oldSize, newSize);
    };

    win.onAiRefresh = async () => {
      await this.handleUserAction(win, 're_synthesize_layout', {}, null);
    };

    win.onApplyHtml = (prevHtml, notice) => {
      this.renderAppHtml(win, prevHtml, notice || 'Restored');
      win.statusLlm.textContent = `vLLM: ${notice || 'Restored'}`;
    };
  }

  // Launch a new app from prompt
  async launchNewApp({ title, prompt, iconSvg, width = 600, height = 450 }) {
    const id = `app_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const win = this.wm.createWindow({
      id,
      title: title || prompt.slice(0, 24) || 'Vibe App',
      iconSvg: iconSvg || XPIcons.promptStudio,
      width,
      height
    });

    const dimensions = this.getUsableDimensions(win);

    // Initial placeholder while LLM synthesizes
    win.appRoot.innerHTML = `
      <div class="xp-app-container" style="align-items:center; justify-content:center; height:100%; text-align:center;">
        <div style="margin-bottom:12px;">${iconSvg || XPIcons.promptStudio}</div>
        <div style="font-size:13px; font-weight:bold; margin-bottom:8px;">Synthesizing UI with Qwen3.8...</div>
        <div style="font-size:11px; color:#555; max-width:320px; margin-bottom:14px;">"${prompt}"</div>
        <div class="xp-progress" style="width:240px;"><div class="xp-progress-bar" style="width:100%;"></div></div>
        <div style="font-size:10px; color:#777; margin-top:10px;">Target: <code>${VibeConfig.get().endpoint}</code> (${dimensions.width}×${dimensions.height}px)</div>
      </div>
    `;

    this.wm.setWindowLoading(win.id, true, 'vLLM: Synthesizing App...');

    const result = await this.llm.generateApp(prompt, dimensions, win);

    let statusText = 'vLLM: Ready';
    if (result.source === 'vllm') {
      statusText = `vLLM (${result.model}): Done (${result.latencyMs}ms)`;
    } else if (result.source === 'local-synthesizer-fallback' || result.source === 'vibe-synthesizer-fallback') {
      statusText = `⚠️ Fallback (${result.latencyMs}ms)`;
    } else {
      statusText = `❌ Error (${result.latencyMs}ms)`;
    }

    this.wm.setWindowLoading(win.id, false, statusText);
    win.statusLatency.textContent = `Latency: ${result.latencyMs}ms`;
    this.wm.updateInspector(win.id, result);

    this.renderAppHtml(win, result.html, 'App Initialized');
    return win;
  }
}

window.AppRuntime = AppRuntime;
