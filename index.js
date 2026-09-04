import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { world_names, selected_world_info } from '../../../world-info.js';

const EXT = 'lore_organizer';
const VERSION = 2;
const UNGROUPED_COLLAPSE_KEY = '__ungrouped__';

const defaults = {
    version: VERSION,
    groups: [],
    placements: {},
    presets: {},
    collapsed: {},
    dependencies: {},
    autoDependencies: true,
};

const uiState = {
    bulkMode: false,
    bulkSelected: new Set(),
};

function settings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = structuredClone(defaults);
    const s = extension_settings[EXT];
    let migrated = false;

    // v1 -> v2 migration: one assignment becomes one placement.
    if (!s.placements) {
        migrated = true;
        s.placements = {};
        for (const [book, gid] of Object.entries(s.assignments ?? {})) {
            if (gid) s.placements[book] = [gid];
        }
    }

    s.version = VERSION;
    s.groups ??= [];
    s.placements ??= {};
    s.presets ??= {};
    s.collapsed ??= {};
    s.dependencies ??= {};
    s.autoDependencies ??= true;

    // Keep legacy field from driving state after migration.
    if ('assignments' in s) { delete s.assignments; migrated = true; }

    // New installs / upgraded organized libraries start with the huge loose list tucked away.
    if (!(UNGROUPED_COLLAPSE_KEY in s.collapsed) && s.groups.length) { s.collapsed[UNGROUPED_COLLAPSE_KEY] = true; migrated = true; }
    if (migrated) saveSettingsDebounced();
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
function bookExists(name) { return books().includes(name); }
function groupById(id) { return settings().groups.find(g => g.id === id); }
function children(parentId) { return settings().groups.filter(g => (g.parentId ?? null) === (parentId ?? null)).sort((a,b)=>a.name.localeCompare(b.name)); }

function validPlacements(name) {
    const list = Array.isArray(settings().placements[name]) ? settings().placements[name] : [];
    return [...new Set(list)].filter(id => groupById(id));
}

function setPlacements(name, ids) {
    const clean = [...new Set(ids)].filter(id => groupById(id));
    if (clean.length) settings().placements[name] = clean;
    else delete settings().placements[name];
}

function assignedTo(groupId) { return books().filter(name => validPlacements(name).includes(groupId)); }
function ungrouped() { return books().filter(name => validPlacements(name).length === 0); }

function descendantGroupIds(groupId) {
    const out = [groupId];
    for (const c of children(groupId)) out.push(...descendantGroupIds(c.id));
    return out;
}

function booksInGroupTree(groupId) {
    const ids = new Set(descendantGroupIds(groupId));
    return books().filter(name => validPlacements(name).some(id => ids.has(id)));
}

function directBooksInGroup(groupId) { return assignedTo(groupId); }

function dependencyClosure(seedNames) {
    const out = new Set(seedNames.filter(bookExists));
    if (!settings().autoDependencies) return out;
    const queue = [...out];
    while (queue.length) {
        const current = queue.shift();
        for (const dep of settings().dependencies[current] ?? []) {
            if (!bookExists(dep) || out.has(dep)) continue;
            out.add(dep);
            queue.push(dep);
        }
    }
    return out;
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
    const valid = new Set(targetNames.filter(bookExists));
    const indices = books()
        .map(name => ({ name, index: world_names.indexOf(name) }))
        .filter(({ name, index }) => valid.has(name) && index >= 0)
        .map(({ index }) => String(index));

    const selector = $('#world_info');
    selector.val(indices.length ? indices : null).trigger('change');
}

async function setBookActive(name, enabled) {
    const target = activeSet();
    if (enabled) {
        for (const n of dependencyClosure([name])) target.add(n);
    } else {
        target.delete(name); // Dependencies remain active; another book may need them.
    }
    applyNativeGlobalSelection([...target]);
}

async function setMany(names, enabled) {
    const target = activeSet();
    if (enabled) {
        for (const n of dependencyClosure(names)) target.add(n);
    } else {
        for (const name of names) target.delete(name);
    }
    applyNativeGlobalSelection([...target]);
    render();
}

