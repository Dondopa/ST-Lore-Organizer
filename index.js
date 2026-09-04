import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { world_names, selected_world_info } from '../../../world-info.js';

const EXT = 'lore_organizer';
const VERSION = 1;

const defaults = {
    version: VERSION,
    groups: [],
    assignments: {},
    presets: {},
    collapsed: {},
};

const uiState = {
    bulkMode: false,
    bulkSelected: new Set(),
};

function settings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = structuredClone(defaults);
    const s = extension_settings[EXT];
    s.version ??= VERSION;
    s.groups ??= [];
    s.assignments ??= {};
    s.presets ??= {};
    s.collapsed ??= {};
    return s;
}

function uid() {
    return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll('-', '').slice(0, 12);
}

function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function save() { saveSettingsDebounced(); }
function activeSet() { return new Set(selected_world_info ?? []); }
function books() { return Array.isArray(world_names) ? [...world_names].sort((a,b)=>a.localeCompare(b)) : []; }
function groupById(id) { return settings().groups.find(g => g.id === id); }
function children(parentId) { return settings().groups.filter(g => (g.parentId ?? null) === (parentId ?? null)).sort((a,b)=>a.name.localeCompare(b.name)); }
function assignedTo(groupId) { return books().filter(name => settings().assignments[name] === groupId); }
function ungrouped() { return books().filter(name => !groupById(settings().assignments[name])); }

function descendantGroupIds(groupId) {
    const out = [groupId];
    for (const c of children(groupId)) out.push(...descendantGroupIds(c.id));
    return out;
}

function booksInGroupTree(groupId) {
    const ids = new Set(descendantGroupIds(groupId));
    return books().filter(name => ids.has(settings().assignments[name]));
}

function directBooksInGroup(groupId) {
    return assignedTo(groupId);
}

function setBulkSelection(names, selected) {
    for (const name of names) {
        if (selected) uiState.bulkSelected.add(name);
        else uiState.bulkSelected.delete(name);
    }
}

function bulkSelectionButton(groupId) {
    if (!uiState.bulkMode) return '';
    const direct = directBooksInGroup(groupId);
    if (!direct.length) return '<button class="menu_button lo-group-selectall" disabled title="No lorebooks directly in this group">Select All</button>';
    const allSelected = direct.every(name => uiState.bulkSelected.has(name));
    return `<button class="menu_button lo-group-selectall" data-group="${esc(groupId)}" data-action="${allSelected ? 'clear' : 'select'}" title="${allSelected ? 'Deselect' : 'Select'} all lorebooks directly in this group">${allSelected ? 'Deselect All' : 'Select All'}</button>`;
}

function applyNativeGlobalSelection(targetNames) {
    const valid = new Set(targetNames.filter(name => books().includes(name)));
    const indices = books()
        .map(name => ({ name, index: world_names.indexOf(name) }))
        .filter(({ name, index }) => valid.has(name) && index >= 0)
        .map(({ index }) => String(index));

    const selector = $('#world_info');
    selector.val(indices.length ? indices : null).trigger('change');
}

async function setBookActive(name, enabled) {
    const target = activeSet();
    if (enabled) target.add(name);
    else target.delete(name);
    applyNativeGlobalSelection([...target]);
}

async function setMany(names, enabled) {
    const target = activeSet();
    for (const name of names) {
        if (enabled) target.add(name);
        else target.delete(name);
    }
    applyNativeGlobalSelection([...target]);
    render();
}

async function replaceActive(targetNames) {
    applyNativeGlobalSelection(targetNames);
    render();
}

function groupPath(id) {
    const parts = [];
    let cur = groupById(id);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
        seen.add(cur.id); parts.unshift(cur.name); cur = groupById(cur.parentId);
    }
    return parts.join(' / ');
}

function groupOptions(selected = '', includeUngrouped = true) {
    const options = includeUngrouped ? ['<option value="">Ungrouped</option>'] : ['<option value="" disabled selected>Move selected to…</option>'];
    return [...options, ...settings().groups
        .slice().sort((a,b)=>groupPath(a.id).localeCompare(groupPath(b.id)))
        .map(g => `<option value="${esc(g.id)}" ${includeUngrouped && g.id===selected?'selected':''}>${esc(groupPath(g.id))}</option>`)].join('');
}

