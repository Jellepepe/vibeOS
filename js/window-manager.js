// VibeOS Window Manager
class WindowManager {
  constructor(llmClient) {
    this.llmClient = llmClient;
    this.windows = new Map();
    this.activeWindowId = null;
    this.highestZIndex = 100;
    this.desktopEl = document.getElementById('xp-desktop');
    this.taskbarWindowsEl = document.getElementById('taskbar-windows-list');
    this.resizeGhostEl = document.getElementById('xp-resize-ghost');
    this.ghostBadgeEl = this.resizeGhostEl.querySelector('.xp-resize-ghost-badge');

    // Dragging state
    this.dragState = null;
    // Resizing state
    this.resizeState = null;

    this.bindGlobalEvents();
  }

  bindGlobalEvents() {
    window.addEventListener('mousemove', (e) => {
      this.handleGlobalMouseMove(e);
    });

    window.addEventListener('mouseup', (e) => {
      this.handleGlobalMouseUp(e);
    });

    window.addEventListener('resize', () => {
      // Re-constrain maximized windows if viewport changes
      this.windows.forEach(win => {
        if (win.isMaximized) {
          win.element.style.width = '100vw';
          win.element.style.height = 'calc(100vh - 30px)';
        }
      });
    });
  }

  createWindow({ id, title, iconSvg, width = 600, height = 440, x, y, appData = null }) {
    if (this.windows.has(id)) {
      this.focusWindow(id);
      return this.windows.get(id);
    }

    // Default cascading position
    const offset = (this.windows.size * 25) % 150;
    const posX = x !== undefined ? x : Math.max(40, 100 + offset);
    const posY = y !== undefined ? y : Math.max(20, 50 + offset);

    const winEl = document.createElement('div');
    winEl.className = 'xp-window';
    winEl.id = `win-${id}`;
    winEl.style.width = `${width}px`;
    winEl.style.height = `${height}px`;
    winEl.style.left = `${posX}px`;
    winEl.style.top = `${posY}px`;

    winEl.innerHTML = `
      <!-- Titlebar -->
      <div class="xp-titlebar">
        <div class="xp-titlebar-left">
          <span class="xp-titlebar-icon">${iconSvg || XPIcons.flag}</span>
          <span class="xp-titlebar-title" title="${title}">${title}</span>
        </div>
        <div class="xp-titlebar-controls">
          <button class="xp-btn-ctrl btn-min" title="Minimize">_</button>
          <button class="xp-btn-ctrl btn-max" title="Maximize">□</button>
          <button class="xp-btn-ctrl btn-close" title="Close">✕</button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="xp-window-toolbar">
        <button class="xp-tb-btn btn-ai-refresh" title="Re-render layout with Qwen3.8">
          <span>🔄</span> Re-Synthesize
        </button>
        <button class="xp-tb-btn btn-undo" title="Undo last state change">
          <span>↶</span> Undo
        </button>
        <div class="xp-tb-divider"></div>
        <button class="xp-tb-btn btn-pin-start" title="Pin / Unpin to Start Menu">
          <span>📌</span> Pin to Start
        </button>
        <div class="xp-tb-divider"></div>
        <button class="xp-tb-btn btn-inspect" title="Inspect LLM Prompt & HTML">
          <span>🔍</span> Inspector
        </button>
      </div>

      <!-- Loading marquee bar -->
      <div class="xp-loading-bar-wrapper">
        <div class="xp-loading-bar-marquee"></div>
      </div>

      <!-- Content Area -->
      <div class="xp-window-content">
        <div class="xp-app-root"></div>
      </div>

      <!-- Prompt / Code Inspector Drawer -->
      <div class="xp-code-inspector">
        <div class="xp-inspector-header">
          <span>vLLM Prompt & Code Inspector</span>
          <button class="xp-btn-ctrl btn-close-inspector" style="width:16px;height:16px;font-size:9px;">✕</button>
        </div>
        <div class="xp-inspector-body">Prompt history and generated HTML will appear here...</div>
      </div>

      <!-- Statusbar -->
      <div class="xp-window-statusbar">
        <div class="xp-statusbar-panel status-llm">vLLM: Ready</div>
        <div class="xp-statusbar-panel status-latency">Latency: --</div>
        <div class="xp-statusbar-panel status-dim">${width}x${height}</div>
      </div>

      <!-- 8 Resize Handles -->
      <div class="xp-resize-handle xp-resize-n" data-dir="n"></div>
      <div class="xp-resize-handle xp-resize-s" data-dir="s"></div>
      <div class="xp-resize-handle xp-resize-w" data-dir="w"></div>
      <div class="xp-resize-handle xp-resize-e" data-dir="e"></div>
      <div class="xp-resize-handle xp-resize-nw" data-dir="nw"></div>
      <div class="xp-resize-handle xp-resize-ne" data-dir="ne"></div>
      <div class="xp-resize-handle xp-resize-sw" data-dir="sw"></div>
      <div class="xp-resize-handle xp-resize-se" data-dir="se"></div>
    `;

    this.desktopEl.appendChild(winEl);

    // Create Taskbar Tab
    const taskbarItem = document.createElement('div');
    taskbarItem.className = 'taskbar-item active';
    taskbarItem.id = `tb-${id}`;
    taskbarItem.title = title;
    taskbarItem.innerHTML = `
      <span class="taskbar-item-icon">${iconSvg || XPIcons.flag}</span>
      <span class="taskbar-item-title">${title}</span>
    `;
    this.taskbarWindowsEl.appendChild(taskbarItem);

    const winObj = {
      id,
      title,
      iconSvg,
      element: winEl,
      taskbarItem,
      appRoot: winEl.querySelector('.xp-app-root'),
      inspector: winEl.querySelector('.xp-code-inspector'),
      inspectorBody: winEl.querySelector('.xp-inspector-body'),
      loadingBar: winEl.querySelector('.xp-loading-bar-wrapper'),
      statusLlm: winEl.querySelector('.status-llm'),
      statusLatency: winEl.querySelector('.status-latency'),
      statusDim: winEl.querySelector('.status-dim'),
      isMinimized: false,
      isMaximized: false,
      prevBounds: null,
      appData,
      history: [],
      currentHtml: '',
      lastPrompt: '',
      timers: { intervals: new Set(), animationFrames: new Set(), timeouts: new Set() },
      activeScripts: [],
      cleanup: null
    };

    this.windows.set(id, winObj);

    // Bind Window Controls
    this.bindWindowEvents(winObj);

    // Focus Window
    this.focusWindow(id);

    return winObj;
  }

