/* FMS core: pure business logic (no DOM). Base units: hectare, kg, litre, currency. */
(function (root) {
  const HA = 0.404686, r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const uid = p => p + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const toHa = (v, u) => (u === 'acre' ? v * HA : v), fromHa = (v, u) => (u === 'acre' ? v / HA : v);
  const f = (k, type, o) => Object.assign({ k, type }, o);
  const SEL = {
    act: ['Sowing', 'Transplanting', 'Irrigation', 'Fertilization', 'Spraying', 'Weeding', 'Pest Observation', 'Disease Observation', 'Pruning', 'Cultivation', 'Other'],
    exp: ['Seeds', 'Fertilizer', 'Pesticide', 'Labour', 'Machinery', 'Fuel', 'Electricity', 'Water', 'Irrigation', 'Transportation', 'Repairs', 'Maintenance', 'Land', 'Other'],
    inv: ['Seeds', 'Fertilizers', 'Pesticides', 'Animal Feed', 'Fuel', 'Spare Parts', 'Tools', 'Harvested Produce', 'Packaging', 'Other'],
    stage: ['Seed', 'Germination', 'Seedling', 'Vegetative Growth', 'Flowering', 'Grain/Fruit Development', 'Maturity', 'Harvest']
  };
  const SCHEMA = {
    fields: { t: 'Fields', f: [f('name', 'text', { req: 1 }), f('area', 'number', { req: 1, gt: 0, area: 1 }), f('notes', 'text')] },
    cycles: { t: 'Crop Cycles', f: [f('fieldId', 'ref', { ref: 'fields', req: 1 }), f('crop', 'text', { req: 1 }), f('variety', 'text'), f('sowing', 'date', { req: 1 }), f('expected', 'date'), f('area', 'number', { gt: 0, area: 1 }), f('stage', 'select', { opts: SEL.stage }), f('status', 'select', { opts: ['Active', 'Completed'] })] },
    activities: { t: 'Activities', f: [f('date', 'date', { req: 1 }), f('type', 'select', { req: 1, opts: SEL.act }), f('cycleId', 'ref', { ref: 'cycles' }), f('worker', 'text'), f('qty', 'number', { min: 0 }), f('unit', 'text'), f('notes', 'text')] },
    irrigation: { t: 'Irrigation', f: [f('cycleId', 'ref', { ref: 'cycles', req: 1 }), f('method', 'select', { opts: ['Flood', 'Drip', 'Sprinkler', 'Furrow', 'Rain', 'Other'] }), f('source', 'select', { opts: ['Borewell', 'River', 'Canal', 'Reservoir', 'Rainwater', 'Farm Pond', 'Municipal Supply', 'Other'] }), f('start', 'datetime-local', { req: 1 }), f('end', 'datetime-local', { req: 1 }), f('volume', 'number', { min: 0 })] },
    harvests: { t: 'Harvest', f: [f('cycleId', 'ref', { ref: 'cycles', req: 1 }), f('date', 'date', { req: 1 }), f('qty', 'number', { req: 1, min: 0 })] },
    sales: { t: 'Sales', f: [f('cycleId', 'ref', { ref: 'cycles', req: 1 }), f('date', 'date', { req: 1 }), f('qty', 'number', { req: 1, min: 0 }), f('price', 'number', { req: 1, min: 0 }), f('customer', 'text')] },
    items: { t: 'Inventory Items', f: [f('name', 'text', { req: 1 }), f('category', 'select', { opts: SEL.inv }), f('unit', 'text', { req: 1 })] },
    invtx: { t: 'Stock Movements', f: [f('itemId', 'ref', { ref: 'items', req: 1 }), f('date', 'date', { req: 1 }), f('type', 'select', { req: 1, opts: ['Purchase', 'Adjustment', 'Consumption', 'Return', 'Sale'] }), f('qty', 'number', { req: 1 })] },
    workers: { t: 'Workers', f: [f('name', 'text', { req: 1 }), f('wageType', 'select', { opts: ['Hourly', 'Daily', 'Task'] }), f('rate', 'number', { req: 1, min: 0 })] },
    work: { t: 'Work Records', f: [f('workerId', 'ref', { ref: 'workers', req: 1 }), f('date', 'date', { req: 1 }), f('cycleId', 'ref', { ref: 'cycles' }), f('qty', 'number', { req: 1, gt: 0 })] },
    expenses: { t: 'Expenses', f: [f('date', 'date', { req: 1 }), f('category', 'select', { req: 1, opts: SEL.exp }), f('amount', 'number', { req: 1, min: 0 }), f('cycleId', 'ref', { ref: 'cycles' }), f('vendor', 'text'), f('notes', 'text')] },
    tasks: { t: 'Tasks', f: [f('title', 'text', { req: 1 }), f('due', 'date'), f('priority', 'select', { opts: ['Low', 'Medium', 'High'] }), f('status', 'select', { opts: ['Pending', 'Scheduled', 'In Progress', 'Completed', 'Skipped', 'Cancelled'] }), f('cycleId', 'ref', { ref: 'cycles' })] }
  };
  const emptyState = () => ({ v: 1, settings: { unit: 'acre', lang: 'en', deviceId: uid('device') }, data: Object.fromEntries(Object.keys(SCHEMA).map(k => [k, []])), audit: [] });
  const migrate = s => { const e = emptyState(); s = s || {}; s.settings = Object.assign(e.settings, s.settings); s.data = Object.assign(e.data, s.data); s.audit = s.audit || []; s.v = 1; return s; };
  const get = (S, t, id) => S.data[t].find(r => r.id === id);
  const sum = (a, fn) => r2(a.reduce((x, y) => x + fn(y), 0));

  // proportional split in whole cents; remainder goes to the largest share so parts always sum to total
  function allocate(total, weights) {
    const W = weights.reduce((a, b) => a + b, 0);
    if (!(W > 0)) return weights.map(() => 0);
    const cents = Math.round(total * 100), parts = weights.map(w => Math.floor(cents * w / W));
    let rem = cents - parts.reduce((a, b) => a + b, 0), order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
    for (let i = 0; rem > 0; i = (i + 1) % order.length, rem--) parts[order[i]]++;
    return parts.map(c => c / 100);
  }
  function balance(S, itemId) {
    return r2(S.data.invtx.filter(t => t.itemId === itemId).reduce((b, t) => b + (['Purchase', 'Return', 'Adjustment'].includes(t.type) ? t.qty : -t.qty), 0));
  }
  function prepare(t, rec, S) { // convert display units -> base units, add derived values
    const r = Object.assign({}, rec), u = S.settings.unit;
    if (t === 'fields' && r.area != null) { r.areaHa = toHa(r.area, u); }
    if (t === 'cycles') {
      const fl = get(S, 'fields', r.fieldId);
      r.areaHa = r.area != null ? toHa(r.area, u) : fl ? fl.areaHa : null; r.stage = r.stage || 'Seed'; r.status = r.status || 'Active';
    }
    if (t === 'irrigation' && r.start && r.end) r.hours = r2((new Date(r.end) - new Date(r.start)) / 36e5);
    if (t === 'work') { const w = get(S, 'workers', r.workerId); r.total = w && r.qty > 0 ? r2(r.qty * w.rate) : 0; }
    if (t === 'invtx') r.qty = Number(r.qty);
    delete r.area; return r;
  }
  function validate(t, rec, S) {
    const errors = [], warnings = [];
    for (const d of SCHEMA[t].f) {
      const v = rec[d.k === 'area' ? 'areaHa' : d.k], has = v !== null && v !== undefined && v !== '';
      if (d.req && !has && !(d.k === 'area' && rec.areaHa != null)) { errors.push(d.k + ' is required'); continue; }
      if (!has) continue;
      if (d.type === 'number') {
        if (!Number.isFinite(v)) { errors.push(d.k + ' must be a number'); continue; }
        if (d.min != null && v < d.min) errors.push(d.k + ' must be >= ' + d.min);
        if (d.gt != null && v <= d.gt) errors.push(d.k + ' must be > ' + d.gt);
      }
      if (d.type === 'ref' && !get(S, d.ref, v)) errors.push(d.k + ' refers to a missing record');
      if (d.type === 'select' && !d.opts.includes(v)) errors.push(d.k + ' is not a valid option');
    }
    if (t === 'invtx' && Number.isFinite(rec.qty)) {
      if (rec.type !== 'Adjustment' && rec.qty <= 0) errors.push('qty must be > 0');
      if (['Consumption', 'Sale'].includes(rec.type) && rec.qty > balance(S, rec.itemId)) errors.push('Insufficient stock (available ' + balance(S, rec.itemId) + ')');
    }
    if (t === 'irrigation' && rec.start && rec.end && !(new Date(rec.end) > new Date(rec.start))) errors.push('End time must be after start time');
    const cy = get(S, 'cycles', rec.cycleId);
    if (t === 'harvests' && cy && rec.date && rec.date < cy.sowing) warnings.push('Harvest date is before sowing date');
    if (t === 'cycles' && rec.expected && rec.sowing && rec.expected < rec.sowing) warnings.push('Expected harvest is before sowing date');
    if (t === 'sales' && cy && Number.isFinite(rec.qty) && rec.qty > harvested(S, cy.id) - sold(S, cy.id)) warnings.push('Sale quantity exceeds unsold harvest');
    return { errors, warnings };
  }
  const harvested = (S, id) => sum(S.data.harvests.filter(h => h.cycleId === id), h => h.qty);
  const sold = (S, id) => sum(S.data.sales.filter(h => h.cycleId === id), h => h.qty);
  function add(S, t, rec) {
    const now = new Date().toISOString(), r = Object.assign({ id: uid(t.slice(0, 3)), deviceId: S.settings.deviceId, createdAt: now, updatedAt: now, deletedAt: null, version: 1, syncStatus: 'PENDING_SYNC' }, rec);
    S.data[t].push(r); S.audit.push({ at: now, entity: t, entityId: r.id, action: 'create', device: S.settings.deviceId }); return r;
  }
  const REFS = { fields: [['cycles', 'fieldId']], cycles: [['activities', 'cycleId'], ['irrigation', 'cycleId'], ['harvests', 'cycleId'], ['sales', 'cycleId'], ['work', 'cycleId'], ['expenses', 'cycleId'], ['tasks', 'cycleId']], items: [['invtx', 'itemId']], workers: [['work', 'workerId']] };
  function remove(S, t, id) {
    const used = (REFS[t] || []).filter(([c, k]) => S.data[c].some(r => r[k] === id)).map(x => x[0]);
    if (used.length) return { ok: false, reason: 'In use by: ' + used.join(', ') };
    S.data[t] = S.data[t].filter(r => r.id !== id); S.audit.push({ at: new Date().toISOString(), entity: t, entityId: id, action: 'delete', device: S.settings.deviceId }); return { ok: true };
  }
  // Farm-wide expenses (no cycle) are shared across ACTIVE cycles by area.
  function kpis(S, id) {
    const c = get(S, 'cycles', id), act = S.data.cycles.filter(x => x.status === 'Active'), idx = act.findIndex(x => x.id === id);
    const direct = sum(S.data.expenses.filter(e => e.cycleId === id), e => e.amount);
    const shared = idx < 0 ? 0 : r2(S.data.expenses.filter(e => !e.cycleId).reduce((a, e) => a + allocate(e.amount, act.map(x => x.areaHa || 0))[idx], 0));
    const labour = sum(S.data.work.filter(w => w.cycleId === id), w => w.total);
    const cost = r2(direct + shared + labour), revenue = sum(S.data.sales.filter(s => s.cycleId === id), s => s.qty * s.price), y = harvested(S, id);
    const ha = c.areaHa || 0, per = v => (ha > 0 ? r2(v / ha) : null);
    return { cost, revenue, profit: r2(revenue - cost), yieldKg: y, water: sum(S.data.irrigation.filter(i => i.cycleId === id), i => i.volume || 0), areaHa: ha, yieldPerHa: per(y), costPerHa: per(cost), profitPerHa: per(revenue - cost), costPerKg: y > 0 ? r2(cost / y) : null };
  }
  function dashboard(S) {
    const D = S.data, exp = sum(D.expenses, e => e.amount), lab = sum(D.work, w => w.total), rev = sum(D.sales, s => s.qty * s.price), today = new Date().toISOString().slice(0, 10);
    return { activeCrops: D.cycles.filter(c => c.status === 'Active').length, areaHa: sum(D.fields, x => x.areaHa), expenses: exp, labour: lab, cost: r2(exp + lab), revenue: rev, profit: r2(rev - exp - lab), water: sum(D.irrigation, i => i.volume || 0), stockItems: D.items.length, openTasks: D.tasks.filter(t => !['Completed', 'Skipped', 'Cancelled'].includes(t.status)).length, overdue: D.tasks.filter(t => t.due && t.due < today && !['Completed', 'Skipped', 'Cancelled'].includes(t.status)).length, pending: [].concat(...Object.values(D)).filter(r => r.syncStatus && r.syncStatus !== 'SYNCED').length };
  }
  const API = { HA, r2, uid, toHa, fromHa, SCHEMA, emptyState, migrate, get, allocate, balance, prepare, validate, add, remove, kpis, dashboard };
  if (typeof module !== 'undefined') module.exports = API; else root.FMSCore = API;
})(this);