function renderBook(name) {
    const active = activeSet().has(name);
    const gid = settings().assignments[name] ?? '';
    const bulkChecked = uiState.bulkSelected.has(name);
    return `<div class="lo-book" draggable="${uiState.bulkMode ? 'false' : 'true'}" data-book="${esc(name)}">
        ${uiState.bulkMode ? `<label class="lo-bulk-pick" title="Select for bulk move"><input class="lo-bulk-checkbox" type="checkbox" data-book="${esc(name)}" ${bulkChecked?'checked':''}></label>` : ''}
        <label class="lo-book-main"><input class="lo-book-toggle" type="checkbox" data-book="${esc(name)}" ${active?'checked':''}><span title="${esc(name)}">${esc(name)}</span></label>
        ${uiState.bulkMode ? '' : `<select class="lo-move" data-book="${esc(name)}" title="Move to group">${groupOptions(gid)}</select>`}
    </div>`;
}

function renderGroup(g, depth=0, query='') {
    const s = settings();
    const isCollapsed = !!s.collapsed[g.id];
    const direct = assignedTo(g.id).filter(n => !query || n.toLowerCase().includes(query));
    const kids = children(g.id);
    const allTreeBooks = booksInGroupTree(g.id);
    const activeCount = allTreeBooks.filter(n=>activeSet().has(n)).length;
    const matchesDesc = kids.some(k => groupMatches(k, query));
    const nameMatches = !query || g.name.toLowerCase().includes(query);
    if (query && !nameMatches && !direct.length && !matchesDesc) return '';
    const bodyHidden = isCollapsed && !query;
    return `<section class="lo-group" data-group="${esc(g.id)}" style="--depth:${depth}">
        <div class="lo-group-head" data-drop-group="${esc(g.id)}">
            <div class="lo-group-title-row">
                <button class="menu_button lo-collapse" data-group="${esc(g.id)}" title="Collapse/expand">${bodyHidden?'▶':'▼'}</button>
                <strong title="${esc(groupPath(g.id))}">${esc(g.name)}</strong>
                <span class="lo-count">${activeCount}/${allTreeBooks.length}</span>
            </div>
            <div class="lo-group-actions">
                ${bulkSelectionButton(g.id)}
                <button class="menu_button lo-group-on" data-group="${esc(g.id)}" title="Enable this group and descendants">On</button>
                <button class="menu_button lo-group-off" data-group="${esc(g.id)}" title="Disable this group and descendants">Off</button>
                <button class="menu_button lo-add-child" data-group="${esc(g.id)}" title="Add subgroup">＋</button>
                <button class="menu_button lo-rename-group" data-group="${esc(g.id)}" title="Rename">✎</button>
                <button class="menu_button lo-delete-group" data-group="${esc(g.id)}" title="Delete group">×</button>
            </div>
        </div>
        <div class="lo-group-body ${bodyHidden?'lo-hidden':''}">
            ${direct.map(renderBook).join('')}
            ${kids.map(k=>renderGroup(k, depth+1, query)).join('')}
        </div>
    </section>`;
}

function groupMatches(g, query) {
    if (!query) return true;
    if (g.name.toLowerCase().includes(query)) return true;
    if (assignedTo(g.id).some(n=>n.toLowerCase().includes(query))) return true;
    return children(g.id).some(k=>groupMatches(k, query));
}

function renderPresets() {
    const names = Object.keys(settings().presets).sort((a,b)=>a.localeCompare(b));
    return `<div class="lo-presets">
      <div class="lo-row"><select id="lo_preset_select"><option value="">— Presets —</option>${names.map(n=>`<option>${esc(n)}</option>`).join('')}</select>
      <button id="lo_apply_preset" class="menu_button">Apply</button><button id="lo_save_preset" class="menu_button">Save current</button><button id="lo_delete_preset" class="menu_button">Delete</button></div>
    </div>`;
}

function visibleBookNames() {
    return [...document.querySelectorAll('#lo_tree .lo-book')].map(el => el.dataset.book).filter(Boolean);
}

