// v3.5.2 — 2026-03-22

// ─── shared/pill-select.js ───────────────────────────────────────────────────
// PillSelect: tappable pill button selector -- single or multi select
// Usage: new PillSelect(containerEl, { options, selected, multi, onSelect, color })

'use strict';

export class PillSelect {
  constructor(container, options = {}) {
    this.container = container;
    this.options   = options.options   || [];   // [{ value, label, emoji? }] or ['string']
    this.selected  = options.selected  || (options.multi ? [] : null);
    this.multi     = options.multi     || false;
    this.onSelect  = options.onSelect  || (() => {});
    this.color     = options.color     || 'indigo'; // 'indigo' | 'emerald'
    this.allowAdd  = options.allowAdd  || false;
    this.onAdd     = options.onAdd     || (() => {});

    this._render();
  }

  _normalizeOptions() {
    return this.options.map(o =>
      typeof o === 'string' ? { value: o, label: o } : o
    );
  }

  _isSelected(value) {
    if (this.multi) return Array.isArray(this.selected) && this.selected.includes(value);
    return this.selected === value;
  }

  _colors() {
    return this.color === 'emerald'
      ? { active: '#065F46', activeBg: '#D1FAE5', activeBorder: '#6EE7B7', inactiveBg: '#F0FDF4', inactiveBorder: '#A7F3D0', text: '#065F46' }
      : { active: '#3730A3', activeBg: '#EEF2FF', activeBorder: '#A5B4FC', inactiveBg: '#F8FAFC', inactiveBorder: '#E2E8F0', text: '#3730A3' };
  }

  _render() {
    const opts   = this._normalizeOptions();
    const colors = this._colors();

    this.container.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center;';
    this.container.innerHTML = opts.map(opt => {
      const active = this._isSelected(opt.value);
      return `
        <button
          class="pill-btn ${active ? 'pill-active' : ''}"
          data-value="${opt.value}"
          type="button"
          style="
            padding:8px 16px; border-radius:999px; cursor:pointer;
            font-size:14px; font-weight:500; min-height:40px;
            border:1.5px solid ${active ? colors.activeBorder : colors.inactiveBorder};
            background:${active ? colors.activeBg : colors.inactiveBg};
            color:${active ? colors.active : '#64748B'};
            transition:all 0.15s; user-select:none;
            -webkit-tap-highlight-color:transparent;
          "
        >${opt.emoji ? opt.emoji + ' ' : ''}${opt.label}</button>
      `;
    }).join('') + (this.allowAdd ? `
      <button
        class="pill-add-btn"
        type="button"
        style="
          padding:8px 16px; border-radius:999px; cursor:pointer;
          font-size:14px; font-weight:500; min-height:40px;
          border:1.5px dashed #CBD5E1; background:transparent;
          color:#94A3B8; transition:all 0.15s;
        "
      >+ Add</button>
    ` : '');

    this._bind();
  }

  _bind() {
    this.container.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        if (this.multi) {
          const arr = Array.isArray(this.selected) ? [...this.selected] : [];
          const idx = arr.indexOf(val);
          if (idx > -1) arr.splice(idx, 1);
          else arr.push(val);
          this.selected = arr;
        } else {
          this.selected = this.selected === val ? null : val;
        }
        this._render();
        this.onSelect(this.selected);
      });
    });

    const addBtn = this.container.querySelector('.pill-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.onAdd());
    }
  }

  getValue() { return this.selected; }

  setValue(val) {
    this.selected = val;
    this._render();
  }

  setOptions(opts) {
    this.options = opts;
    this._render();
  }

  addOption(value, label = value) {
    this.options.push({ value, label });
    this._render();
  }
}
