// VibeOS Start Menu Logic with App Pinning and Search
class StartMenu {
  constructor(runtime) {
    this.runtime = runtime;
    this.menuEl = document.getElementById('xp-start-menu');
    this.startBtn = document.getElementById('xp-start-btn');
    this.pinnedContainer = document.getElementById('start-pinned-list');
    this.searchInput = document.getElementById('start-search-field');

    // Load pinned apps from localStorage or preloaded defaults
    this.pinnedAppIds = this.loadPinnedApps();

    this.bindEvents();
    this.renderPinnedApps();
  }

  loadPinnedApps() {
    try {
      const saved = localStorage.getItem('vibeos_pinned_apps');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ['app_studio', 'app_settings', 'app_notepad', 'app_paint', 'app_synth'];
  }

  savePinnedApps() {
    try {
      localStorage.setItem('vibeos_pinned_apps', JSON.stringify(this.pinnedAppIds));
    } catch (e) {}
  }

  togglePin(appId) {
    if (this.pinnedAppIds.includes(appId)) {
      this.pinnedAppIds = this.pinnedAppIds.filter(id => id !== appId);
    } else {
      this.pinnedAppIds.push(appId);
    }
    this.savePinnedApps();
    this.renderPinnedApps();
  }

  bindEvents() {
    // Start button click
    this.startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.menuEl.contains(e.target) && !this.startBtn.contains(e.target)) {
        this.closeMenu();
      }
    });

    // Search inside start menu
    this.searchInput.addEventListener('input', () => {
      const q = this.searchInput.value.toLowerCase().trim();
      this.renderFilteredApps(q);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = this.searchInput.value.trim();
        if (q) {
          this.closeMenu();
          this.runtime.launchNewApp({
            title: q.slice(0, 20),
            prompt: q
          });
        }
      }
    });

    // Listen to global toggle pin events from window titlebars/toolbars
    window.addEventListener('vibeos:toggle-pin', (e) => {
      const { id, title, iconSvg } = e.detail;
      this.togglePin(id);
    });

    // All Programs click opens Spotlight or expands
    document.querySelector('.start-all-programs')?.addEventListener('click', () => {
      this.closeMenu();
      window.dispatchEvent(new CustomEvent('vibeos:open-spotlight'));
    });
  }

  toggleMenu() {
    const isOpen = this.menuEl.classList.contains('open');
    if (isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.menuEl.classList.add('open');
    this.startBtn.classList.add('active');
    this.searchInput.value = '';
    this.renderPinnedApps();
    setTimeout(() => this.searchInput.focus(), 50);
  }

  closeMenu() {
    this.menuEl.classList.remove('open');
    this.startBtn.classList.remove('active');
  }

  renderPinnedApps() {
    this.pinnedContainer.innerHTML = '';

    const allApps = [...PreloadedApps];

    // Find apps that are pinned
    const pinned = allApps.filter(a => this.pinnedAppIds.includes(a.id));

    if (pinned.length === 0) {
      this.pinnedContainer.innerHTML = `<div style="padding:10px; color:#777; font-size:11px;">No apps pinned. Use Spotlight or Windows to pin apps!</div>`;
      return;
    }

    pinned.forEach(app => {
      const itemEl = document.createElement('div');
      itemEl.className = 'start-app-item';
      itemEl.innerHTML = `
        <div class="start-app-item-icon">${app.iconSvg}</div>
        <div class="start-app-item-content">
          <div class="start-app-item-title">${app.title}</div>
          <div class="start-app-item-desc">${app.desc || 'Windows XP Application'}</div>
        </div>
        <button class="start-pin-btn" title="Unpin from Start Menu">📌</button>
      `;

      itemEl.addEventListener('click', (e) => {
        if (e.target.closest('.start-pin-btn')) {
          e.stopPropagation();
          this.togglePin(app.id);
          return;
        }
        this.closeMenu();
        if (app.create) {
          app.create(this.runtime);
        } else {
          this.runtime.launchNewApp({ title: app.title, prompt: app.desc, iconSvg: app.iconSvg });
        }
      });

      this.pinnedContainer.appendChild(itemEl);
    });
  }

  renderFilteredApps(query) {
    if (!query) {
      this.renderPinnedApps();
      return;
    }

    this.pinnedContainer.innerHTML = '';
    const matches = PreloadedApps.filter(a =>
      a.title.toLowerCase().includes(query) || (a.desc && a.desc.toLowerCase().includes(query))
    );

    matches.forEach(app => {
      const itemEl = document.createElement('div');
      itemEl.className = 'start-app-item';
      itemEl.innerHTML = `
        <div class="start-app-item-icon">${app.iconSvg}</div>
        <div class="start-app-item-content">
          <div class="start-app-item-title">${app.title}</div>
          <div class="start-app-item-desc">${app.desc}</div>
        </div>
      `;
      itemEl.addEventListener('click', () => {
        this.closeMenu();
        app.create(this.runtime);
      });
      this.pinnedContainer.appendChild(itemEl);
    });

    // Special AI Synthesizer item
    const aiItem = document.createElement('div');
    aiItem.className = 'start-app-item';
    aiItem.style.background = '#eaf2ff';
    aiItem.style.borderTop = '1px dashed #7f9db9';
    aiItem.innerHTML = `
      <div class="start-app-item-icon">${XPIcons.promptStudio}</div>
      <div class="start-app-item-content">
        <div class="start-app-item-title" style="color:#003399;">✨ Synthesize with Qwen3.8: "${query}"</div>
        <div class="start-app-item-desc">Press Enter to generate and launch</div>
      </div>
    `;
    aiItem.addEventListener('click', () => {
      this.closeMenu();
      this.runtime.launchNewApp({
        title: query.slice(0, 20),
        prompt: query
      });
    });
    this.pinnedContainer.appendChild(aiItem);
  }
}

window.StartMenu = StartMenu;
