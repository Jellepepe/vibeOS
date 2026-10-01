// VibeOS LLM Client for OpenAI compatible / vLLM
class VibeLLMClient {
  constructor() {
    this.config = VibeConfig.get();
    window.addEventListener('vibeos:config-changed', (e) => {
      this.config = e.detail;
    });
  }

  async checkHealth() {
    const proxyBase = window.location.protocol.startsWith('http') ? '' : 'http://localhost:3000';

    // 1. Try local server proxy
    try {
      const res = await fetch(`${proxyBase}/api/llm/health?endpoint=${encodeURIComponent(this.config.endpoint)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          if (!data.models.includes(this.config.model)) {
            const best = data.models.find(m => m.includes('qwen')) || data.models[0];
            if (best) {
              console.log(`[VibeOS] Auto-selected active vLLM model: ${best}`);
              this.config.model = best;
              VibeConfig.save({ model: best });
            }
          }
        }
        return data;
      }
    } catch (e) {
      console.warn('Proxy health check failed:', e.message);
    }

    // 2. Try direct vLLM endpoint
    try {
      const targetUrl = `${this.config.endpoint.replace(/\/+$/, '')}/v1/models`;
      const res = await fetch(targetUrl);
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map(m => m.id);
        if (models.length > 0 && !models.includes(this.config.model)) {
          const best = models.find(m => m.includes('qwen')) || models[0];
          if (best) {
            console.log(`[VibeOS] Auto-selected active vLLM model: ${best}`);
            this.config.model = best;
            VibeConfig.save({ model: best });
          }
        }
        return { alive: true, models };
      }
    } catch (e) {
      console.warn('Direct health check failed:', e.message);
    }

    return { alive: false };
  }

  cleanLLMOutput(rawText, win = null) {
    if (!rawText) return '';
    let cleaned = rawText.trim();

    // 1. Extract content from codeblock fences if present
    const codeBlockMatch = cleaned.match(/```(?:html|xml)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      cleaned = codeBlockMatch[1].trim();
    } else {
      cleaned = cleaned.replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
    }

    // 2. Parse HTML and preserve any styles/scripts in <head>
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleaned, 'text/html');

      // If there are scripts or styles in <head>, move them into body
      if (doc.head) {
        const headNodes = doc.head.querySelectorAll('style, script');
        headNodes.forEach(node => {
          doc.body.insertBefore(node, doc.body.firstChild);
        });
      }

      // Unwrap any nested .xp-window
      const nestedWindows = doc.querySelectorAll('.xp-window');
      nestedWindows.forEach(nw => {
        const parent = nw.parentNode;
        while (nw.firstChild) {
          parent.insertBefore(nw.firstChild, nw);
        }
        nw.remove();
      });

      // Extract and strip duplicate titlebars (.xp-titlebar)
      const titlebars = doc.querySelectorAll('.xp-titlebar');
      titlebars.forEach(tb => {
        const titleEl = tb.querySelector('.xp-titlebar-title, .xp-titlebar-text, .xp-titlebar-left');
        let titleText = titleEl ? titleEl.textContent.trim() : '';
        if (!titleText) {
          const clone = tb.cloneNode(true);
          clone.querySelectorAll('button, .xp-titlebar-controls, .xp-titlebar-buttons, svg').forEach(el => el.remove());
          titleText = clone.textContent.trim();
        }
        if (titleText && win) {
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

      // Strip duplicate min/max/close controls
      doc.querySelectorAll('.xp-titlebar-controls, .xp-titlebar-buttons, .xp-btn-ctrl.btn-close, .xp-btn-ctrl.btn-min, .xp-btn-ctrl.btn-max').forEach(el => el.remove());

      cleaned = doc.body.innerHTML.trim();
    } catch (e) {
      console.warn('DOM cleanup error:', e);
    }

    // 3. Ensure root app container wrapper
    if (!cleaned.includes('xp-app-container')) {
      cleaned = `<div class="xp-app-container">${cleaned}</div>`;
    }

    return cleaned;
  }

  async callLLM(messages, options = {}) {
    // Auto-normalize model if set to qwen3.8
    let currentModel = this.config.model || 'qwen3.8-27b';
    if (currentModel === 'qwen3.8') {
      currentModel = 'qwen3.8-27b';
      this.config.model = currentModel;
    }

    const payload = {
      endpoint: this.config.endpoint,
      model: currentModel,
      messages: messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      enableFallback: this.config.enableLocalSynthesizerFallback === true
    };

    const startTime = performance.now();
    let response = null;
    let usedMethod = 'proxy';
    let lastError = null;

    // 1. Try server proxy first (works both from http://localhost:3000 and file:// via localhost:3000)
    if (this.config.useServerProxy) {
      const proxyUrl = window.location.protocol.startsWith('http')
        ? '/api/llm/generate'
        : 'http://localhost:3000/api/llm/generate';

      try {
        console.log(`[VibeOS] Sending request to proxy ${proxyUrl}...`);
        response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (proxyErr) {
        console.warn(`[VibeOS] Proxy ${proxyUrl} unreachable:`, proxyErr.message);
        lastError = proxyErr;
      }
    }

    // 2. If proxy failed or disabled, try direct fetch to configured endpoint
    if (!response || !response.ok) {
      usedMethod = 'direct';
      const targetUrl = `${this.config.endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
      try {
        console.log(`[VibeOS] Trying direct fetch to ${targetUrl}...`);
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: currentModel,
            messages: messages,
            temperature: payload.temperature,
            max_tokens: payload.max_tokens
          })
        });
      } catch (directErr) {
        console.warn(`[VibeOS] Direct fetch to ${targetUrl} failed:`, directErr.message);
        lastError = directErr;
      }
    }

    const elapsed = Math.round(performance.now() - startTime);

    if (response && response.ok) {
      try {
        const json = await response.json();
        let textOutput = '';
        let isFallback = json.source === 'vibe-synthesizer-fallback';

        if (json.data && json.data.choices && json.data.choices[0]) {
          textOutput = json.data.choices[0].message?.content || '';
        } else if (json.choices && json.choices[0]) {
          textOutput = json.choices[0].message?.content || '';
        } else {
          textOutput = json.raw || JSON.stringify(json);
        }

        return {
          html: this.cleanLLMOutput(textOutput, options.win),
          raw: textOutput,
          latencyMs: elapsed,
          source: json.source || (isFallback ? 'fallback' : 'vllm'),
          notice: json.notice,
          model: currentModel,
          messages: messages
        };
      } catch (parseErr) {
        lastError = parseErr;
      }
    }

    // If we reached here, both real vLLM calls failed
    const errorMsg = lastError ? lastError.message : (response ? `HTTP ${response.status}: ${response.statusText}` : 'Failed to connect');
    console.error('[VibeOS] LLM call failed:', errorMsg);

    // If user explicitly enabled fallback synthesizer in settings:
    if (this.config.enableLocalSynthesizerFallback) {
      const syntheticHtml = this.synthesizeLocalApp(messages);
      return {
        html: `
          <div style="background:#fff3cd; color:#856404; padding:5px 8px; border-bottom:1px solid #ffeeba; font-size:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>⚠️ vLLM offline (${errorMsg}). Showing local preview.</span>
            <button class="xp-btn" style="font-size:9px; padding:1px 6px;" onclick="PreloadedApps.find(a=>a.id==='app_settings').create(vibeOS.runtime)">Check Settings</button>
          </div>
          ${syntheticHtml}
        `,
        raw: syntheticHtml,
        latencyMs: elapsed,
        source: 'local-synthesizer-fallback',
        notice: `vLLM error: ${errorMsg}. Local synthesizer active.`,
        model: `${currentModel} (Fallback)`,
        messages: messages
      };
    }

    // Otherwise, return an informative Windows XP styled error dialog so the user sees the real cause:
    return {
      html: `
        <div class="xp-app-container">
          <fieldset class="xp-groupbox" style="border-color:#d9534f; background:#fff8f8;">
            <legend style="color:#d9534f; font-weight:bold;">⚠️ vLLM Connection / Inference Error</legend>
            <p style="margin-bottom:8px;">Failed to get completion from vLLM endpoint: <code>${this.config.endpoint}</code></p>
            <table class="xp-listview" style="margin-bottom:10px;">
              <tr><td style="width:120px; font-weight:bold;">Model:</td><td><code>${currentModel}</code></td></tr>
              <tr><td style="font-weight:bold;">Target URL:</td><td><code>${this.config.endpoint}/v1/chat/completions</code></td></tr>
              <tr><td style="font-weight:bold;">Error Details:</td><td style="color:#c00; font-family:var(--xp-mono);">${errorMsg}</td></tr>
              <tr><td style="font-weight:bold;">Hint:</td><td>Ensure <code>node server.js</code> is running on your machine to proxy requests without CORS issues, or verify <code>${this.config.endpoint}</code> is reachable.</td></tr>
            </table>
            <div style="display:flex; justify-content:flex-end; gap:6px;">
              <button class="xp-btn" onclick="location.reload()">Reload Desktop</button>
              <button class="xp-btn xp-btn-default" onclick="PreloadedApps.find(a=>a.id==='app_settings').create(vibeOS.runtime)">Open vLLM Settings</button>
            </div>
          </fieldset>
        </div>
      `,
      raw: errorMsg,
      latencyMs: elapsed,
      source: 'error',
      error: errorMsg,
      messages: messages
    };
  }

  // Local synthesizer fallback for instant testing
  synthesizeLocalApp(messages) {
    const lastMsg = messages[messages.length - 1]?.content || '';
    let promptText = lastMsg;
    try {
      if (typeof lastMsg === 'string' && lastMsg.startsWith('{')) {
        const parsed = JSON.parse(lastMsg);
        promptText = parsed.action || parsed.prompt || lastMsg;
      }
    } catch (e) { }

    const lower = promptText.toLowerCase();
    const isResize = lower.includes('window was resized') || lower.includes('adaptively re-render');

    let title = 'VibeOS Application';
    let appCategory = 'tool';

    if (lower.includes('crypto') || lower.includes('stock') || lower.includes('wall street')) {
      title = 'Crypto & Stock Ticker XP';
      appCategory = 'finance';
    } else if (lower.includes('pizza') || lower.includes('food')) {
      title = 'Pizza Express XP';
      appCategory = 'pizza';
    } else if (lower.includes('rpg') || lower.includes('inventory') || lower.includes('questmaster')) {
      title = 'QuestMaster RPG Inventory';
      appCategory = 'rpg';
    } else if (lower.includes('weather') || lower.includes('doppler')) {
      title = 'Global Weather Doppler';
      appCategory = 'weather';
    } else if (lower.includes('paint') || lower.includes('art')) {
      title = 'Paint Studio XP';
      appCategory = 'paint';
    } else if (lower.includes('synth') || lower.includes('music')) {
      title = 'Retro Synthesizer 2000';
      appCategory = 'synth';
    }

    if (appCategory === 'finance') {
      return `
        <div class="xp-tabs">
          <button class="xp-tab active" data-vibe-action="switch_tab" data-tab="markets">Live Markets</button>
          <button class="xp-tab" data-vibe-action="switch_tab" data-tab="portfolio">My Portfolio</button>
          <button class="xp-tab" data-vibe-action="switch_tab" data-tab="news">AI Newsfeed</button>
        </div>
        <div class="xp-tab-content">
          <fieldset class="xp-groupbox">
            <legend>Crypto Market Tickers (Qwen3.8 Inference)</legend>
            <table class="xp-listview">
              <thead><tr><th>Asset</th><th>Price (USD)</th><th>24h Change</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td><strong>BTC / Bitcoin</strong></td><td>$94,520.10</td><td style="color:#0a7a0a;">+5.2% ▲</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="BTC">Trade</button></td></tr>
                <tr><td><strong>ETH / Ethereum</strong></td><td>$3,480.00</td><td style="color:#0a7a0a;">+3.1% ▲</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="ETH">Trade</button></td></tr>
                <tr><td><strong>SOL / Solana</strong></td><td>$218.40</td><td style="color:#c00;">-0.8% ▼</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="SOL">Trade</button></td></tr>
                <tr><td><strong>VIBE / VibeCoin</strong></td><td>$42.00</td><td style="color:#0a7a0a;">+69.4% ▲</td><td><button class="xp-btn xp-btn-default" data-vibe-action="trade" data-asset="VIBE">Buy More</button></td></tr>
              </tbody>
            </table>
          </fieldset>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <fieldset class="xp-groupbox" style="flex:1;">
              <legend>Order Execution</legend>
              <div style="display:flex; flex-direction:column; gap:6px;">
                <label>Amount (USD): <input type="number" name="trade_amount" value="500" class="xp-input" style="width:110px;"></label>
                <div style="display:flex; gap:6px; margin-top:4px;">
                  <button class="xp-btn xp-btn-default" data-vibe-action="buy_order">Buy Asset</button>
                  <button class="xp-btn" data-vibe-action="sell_order">Sell Asset</button>
                  <button class="xp-btn" data-vibe-action="ai_forecast">Qwen3.8 Forecast</button>
                </div>
              </div>
            </fieldset>
            <fieldset class="xp-groupbox" style="flex:1;">
              <legend>Market Sentiment Meter</legend>
              <div>Greed Index: <strong>78/100 (Extreme Greed)</strong></div>
              <div class="xp-progress" style="margin-top:6px;"><div class="xp-progress-bar" style="width:78%;"></div></div>
            </fieldset>
          </div>
        </div>
        <div class="xp-statusbar">
          <span>Status: Market Live</span>
          <span>Target: ${this.config.endpoint.replace(/^https?:\/\//, '')} (${this.config.model})</span>
        </div>
      `;
    }

    if (appCategory === 'pizza') {
      return `
        <fieldset class="xp-groupbox">
          <legend>Pizza Express XP - Build Your Masterpiece</legend>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; margin-bottom:4px; font-weight:bold;">Crust Selection:</label>
              <label class="xp-radio-label"><input type="radio" name="crust" value="thin" checked> Crispy Thin Crust (XP Standard)</label><br>
              <label class="xp-radio-label"><input type="radio" name="crust" value="stuffed"> Stuffed Cheese Border (+ $2.50)</label><br>
              <label class="xp-radio-label"><input type="radio" name="crust" value="deep"> Chicago Deep Dish</label>
              <label style="display:block; margin:12px 0 4px; font-weight:bold;">Cheese Level:</label>
              <input type="range" class="xp-slider" min="1" max="5" value="4">
            </div>
            <div>
              <label style="display:block; margin-bottom:4px; font-weight:bold;">Premium Toppings:</label>
              <label class="xp-check-label"><input type="checkbox" name="pepperoni" checked> Spicy Pepperoni</label><br>
              <label class="xp-check-label"><input type="checkbox" name="mushrooms" checked> Portobello Mushrooms</label><br>
              <label class="xp-check-label"><input type="checkbox" name="jalapenos"> Pickled Jalapeños</label><br>
              <label class="xp-check-label"><input type="checkbox" name="truffle"> Truffle Glaze</label>
            </div>
          </div>
        </fieldset>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          <span style="font-size:13px; font-weight:bold;">Order Total: $18.50</span>
          <div style="display:flex; gap:6px;">
            <button class="xp-btn" data-vibe-action="randomize_pizza">🎲 Surprise Me (AI Recipe)</button>
            <button class="xp-btn xp-btn-default" data-vibe-action="place_order">🍕 Place Order Now</button>
          </div>
        </div>
        <div class="xp-statusbar" style="margin-top:12px;">
          <span>Oven Status: 450°F Ready</span>
          <span>Estimated Delivery: 22 mins</span>
        </div>
      `;
    }

    if (appCategory === 'rpg') {
      return `
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
          <fieldset class="xp-groupbox">
            <legend>Hero Inventory Bag (Capacity: 8/16)</legend>
            <table class="xp-listview">
              <thead><tr><th>Item</th><th>Type</th><th>Stats</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td>🗡️ Frostmourne Replica</td><td>Weapon</td><td>+45 Atk, +15 Ice</td><td><button class="xp-btn" data-vibe-action="equip" data-item="frostmourne">Equip</button></td></tr>
                <tr><td>🛡️ Aegis of Luna XP</td><td>Shield</td><td>+30 Armor, +10 Glow</td><td><button class="xp-btn" data-vibe-action="equip" data-item="shield">Equip</button></td></tr>
                <tr><td>🧪 Elixir of Vibe</td><td>Potion</td><td>Restore 100 Mana</td><td><button class="xp-btn xp-btn-default" data-vibe-action="consume" data-item="potion">Drink</button></td></tr>
                <tr><td>📜 Scroll of AI Conjuration</td><td>Artifact</td><td>Summon Qwen3.8 Golem</td><td><button class="xp-btn" data-vibe-action="cast_spell">Cast</button></td></tr>
              </tbody>
            </table>
          </fieldset>
          <fieldset class="xp-groupbox">
            <legend>Hero Attributes</legend>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <div>Level: <strong>42 Paladin</strong></div>
              <div>HP: 1,450 / 1,450</div>
              <div class="xp-progress"><div class="xp-progress-bar" style="width:100%; background:#28a745;"></div></div>
              <div>MP: 820 / 900</div>
              <div class="xp-progress"><div class="xp-progress-bar" style="width:85%; background:#0078d7;"></div></div>
              <button class="xp-btn" style="margin-top:10px;" data-vibe-action="loot_chest">🗝️ Open Dungeon Chest</button>
            </div>
          </fieldset>
        </div>
        <div class="xp-statusbar" style="margin-top:8px;">
          <span>Current Zone: Whispering Woods</span>
          <span>Difficulty: Master</span>
        </div>
      `;
    }

    if (appCategory === 'weather') {
      return `
        <fieldset class="xp-groupbox">
          <legend>Live Doppler Satellite Radar</legend>
          <div style="display:flex; justify-content:space-between; align-items:center; background:#001f3f; color:#00ffcc; padding:12px; border:2px inset #fff; font-family:monospace; margin-bottom:10px;">
            <div>
              <div style="font-size:16px; font-weight:bold;">SAN FRANCISCO / BAY AREA</div>
              <div>Conditions: Sunny & Clear (Bliss Skies)</div>
            </div>
            <div style="font-size:28px; font-weight:bold;">72°F</div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
            <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;"><div>Mon</div><strong>74°F</strong><div>☀️</div></div>
            <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;"><div>Tue</div><strong>68°F</strong><div>⛅</div></div>
            <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;"><div>Wed</div><strong>65°F</strong><div>🌧️</div></div>
            <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;"><div>Thu</div><strong>70°F</strong><div>🌤️</div></div>
          </div>
        </fieldset>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input type="text" class="xp-input" placeholder="Enter City (e.g. Tokyo, London, Zurich)..." style="flex:1;">
          <button class="xp-btn xp-btn-default" data-vibe-action="search_weather">Get Forecast</button>
        </div>
        <div class="xp-statusbar" style="margin-top:8px;">
          <span>Station: NOAA Doppler Satellite</span>
          <span>Updated: Just now</span>
        </div>
      `;
    }

    // Default responsive dynamic app
    return `
      <fieldset class="xp-groupbox">
        <legend>${title} - Synthesized Workspace</legend>
        <div style="margin-bottom:10px;">
          <p>Synthesized for prompt: <strong>"${promptText.slice(0, 100).replace(/"/g, '&quot;')}"</strong></p>
          <p style="font-size:10px; color:#555; margin-top:2px;">Target inference: ${this.config.model} on <code>${this.config.endpoint}</code></p>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:10px;">
          <input type="text" name="query" class="xp-input" value="Active process #402" style="flex:1;">
          <button class="xp-btn xp-btn-default" data-vibe-action="execute">Execute</button>
          <button class="xp-btn" data-vibe-action="clear">Clear</button>
        </div>
        <div class="xp-tabs">
          <button class="xp-tab active" data-vibe-action="switch_tab" data-tab="tab1">Active View</button>
          <button class="xp-tab" data-vibe-action="switch_tab" data-tab="tab2">Configuration</button>
          <button class="xp-tab" data-vibe-action="switch_tab" data-tab="tab3">AI Logs</button>
        </div>
        <div class="xp-tab-content">
          <table class="xp-listview">
            <thead><tr><th>Process ID</th><th>Module</th><th>Status</th><th>Operation</th></tr></thead>
            <tbody>
              <tr><td>001</td><td>Inference Pipeline</td><td>Running</td><td><button class="xp-btn" data-vibe-action="restart_mod">Restart</button></td></tr>
              <tr><td>002</td><td>Context Synthesizer</td><td>Ready</td><td><button class="xp-btn" data-vibe-action="flush_mod">Flush</button></td></tr>
              <tr><td>003</td><td>Responsive Renderer</td><td>Adaptive</td><td><button class="xp-btn xp-btn-default" data-vibe-action="sync_mod">Sync</button></td></tr>
            </tbody>
          </table>
        </div>
      </fieldset>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span style="font-size:10px; color:#555;">Ready for next user action.</span>
        <div style="display:flex; gap:6px;">
          <button class="xp-btn" data-vibe-action="refresh">🔄 Refresh</button>
          <button class="xp-btn xp-btn-default" data-vibe-action="ai_enhance">✨ AI Optimize</button>
        </div>
      </div>
      <div class="xp-statusbar" style="margin-top:10px;">
        <span>Status: Online</span>
        <span>App: ${title}</span>
      </div>
    `;
  }

  // 1. Generate brand new app from user prompt
  async generateApp(prompt, dimensions = { width: 550, height: 420 }, win = null) {
    const userPrompt = `Create a fully featured, interactive Windows XP application for: "${prompt}".
Usable viewport size: ${dimensions.width}px wide by ${dimensions.height}px high.

CRITICAL RULES:
- The OS ALREADY renders the window frame, blue titlebar, and min/max/close buttons.
- DO NOT generate the window titlebar (.xp-titlebar), window borders, or minimize/maximize/close buttons.
- ONLY generate the application's internal UI (e.g. if this is a web browser, generate the browser toolbar with address bar and buttons, then the web viewport).
- Structure: Start immediately with <div class="xp-app-container"> styled with width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden;
- Fit cleanly inside this size without outer double scrollbars.
- CLIENT-SIDE JAVASCRIPT: Feel free to include <script> tags for basic interactions, 60fps animations, movement, games, physics, tickers, or sound that don't require server LLM regeneration.
- Client buttons: For client JS buttons use standard onclick="..." or addEventListener (or data-client="true").
- AI buttons: Use data-vibe-action only for actions where the user wants the AI to generate or transform content.`;

    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    return this.callLLM(messages, { win });
  }

  // 2. Perform interactive action state transition
  async transitionState({ currentHtml, action, params = {}, formValues = {}, dimensions, win = null }) {
    const prompt = `User interacted with the application.
Action: "${action}"
Action Parameters: ${JSON.stringify(params)}
Current Form Input Values: ${JSON.stringify(formValues)}
Usable viewport size: ${dimensions.width}px wide by ${dimensions.height}px high.

FAST PARTIAL UPDATE (RECOMMENDED):
If only specific elements need to update (e.g. updating a counter, adding an item to a list/table, updating text, or switching views), return ONLY one or more <vibe-patch> elements instead of the entire page!
Format:
<vibe-patch selector="#target-id-or-class" mode="replace">...updated content...</vibe-patch>
<vibe-patch selector="#table-body" mode="append"><tr>...new row...</tr></vibe-patch>

Supported modes: "replace", "append", "prepend", "text", "style" (with prop="propName").
Client-side scripts: You can include <script> tags inside patches or container to run instant animations, movement, or local logic.
Only return full <div class="xp-app-container"> if a completely new layout or page reset is required.
DO NOT render any window frames or titlebars.`;

    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'assistant', content: currentHtml },
      { role: 'user', content: prompt }
    ];

    return this.callLLM(messages, { win, maxTokens: 800, temperature: 0.3 });
  }

  // 3. Responsive re-render upon window resize finish
  async reRenderOnResize({ currentHtml, formValues = {}, oldSize, newSize, win = null }) {
    const prompt = `Window was resized to: ${newSize.width}px wide by ${newSize.height}px high (previously ${oldSize.width}x${oldSize.height}).
Current Form Input Values: ${JSON.stringify(formValues)}

FAST UPDATE:
If you only need to tweak layout styling, column widths, or visibility, return <vibe-patch selector="..." mode="...">. Otherwise, return the updated HTML inside <div class="xp-app-container">.
Client-side scripts: You can include or update <script> tags for responsive canvas or animation dimensions.
DO NOT render any window frames or titlebars.`;

    const messages = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'assistant', content: currentHtml },
      { role: 'user', content: prompt }
    ];

    return this.callLLM(messages, { win, maxTokens: 800, temperature: 0.3 });
  }
}

window.VibeLLMClient = VibeLLMClient;
