(function () {
  'use strict';
  const C = FMSCore, KEY = 'fms.v1', $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I18N = { hi: { dash: 'डैशबोर्ड', fields: 'खेत', cycles: 'फसल चक्र', activities: 'गतिविधियाँ', irrigation: 'सिंचाई', harvests: 'कटाई', sales: 'बिक्री', items: 'भंडार', invtx: 'स्टॉक', workers: 'श्रमिक', work: 'काम', expenses: 'खर्च', tasks: 'कार्य', settings: 'सेटिंग्स' } };
  let S = load(), tab = 'dash', msgs = null;
  function load() { try { const j = localStorage.getItem(KEY); if (j) return C.migrate(JSON.parse(j)); } catch (e) { /* corrupt or unavailable: start fresh */ } return C.emptyState(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { toast('Could not save (storage full or blocked). Export a backup.'); return false; } }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 4000); }
  const u = () => S.settings.unit, tt = (k, d) => (I18N[S.settings.lang] || {})[k] || d;
  const num = v => (v == null ? '–' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  const money = v => (v == null ? '–' : '₹' + num(v));
  const area = ha => (ha == null ? '–' : num(C.fromHa(ha, u())) + ' ' + u());
  function label(t, r) {
    if (!r) return '–';
    if (t === 'cycles') return r.crop + ' (' + label('fields', C.get(S, 'fields', r.fieldId)) + ')';
    return r.name || r.title || r.id;
  }
  const tabs = () => [['dash', 'Dashboard']].concat(Object.keys(C.SCHEMA).map(k => [k, C.SCHEMA[k].t]), [['settings', 'Settings']]);

  function render() {
    $('#nav').innerHTML = tabs().map(([k, n]) => `<button data-t="${k}" aria-current="${k === tab}">${esc(tt(k, n))}</button>`).join('');
    const d = C.dashboard(S);
    $('#sync').textContent = d.pending ? '⚠ ' + d.pending + ' records waiting for sync (offline)' : '☁ All saved';
    $('#main').innerHTML = tab === 'dash' ? dashView(d) : tab === 'settings' ? settingsView() : listView(tab);
    if (tab === 'dash') weatherInit();
  }
  function dashView(d) {
    const st = (v, l, c) => `<div class="card stat"><b class="${c || ''}">${esc(v)}</b><span>${l}</span></div>`;
    const rows = S.data.cycles.map(c => { const k = C.kpis(S, c.id); return `<tr><td>${esc(label('cycles', c))}</td><td>${esc(c.stage)}</td><td>${area(k.areaHa)}</td><td>${money(k.cost)}</td><td>${money(k.revenue)}</td><td class="${k.profit < 0 ? 'neg' : 'pos'}">${money(k.profit)}</td><td>${num(k.yieldKg)} kg</td><td>${k.yieldPerHa == null ? '–' : num(C.fromHa(1, u()) * k.yieldPerHa)} kg/${u()}</td><td>${k.costPerKg == null ? '–' : money(k.costPerKg) + '/kg'}</td><td>${num(k.water)} L</td></tr>`; }).join('');
    return `<h2>${tt('dash', 'Dashboard')}</h2><div class="grid">${st(d.activeCrops, '🌱 Active crops')}${st(area(d.areaHa), 'Total area')}${st(money(d.cost), 'Total cost (expenses + labour)')}${st(money(d.revenue), 'Revenue')}${st(money(d.profit), 'Profit', d.profit < 0 ? 'neg' : 'pos')}${st(num(d.water) + ' L', '💧 Water used')}${st(d.stockItems, '📦 Stock items')}${st(d.openTasks + (d.overdue ? ' (' + d.overdue + ' overdue)' : ''), 'Open tasks', d.overdue ? 'neg' : '')}</div>
    <div class="card"><h3>Weather</h3><div id="wx" class="mut">Loading…</div><button class="s" id="wxbtn">Use my location</button></div>
    <div class="card"><h3>Crop profitability</h3>${rows ? `<div class="tw"><table><tr><th>Crop</th><th>Stage</th><th>Area</th><th>Cost</th><th>Revenue</th><th>Profit</th><th>Yield</th><th>Yield/area</th><th>Cost/kg</th><th>Water</th></tr>${rows}</table></div><p class="mut">Farm-wide expenses (no crop selected) are shared across active crops by area.</p>` : '<p class="mut">Add a field, then start a crop cycle.</p>'}</div>`;
  }
  function input(t, f) {
    const id = 'f_' + f.k, name = f.k === 'area' ? f.k + ' (' + u() + ')' : f.k, req = f.req ? ' required' : '';
    let el;
    if (f.type === 'select') el = `<select id="${id}" name="${f.k}"${req}>${f.req ? '<option value="">Select…</option>' : '<option value="">–</option>'}${f.opts.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'ref') el = `<select id="${id}" name="${f.k}"${req}><option value="">${f.req ? 'Select…' : (t === 'expenses' ? 'Entire farm (split by area)' : '–')}</option>${S.data[f.ref].map(r => `<option value="${r.id}">${esc(label(f.ref, r))}</option>`).join('')}</select>`;
    else el = `<input id="${id}" name="${f.k}" type="${f.type}"${f.type === 'number' ? ' step="any" inputmode="decimal"' : ''}${req}>`;
    return `<label for="${id}">${esc(name)}${f.req ? ' *' : ''}</label>${el}`;
  }
  function cell(f, r) {
    if (f.type === 'ref') return label(f.ref, C.get(S, f.ref, r[f.k]));
    if (f.k === 'area') return area(r.areaHa);
    return r[f.k] == null || r[f.k] === '' ? '–' : r[f.k];
  }
  function listView(t) {
    const sc = C.SCHEMA[t], cols = sc.f.map(f => `<th>${esc(f.k)}</th>`).join('');
    const extra = { work: ['total'], irrigation: ['hours'], items: ['stock'] }[t] || [];
    const rows = S.data[t].map(r => `<tr>${sc.f.map(f => `<td>${esc(cell(f, r))}</td>`).join('')}${extra.map(k => `<td>${esc(k === 'stock' ? C.balance(S, r.id) : r[k])}</td>`).join('')}<td><button class="d" data-del="${r.id}" aria-label="Delete">Delete</button></td></tr>`).join('');
    const hint = t === 'invtx' ? '<p class="mut">Adjustment quantity may be negative. Consumption and Sale cannot exceed stock.</p>' : t === 'work' ? '<p class="mut">Quantity = hours, days or tasks (matches worker wage type). Cost = quantity × rate.</p>' : t === 'irrigation' ? '<p class="mut">Volume in litres.</p>' : '';
    return `<h2>${esc(tt(t, sc.t))}</h2><form class="card" id="form" novalidate>${sc.f.map(f => input(t, f)).join('')}<div id="msgs" role="alert"></div><button class="p" type="submit">+ Add</button></form>${hint}
    <div class="card tw">${rows ? `<table><tr>${cols}${extra.map(k => `<th>${k}</th>`).join('')}<th></th></tr>${rows}</table>` : '<p class="mut">No records yet.</p>'}</div>`;
  }
  function settingsView() {
    return `<h2>Settings</h2><div class="card"><label for="su">Area unit</label><select id="su"><option value="acre"${u() === 'acre' ? ' selected' : ''}>Acre</option><option value="hectare"${u() === 'hectare' ? ' selected' : ''}>Hectare</option></select>
    <label for="sl">Language</label><select id="sl"><option value="en"${S.settings.lang === 'en' ? ' selected' : ''}>English</option><option value="hi"${S.settings.lang === 'hi' ? ' selected' : ''}>हिन्दी (menus)</option></select></div>
    <div class="card"><button class="p" id="exp">Export backup (JSON)</button><label for="imp">Import backup</label><input type="file" id="imp" accept="application/json"><button class="d" id="rst" style="margin-top:1rem">Erase all data</button><p class="mut">Data is stored only in this browser (offline-first). No server is configured, so records stay “pending sync”. Use export to back up.</p></div>`;
  }
  function submit(t, form) {
    const rec = {};
    for (const f of C.SCHEMA[t].f) { let v = form.elements[f.k].value; if (f.type === 'number') v = v === '' ? null : Number(v); else if (v === '') v = null; rec[f.k] = v; }
    const p = C.prepare(t, rec, S), r = C.validate(t, p, S);
    if (r.errors.length) { $('#msgs').innerHTML = r.errors.map(e => `<div class="err">✕ ${esc(e)}</div>`).join(''); return; }
    if (r.warnings.length && !confirm('Warning:\n' + r.warnings.join('\n') + '\n\nContinue anyway?')) return;
    C.add(S, t, p); if (save()) { toast('Saved'); render(); }
  }
  function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  // Weather: Open-Meteo; falls back to last cached result with timestamp
  function showWx(w, note) { $('#wx') && ($('#wx').innerHTML = `${esc(w.t)}°C · rain chance today ${esc(w.p)}% · wind ${esc(w.w)} km/h<br><span class="mut">${esc(note)} ${esc(new Date(w.at).toLocaleString())}. Weather info only, not an agronomic recommendation.${w.p >= 60 ? ' Rain likely – review scheduled irrigation.' : ''}</span>`); }
  function weatherInit() {
    let c = null; try { c = JSON.parse(localStorage.getItem('fms.wx')); } catch (e) { /* none */ }
    if (c) showWx(c, 'Last updated'); else $('#wx').textContent = 'No weather yet. Tap “Use my location” (needs internet once).';
  }
  function fetchWx() {
    if (!navigator.geolocation) return toast('Location not supported');
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,wind_speed_10m&daily=precipitation_probability_max&timezone=auto&forecast_days=1`);
        if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
        const w = { t: j.current.temperature_2m, w: j.current.wind_speed_10m, p: j.daily.precipitation_probability_max[0], at: Date.now() };
        try { localStorage.setItem('fms.wx', JSON.stringify(w)); } catch (e) { /* ignore */ } showWx(w, 'Updated');
      } catch (e) { toast('Weather unavailable – showing last saved data'); weatherInit(); }
    }, () => toast('Location permission denied'), { timeout: 10000 });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t) { tab = b.dataset.t; render(); }
    else if (b.dataset.del) { if (!confirm('Delete this record?')) return; const r = C.remove(S, tab, b.dataset.del); if (!r.ok) return toast(r.reason); save(); render(); }
    else if (b.id === 'exp') download('farm-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S, null, 2));
    else if (b.id === 'rst') { if (confirm('Erase ALL data? This cannot be undone.')) { S = C.emptyState(); save(); render(); } }
    else if (b.id === 'wxbtn') fetchWx();
  });
  document.addEventListener('submit', e => { if (e.target.id === 'form') { e.preventDefault(); submit(tab, e.target); } });
  document.addEventListener('change', e => {
    if (e.target.id === 'su') { S.settings.unit = e.target.value; save(); render(); }
    else if (e.target.id === 'sl') { S.settings.lang = e.target.value; save(); render(); }
    else if (e.target.id === 'imp' && e.target.files[0]) {
      const rd = new FileReader(); rd.onload = () => { try { const j = JSON.parse(rd.result); if (!j || typeof j !== 'object' || !j.data) throw new Error('bad'); S = C.migrate(j); save(); render(); toast('Backup imported'); } catch (x) { toast('Invalid backup file'); } }; rd.readAsText(e.target.files[0]);
    }
  });
  render();
})();