async function replaceActive(targetNames, includeDependencies=false) {
    const target = includeDependencies ? [...dependencyClosure(targetNames)] : targetNames;
    applyNativeGlobalSelection(target);
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

function groupOptions(selected = '', includeUngrouped = true, excludeIds = new Set()) {
    const options = includeUngrouped ? ['<option value="">Ungrouped</option>'] : ['<option value="" disabled selected>Choose group…</option>'];
    return [...options, ...settings().groups
        .filter(g => !excludeIds.has(g.id))
        .slice().sort((a,b)=>groupPath(a.id).localeCompare(groupPath(b.id)))
        .map(g => `<option value="${esc(g.id)}" ${includeUngrouped && g.id===selected?'selected':''}>${esc(groupPath(g.id))}</option>`)].join('');
}

function renderBook(name) {
    const active = activeSet().has(name);
    const placements = validPlacements(name);
    const gid = placements[0] ?? '';
    const bulkChecked = uiState.bulkSelected.has(name);
    const aliasCount = Math.max(0, placements.length - 1);
    const depCount = (settings().dependencies[name] ?? []).filter(bookExists).length;
    return `<div class="lo-book" draggable="${uiState.bulkMode ? 'false' : 'true'}" data-book="${esc(name)}">
        ${uiState.bulkMode ? `<label class="lo-bulk-pick" title="Select for bulk move"><input class="lo-bulk-checkbox" type="checkbox" data-book="${esc(name)}" ${bulkChecked?'checked':''}></label>` : ''}
        <label class="lo-book-main"><input class="lo-book-toggle" type="checkbox" data-book="${esc(name)}" ${active?'checked':''}><span title="${esc(name)}">${esc(name)}</span>${aliasCount ? `<span class="lo-badge" title="Also appears in ${aliasCount} other group(s)">+${aliasCount}</span>` : ''}${depCount ? `<span class="lo-badge" title="${depCount} activation dependency/dependencies">⇢${depCount}</span>` : ''}</label>
        ${uiState.bulkMode ? '' : `<div class="lo-book-tools"><select class="lo-move" data-book="${esc(name)}" title="Move to group (replaces current placements)">${groupOptions(gid)}</select><button class="menu_button lo-manage-book" data-book="${esc(name)}" title="Aliases and dependencies">⋯</button></div>`}
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
        <div class="lo-group-head" data-drop-group="${esc(g.id)}" draggable="${uiState.bulkMode ? 'false' : 'true'}">
            <div class="lo-group-title-row">
                <button class="menu_button lo-collapse" data-group="${esc(g.id)}" title="Collapse/expand">${bodyHidden?'▶':'▼'}</button>
                <strong title="${esc(groupPath(g.id))}">${esc(g.name)}</strong>
                <span class="lo-count">${activeCount} active • ${allTreeBooks.length} books</span>
            </div>
            <div class="lo-group-actions">
                ${bulkSelectionButton(g.id)}
                <button class="menu_button lo-group-on" data-group="${esc(g.id)}" title="Enable this group, descendants, and dependencies">On</button>
                <button class="menu_button lo-group-off" data-group="${esc(g.id)}" title="Disable this group and descendants">Off</button>
                <button class="menu_button lo-group-only" data-group="${esc(g.id)}" title="Make this group (plus dependencies) the only active Global Lore set">Only</button>
                <button class="menu_button lo-add-child" data-group="${esc(g.id)}" title="Add subgroup">＋</button>
                <button class="menu_button lo-move-group" data-group="${esc(g.id)}" title="Move/reparent group">↪</button>
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
    return [...new Set([...document.querySelectorAll('#lo_tree .lo-book')].map(el => el.dataset.book).filter(Boolean))];
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
        <button id="lo_bulk_select_active" class="menu_button">Active</button>
        <button id="lo_bulk_select_inactive" class="menu_button">Inactive</button>
        <button id="lo_bulk_invert" class="menu_button">Invert</button>
        <button id="lo_bulk_clear" class="menu_button">Clear</button>
        <select id="lo_bulk_group" title="Destination group">${groupOptions('', false)}<option value="__UNGROUPED__">Ungrouped</option></select>
        <button id="lo_bulk_move" class="menu_button" ${uiState.bulkSelected.size ? '' : 'disabled'}>Move</button>
        <button id="lo_bulk_alias" class="menu_button" ${uiState.bulkSelected.size ? '' : 'disabled'} title="Add destination as an additional placement without removing existing groups">Alias</button>
        <button id="lo_bulk_exit" class="menu_button">Done</button>
    </div>`;

    document.querySelector('#lo_bulk_select_visible')?.addEventListener('click', () => {
        setBulkSelection(visibleBookNames(), true); render();
    });
    document.querySelector('#lo_bulk_select_active')?.addEventListener('click', () => {
        const active = activeSet(); setBulkSelection(visibleBookNames().filter(n=>active.has(n)), true); render();
    });
    document.querySelector('#lo_bulk_select_inactive')?.addEventListener('click', () => {
        const active = activeSet(); setBulkSelection(visibleBookNames().filter(n=>!active.has(n)), true); render();
    });
    document.querySelector('#lo_bulk_invert')?.addEventListener('click', () => {
        for (const name of visibleBookNames()) {
            if (uiState.bulkSelected.has(name)) uiState.bulkSelected.delete(name); else uiState.bulkSelected.add(name);
        }
        render();
    });
    document.querySelector('#lo_bulk_clear')?.addEventListener('click', () => { uiState.bulkSelected.clear(); render(); });
    document.querySelector('#lo_bulk_move')?.addEventListener('click', () => bulkPlace(false));
    document.querySelector('#lo_bulk_alias')?.addEventListener('click', () => bulkPlace(true));
    document.querySelector('#lo_bulk_exit')?.addEventListener('click', () => {
        uiState.bulkMode = false; uiState.bulkSelected.clear(); render();
    });
}

function bulkPlace(asAlias) {
    const dest = document.querySelector('#lo_bulk_group')?.value;
    if (!dest || !uiState.bulkSelected.size) return;
    if (dest === '__UNGROUPED__' && asAlias) return;
    for (const name of uiState.bulkSelected) {
        if (!bookExists(name)) continue;
        if (dest === '__UNGROUPED__') setPlacements(name, []);
        else if (groupById(dest)) setPlacements(name, asAlias ? [...validPlacements(name), dest] : [dest]);
    }
    save(); uiState.bulkSelected.clear(); render();
}

function orphanInfo() {
    const existing = new Set(books());
    const missingPlacementBooks = Object.keys(settings().placements).filter(b => !existing.has(b));
    const missingDepSources = Object.keys(settings().dependencies).filter(b => !existing.has(b));
    let missingDepTargets = 0;
    for (const deps of Object.values(settings().dependencies)) missingDepTargets += (deps ?? []).filter(d => !existing.has(d)).length;
    return { missingPlacementBooks, missingDepSources, missingDepTargets, total: missingPlacementBooks.length + missingDepSources.length + missingDepTargets };
}

function renderOrphans() {
    const info = orphanInfo();
    if (!info.total) return '';
    return `<div class="lo-warning">⚠ ${info.total} missing/orphaned organizer reference${info.total===1?'':'s'} <button id="lo_cleanup_orphans" class="menu_button">Clean up</button></div>`;
}

function render() {
    const root = document.querySelector('#lo_tree');
    if (!root) return;
    const query = String(document.querySelector('#lo_search')?.value ?? '').trim().toLowerCase();
    const roots = children(null);
    const looseAll = ungrouped();
    const loose = looseAll.filter(n=>!query || n.toLowerCase().includes(query));
    const looseCollapsed = !!settings().collapsed[UNGROUPED_COLLAPSE_KEY] && !query;
    root.innerHTML = `${renderOrphans()}${roots.map(g=>renderGroup(g,0,query)).join('')}
      <section class="lo-group lo-ungrouped"><div class="lo-group-head" data-drop-group="">
        <div class="lo-group-title-row"><button class="menu_button lo-collapse-ungrouped" title="Collapse/expand">${looseCollapsed?'▶':'▼'}</button><strong>Ungrouped</strong><span class="lo-count">${looseAll.length} books</span></div>
        ${uiState.bulkMode ? `<div class="lo-group-actions"><button class="menu_button lo-ungrouped-selectall" data-action="${looseAll.length && looseAll.every(name => uiState.bulkSelected.has(name)) ? 'clear' : 'select'}" ${looseAll.length ? '' : 'disabled'}>${looseAll.length && looseAll.every(name => uiState.bulkSelected.has(name)) ? 'Deselect All' : 'Select All'}</button></div>` : ''}
      </div><div class="lo-group-body ${looseCollapsed?'lo-hidden':''}">${loose.map(renderBook).join('')}</div></section>`;
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
    if (!window.confirm(`Delete group “${g.name}”? Its lorebook placements will be removed. Subgroups will also be removed.`)) return;
    const ids = new Set(descendantGroupIds(id));
    settings().groups = settings().groups.filter(x=>!ids.has(x.id));
    for (const book of Object.keys(settings().placements)) setPlacements(book, validPlacements(book).filter(gid=>!ids.has(gid)));
    for (const gid of ids) delete settings().collapsed[gid];
    save(); render();
}

function ensureModal() {
    let modal = document.querySelector('#lo_modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'lo_modal';
    modal.className = 'lo-modal lo-hidden';
    modal.innerHTML = `<div class="lo-modal-card"><div class="lo-modal-head"><strong id="lo_modal_title">Lore Organizer</strong><button id="lo_modal_close" class="menu_button">×</button></div><div id="lo_modal_body"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    modal.querySelector('#lo_modal_close')?.addEventListener('click', closeModal);
    return modal;
}

function openModal(title, html) {
    const modal = ensureModal();
    modal.querySelector('#lo_modal_title').textContent = title;
    modal.querySelector('#lo_modal_body').innerHTML = html;
    modal.classList.remove('lo-hidden');
    return modal;
}
function closeModal() { document.querySelector('#lo_modal')?.classList.add('lo-hidden'); }

function openMoveGroupDialog(id) {
    const g = groupById(id); if (!g) return;
    const blocked = new Set(descendantGroupIds(id));
    const currentParent = g.parentId ?? '';
    const options = [`<option value="" ${!currentParent?'selected':''}>— Root —</option>`, ...settings().groups
        .filter(x=>!blocked.has(x.id)).sort((a,b)=>groupPath(a.id).localeCompare(groupPath(b.id)))
        .map(x=>`<option value="${esc(x.id)}" ${x.id===currentParent?'selected':''}>${esc(groupPath(x.id))}</option>`)].join('');
    const modal = openModal(`Move group: ${g.name}`, `<p>Choose the new parent. Moving a group keeps all of its subgroups and lorebook placements.</p><select id="lo_group_parent_select" class="text_pole">${options}</select><div class="lo-modal-actions"><button id="lo_group_move_save" class="menu_button">Move group</button><button id="lo_group_move_cancel" class="menu_button">Cancel</button></div>`);
    modal.querySelector('#lo_group_move_save')?.addEventListener('click', ()=>{
        const parent = modal.querySelector('#lo_group_parent_select')?.value || null;
        g.parentId = parent; save(); closeModal(); render();
    });
    modal.querySelector('#lo_group_move_cancel')?.addEventListener('click', closeModal);
}

function openBookManager(name) {
    const placements = new Set(validPlacements(name));
    const deps = new Set((settings().dependencies[name] ?? []).filter(bookExists));
    const groupChecks = settings().groups.slice().sort((a,b)=>groupPath(a.id).localeCompare(groupPath(b.id))).map(g=>`<label class="lo-check-row"><input type="checkbox" class="lo-placement-check" value="${esc(g.id)}" ${placements.has(g.id)?'checked':''}><span>${esc(groupPath(g.id))}</span></label>`).join('') || '<em>No groups yet.</em>';
    const modal = openModal(`Manage: ${name}`, `<div class="lo-manager-section"><strong>Group placements / aliases</strong><p class="lo-help">Check multiple groups to make this lorebook appear in more than one place. It is still the same native lorebook.</p><div class="lo-check-list lo-placement-list">${groupChecks}</div></div>
      <div class="lo-manager-section"><strong>Activation dependencies</strong><p class="lo-help">When this lorebook is enabled, checked dependencies will also be enabled. Disabling it does not automatically disable dependencies.</p><input id="lo_dep_search" class="text_pole" placeholder="Filter lorebooks…"><div id="lo_dep_list" class="lo-check-list"></div></div>
      <div class="lo-modal-actions"><button id="lo_book_manage_save" class="menu_button">Save</button><button id="lo_book_manage_cancel" class="menu_button">Cancel</button></div>`);

    const depList = modal.querySelector('#lo_dep_list');
    const renderDeps = () => {
        const q = String(modal.querySelector('#lo_dep_search')?.value ?? '').toLowerCase();
        depList.innerHTML = books().filter(b=>b!==name && (!q || b.toLowerCase().includes(q))).map(b=>`<label class="lo-check-row"><input type="checkbox" class="lo-dep-check" value="${esc(b)}" ${deps.has(b)?'checked':''}><span>${esc(b)}</span></label>`).join('');
        depList.querySelectorAll('.lo-dep-check').forEach(el=>el.addEventListener('change', e=>{
            if (e.currentTarget.checked) deps.add(e.currentTarget.value); else deps.delete(e.currentTarget.value);
        }));
    };
    renderDeps();
    modal.querySelector('#lo_dep_search')?.addEventListener('input', renderDeps);
    modal.querySelector('#lo_book_manage_save')?.addEventListener('click', ()=>{
        const ids = [...modal.querySelectorAll('.lo-placement-check:checked')].map(x=>x.value);
        setPlacements(name, ids);
        const cleanDeps = [...deps].filter(bookExists).filter(x=>x!==name);
        if (cleanDeps.length) settings().dependencies[name] = cleanDeps; else delete settings().dependencies[name];
        save(); closeModal(); render();
    });
    modal.querySelector('#lo_book_manage_cancel')?.addEventListener('click', closeModal);
}

function exportOrganizer() {
    const payload = {
        format: 'ST-Lore-Organizer',
        exportVersion: 1,
        createdAt: new Date().toISOString(),
        data: structuredClone(settings()),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ST-Lore-Organizer-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importOrganizerFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result ?? ''));
            const data = parsed?.format === 'ST-Lore-Organizer' ? parsed.data : parsed;
            if (!data || !Array.isArray(data.groups)) throw new Error('Not a Lore Organizer backup.');
            if (!window.confirm('Replace current Lore Organizer groups, placements, presets, collapse state, and dependencies with this backup? Native lorebooks are not modified.')) return;
            extension_settings[EXT] = data;
            settings(); save(); render();
        } catch (err) {
            window.alert(`Could not import Lore Organizer backup: ${err?.message ?? err}`);
        }
    };
    reader.readAsText(file);
}

function cleanupOrphans() {
    const existing = new Set(books());
    for (const book of Object.keys(settings().placements)) {
        if (!existing.has(book)) delete settings().placements[book];
        else setPlacements(book, validPlacements(book));
    }
    for (const source of Object.keys(settings().dependencies)) {
        if (!existing.has(source)) { delete settings().dependencies[source]; continue; }
        const deps = (settings().dependencies[source] ?? []).filter(d=>existing.has(d) && d!==source);
        if (deps.length) settings().dependencies[source] = [...new Set(deps)]; else delete settings().dependencies[source];
    }
    save(); render();
}

function bindDynamic() {
    document.querySelectorAll('.lo-book-toggle').forEach(el=>el.addEventListener('change', e=>setBookActive(e.currentTarget.dataset.book, e.currentTarget.checked)));
    document.querySelectorAll('.lo-bulk-checkbox').forEach(el=>el.addEventListener('change', e=>{
        const name = e.currentTarget.dataset.book;
        if (e.currentTarget.checked) uiState.bulkSelected.add(name); else uiState.bulkSelected.delete(name);
        renderBulkBar();
    }));
    document.querySelectorAll('.lo-group-selectall').forEach(el=>el.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.group; if (!id) return;
        setBulkSelection(directBooksInGroup(id), e.currentTarget.dataset.action !== 'clear'); render();
    }));
    document.querySelectorAll('.lo-ungrouped-selectall').forEach(el=>el.addEventListener('click', e=>{ setBulkSelection(ungrouped(), e.currentTarget.dataset.action !== 'clear'); render(); }));
    document.querySelectorAll('.lo-move').forEach(el=>el.addEventListener('change', e=>{
        const b=e.currentTarget.dataset.book, v=e.currentTarget.value; setPlacements(b, v ? [v] : []); save(); render();
    }));
    document.querySelectorAll('.lo-manage-book').forEach(el=>el.addEventListener('click', e=>openBookManager(e.currentTarget.dataset.book)));
    document.querySelectorAll('.lo-collapse').forEach(el=>el.addEventListener('click', e=>{ const id=e.currentTarget.dataset.group; settings().collapsed[id]=!settings().collapsed[id]; save(); render(); }));
    document.querySelector('.lo-collapse-ungrouped')?.addEventListener('click', ()=>{ settings().collapsed[UNGROUPED_COLLAPSE_KEY]=!settings().collapsed[UNGROUPED_COLLAPSE_KEY]; save(); render(); });
    document.querySelectorAll('.lo-group-on').forEach(el=>el.addEventListener('click', e=>setMany(booksInGroupTree(e.currentTarget.dataset.group), true)));
    document.querySelectorAll('.lo-group-off').forEach(el=>el.addEventListener('click', e=>setMany(booksInGroupTree(e.currentTarget.dataset.group), false)));
    document.querySelectorAll('.lo-group-only').forEach(el=>el.addEventListener('click', e=>replaceActive(booksInGroupTree(e.currentTarget.dataset.group), true)));
    document.querySelectorAll('.lo-add-child').forEach(el=>el.addEventListener('click', e=>addGroup(e.currentTarget.dataset.group)));
    document.querySelectorAll('.lo-move-group').forEach(el=>el.addEventListener('click', e=>openMoveGroupDialog(e.currentTarget.dataset.group)));
    document.querySelectorAll('.lo-rename-group').forEach(el=>el.addEventListener('click', e=>{ const g=groupById(e.currentTarget.dataset.group); const n=promptName('Rename group:', g?.name??''); if(n&&g){g.name=n;save();render();} }));
    document.querySelectorAll('.lo-delete-group').forEach(el=>el.addEventListener('click', e=>deleteGroup(e.currentTarget.dataset.group)));
    document.querySelector('#lo_cleanup_orphans')?.addEventListener('click', cleanupOrphans);

    if (!uiState.bulkMode) {
        document.querySelectorAll('.lo-book').forEach(el=>el.addEventListener('dragstart', e=>{
            e.stopPropagation(); e.dataTransfer.setData('text/lorebook', e.currentTarget.dataset.book);
        }));
        document.querySelectorAll('.lo-group-head[draggable="true"]').forEach(el=>el.addEventListener('dragstart', e=>{
            if (e.target.closest('.menu_button, select, input')) { e.preventDefault(); return; }
            e.dataTransfer.setData('text/loregroup', e.currentTarget.closest('.lo-group')?.dataset.group ?? '');
        }));
        document.querySelectorAll('[data-drop-group]').forEach(el=>{
            el.addEventListener('dragover', e=>{e.preventDefault();e.currentTarget.classList.add('lo-drop');});
            el.addEventListener('dragleave', e=>e.currentTarget.classList.remove('lo-drop'));
            el.addEventListener('drop', e=>{
                e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('lo-drop');
                const book=e.dataTransfer.getData('text/lorebook'); const movingGroup=e.dataTransfer.getData('text/loregroup'); const target=e.currentTarget.dataset.dropGroup;
                if (book) { if(target)setPlacements(book,[target]);else setPlacements(book,[]); save(); render(); return; }
                if (movingGroup && target && movingGroup!==target) {
                    const blocked = new Set(descendantGroupIds(movingGroup));
                    if (!blocked.has(target)) { const g=groupById(movingGroup); if(g){g.parentId=target;save();render();} }
                }
            });
        });
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
        <div class="lo-toolbar"><input id="lo_search" class="text_pole" placeholder="Search lorebooks or groups…"><button id="lo_add_root" class="menu_button">+ Group</button><button id="lo_export" class="menu_button" title="Export organizer backup">Backup</button><button id="lo_import" class="menu_button" title="Import organizer backup">Restore</button><button id="lo_refresh" class="menu_button">↻</button><input id="lo_import_file" type="file" accept="application/json,.json" hidden></div>
        <div class="lo-settings-row"><label><input id="lo_auto_deps" type="checkbox" ${settings().autoDependencies?'checked':''}> Auto-activate dependencies</label></div>
        <div id="lo_presets_wrap"></div>
        <div id="lo_bulk_wrap"></div>
        <div class="lo-note">Groups and aliases are organization only. Checkboxes control SillyTavern's native Global Lore selection.</div>
        <div id="lo_tree"></div>
      </div></div>`;
    const host = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings') ?? document.querySelector('#extension_settings');
    (host ?? document.body).appendChild(wrapper);
    document.querySelector('#lo_search')?.addEventListener('input', render);
    document.querySelector('#lo_add_root')?.addEventListener('click', ()=>addGroup(null));
    document.querySelector('#lo_export')?.addEventListener('click', exportOrganizer);
    document.querySelector('#lo_import')?.addEventListener('click', ()=>document.querySelector('#lo_import_file')?.click());
    document.querySelector('#lo_import_file')?.addEventListener('change', e=>{ importOrganizerFile(e.currentTarget.files?.[0]); e.currentTarget.value=''; });
    document.querySelector('#lo_auto_deps')?.addEventListener('change', e=>{ settings().autoDependencies=e.currentTarget.checked; save(); });
    document.querySelector('#lo_refresh')?.addEventListener('click', render);
    render();
}

jQuery(async () => {
    settings();
    buildUI();
    if (eventSource && event_types?.WORLDINFO_SETTINGS_UPDATED) eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, render);
    setTimeout(render, 500);
});
