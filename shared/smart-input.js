// ─── shared/smart-input.js ───────────────────────────────────────────────────
// SmartInput: text field with real-time pill suggestions from historical data
// Usage: new SmartInput(containerEl, { suggestions: [], onSelect, onInput, placeholder })

'use strict';

import { debounce } from './utils.js';

export class SmartInput {
  constructor(container, options = {}) {
    this.container   = container;
    this.suggestions = options.suggestions || [];
    this.onSelect    = options.onSelect    || (() => {});
    this.onInput     = options.onInput     || (() => {});
    this.placeholder = options.placeholder || '';
    this.maxSuggestions = options.maxSuggestions || 5;
    this.value       = options.value || '';

    this._render();
    this._bind();
  }

  _render() {
    this.container.innerHTML = `
      <div class="smart-input-wrap" style="position:relative;">
        <input
          type="text"
          class="smart-input"
          placeholder="${this.placeholder}"
          value="${this.value}"
          autocomplete="off"
          style="
            width:100%; box-sizing:border-box;
            padding:12px 16px; border-radius:12px;
            border:1.5px solid var(--border); background:var(--surface);
            font-size:15px; color:var(--text); outline:none;
            transition:border-color 0.15s;
          "
        />
        <div class="smart-suggestions" style="
          display:none; position:absolute; top:calc(100% + 4px); left:0; right:0;
          background:var(--surface); border:1.5px solid var(--border);
          border-radius:12px; z-index:100; overflow:hidden;
          box-shadow:0 8px 24px rgba(0,0,0,0.12);
        "></div>
      </div>
    `;

    this.input   = this.container.querySelector('.smart-input');
    this.dropdown = this.container.querySelector('.smart-suggestions');
  }

  _bind() {
    const onInputDebounced = debounce((val) => {
      this._showSuggestions(val);
      this.onInput(val);
    }, 150);

    this.input.addEventListener('input', (e) => {
      this.value = e.target.value;
      onInputDebounced(this.value);
    });

    this.input.addEventListener('focus', () => {
      this.input.style.borderColor = 'var(--primary)';
      if (this.value || this.suggestions.length > 0) {
        this._showSuggestions(this.value);
      }
    });

    this.input.addEventListener('blur', () => {
      this.input.style.borderColor = 'var(--border)';
      setTimeout(() => this._hideSuggestions(), 200);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) this._hideSuggestions();
    });
  }

  _showSuggestions(query) {
    const filtered = query
      ? this.suggestions.filter(s =>
          s.toLowerCase().includes(query.toLowerCase()) && s !== query
        )
      : this.suggestions;

    const top = filtered.slice(0, this.maxSuggestions);
    if (top.length === 0) { this._hideSuggestions(); return; }

    this.dropdown.innerHTML = top.map((s, i) => `
      <div
        class="smart-suggestion-item"
        data-value="${s.replace(/"/g, '&quot;')}"
        style="
          padding:10px 16px; cursor:pointer; font-size:14px;
          color:var(--text); border-bottom:1px solid var(--border-light);
          transition:background 0.1s;
          ${i === top.length - 1 ? 'border-bottom:none;' : ''}
        "
        onmouseover="this.style.background='var(--hover)'"
        onmouseout="this.style.background='transparent'"
      >${this._highlight(s, query)}</div>
    `).join('');

    this.dropdown.querySelectorAll('.smart-suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.setValue(el.dataset.value);
        this.onSelect(el.dataset.value);
        this._hideSuggestions();
      });
    });

    this.dropdown.style.display = 'block';
  }

  _hideSuggestions() {
    this.dropdown.style.display = 'none';
  }

  _highlight(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      `<strong style="color:var(--primary)">${text.slice(idx, idx + query.length)}</strong>` +
      text.slice(idx + query.length)
    );
  }

  setValue(val) {
    this.value = val;
    this.input.value = val;
  }

  getSuggestions() { return this.suggestions; }

  updateSuggestions(newSuggestions) {
    this.suggestions = newSuggestions;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