function renderBulkBar() {
    const wrap = document.querySelector('#lo_bulk_wrap');
    if (!wrap) return;
    if (!uiState.bulkMode) {
        wrap.innerHTML = `<button id="lo_bulk_enter" class="menu_button">☑ Bulk Select</button>`;
        document.querySelector('#lo_bulk_enter')?.addEventListener('click', () => {
            uiState.bulkMode = true;
            uiState.bulkSelected.clear();
            render();
        });
        return;
    }

    wrap.innerHTML = `<div class="lo-bulkbar">
        <span class="lo-bulk-count">Selected: ${uiState.bulkSelected.size}</span>
        <button id="lo_bulk_select_visible" class="menu_button" title="Select all lorebooks currently shown by search/filter">Select visible</button>
        <button id="lo_bulk_clear" class="menu_button">Clear</button>
        <select id="lo_bulk_group" title="Destination group">${groupOptions('', false)}<option value="__UNGROUPED__">Ungrouped</option></select>
        <button id="lo_bulk_move" class="menu_button" ${uiState.bulkSelected.size ? '' : 'disabled'}>Move</button>
        <button id="lo_bulk_exit" class="menu_button">Done</button>
    </div>`;

    document.querySelector('#lo_bulk_select_visible')?.addEventListener('click', () => {
        for (const name of visibleBookNames()) uiState.bulkSelected.add(name);
        render();
    });
    document.querySelector('#lo_bulk_clear')?.addEventListener('click', () => {
        uiState.bulkSelected.clear();
        render();
    });
    document.querySelector('#lo_bulk_move')?.addEventListener('click', () => {
        const select = document.querySelector('#lo_bulk_group');
        const dest = select?.value;
        if (!dest || !uiState.bulkSelected.size) return;
        for (const name of uiState.bulkSelected) {
            if (!books().includes(name)) continue;
            if (dest === '__UNGROUPED__') delete settings().assignments[name];
            else if (groupById(dest)) settings().assignments[name] = dest;
        }
        save();
        uiState.bulkSelected.clear();
        render();
    });
    document.querySelector('#lo_bulk_exit')?.addEventListener('click', () => {
        uiState.bulkMode = false;
        uiState.bulkSelected.clear();
        render();
    });
}

function render() {
    const root = document.querySelector('#lo_tree');
    if (!root) return;
    const query = String(document.querySelector('#lo_search')?.value ?? '').trim().toLowerCase();
    const roots = children(null);
    const loose = ungrouped().filter(n=>!query || n.toLowerCase().includes(query));
    root.innerHTML = `${roots.map(g=>renderGroup(g,0,query)).join('')}
      <section class="lo-group lo-ungrouped"><div class="lo-group-head" data-drop-group=""><strong>Ungrouped</strong><span class="lo-count">${loose.length}</span>${uiState.bulkMode ? `<button class="menu_button lo-ungrouped-selectall" data-action="${ungrouped().length && ungrouped().every(name => uiState.bulkSelected.has(name)) ? 'clear' : 'select'}" ${ungrouped().length ? '' : 'disabled'} title="Select or deselect all ungrouped lorebooks">${ungrouped().length && ungrouped().every(name => uiState.bulkSelected.has(name)) ? 'Deselect All' : 'Select All'}</button>` : ''}</div>
      <div class="lo-group-body">${loose.map(renderBook).join('')}</div></section>`;
    const presetWrap = document.querySelector('#lo_presets_wrap');
    if (presetWrap) presetWrap.innerHTML = renderPresets();
    renderBulkBar();
    bindDynamic();
}

function promptName(message, initial='') {
    const v = window.prompt(message, initial);
    return v == null ? null : v.trim();
}

function addGroup(parentId=null) {
    const name = promptName(parentId ? 'Subgroup name:' : 'Group name:');
    if (!name) return;
    settings().groups.push({ id: uid(), name, parentId }); save(); render();
}

function deleteGroup(id) {
    const g = groupById(id); if (!g) return;
    if (!window.confirm(`Delete group “${g.name}”? Lorebooks will become ungrouped. Subgroups will also be removed.`)) return;
    const ids = new Set(descendantGroupIds(id));
    settings().groups = settings().groups.filter(x=>!ids.has(x.id));
    for (const [book,gid] of Object.entries(settings().assignments)) if (ids.has(gid)) delete settings().assignments[book];
    save(); render();
}

