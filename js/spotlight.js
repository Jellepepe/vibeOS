// VibeOS Spotlight / PowerToys Search Runner
class SpotlightSearch {
  constructor(runtime) {
    this.runtime = runtime;
    this.modalEl = document.getElementById('xp-spotlight-modal');
    this.inputEl = document.getElementById('spotlight-input-field');
    this.resultsEl = document.getElementById('spotlight-results-list');
    this.closeBtn = document.getElementById('spotlight-close-btn');

    this.selectedIndex = 0;
    this.currentItems = [];

    this.bindEvents();
  }

  bindEvents() {
    // Keyboard shortcuts: Cmd+Space, Ctrl+Space, Alt+Space, or F3
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey || e.altKey) && e.code === 'Space') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Custom event to open from anywhere
    window.addEventListener('vibeos:open-spotlight', () => {
      this.open();
    });

    this.closeBtn.addEventListener('click', () => {
      this.close();
    });

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    // Input events
    this.inputEl.addEventListener('input', () => {
      this.selectedIndex = 0;
      this.render();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.currentItems.length;
          this.updateSelection();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + this.currentItems.length) % this.currentItems.length;
          this.updateSelection();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    });

    // Suggested chips
    document.querySelectorAll('.spotlight-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.textContent.trim();
        this.inputEl.value = query;
        this.render();
        this.executeSelected();
      });
    });
  }

  isOpen() {
    return this.modalEl.classList.contains('open');
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.modalEl.classList.add('open');
    this.inputEl.value = '';
    this.selectedIndex = 0;
    this.render();
    setTimeout(() => this.inputEl.focus(), 50);
  }

  close() {
    this.modalEl.classList.remove('open');
  }

  render() {
    const query = this.inputEl.value.trim().toLowerCase();
    this.resultsEl.innerHTML = '';
    this.currentItems = [];

    // Filter existing apps
    const matchingApps = PreloadedApps.filter(app =>
      !query || app.title.toLowerCase().includes(query) || (app.desc && app.desc.toLowerCase().includes(query))
    );

    matchingApps.forEach(app => {
      this.currentItems.push({
        type: 'app',
        app: app,
        title: app.title,
        desc: app.desc,
        iconSvg: app.iconSvg
      });
    });

    // If user typed something, add the LLM synthesis option as top or prominent option
    if (query) {
      this.currentItems.unshift({
        type: 'llm_generate',
        prompt: this.inputEl.value.trim(),
        title: `✨ Generate & Launch: "${this.inputEl.value.trim()}"`,
        desc: `Real-time synthesis via Qwen3.8 on ${VibeConfig.get().endpoint}`,
        iconSvg: XPIcons.promptStudio
      });
    }

    if (this.currentItems.length === 0) {
      this.resultsEl.innerHTML = `<div style="padding:16px; text-align:center; color:#888;">Type an app description to generate with Qwen3.8...</div>`;
      return;
    }

    this.currentItems.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = `spotlight-item ${item.type === 'llm_generate' ? 'ai-create' : ''} ${index === this.selectedIndex ? 'selected' : ''}`;
      el.dataset.index = index;

      el.innerHTML = `
        <div class="spotlight-item-icon">${item.iconSvg}</div>
        <div class="spotlight-item-content">
          <div class="spotlight-item-title">${item.title}</div>
          <div class="spotlight-item-desc">${item.desc}</div>
        </div>
        ${item.type === 'llm_generate' ? '<span class="spotlight-item-badge">Synthesize</span>' : ''}
      `;

      el.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });

      this.resultsEl.appendChild(el);
    });
  }

  updateSelection() {
    const items = this.resultsEl.querySelectorAll('.spotlight-item');
    items.forEach((el, idx) => {
      el.classList.toggle('selected', idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  executeSelected() {
    if (this.currentItems.length === 0) return;
    const item = this.currentItems[this.selectedIndex] || this.currentItems[0];
    this.close();

    if (item.type === 'app') {
      item.app.create(this.runtime);
    } else if (item.type === 'llm_generate') {
      this.runtime.launchNewApp({
        title: item.prompt.slice(0, 24),
        prompt: item.prompt,
        iconSvg: XPIcons.promptStudio
      });
    }
  }
}

window.SpotlightSearch = SpotlightSearch;
