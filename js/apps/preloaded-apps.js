// VibeOS Preloaded System Applications & Definitions

const PreloadedApps = [
  {
    id: 'app_settings',
    title: 'Control Panel & LLM Settings',
    desc: 'Configure LLM endpoint, model, and system parameters',
    iconSvg: XPIcons.settings,
    isPinned: true,
    width: 580,
    height: 480,
    isSystem: true,
    create: (runtime) => {
      const win = runtime.wm.createWindow({
        id: 'app_settings',
        title: 'Control Panel - vLLM Inference Settings',
        iconSvg: XPIcons.settings,
        width: 580,
        height: 490
      });

      function renderSettings() {
        const cfg = VibeConfig.get();
        win.appRoot.innerHTML = `
          <div class="xp-app-container">
            <fieldset class="xp-groupbox">
              <legend>vLLM Server & Model Connection</legend>
              <table style="width:100%; border-spacing:8px; font-size:11px;">
                <tr>
                  <td style="width:140px; font-weight:bold;">vLLM Endpoint URL:</td>
                  <td>
                    <input type="text" id="cfg-endpoint" class="xp-input" value="${cfg.endpoint}" style="width:100%; font-family:monospace;">
                    <div style="font-size:10px; color:#555; margin-top:2px;">Default: <code>${VibeConfig.defaults.endpoint}</code></div>
                  </td>
                </tr>
                <tr>
                  <td style="font-weight:bold;">Model Name:</td>
                  <td>
                    <input type="text" id="cfg-model" class="xp-input" value="${cfg.model}" style="width:100%; font-family:monospace;">
                    <div style="font-size:10px; color:#555; margin-top:2px;">Default: <code>qwen3.8-27b</code> (Recommended for vLLM with vision & native tool calling)</div>
                  </td>
                </tr>
                <tr>
                  <td style="font-weight:bold;">API Key (Optional):</td>
                  <td>
                    <input type="password" id="cfg-apikey" class="xp-input" value="${cfg.apiKey || ''}" placeholder="Leave empty for local vllm" style="width:100%;">
                  </td>
                </tr>
                <tr>
                  <td style="font-weight:bold;">Routing Mode:</td>
                  <td>
                    <label class="xp-radio-label">
                      <input type="radio" name="proxy_mode" value="proxy" ${cfg.useServerProxy ? 'checked' : ''}>
                      Server Proxy (Avoids Browser CORS restrictions)
                    </label><br>
                    <label class="xp-radio-label">
                      <input type="radio" name="proxy_mode" value="direct" ${!cfg.useServerProxy ? 'checked' : ''}>
                      Direct Browser Fetch
                    </label>
                  </td>
                </tr>
              </table>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid #d4d0c8;">
                <div id="test-connection-status" style="font-size:11px; font-weight:bold; color:#0055ea;">
                  Status: Ready to test
                </div>
                <button id="btn-test-conn" class="xp-btn">
                  <span>⚡</span> Test vLLM Connection
                </button>
              </div>
            </fieldset>

            <fieldset class="xp-groupbox">
              <legend>Adaptive UI & Responsive Inference Options</legend>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <label class="xp-check-label">
                  <input type="checkbox" id="cfg-autoresize" ${cfg.autoRenderOnResize ? 'checked' : ''}>
                  <strong>Auto Re-render on Window Resize:</strong> When window resize finishes, trigger Qwen3.8 to adapt UI.
                </label>
                <label class="xp-check-label">
                  <input type="checkbox" id="cfg-fallback" ${cfg.enableLocalSynthesizerFallback ? 'checked' : ''}>
                  <strong>Enable Local Synthesizer Fallback:</strong> If LLM endpoint is unreachable, use built-in XP synthesizer so UI demo never freezes.
                </label>

                <div style="display:flex; gap:20px; margin-top:6px;">
                  <div style="flex:1;">
                    <label style="display:block; margin-bottom:4px;">Temperature: <span id="temp-val">${cfg.temperature}</span></label>
                    <input type="range" id="cfg-temp" class="xp-slider" min="0" max="1.5" step="0.05" value="${cfg.temperature}">
                  </div>
                  <div style="flex:1;">
                    <label style="display:block; margin-bottom:4px;">Max Tokens:</label>
                    <input type="number" id="cfg-tokens" class="xp-input" value="${cfg.maxTokens}" style="width:100px;">
                  </div>
                </div>
              </div>
            </fieldset>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
              <button id="btn-save-settings" class="xp-btn xp-btn-default" style="padding:4px 16px;">
                Save Settings
              </button>
              <button id="btn-reset-settings" class="xp-btn">
                Restore Defaults
              </button>
            </div>

            <div class="xp-statusbar" style="margin-top:auto;">
              <span>VibeOS Kernel 1.0</span>
              <span>Target: ${cfg.endpoint.replace(/^https?:\/\//, '')} (${cfg.model})</span>
            </div>
          </div>
        `;

        // Event listeners
        const tempSlider = win.appRoot.querySelector('#cfg-temp');
        const tempVal = win.appRoot.querySelector('#temp-val');
        tempSlider.addEventListener('input', () => {
          tempVal.textContent = tempSlider.value;
        });

        win.appRoot.querySelector('#btn-test-conn').addEventListener('click', async () => {
          const statusEl = win.appRoot.querySelector('#test-connection-status');
          statusEl.textContent = 'Testing connection to endpoint...';
          statusEl.style.color = '#333';

          const endpoint = win.appRoot.querySelector('#cfg-endpoint').value.trim();
          const proxyBase = window.location.protocol.startsWith('http') ? '' : 'http://localhost:3000';
          try {
            const res = await fetch(`${proxyBase}/api/llm/health?endpoint=${encodeURIComponent(endpoint)}`);
            const data = await res.json();
            if (data.alive) {
              const modelList = data.models && data.models.length > 0 ? ` [${data.models.join(', ')}]` : '';
              statusEl.textContent = `✓ Connected to vLLM!${modelList}`;
              statusEl.style.color = '#0a7a0a';
              if (data.models && data.models.length > 0) {
                const modelInput = win.appRoot.querySelector('#cfg-model');
                if (!data.models.includes(modelInput.value)) {
                  const best = data.models.find(m => m.includes('qwen')) || data.models[0];
                  modelInput.value = best;
                }
              }
            } else {
              statusEl.textContent = `Offline or unreachable (${data.error || 'Check host endpoint'}).`;
              statusEl.style.color = '#c00';
            }
          } catch (e) {
            statusEl.textContent = `Connection error: ${e.message}`;
            statusEl.style.color = '#c00';
          }
        });

        win.appRoot.querySelector('#btn-save-settings').addEventListener('click', () => {
          const endpoint = win.appRoot.querySelector('#cfg-endpoint').value.trim();
          const model = win.appRoot.querySelector('#cfg-model').value.trim();
          const apiKey = win.appRoot.querySelector('#cfg-apikey').value.trim();
          const useProxy = win.appRoot.querySelector('input[name="proxy_mode"]:checked').value === 'proxy';
          const autoResize = win.appRoot.querySelector('#cfg-autoresize').checked;
          const fallback = win.appRoot.querySelector('#cfg-fallback').checked;
          const temperature = parseFloat(win.appRoot.querySelector('#cfg-temp').value);
          const maxTokens = parseInt(win.appRoot.querySelector('#cfg-tokens').value);

          VibeConfig.save({
            endpoint,
            model,
            apiKey,
            useServerProxy: useProxy,
            autoRenderOnResize: autoResize,
            enableLocalSynthesizerFallback: fallback,
            temperature,
            maxTokens
          });

          alert('VibeOS Settings saved successfully!');
        });

        win.appRoot.querySelector('#btn-reset-settings').addEventListener('click', () => {
          localStorage.removeItem(VibeConfig.STORAGE_KEY);
          renderSettings();
        });
      }

      renderSettings();
      return win;
    }
  },

  {
    id: 'app_studio',
    title: 'Vibe App Studio',
    desc: 'Prompt & synthesize custom applications in real-time',
    iconSvg: XPIcons.promptStudio,
    isPinned: true,
    width: 620,
    height: 480,
    isSystem: true,
    create: (runtime) => {
      const win = runtime.wm.createWindow({
        id: 'app_studio',
        title: 'Vibe App Studio - Prompt to UI Generator',
        iconSvg: XPIcons.promptStudio,
        width: 620,
        height: 480
      });

      win.appRoot.innerHTML = `
        <div class="xp-app-container">
          <fieldset class="xp-groupbox">
            <legend>Describe Any App to Generate with Qwen3.8</legend>
            <textarea id="studio-prompt-input" class="xp-textarea" style="width:100%; height:75px;" placeholder="e.g. A retro 90s Stock & Crypto trading terminal with live order book, price chart simulation, and buy/sell buttons..."></textarea>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
              <span style="font-size:10px; color:#555;">vLLM Model: <strong>qwen3.8</strong> | Style: Windows XP Luna</span>
              <button id="studio-btn-generate" class="xp-btn xp-btn-default" style="font-size:12px; padding:4px 16px;">
                ✨ Synthesize & Launch App
              </button>
            </div>
          </fieldset>

          <fieldset class="xp-groupbox">
            <legend>Instant Inspiration & Sample Apps</legend>
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
              <div class="xp-btn studio-quick-app" data-prompt="A retro 1990s Wall Street Stock and Crypto Ticker with order book, market sentiment meter, and buy/sell buttons" style="text-align:left; padding:6px; height:auto; justify-content:flex-start;">
                📈 <div><strong>Wall Street Ticker XP</strong><div style="font-size:10px; color:#555;">Financial charts & live simulation</div></div>
              </div>
              <div class="xp-btn studio-quick-app" data-prompt="Pizza Express XP: A custom pizza ordering terminal with crust selector, topping checkboxes, cheese slider, and order total calculation" style="text-align:left; padding:6px; height:auto; justify-content:flex-start;">
                🍕 <div><strong>Pizza Express Terminal</strong><div style="font-size:10px; color:#555;">Custom crusts, toppings & pricing</div></div>
              </div>
              <div class="xp-btn studio-quick-app" data-prompt="QuestMaster RPG Inventory: A fantasy RPG backpack with item grid, equip/drink buttons, player HP/MP bars, and dungeon chest opening" style="text-align:left; padding:6px; height:auto; justify-content:flex-start;">
                🗡️ <div><strong>QuestMaster RPG Inventory</strong><div style="font-size:10px; color:#555;">Item management & stat bars</div></div>
              </div>
              <div class="xp-btn studio-quick-app" data-prompt="Global Doppler Weather Radar: Live city weather reports, 4-day forecast cards, radar maps, and temperature scale" style="text-align:left; padding:6px; height:auto; justify-content:flex-start;">
                ⛅ <div><strong>Global Weather Doppler</strong><div style="font-size:10px; color:#555;">Live satellite & city forecasts</div></div>
              </div>
            </div>
          </fieldset>

          <div class="xp-statusbar" style="margin-top:auto;">
            <span>Ready for prompt input</span>
            <span>Target: ${VibeConfig.get().endpoint.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      `;

      const promptInput = win.appRoot.querySelector('#studio-prompt-input');
      const genBtn = win.appRoot.querySelector('#studio-btn-generate');

      const doLaunch = (prompt) => {
        if (!prompt) return;
        runtime.launchNewApp({
          title: prompt.slice(0, 24),
          prompt: prompt,
          iconSvg: XPIcons.promptStudio
        });
      };

      genBtn.addEventListener('click', () => {
        doLaunch(promptInput.value.trim());
      });

      win.appRoot.querySelectorAll('.studio-quick-app').forEach(btn => {
        btn.addEventListener('click', () => {
          const prompt = btn.dataset.prompt;
          promptInput.value = prompt;
          doLaunch(prompt);
        });
      });

      return win;
    }
  },

  {
    id: 'app_notepad',
    title: 'Notepad AI',
    desc: 'Classic Windows XP text editor with Qwen3.8 intelligence',
    iconSvg: XPIcons.notepad,
    isPinned: true,
    width: 540,
    height: 400,
    create: (runtime) => {
      const initialHtml = `
        <div class="xp-app-container" style="gap:4px;">
          <div style="display:flex; gap:4px; padding:2px 0;">
            <button class="xp-btn" data-vibe-action="ai_summarize">⚡ Summarize</button>
            <button class="xp-btn" data-vibe-action="ai_improve">✨ Polish Writing</button>
            <button class="xp-btn" data-vibe-action="ai_poem">📜 Turn into XP Poem</button>
            <button class="xp-btn" data-vibe-action="ai_code_snippet">💻 Convert to Code</button>
          </div>
          <textarea name="notepad_content" class="xp-textarea" style="flex:1; width:100%; min-height:260px; font-family:var(--xp-mono); font-size:12px; line-height:1.4; padding:8px;">Welcome to VibeOS!

This operating system generates dynamic, interactive Windows XP applications in real-time using LLM inference connected to ${VibeConfig.get().model} on ${VibeConfig.get().endpoint.replace(/^https?:\/\//, '')}.

Try clicking the buttons above, or open the Start Menu / Spotlight (Win+Space) to synthesize any application you desire!</textarea>
          <div class="xp-statusbar">
            <span>Encoding: ANSI</span>
            <span>Lines: 8, Col: 1</span>
          </div>
        </div>
      `;
      const win = runtime.wm.createWindow({
        id: 'app_notepad',
        title: 'Untitled - Notepad AI',
        iconSvg: XPIcons.notepad,
        width: 540,
        height: 400
      });
      runtime.renderAppHtml(win, initialHtml, 'Notepad Initialized');
      return win;
    }
  },

  {
    id: 'app_paint',
    title: 'Paint XP',
    desc: 'Drawing canvas with AI style filters and generation',
    iconSvg: XPIcons.paint,
    isPinned: true,
    width: 600,
    height: 450,
    create: (runtime) => {
      const win = runtime.wm.createWindow({
        id: 'app_paint',
        title: 'untitled - Paint XP',
        iconSvg: XPIcons.paint,
        width: 600,
        height: 450
      });

      win.appRoot.innerHTML = `
        <div class="xp-app-container" style="gap:4px; height:100%;">
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="display:flex; gap:2px;">
              <button class="xp-btn color-pick active" data-color="#000000" style="width:20px; min-height:20px; background:#000;"></button>
              <button class="xp-btn color-pick" data-color="#ff0000" style="width:20px; min-height:20px; background:#ff0000;"></button>
              <button class="xp-btn color-pick" data-color="#00aa00" style="width:20px; min-height:20px; background:#00aa00;"></button>
              <button class="xp-btn color-pick" data-color="#0055ea" style="width:20px; min-height:20px; background:#0055ea;"></button>
              <button class="xp-btn color-pick" data-color="#ffbb00" style="width:20px; min-height:20px; background:#ffbb00;"></button>
            </div>
            <div class="xp-tb-divider"></div>
            <label style="font-size:10px;">Brush: <input type="range" id="brush-size" class="xp-slider" min="1" max="24" value="4" style="width:70px;"></label>
            <div class="xp-tb-divider"></div>
            <button id="paint-clear" class="xp-btn">Clear</button>
            <button class="xp-btn xp-btn-default" data-vibe-action="ai_critique">🎨 Qwen3.8 Art Critic</button>
          </div>
          <div style="flex:1; border:2px inset #fff; background:#ffffff; overflow:hidden; position:relative;">
            <canvas id="paint-canvas" width="800" height="600" style="background:#fff; cursor:crosshair; width:100%; height:100%;"></canvas>
          </div>
          <div class="xp-statusbar">
            <span>Canvas: 800 x 600</span>
            <span>Tool: Brush</span>
          </div>
        </div>
      `;

      // Setup drawing canvas
      const canvas = win.appRoot.querySelector('#paint-canvas');
      const ctx = canvas.getContext('2d');
      let isDrawing = false;
      let strokeColor = '#000000';
      let strokeWidth = 4;

      const brushSlider = win.appRoot.querySelector('#brush-size');
      brushSlider.addEventListener('input', () => { strokeWidth = brushSlider.value; });

      win.appRoot.querySelectorAll('.color-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          win.appRoot.querySelectorAll('.color-pick').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          strokeColor = btn.dataset.color;
        });
      });

      win.appRoot.querySelector('#paint-clear').addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) * (canvas.width / rect.width),
          y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
      };

      canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      });

      canvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      });

      canvas.addEventListener('mouseup', () => { isDrawing = false; });
      canvas.addEventListener('mouseleave', () => { isDrawing = false; });

      runtime.bindInteractiveHandlers(win);
      return win;
    }
  },

  {
    id: 'app_synth',
    title: 'VibeSynth 2000',
    desc: 'Interactive 8-bit audio synth with web audio API',
    iconSvg: XPIcons.synth,
    isPinned: true,
    width: 520,
    height: 380,
    create: (runtime) => {
      const win = runtime.wm.createWindow({
        id: 'app_synth',
        title: 'VibeSynth 2000 XP Professional',
        iconSvg: XPIcons.synth,
        width: 520,
        height: 380
      });

      win.appRoot.innerHTML = `
        <div class="xp-app-container">
          <fieldset class="xp-groupbox">
            <legend>Audio Oscillator & Synthesizer</legend>
            <div style="display:flex; justify-content:space-around; align-items:center; background:#1e272e; padding:12px; border-radius:4px; margin-bottom:10px;">
              <div style="text-align:center; color:#00d2d3;">
                <div style="font-size:10px;">WAVEFORM</div>
                <select id="synth-wave" class="xp-select" style="margin-top:4px;">
                  <option value="sine">Sine Wave</option>
                  <option value="square" selected>Square (8-Bit XP)</option>
                  <option value="sawtooth">Sawtooth</option>
                  <option value="triangle">Triangle</option>
                </select>
              </div>
              <div style="text-align:center; color:#ff9ff3;">
                <div style="font-size:10px;">OCTAVE</div>
                <div style="display:flex; gap:4px; margin-top:4px; justify-content:center;">
                  <button class="xp-btn" id="oct-down">-</button>
                  <span id="oct-val" style="font-weight:bold; padding:2px 6px;">4</span>
                  <button class="xp-btn" id="oct-up">+</button>
                </div>
              </div>
            </div>

            <!-- Piano Keyboard -->
            <div style="display:flex; justify-content:center; padding:10px 0; background:#d4d0c8; border:1px solid #707070;">
              <div style="display:flex; position:relative;" id="synth-keys">
                <button class="xp-btn synth-key" data-note="C" style="width:36px; height:120px; background:#fff; font-weight:bold;">C</button>
                <button class="xp-btn synth-key" data-note="D" style="width:36px; height:120px; background:#fff; font-weight:bold;">D</button>
                <button class="xp-btn synth-key" data-note="E" style="width:36px; height:120px; background:#fff; font-weight:bold;">E</button>
                <button class="xp-btn synth-key" data-note="F" style="width:36px; height:120px; background:#fff; font-weight:bold;">F</button>
                <button class="xp-btn synth-key" data-note="G" style="width:36px; height:120px; background:#fff; font-weight:bold;">G</button>
                <button class="xp-btn synth-key" data-note="A" style="width:36px; height:120px; background:#fff; font-weight:bold;">A</button>
                <button class="xp-btn synth-key" data-note="B" style="width:36px; height:120px; background:#fff; font-weight:bold;">B</button>
                <button class="xp-btn synth-key" data-note="C2" style="width:36px; height:120px; background:#fff; font-weight:bold;">C</button>
              </div>
            </div>
          </fieldset>

          <div style="display:flex; justify-content:space-between; align-items:center;">
            <button class="xp-btn" id="btn-play-jingle">▶ Play Windows XP Startup Chime</button>
            <button class="xp-btn xp-btn-default" data-vibe-action="generate_ai_chords">🎶 Qwen3.8 Chord Progression</button>
          </div>

          <div class="xp-statusbar" style="margin-top:auto;">
            <span>Web Audio Engine: Active</span>
            <span>Sample Rate: 44.1 kHz</span>
          </div>
        </div>
      `;

      // Audio engine
      let audioCtx = null;
      let octave = 4;

      function getAudioContext() {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
      }

      const noteFrequencies = {
        'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23,
        'G': 392.00, 'A': 440.00, 'B': 493.88, 'C2': 523.25
      };

      function playTone(freq, duration = 0.3) {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const waveSelect = win.appRoot.querySelector('#synth-wave');
        osc.type = waveSelect ? waveSelect.value : 'square';
        osc.frequency.setValueAtTime(freq * Math.pow(2, octave - 4), ctx.currentTime);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
      }

      win.appRoot.querySelectorAll('.synth-key').forEach(key => {
        key.addEventListener('click', () => {
          const note = key.dataset.note;
          if (noteFrequencies[note]) {
            playTone(noteFrequencies[note]);
          }
        });
      });

      win.appRoot.querySelector('#btn-play-jingle').addEventListener('click', () => {
        // Play iconic notes
        const notes = [
          { f: 311.13, d: 0.25 }, // Eb4
          { f: 466.16, d: 0.25 }, // Bb4
          { f: 415.30, d: 0.25 }, // Ab4
          { f: 311.13, d: 0.35 }, // Eb4
          { f: 466.16, d: 0.5 }  // Bb4
        ];
        let delay = 0;
        notes.forEach(n => {
          setTimeout(() => playTone(n.f, n.d), delay);
          delay += 250;
        });
      });

      runtime.bindInteractiveHandlers(win);
      return win;
    }
  },

  {
    id: 'app_physics',
    title: 'XP Motion & Physics Lab',
    desc: 'Zero-latency 60fps canvas physics & particle animations with client-side JavaScript',
    iconSvg: XPIcons.motion,
    isPinned: true,
    width: 620,
    height: 480,
    create: (runtime) => {
      const win = runtime.wm.createWindow({
        id: 'app_physics',
        title: 'XP Motion & Physics Lab (60 FPS Client JS)',
        iconSvg: XPIcons.motion,
        width: 620,
        height: 480
      });

      const html = `
        <div class="xp-app-container">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:11px;">
              <strong>Client-Side 60fps Particle Physics</strong> — 0ms interaction latency with embedded &lt;script&gt;
            </div>
            <div style="font-size:10px; color:#555;">
              Active Particles: <span id="particle-count" style="font-weight:bold; color:#0055ea;">25</span>
            </div>
          </div>

          <div style="position:relative; flex:1; min-height:220px; background:#0a0e17; border:2px inset #fff; overflow:hidden;">
            <canvas id="physics-canvas" style="width:100%; height:100%; display:block;"></canvas>
            <div id="obstacle-layer" style="position:absolute; inset:0; pointer-events:none;"></div>
          </div>

          <div style="display:flex; gap:10px; margin-top:8px;">
            <fieldset class="xp-groupbox" style="flex:1;">
              <legend>Realtime Physical Constants (Client JS)</legend>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:11px;">
                <div>
                  <label style="display:flex; justify-content:space-between;">
                    <span>Gravity:</span><span id="grav-val">0.35</span>
                  </label>
                  <input type="range" id="slider-gravity" class="xp-slider" min="-0.5" max="1.0" step="0.05" value="0.35">
                </div>
                <div>
                  <label style="display:flex; justify-content:space-between;">
                    <span>Elasticity (Bounce):</span><span id="bounce-val">0.80</span>
                  </label>
                  <input type="range" id="slider-bounce" class="xp-slider" min="0.1" max="1.0" step="0.05" value="0.80">
                </div>
              </div>
            </fieldset>

            <fieldset class="xp-groupbox" style="width:220px;">
              <legend>Simulation Control</legend>
              <div style="display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; gap:4px;">
                  <button class="xp-btn" id="btn-toggle-sim" data-client="true" style="flex:1;">⏸ Pause</button>
                  <button class="xp-btn" id="btn-add-balls" data-client="true" style="flex:1;">+5 Particles</button>
                </div>
                <div style="display:flex; gap:4px;">
                  <button class="xp-btn" id="btn-invert-grav" data-client="true" style="flex:1;">🔄 Invert G</button>
                  <button class="xp-btn" id="btn-clear-sim" data-client="true" style="flex:1;">🧹 Reset</button>
                </div>
              </div>
            </fieldset>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <div style="font-size:10px; color:#555;">Click anywhere on the black canvas to spawn custom particles!</div>
            <button class="xp-btn xp-btn-default" data-vibe-action="ai_add_space_portal">
              ✨ Ask Qwen3.8 to Inject Space Portals
            </button>
          </div>

          <div class="xp-statusbar" style="margin-top:6px;">
            <span id="fps-counter">Engine: 60 FPS</span>
            <span>Renderer: HTML5 Canvas 2D</span>
          </div>

          <script>
            (function() {
              const canvas = document.getElementById('physics-canvas');
              if (!canvas) return;
              const ctx = canvas.getContext('2d');
              const countEl = document.getElementById('particle-count');
              const fpsEl = document.getElementById('fps-counter');

              let gravity = 0.35;
              let bounce = 0.80;
              let isRunning = true;
              let particles = [];
              const colors = ['#00ffcc', '#ff9ff3', '#feca57', '#54a0ff', '#1dd1a1', '#ff6b6b', '#a29bfe'];

              function resizeCanvas() {
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
              }
              resizeCanvas();
              window.addEventListener('resize', resizeCanvas);

              class Particle {
                constructor(x, y, vx, vy, r, color) {
                  this.x = x ?? Math.random() * (canvas.width - 40) + 20;
                  this.y = y ?? Math.random() * (canvas.height / 2) + 10;
                  this.vx = vx ?? (Math.random() - 0.5) * 8;
                  this.vy = vy ?? (Math.random() - 0.5) * 4;
                  this.r = r ?? Math.floor(Math.random() * 8) + 6;
                  this.color = color ?? colors[Math.floor(Math.random() * colors.length)];
                  this.trail = [];
                }

                update() {
                  this.vy += gravity;
                  this.x += this.vx;
                  this.y += this.vy;

                  // Save trail
                  this.trail.push({ x: this.x, y: this.y });
                  if (this.trail.length > 6) this.trail.shift();

                  // Floor bounce
                  if (this.y + this.r > canvas.height) {
                    this.y = canvas.height - this.r;
                    this.vy = -this.vy * bounce;
                    this.vx *= 0.98; // floor friction
                  }
                  // Ceiling bounce
                  if (this.y - this.r < 0) {
                    this.y = this.r;
                    this.vy = -this.vy * bounce;
                  }
                  // Wall bounce
                  if (this.x + this.r > canvas.width) {
                    this.x = canvas.width - this.r;
                    this.vx = -this.vx * bounce;
                  }
                  if (this.x - this.r < 0) {
                    this.x = this.r;
                    this.vx = -this.vx * bounce;
                  }
                }

                draw() {
                  // Draw glow trail
                  for (let i = 0; i < this.trail.length; i++) {
                    const pt = this.trail[i];
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, this.r * (i / this.trail.length) * 0.7, 0, Math.PI * 2);
                    ctx.fillStyle = this.color;
                    ctx.globalAlpha = (i / this.trail.length) * 0.3;
                    ctx.fill();
                  }

                  ctx.globalAlpha = 1.0;
                  ctx.beginPath();
                  ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
                  ctx.fillStyle = this.color;
                  ctx.shadowColor = this.color;
                  ctx.shadowBlur = 8;
                  ctx.fill();
                  ctx.shadowBlur = 0;
                }
              }

              // Spawn initial 25 particles
              for (let i = 0; i < 25; i++) {
                particles.push(new Particle());
              }

              // Click to spawn particle
              canvas.addEventListener('mousedown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                for (let i = 0; i < 5; i++) {
                  particles.push(new Particle(mx, my, (Math.random() - 0.5) * 10, (Math.random() - 1) * 8));
                }
                if (countEl) countEl.textContent = particles.length;
              });

              // Sliders
              const gravSlider = document.getElementById('slider-gravity');
              const gravVal = document.getElementById('grav-val');
              if (gravSlider) {
                gravSlider.addEventListener('input', () => {
                  gravity = parseFloat(gravSlider.value);
                  gravVal.textContent = gravity.toFixed(2);
                });
              }

              const bounceSlider = document.getElementById('slider-bounce');
              const bounceVal = document.getElementById('bounce-val');
              if (bounceSlider) {
                bounceSlider.addEventListener('input', () => {
                  bounce = parseFloat(bounceSlider.value);
                  bounceVal.textContent = bounce.toFixed(2);
                });
              }

              // Buttons
              const toggleBtn = document.getElementById('btn-toggle-sim');
              if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                  isRunning = !isRunning;
                  toggleBtn.textContent = isRunning ? '⏸ Pause' : '▶ Resume';
                });
              }

              const addBtn = document.getElementById('btn-add-balls');
              if (addBtn) {
                addBtn.addEventListener('click', () => {
                  for (let i = 0; i < 5; i++) particles.push(new Particle());
                  if (countEl) countEl.textContent = particles.length;
                });
              }

              const invBtn = document.getElementById('btn-invert-grav');
              if (invBtn) {
                invBtn.addEventListener('click', () => {
                  gravity = -gravity;
                  if (gravSlider) gravSlider.value = gravity;
                  if (gravVal) gravVal.textContent = gravity.toFixed(2);
                });
              }

              const clearBtn = document.getElementById('btn-clear-sim');
              if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                  particles = [];
                  for (let i = 0; i < 10; i++) particles.push(new Particle());
                  if (countEl) countEl.textContent = particles.length;
                });
              }

              let lastTime = performance.now();
              let frames = 0;

              function renderLoop(now) {
                frames++;
                if (now - lastTime >= 1000) {
                  if (fpsEl) fpsEl.textContent = 'Engine: ' + frames + ' FPS (Client JS)';
                  frames = 0;
                  lastTime = now;
                }

                if (isRunning) {
                  ctx.fillStyle = 'rgba(10, 14, 23, 0.35)';
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  particles.forEach(p => {
                    p.update();
                    p.draw();
                  });
                }

                requestAnimationFrame(renderLoop);
              }

              requestAnimationFrame(renderLoop);
            })();
          </script>
        </div>
      `;

      runtime.renderAppHtml(win, html, 'Physics Lab Started');
      return win;
    }
  }
];

window.PreloadedApps = PreloadedApps;