function bindDynamic() {
    document.querySelectorAll('.lo-book-toggle').forEach(el=>el.addEventListener('change', e=>setBookActive(e.currentTarget.dataset.book, e.currentTarget.checked)));
    document.querySelectorAll('.lo-bulk-checkbox').forEach(el=>el.addEventListener('change', e=>{
        const name = e.currentTarget.dataset.book;
        if (e.currentTarget.checked) uiState.bulkSelected.add(name);
        else uiState.bulkSelected.delete(name);
        renderBulkBar();
    }));
    document.querySelectorAll('.lo-group-selectall').forEach(el=>el.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.group;
        if (!id) return;
        setBulkSelection(directBooksInGroup(id), e.currentTarget.dataset.action !== 'clear');
        render();
    }));
    document.querySelectorAll('.lo-ungrouped-selectall').forEach(el=>el.addEventListener('click', e=>{
        setBulkSelection(ungrouped(), e.currentTarget.dataset.action !== 'clear');
        render();
    }));
    document.querySelectorAll('.lo-move').forEach(el=>el.addEventListener('change', e=>{ const b=e.currentTarget.dataset.book, v=e.currentTarget.value; if(v)settings().assignments[b]=v; else delete settings().assignments[b]; save(); render(); }));
    document.querySelectorAll('.lo-collapse').forEach(el=>el.addEventListener('click', e=>{ const id=e.currentTarget.dataset.group; settings().collapsed[id]=!settings().collapsed[id]; save(); render(); }));
    document.querySelectorAll('.lo-group-on').forEach(el=>el.addEventListener('click', e=>setMany(booksInGroupTree(e.currentTarget.dataset.group), true)));
    document.querySelectorAll('.lo-group-off').forEach(el=>el.addEventListener('click', e=>setMany(booksInGroupTree(e.currentTarget.dataset.group), false)));
    document.querySelectorAll('.lo-add-child').forEach(el=>el.addEventListener('click', e=>addGroup(e.currentTarget.dataset.group)));
    document.querySelectorAll('.lo-rename-group').forEach(el=>el.addEventListener('click', e=>{ const g=groupById(e.currentTarget.dataset.group); const n=promptName('Rename group:', g?.name??''); if(n&&g){g.name=n;save();render();} }));
    document.querySelectorAll('.lo-delete-group').forEach(el=>el.addEventListener('click', e=>deleteGroup(e.currentTarget.dataset.group)));
    if (!uiState.bulkMode) {
        document.querySelectorAll('.lo-book').forEach(el=>el.addEventListener('dragstart', e=>e.dataTransfer.setData('text/lorebook', e.currentTarget.dataset.book)));
        document.querySelectorAll('[data-drop-group]').forEach(el=>{ el.addEventListener('dragover', e=>{e.preventDefault();e.currentTarget.classList.add('lo-drop');}); el.addEventListener('dragleave', e=>e.currentTarget.classList.remove('lo-drop')); el.addEventListener('drop', e=>{e.preventDefault();e.currentTarget.classList.remove('lo-drop');const b=e.dataTransfer.getData('text/lorebook');const gid=e.currentTarget.dataset.dropGroup;if(!b)return;if(gid)settings().assignments[b]=gid;else delete settings().assignments[b];save();render();}); });
    }
    document.querySelector('#lo_apply_preset')?.addEventListener('click', ()=>{ const n=document.querySelector('#lo_preset_select')?.value; if(n) replaceActive(settings().presets[n]??[]); });
    document.querySelector('#lo_save_preset')?.addEventListener('click', ()=>{ const n=promptName('Preset name:'); if(!n)return; settings().presets[n]=[...(selected_world_info??[])]; save(); render(); });
    document.querySelector('#lo_delete_preset')?.addEventListener('click', ()=>{ const n=document.querySelector('#lo_preset_select')?.value; if(!n)return; if(window.confirm(`Delete preset “${n}”?`)){delete settings().presets[n];save();render();} });
}

function buildUI() {
    if (document.querySelector('#lo_panel')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'lo_panel';
    wrapper.className = 'extension_container';
    wrapper.innerHTML = `<div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>📚 Lore Organizer</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
        <div class="lo-toolbar"><input id="lo_search" class="text_pole" placeholder="Search lorebooks or groups…"><button id="lo_add_root" class="menu_button">+ Group</button><button id="lo_refresh" class="menu_button">↻</button></div>
        <div id="lo_presets_wrap"></div>
        <div id="lo_bulk_wrap"></div>
        <div class="lo-note">Folders are organization only. Checkboxes control SillyTavern's native global lorebook selection.</div>
        <div id="lo_tree"></div>
      </div></div>`;
    const host = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings') ?? document.querySelector('#extension_settings');
    (host ?? document.body).appendChild(wrapper);
    document.querySelector('#lo_search')?.addEventListener('input', render);
    document.querySelector('#lo_add_root')?.addEventListener('click', ()=>addGroup(null));
    document.querySelector('#lo_refresh')?.addEventListener('click', render);
    render();
}

jQuery(async () => {
    settings();
    buildUI();
    if (eventSource && event_types?.WORLDINFO_SETTINGS_UPDATED) eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, render);
    setTimeout(render, 500);
});
