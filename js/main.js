// VibeOS Main Bootstrap & Desktop Manager
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Services
  const llmClient = new VibeLLMClient();
  const windowManager = new WindowManager(llmClient);
  const runtime = new AppRuntime(windowManager, llmClient);
  const startMenu = new StartMenu(runtime);
  const spotlight = new SpotlightSearch(runtime);

  // Expose to window for debugging and extensions
  window.vibeOS = {
    llm: llmClient,
    wm: windowManager,
    runtime: runtime,
    startMenu: startMenu,
    spotlight: spotlight
  };

  // Automatic timer tracking for VibeOS apps (prevents animation & interval leaks on close)
  const _origSetInterval = window.setInterval;
  const _origClearInterval = window.clearInterval;
  const _origRAF = window.requestAnimationFrame;
  const _origCAF = window.cancelAnimationFrame;

  window.setInterval = function(fn, delay, ...args) {
    const id = _origSetInterval(fn, delay, ...args);
    if (window.vibeOS?.wm?.activeWindowId) {
      const activeWin = window.vibeOS.wm.windows.get(window.vibeOS.wm.activeWindowId);
      if (activeWin && activeWin.timers) {
        activeWin.timers.intervals.add(id);
      }
    }
    return id;
  };

  window.clearInterval = function(id) {
    if (window.vibeOS?.wm) {
      window.vibeOS.wm.windows.forEach(w => {
        if (w.timers) w.timers.intervals.delete(id);
      });
    }
    return _origClearInterval(id);
  };

  window.requestAnimationFrame = function(callback) {
    let id;
    const activeWinId = window.vibeOS?.wm?.activeWindowId;
    const activeWin = activeWinId ? window.vibeOS.wm.windows.get(activeWinId) : null;

    const wrapped = (timestamp) => {
      if (activeWin && activeWin.timers) {
        activeWin.timers.animationFrames.delete(id);
      }
      callback(timestamp);
    };
    id = _origRAF(wrapped);
    if (activeWin && activeWin.timers) {
      activeWin.timers.animationFrames.add(id);
    }
    return id;
  };

  window.cancelAnimationFrame = function(id) {
    if (window.vibeOS?.wm) {
      window.vibeOS.wm.windows.forEach(w => {
        if (w.timers) w.timers.animationFrames.delete(id);
      });
    }
    return _origCAF(id);
  };

  // 1. Taskbar Clock
  const clockEl = document.getElementById('xp-tray-clock');
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    clockEl.textContent = `${hours}:${minutes} ${ampm}`;
    clockEl.title = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 2. Tray Connection Status Monitor
  const trayStatusBadge = document.getElementById('tray-vllm-badge');
  const trayStatusDot = trayStatusBadge.querySelector('.tray-status-dot');
  const trayStatusText = trayStatusBadge.querySelector('.tray-status-text');

  async function checkConnection() {
    const health = await llmClient.checkHealth();
    const cfg = VibeConfig.get();
    if (health.alive) {
      trayStatusDot.classList.remove('offline');
      trayStatusText.textContent = 'ws01:8000';
      trayStatusBadge.title = `Connected to vLLM on ${cfg.endpoint} (${cfg.model})`;
    } else {
      trayStatusDot.classList.add('offline');
      trayStatusText.textContent = cfg.enableLocalSynthesizerFallback ? 'Offline (Fallback)' : 'ws01 (Offline)';
      trayStatusBadge.title = `vLLM on ${cfg.endpoint} unreachable. Using local synthesizer fallback. Click to configure.`;
    }
  }

  checkConnection();
  setInterval(checkConnection, 15000);

  trayStatusBadge.addEventListener('click', () => {
    const settingsApp = PreloadedApps.find(a => a.id === 'app_settings');
    if (settingsApp) settingsApp.create(runtime);
  });

  // 3. Desktop Icons Setup
  const desktopIconsContainer = document.getElementById('desktop-icons-grid');
  const desktopApps = [
    { title: 'My Computer', iconSvg: XPIcons.myComputer, action: () => spotlight.open() },
    { title: 'My Documents', iconSvg: XPIcons.myDocuments, action: () => spotlight.open() },
    { title: 'Vibe App Studio', iconSvg: XPIcons.promptStudio, action: () => PreloadedApps.find(a => a.id === 'app_studio').create(runtime) },
    { title: 'vLLM Settings', iconSvg: XPIcons.settings, action: () => PreloadedApps.find(a => a.id === 'app_settings').create(runtime) },
    { title: 'Notepad AI', iconSvg: XPIcons.notepad, action: () => PreloadedApps.find(a => a.id === 'app_notepad').create(runtime) },
    { title: 'Paint XP', iconSvg: XPIcons.paint, action: () => PreloadedApps.find(a => a.id === 'app_paint').create(runtime) },
    { title: 'VibeSynth 2000', iconSvg: XPIcons.synth, action: () => PreloadedApps.find(a => a.id === 'app_synth').create(runtime) },
    { title: 'Physics Lab', iconSvg: XPIcons.motion, action: () => PreloadedApps.find(a => a.id === 'app_physics').create(runtime) },
    { title: 'Recycle Bin', iconSvg: XPIcons.recycleBin, action: () => alert('Recycle Bin is empty.') }
  ];

  desktopApps.forEach(item => {
    const iconEl = document.createElement('div');
    iconEl.className = 'desktop-icon';
    iconEl.innerHTML = `
      ${item.iconSvg}
      <span class="desktop-icon-label">${item.title}</span>
    `;

    iconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
      iconEl.classList.add('selected');
    });

    iconEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      item.action();
    });

    desktopIconsContainer.appendChild(iconEl);
  });

  // Deselect desktop icons when clicking background
  document.getElementById('xp-desktop').addEventListener('click', (e) => {
    if (e.target.id === 'xp-desktop' || e.target.id === 'desktop-icons-grid') {
      document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
    }
  });

  // 4. Quick Launch Toolbar Buttons
  document.getElementById('ql-show-desktop').addEventListener('click', () => {
    // Toggle minimize all
    const allMinimized = Array.from(windowManager.windows.values()).every(w => w.isMinimized);
    windowManager.windows.forEach(w => {
      if (allMinimized) {
        windowManager.restoreWindow(w.id);
      } else {
        windowManager.minimizeWindow(w.id);
      }
    });
  });

  document.getElementById('ql-spotlight').addEventListener('click', () => {
    spotlight.open();
  });

  document.getElementById('ql-studio').addEventListener('click', () => {
    PreloadedApps.find(a => a.id === 'app_studio').create(runtime);
  });

  document.getElementById('ql-settings').addEventListener('click', () => {
    PreloadedApps.find(a => a.id === 'app_settings').create(runtime);
  });

  // 5. Desktop Context Menu
  const contextMenu = document.getElementById('desktop-context-menu');
  document.getElementById('xp-desktop').addEventListener('contextmenu', (e) => {
    if (e.target.id === 'xp-desktop' || e.target.id === 'desktop-icons-grid') {
      e.preventDefault();
      contextMenu.style.display = 'block';
      contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
      contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 150)}px`;
    }
  });

  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  document.getElementById('ctx-new-app').addEventListener('click', () => {
    spotlight.open();
  });

  document.getElementById('ctx-settings').addEventListener('click', () => {
    PreloadedApps.find(a => a.id === 'app_settings').create(runtime);
  });

  document.getElementById('ctx-refresh').addEventListener('click', () => {
    window.location.reload();
  });

  // 6. Launch Initial Windows for the user demo or specific view
  const urlParams = new URLSearchParams(window.location.search);
  const requestedView = urlParams.get('view');

  setTimeout(() => {
    if (requestedView === 'start') {
      startMenu.openMenu();
    } else if (requestedView === 'spotlight') {
      spotlight.open();
      spotlight.inputEl.value = 'Wall Street Crypto & Stock Ticker XP';
      spotlight.render();
    } else if (requestedView === 'apps') {
      const notepad = PreloadedApps.find(a => a.id === 'app_notepad');
      const paint = PreloadedApps.find(a => a.id === 'app_paint');
      const synth = PreloadedApps.find(a => a.id === 'app_synth');
      const physics = PreloadedApps.find(a => a.id === 'app_physics');
      if (notepad) {
        const w1 = notepad.create(runtime);
        w1.element.style.left = '40px';
        w1.element.style.top = '40px';
      }
      if (paint) {
        const w2 = paint.create(runtime);
        w2.element.style.left = '320px';
        w2.element.style.top = '100px';
      }
      if (synth) {
        const w3 = synth.create(runtime);
        w3.element.style.left = '640px';
        w3.element.style.top = '50px';
      }
      if (physics) {
        const w4 = physics.create(runtime);
        w4.element.style.left = '520px';
        w4.element.style.top = '220px';
      }
    } else if (requestedView === 'physics') {
      const physics = PreloadedApps.find(a => a.id === 'app_physics');
      if (physics) {
        const win = physics.create(runtime);
        win.element.style.left = '200px';
        win.element.style.top = '60px';
      }
    } else if (requestedView === 'studio') {
      const studio = PreloadedApps.find(a => a.id === 'app_studio');
      if (studio) {
        const win = studio.create(runtime);
        win.element.style.left = '180px';
        win.element.style.top = '60px';
      }
    } else if (requestedView === 'settings') {
      const settings = PreloadedApps.find(a => a.id === 'app_settings');
      if (settings) {
        const win = settings.create(runtime);
        win.element.style.left = '200px';
        win.element.style.top = '60px';
      }
    } else if (requestedView === 'synth_app') {
      const studio = PreloadedApps.find(a => a.id === 'app_studio');
      if (studio) {
        const w1 = studio.create(runtime);
        w1.element.style.left = '40px';
        w1.element.style.top = '40px';
      }
      runtime.launchNewApp({
        title: 'Retro Wall Street Ticker XP',
        prompt: 'A retro 1990s Wall Street Stock and Crypto Ticker with order book, market sentiment meter, and buy/sell buttons',
        iconSvg: XPIcons.promptStudio,
        width: 680,
        height: 520
      }).then(w2 => {
        w2.element.style.left = '420px';
        w2.element.style.top = '70px';
      });
    } else if (requestedView === 'desktop_clean') {
      // Clean desktop with just icons
    } else {
      const studio = PreloadedApps.find(a => a.id === 'app_studio');
      const settings = PreloadedApps.find(a => a.id === 'app_settings');
      if (studio) studio.create(runtime);
      if (settings) settings.create(runtime);
    }
  }, 300);
});
