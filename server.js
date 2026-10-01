const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Load optional gitignored local configuration
let localConfig = {};
try {
  const localConfigJs = path.join(__dirname, 'config.local.js');
  const localConfigJson = path.join(__dirname, 'config.local.json');
  if (fs.existsSync(localConfigJs)) {
    localConfig = require(localConfigJs);
  } else if (fs.existsSync(localConfigJson)) {
    localConfig = JSON.parse(fs.readFileSync(localConfigJson, 'utf8'));
  }
} catch (e) {
  console.warn('[VibeOS Server] Could not load local config:', e.message);
}

const DEFAULT_ENDPOINT = process.env.VLLM_ENDPOINT || localConfig.endpoint || 'http://localhost:8000';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Fallback dynamic generator when Endpoint is not reachable
function synthesizeLocalAppResponse(messages) {
  const lastMsg = messages[messages.length - 1]?.content || '';
  let promptText = lastMsg;
  try {
    if (typeof lastMsg === 'string' && lastMsg.startsWith('{')) {
      const parsed = JSON.parse(lastMsg);
      promptText = parsed.action || parsed.prompt || lastMsg;
    }
  } catch (e) { }

  const lower = promptText.toLowerCase();

  // Check if this is an action or a resize or a new app
  const isResize = lower.includes('window resized to') || lower.includes('re-render the ui adaptively');
  const isAction = lower.includes('user performed action') || lower.includes('action:') || lower.includes('clicked');

  let title = 'VibeOS Application';
  let appCategory = 'tool';

  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('stock')) {
    title = 'Crypto & Stock Ticker XP';
    appCategory = 'finance';
  } else if (lower.includes('paint') || lower.includes('draw')) {
    title = 'Paint Studio XP';
    appCategory = 'paint';
  } else if (lower.includes('music') || lower.includes('synth') || lower.includes('audio')) {
    title = 'VibeSynth 2000';
    appCategory = 'synth';
  } else if (lower.includes('pizza') || lower.includes('food') || lower.includes('restaurant')) {
    title = 'Pizza Express XP';
    appCategory = 'pizza';
  } else if (lower.includes('rpg') || lower.includes('inventory') || lower.includes('game')) {
    title = 'QuestMaster RPG Inventory';
    appCategory = 'rpg';
  } else if (lower.includes('weather')) {
    title = 'Global Weather Radar';
    appCategory = 'weather';
  } else if (lower.includes('calculator') || lower.includes('calc')) {
    title = 'Vibe Calculator 3000';
    appCategory = 'calculator';
  }

  // Dynamic layout generator based on category
  let bodyContent = '';

  if (appCategory === 'finance') {
    bodyContent = `
      <div class="xp-tabs">
        <button class="xp-tab active" data-vibe-action="switch_tab" data-tab="markets">Live Markets</button>
        <button class="xp-tab" data-vibe-action="switch_tab" data-tab="portfolio">My Portfolio</button>
        <button class="xp-tab" data-vibe-action="switch_tab" data-tab="news">AI Newsfeed</button>
      </div>
      <div class="xp-tab-content">
        <fieldset class="xp-groupbox">
          <legend>Crypto Market Tickers (Live Simulation)</legend>
          <table class="xp-listview">
            <thead>
              <tr><th>Asset</th><th>Price (USD)</th><th>24h Change</th><th>Action</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>BTC / Bitcoin</strong></td><td>$94,230.50</td><td style="color:#0a7a0a;">+4.8% ▲</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="BTC">Trade</button></td></tr>
              <tr><td><strong>ETH / Ethereum</strong></td><td>$3,420.15</td><td style="color:#0a7a0a;">+2.1% ▲</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="ETH">Trade</button></td></tr>
              <tr><td><strong>SOL / Solana</strong></td><td>$215.80</td><td style="color:#c00;">-1.4% ▼</td><td><button class="xp-btn" data-vibe-action="trade" data-asset="SOL">Trade</button></td></tr>
              <tr><td><strong>VIBE / VibeCoin</strong></td><td>$42.00</td><td style="color:#0a7a0a;">+69.4% ▲</td><td><button class="xp-btn xp-btn-default" data-vibe-action="trade" data-asset="VIBE">Buy More</button></td></tr>
            </tbody>
          </table>
        </fieldset>

        <div style="display:flex; gap:10px; margin-top:10px;">
          <fieldset class="xp-groupbox" style="flex:1;">
            <legend>Quick Trade Terminal</legend>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <label>Amount (USD): <input type="number" name="amount" value="500" class="xp-input" style="width:100px;"></label>
              <div style="display:flex; gap:6px;">
                <button class="xp-btn xp-btn-default" data-vibe-action="execute_buy">Instant Buy</button>
                <button class="xp-btn" data-vibe-action="execute_sell">Instant Sell</button>
                <button class="xp-btn" data-vibe-action="ai_forecast">Qwen3.8 Forecast</button>
              </div>
            </div>
          </fieldset>
          <fieldset class="xp-groupbox" style="flex:1;">
            <legend>Market Sentiment</legend>
            <div>Greed Index: <strong>78/100 (Extreme Greed)</strong></div>
            <div class="xp-progress" style="margin-top:6px;"><div class="xp-progress-bar" style="width:78%;"></div></div>
          </fieldset>
        </div>
      </div>
      <div class="xp-statusbar">
        <span>Status: Connected to vLLM Markets</span>
        <span>Latency: 12ms</span>
      </div>
    `;
  } else if (appCategory === 'pizza') {
    bodyContent = `
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
        <span style="font-size:14px; font-weight:bold;">Order Total: $18.50</span>
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
  } else if (appCategory === 'rpg') {
    bodyContent = `
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
  } else if (appCategory === 'weather') {
    bodyContent = `
      <fieldset class="xp-groupbox">
        <legend>Live Doppler Satellite Radar</legend>
        <div style="display:flex; justify-content:space-between; align-items:center; background:#001f3f; color:#00ffcc; padding:12px; border:2px inset #fff; font-family:monospace; margin-bottom:10px;">
          <div>
            <div style="font-size:18px; font-weight:bold;">SAN FRANCISCO / BAY AREA</div>
            <div>Conditions: Sunny & Clear (Bliss Skies)</div>
          </div>
          <div style="font-size:32px; font-weight:bold;">72°F</div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;">
          <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;">
            <div>Mon</div><strong>74°F</strong><div>☀️</div>
          </div>
          <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;">
            <div>Tue</div><strong>68°F</strong><div>⛅</div>
          </div>
          <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;">
            <div>Wed</div><strong>65°F</strong><div>🌧️</div>
          </div>
          <div style="border:1px solid #7f9db9; padding:6px; background:#fff; text-align:center;">
            <div>Thu</div><strong>70°F</strong><div>🌤️</div>
          </div>
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
  } else {
    // General dynamic app generated on demand
    bodyContent = `
      <fieldset class="xp-groupbox">
        <legend>${title} - Interactive Workspace</legend>
        <div style="margin-bottom:10px;">
          <p>Generated by <strong>Qwen3.8</strong> running on <code>${DEFAULT_ENDPOINT.replace(/^https?:\/\//, '')}</code>.</p>
          <p style="color:#444; font-size:11px;">Prompt request: <em>"${promptText.slice(0, 100).replace(/"/g, '&quot;')}"</em></p>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <input type="text" class="xp-input" value="Input command or query..." style="flex:1;">
          <button class="xp-btn xp-btn-default" data-vibe-action="submit_query">Submit</button>
          <button class="xp-btn" data-vibe-action="reset">Reset</button>
        </div>

        <div class="xp-tabs">
          <button class="xp-tab active" data-vibe-action="tab_overview">Overview</button>
          <button class="xp-tab" data-vibe-action="tab_analytics">Metrics</button>
          <button class="xp-tab" data-vibe-action="tab_settings">Config</button>
        </div>
        <div class="xp-tab-content">
          <table class="xp-listview">
            <thead><tr><th>Item ID</th><th>Property</th><th>Status</th><th>Control</th></tr></thead>
            <tbody>
              <tr><td>001</td><td>Inference Engine</td><td>Active (vLLM)</td><td><button class="xp-btn" data-vibe-action="toggle_engine">Toggle</button></td></tr>
              <tr><td>002</td><td>Context Window</td><td>32,768 tokens</td><td><button class="xp-btn" data-vibe-action="clear_cache">Flush</button></td></tr>
              <tr><td>003</td><td>UI Synthesizer</td><td>Responsive XP</td><td><button class="xp-btn" data-vibe-action="restyle">Re-Vibe</button></td></tr>
            </tbody>
          </table>
        </div>
      </fieldset>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span style="font-size:11px; color:#555;">Ready for interactive user actions.</span>
        <div style="display:flex; gap:6px;">
          <button class="xp-btn" data-vibe-action="refresh_state">🔄 Refresh State</button>
          <button class="xp-btn xp-btn-default" data-vibe-action="ai_suggest">⚡ AI Suggestion</button>
        </div>
      </div>

      <div class="xp-statusbar" style="margin-top:10px;">
        <span>Status: Ready</span>
        <span>App: ${title}</span>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body class="xp-app-body">
  <div class="xp-app-container">
    ${bodyContent}
  </div>
</body>
</html>`;
}

// Fetch models list from vLLM
async function fetchVLLMModels(endpointUrl) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(endpointUrl);
      const req = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: '/v1/models',
        method: 'GET',
        timeout: 4000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ data: [] });
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout querying /v1/models'));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Proxy request to vLLM endpoint
async function proxyToVLLM(reqBody, endpointUrl) {
  const parsedUrl = new URL(endpointUrl.endsWith('/') ? endpointUrl.slice(0, -1) : endpointUrl);
  const targetPath = '/v1/chat/completions';

  // Normalize model name if user specified qwen3.8
  if (reqBody.model === 'qwen3.8') {
    reqBody.model = 'qwen3.8-27b';
  }

  console.log(`[vLLM Proxy] -> Sending request to ${endpointUrl}${targetPath} (model: ${reqBody.model})`);

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(reqBody);

    const client = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: targetPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000 // generous 60s timeout for complex generations
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[vLLM Proxy] <- Received HTTP ${res.statusCode} (${data.length} bytes)`);
          try {
            resolve({ success: true, data: JSON.parse(data) });
          } catch (e) {
            resolve({ success: true, raw: data });
          }
        } else {
          console.error(`[vLLM Proxy] ❌ vLLM returned HTTP ${res.statusCode}: ${data}`);
          reject(new Error(`vLLM responded with HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    client.on('error', (err) => {
      console.error(`[vLLM Proxy] ❌ Network error: ${err.message}`);
      reject(err);
    });

    client.on('timeout', () => {
      console.error(`[vLLM Proxy] ❌ Request timed out after 60s`);
      client.destroy();
      reject(new Error('vLLM request timed out after 60000ms'));
    });

    client.write(postData);
    client.end();
  });
}

// Check vLLM health
async function checkVLLMHealth(endpointUrl) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(endpointUrl);
      const req = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: '/v1/models',
        method: 'GET',
        timeout: 3000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let models = [];
          try {
            const parsed = JSON.parse(data);
            models = (parsed.data || []).map(m => m.id);
          } catch (e) { }
          resolve({ alive: res.statusCode === 200, status: res.statusCode, models: models });
        });
      });
      req.on('error', (err) => {
        resolve({ alive: false, error: err.message, models: [] });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ alive: false, error: 'Connection timeout', models: [] });
      });
      req.end();
    } catch (e) {
      resolve({ alive: false, error: e.message, models: [] });
    }
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve dynamic/optional config.local.js
  if (reqUrl.pathname === '/config.local.js') {
    const configPath = path.join(__dirname, 'config.local.js');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(content);
    } else if (Object.keys(localConfig).length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(`window.VIBE_LOCAL_CONFIG = ${JSON.stringify(localConfig)};\n`);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('// Optional local config not present\n');
    }
    return;
  }

  // API: Get current server config
  if (reqUrl.pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      endpoint: DEFAULT_ENDPOINT,
      ...localConfig
    }));
    return;
  }

  // API: Health check & Models list
  if (reqUrl.pathname === '/api/llm/health' || reqUrl.pathname === '/api/llm/models') {
    const endpoint = reqUrl.query.endpoint || DEFAULT_ENDPOINT;
    const health = await checkVLLMHealth(endpoint);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  // API: LLM Generate
  if (reqUrl.pathname === '/api/llm/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const endpoint = payload.endpoint || DEFAULT_ENDPOINT;
        let model = payload.model || 'qwen3.8-27b';
        if (model === 'qwen3.8') model = 'qwen3.8-27b';

        const messages = payload.messages || [];
        const temperature = payload.temperature ?? 0.7;
        const max_tokens = payload.max_tokens ?? 4096;
        const enableFallback = payload.enableFallback === true;

        const vllmPayload = {
          model: model,
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens
        };

        try {
          // Real proxy to vLLM
          const result = await proxyToVLLM(vllmPayload, endpoint);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            source: 'vllm',
            endpoint: endpoint,
            model: model,
            data: result.data
          }));
        } catch (vllmErr) {
          console.error(`[API /api/llm/generate] Proxy failed: ${vllmErr.message}`);

          if (enableFallback) {
            const syntheticHtml = synthesizeLocalAppResponse(messages);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              source: 'vibe-synthesizer-fallback',
              notice: `vLLM (${endpoint}) error: ${vllmErr.message}. Showing local preview.`,
              endpoint: endpoint,
              model: model,
              error: vllmErr.message,
              data: {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: syntheticHtml
                    }
                  }
                ]
              }
            }));
          } else {
            // Return actual error status so UI and user can see the real error!
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              source: 'error',
              error: vllmErr.message,
              endpoint: endpoint,
              model: model
            }));
          }
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Serve static files
  let safePath = path.normalize(decodeURIComponent(reqUrl.pathname));
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure path is within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`[VibeOS Server] Running on http://localhost:${port}`);
    console.log(`[VibeOS Server] Proxying to vLLM endpoint: ${DEFAULT_ENDPOINT}`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`[VibeOS Server] Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[VibeOS Server] Error:', e);
    }
  });
}

startServer(DEFAULT_PORT);