  bindWindowEvents(win) {
    const el = win.element;

    // Window click focuses
    el.addEventListener('mousedown', () => {
      this.focusWindow(win.id);
    });

    // Taskbar tab click
    win.taskbarItem.addEventListener('click', () => {
      if (this.activeWindowId === win.id && !win.isMinimized) {
        this.minimizeWindow(win.id);
      } else {
        if (win.isMinimized) {
          this.restoreWindow(win.id);
        }
        this.focusWindow(win.id);
      }
    });

    // Titlebar Dragging
    const titlebar = el.querySelector('.xp-titlebar');
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.xp-titlebar-controls')) return;
      this.focusWindow(win.id);
      if (win.isMaximized) return; // Don't drag maximized

      this.dragState = {
        winId: win.id,
        startX: e.clientX,
        startY: e.clientY,
        initialLeft: el.offsetLeft,
        initialTop: el.offsetTop
      };
      e.preventDefault();
    });

    // Min / Max / Close buttons
    el.querySelector('.btn-min').addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeWindow(win.id);
    });

    el.querySelector('.btn-max').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximize(win.id);
    });

    el.querySelector('.btn-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(win.id);
    });

    // Double click titlebar maximizes
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.xp-titlebar-controls')) return;
      this.toggleMaximize(win.id);
    });

    // Toolbar buttons
    el.querySelector('.btn-ai-refresh').addEventListener('click', () => {
      if (win.onAiRefresh) win.onAiRefresh();
    });

    el.querySelector('.btn-undo').addEventListener('click', () => {
      if (win.history.length > 1) {
        win.history.pop(); // Remove current
        const prev = win.history[win.history.length - 1];
        if (win.onApplyHtml) win.onApplyHtml(prev, 'Undid last state');
      }
    });

    el.querySelector('.btn-pin-start').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('vibeos:toggle-pin', {
        detail: { id: win.id, title: win.title, iconSvg: win.iconSvg }
      }));
    });

    el.querySelector('.btn-inspect').addEventListener('click', () => {
      win.inspector.classList.toggle('open');
    });

    el.querySelector('.btn-close-inspector').addEventListener('click', () => {
      win.inspector.classList.remove('open');
    });

    // Outline Resizing Handles (Crucial Feature)
    const handles = el.querySelectorAll('.xp-resize-handle');
    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (win.isMaximized) return;
        this.focusWindow(win.id);
        const dir = handle.dataset.dir;

        const rect = el.getBoundingClientRect();
        this.resizeState = {
          winId: win.id,
          dir: dir,
          startX: e.clientX,
          startY: e.clientY,
          initialX: rect.left,
          initialY: rect.top,
          initialW: rect.width,
          initialH: rect.height,
          currentW: rect.width,
          currentH: rect.height,
          currentX: rect.left,
          currentY: rect.top
        };

        // Show Outline Ghost
        this.showResizeGhost(rect.left, rect.top, rect.width, rect.height);
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  showResizeGhost(x, y, w, h) {
    this.resizeGhostEl.style.display = 'block';
    this.resizeGhostEl.style.left = `${x}px`;
    this.resizeGhostEl.style.top = `${y}px`;
    this.resizeGhostEl.style.width = `${w}px`;
    this.resizeGhostEl.style.height = `${h}px`;
    this.ghostBadgeEl.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
  }

  hideResizeGhost() {
    this.resizeGhostEl.style.display = 'none';
  }

  handleGlobalMouseMove(e) {
    // 1. Dragging Window
    if (this.dragState) {
      const win = this.windows.get(this.dragState.winId);
      if (!win) return;

      const deltaX = e.clientX - this.dragState.startX;
      const deltaY = e.clientY - this.dragState.startY;

      let newLeft = this.dragState.initialLeft + deltaX;
      let newTop = this.dragState.initialTop + deltaY;

      // Keep within desktop bounds
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - 60));
      newLeft = Math.max(-win.element.offsetWidth + 80, Math.min(newLeft, window.innerWidth - 60));

      win.element.style.left = `${newLeft}px`;
      win.element.style.top = `${newTop}px`;
    }

    // 2. Resizing Window with Outline
    if (this.resizeState) {
      const rs = this.resizeState;
      const deltaX = e.clientX - rs.startX;
      const deltaY = e.clientY - rs.startY;

      let newW = rs.initialW;
      let newH = rs.initialH;
      let newX = rs.initialX;
      let newY = rs.initialY;

      const minW = 320;
      const minH = 200;

      if (rs.dir.includes('e')) {
        newW = Math.max(minW, rs.initialW + deltaX);
      }
      if (rs.dir.includes('s')) {
        newH = Math.max(minH, rs.initialH + deltaY);
      }
      if (rs.dir.includes('w')) {
        const potentialW = rs.initialW - deltaX;
        if (potentialW >= minW) {
          newW = potentialW;
          newX = rs.initialX + deltaX;
        } else {
          newW = minW;
          newX = rs.initialX + (rs.initialW - minW);
        }
      }
      if (rs.dir.includes('n')) {
        const potentialH = rs.initialH - deltaY;
        if (potentialH >= minH) {
          newH = potentialH;
          newY = rs.initialY + deltaY;
        } else {
          newH = minH;
          newY = rs.initialY + (rs.initialH - minH);
        }
      }

      rs.currentW = newW;
      rs.currentH = newH;
      rs.currentX = newX;
      rs.currentY = newY;

      this.showResizeGhost(newX, newY, newW, newH);
    }
  }

  handleGlobalMouseUp(e) {
    if (this.dragState) {
      this.dragState = null;
    }

    if (this.resizeState) {
      const rs = this.resizeState;
      const win = this.windows.get(rs.winId);
      this.hideResizeGhost();

      if (win) {
        const oldSize = { width: Math.round(rs.initialW), height: Math.round(rs.initialH) };
        const newSize = { width: Math.round(rs.currentW), height: Math.round(rs.currentH) };

        // Apply new bounds to real window
        win.element.style.left = `${rs.currentX}px`;
        win.element.style.top = `${rs.currentY}px`;
        win.element.style.width = `${rs.currentW}px`;
        win.element.style.height = `${rs.currentH}px`;
        win.statusDim.textContent = `${newSize.width}x${newSize.height}`;

        // Trigger LLM Adaptive Re-render upon release!
        const config = VibeConfig.get();
        const sizeChangedSignificantly = Math.abs(oldSize.width - newSize.width) > 40 || Math.abs(oldSize.height - newSize.height) > 40;

        if (config.autoRenderOnResize && sizeChangedSignificantly && win.onWindowResized) {
          win.onWindowResized(oldSize, newSize);
        }
      }

      this.resizeState = null;
    }
  }

  focusWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (win.isMinimized) {
      this.restoreWindow(id);
    }

    this.highestZIndex += 2;
    win.element.style.zIndex = this.highestZIndex;

    // Remove active style from all others
    this.windows.forEach(w => {
      w.element.classList.add('inactive');
      w.taskbarItem.classList.remove('active');
    });

    win.element.classList.remove('inactive');
    win.taskbarItem.classList.add('active');
    this.activeWindowId = id;
  }

  minimizeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.isMinimized = true;
    win.element.classList.add('minimized');
    win.taskbarItem.classList.remove('active');

    if (this.activeWindowId === id) {
      this.activeWindowId = null;
      // Focus another unminimized window
      for (const [wId, w] of this.windows.entries()) {
        if (!w.isMinimized) {
          this.focusWindow(wId);
          break;
        }
      }
    }
  }

  restoreWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    win.isMinimized = false;
    win.element.classList.remove('minimized');
    this.focusWindow(id);
  }

  toggleMaximize(id) {
    const win = this.windows.get(id);
    if (!win) return;

    const el = win.element;
    const maxBtn = el.querySelector('.btn-max');

    if (!win.isMaximized) {
      // Maximize
      win.prevBounds = {
        top: el.style.top,
        left: el.style.left,
        width: el.style.width,
        height: el.style.height
      };
      el.classList.add('maximized');
      win.isMaximized = true;
      maxBtn.textContent = '❐';
      maxBtn.title = 'Restore';

      const bounds = el.getBoundingClientRect();
      const newSize = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
      win.statusDim.textContent = `${newSize.width}x${newSize.height}`;

      if (win.onWindowResized) {
        win.onWindowResized({ width: parseInt(win.prevBounds.width), height: parseInt(win.prevBounds.height) }, newSize);
      }
    } else {
      // Restore
      el.classList.remove('maximized');
      if (win.prevBounds) {
        el.style.top = win.prevBounds.top;
        el.style.left = win.prevBounds.left;
        el.style.width = win.prevBounds.width;
        el.style.height = win.prevBounds.height;
      }
      win.isMaximized = false;
      maxBtn.textContent = '□';
      maxBtn.title = 'Maximize';

      const restoredW = parseInt(el.style.width);
      const restoredH = parseInt(el.style.height);
      win.statusDim.textContent = `${restoredW}x${restoredH}`;
    }
    this.focusWindow(id);
  }

  closeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return;

    if (win.cleanup) {
      try { win.cleanup(); } catch (e) { console.warn('[VibeOS] Window cleanup error:', e); }
    }

    win.element.remove();
    win.taskbarItem.remove();
    this.windows.delete(id);

    if (this.activeWindowId === id) {
      this.activeWindowId = null;
      for (const [wId, w] of this.windows.entries()) {
        if (!w.isMinimized) {
          this.focusWindow(wId);
          break;
        }
      }
    }
  }

  setWindowLoading(id, isLoading, statusText = '') {
    const win = this.windows.get(id);
    if (!win) return;

    if (isLoading) {
      win.loadingBar.classList.add('active');
      win.statusLlm.textContent = statusText || 'vLLM: Generating...';
      win.statusLlm.style.color = '#0055ea';
    } else {
      win.loadingBar.classList.remove('active');
      win.statusLlm.textContent = statusText || 'vLLM: Ready';
      win.statusLlm.style.color = '#333';
    }
  }

  updateInspector(id, info) {
    const win = this.windows.get(id);
    if (!win) return;

    const formatted = `[Time: ${new Date().toLocaleTimeString()}] Source: ${info.source || 'vllm'} | Latency: ${info.latencyMs || 0}ms
Model: ${info.model || 'qwen3.8'}
==================================================
MESSAGES SENT TO LLM:
${JSON.stringify(info.messages, null, 2)}
==================================================
GENERATED HTML OUTPUT:
${info.html}
`;
    win.inspectorBody.textContent = formatted;
  }
}

window.WindowManager = WindowManager;
