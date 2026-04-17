// v1.0.0 — 2026-04-04
// ─── shared/multi-smart-input.js ──────────────────────────────────────────────
// MultiSmartInput: multi-tag field with real-time suggestions and "Add New"
// Usage: new MultiSmartInput(containerEl, { suggestions: [{id, name, emoji}], onSelect, onAdd, onRemove, placeholder, selected: [] })

'use strict';

import { debounce, uuidv4 } from './utils.js';

export class MultiSmartInput {
  constructor(container, options = {}) {
    this.container      = container;
    this.suggestions    = options.suggestions || []; // Array of objects {id, name, emoji}
    this.onSelect       = options.onSelect    || (() => {});
    this.onAdd          = options.onAdd       || (() => {}); // Called when "Add New" is clicked
    this.onRemove       = options.onRemove    || (() => {});
    this.onChange       = options.onChange    || (() => {}); // Called on any change to selected list
    this.placeholder    = options.placeholder || 'Type name...';
    this.selected       = options.selected    || []; // Array of objects {id, name, emoji}
    this.maxSuggestions = options.maxSuggestions || 5;

    this.inputValue = '';
    this._render();
    this._bind();
  }

  _render() {
    this.container.innerHTML = `
      <div class="multi-smart-input-wrap" style="
        border:1.5px solid var(--border); background:var(--surface);
        border-radius:12px; padding:6px 8px; min-height:48px;
        display:flex; flex-wrap:wrap; gap:6px; align-items:center;
        transition: border-color 0.15s; position:relative;
      ">
        <div class="msi-tags" style="display:contents;"></div>
        <input
          type="text"
          class="msi-input"
          placeholder="${this.selected.length > 0 ? '' : this.placeholder}"
          autocomplete="off"
          style="
            flex:1; min-width:120px; border:none; background:transparent;
            padding:6px; font-size:14px; color:var(--text); outline:none;
            font-family:inherit;
          "
        />
        <div class="msi-suggestions" style="
          display:none; position:absolute; top:calc(100% + 8px); left:0; right:0;
          background:var(--surface); border:1.5px solid var(--border);
          border-radius:12px; z-index:1000; overflow:hidden;
          box-shadow:0 12px 32px rgba(0,0,0,0.15);
        "></div>
      </div>
    `;

    this.wrap        = this.container.querySelector('.multi-smart-input-wrap');
    this.tagContainer = this.container.querySelector('.msi-tags');
    this.input       = this.container.querySelector('.msi-input');
    this.dropdown    = this.container.querySelector('.msi-suggestions');

    this._renderTags();
  }

  _renderTags() {
    this.tagContainer.innerHTML = this.selected.map(item => `
      <div class="msi-tag" data-id="${item.id}" style="
        background:var(--primary-bg); color:var(--primary);
        padding:4px 10px; border-radius:99px; font-size:12px; font-weight:600;
        display:flex; align-items:center; gap:6px; user-select:none;
      ">
        <span>${item.emoji || '👤'} ${item.name}</span>
        <span class="msi-tag-remove" style="cursor:pointer; font-size:16px; opacity:0.6;">×</span>
      </div>
    `).join('');

    this.tagContainer.querySelectorAll('.msi-tag-remove').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.closest('.msi-tag').dataset.id;
        this.removeById(id);
      };
    });

    this.input.placeholder = this.selected.length > 0 ? '' : this.placeholder;
  }

  _bind() {
    const onInputDebounced = debounce((val) => {
      this._showSuggestions(val);
    }, 100);

    this.input.addEventListener('input', (e) => {
      this.inputValue = e.target.value;
      onInputDebounced(this.inputValue);
    });

    this.input.addEventListener('focus', () => {
      this.wrap.style.borderColor = 'var(--primary)';
      this._showSuggestions(this.inputValue);
    });

    this.input.addEventListener('blur', () => {
      this.wrap.style.borderColor = 'var(--border)';
      setTimeout(() => this._hideSuggestions(), 200);
    });

    this.wrap.addEventListener('click', () => this.input.focus());

    // Handle Backspace to remove last tag
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !this.inputValue && this.selected.length > 0) {
        const last = this.selected[this.selected.length - 1];
        this.removeById(last.id);
      }
    });
  }

  _showSuggestions(query) {
    const queryLower = (query || '').toLowerCase().trim();
    
    // Filter out already selected
    const selectedIds = new Set(this.selected.map(s => s.id));
    let filtered = this.suggestions.filter(s => !selectedIds.has(s.id));

    if (queryLower) {
      filtered = filtered.filter(s => s.name.toLowerCase().includes(queryLower));
    }

    const top = filtered.slice(0, this.maxSuggestions);
    const hasExactMatch = queryLower && this.suggestions.some(s => s.name.toLowerCase() === queryLower);

    let html = top.map((s, i) => `
      <div class="msi-suggestion-item" data-id="${s.id}" style="
        padding:12px 16px; cursor:pointer; font-size:14px;
        color:var(--text); border-bottom:1px solid var(--border-light);
        display:flex; align-items:center; gap:10px;
        ${i === top.length - 1 && hasExactMatch ? 'border-bottom:1px solid var(--border-light);' : ''}
        ${i === top.length - 1 && !hasExactMatch ? 'border-bottom:none;' : ''}
      " onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
        <span>${s.emoji || '👤'}</span>
        <span style="flex:1;">${this._highlight(s.name, queryLower)}</span>
      </div>
    `).join('');

    if (queryLower && !hasExactMatch) {
      html += `
        <div class="msi-suggestion-add" style="
          padding:12px 16px; cursor:pointer; font-size:14px;
          color:var(--primary); font-weight:700; background:var(--primary-bg-light);
        " onmouseover="this.style.background='var(--primary-bg)'" onmouseout="this.style.background='var(--primary-bg-light)'">
          ✨ Add New: "${query.trim()}"
        </div>
      `;
    }

    if (!html) { this._hideSuggestions(); return; }

    this.dropdown.innerHTML = html;
    this.dropdown.style.display = 'block';

    this.dropdown.querySelectorAll('.msi-suggestion-item').forEach(el => {
      el.onmousedown = (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        const item = this.suggestions.find(s => s.id === id);
        if (item) this.add(item);
      };
    });

    const addBtn = this.dropdown.querySelector('.msi-suggestion-add');
    if (addBtn) {
      addBtn.onmousedown = (e) => {
        e.preventDefault();
        const name = query.trim();
        this._hideSuggestions();
        this.input.value = '';
        this.inputValue = '';
        this.onAdd(name);
      };
    }
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

  add(item) {
    if (this.selected.find(s => s.id === item.id)) return;
    this.selected.push(item);
    this.input.value = '';
    this.inputValue = '';
    this._renderTags();
    this.onSelect(item);
    this.onChange(this.selected);
    this._hideSuggestions();
  }

  removeById(id) {
    const item = this.selected.find(s => s.id === id);
    this.selected = this.selected.filter(s => s.id !== id);
    this._renderTags();
    if (item) this.onRemove(item);
    this.onChange(this.selected);
  }

  getSelectedIds() {
    return this.selected.map(s => s.id);
  }

  setSelected(newList) {
    this.selected = [...newList];
    this._renderTags();
  }
  
  updateSuggestions(newList) {
    this.suggestions = newList;
  }
}
