// VibeOS Local Configuration Overrides Example
// Copy this file to config.local.js to override defaults locally:
//   cp config.local.example.js config.local.js
const localConfig = {
  endpoint: 'http://localhost:8000',
  model: 'qwen3.8-27b'
};

if (typeof window !== 'undefined') {
  window.VIBE_LOCAL_CONFIG = localConfig;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = localConfig;
}
