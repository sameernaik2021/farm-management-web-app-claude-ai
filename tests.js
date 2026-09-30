const assert = require('assert'), C = require('./core.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const mk = () => { const S = C.emptyState(); S.settings.unit = 'acre'; return S; };
const put = (S, type, rec) => { const p = C.prepare(type, rec, S), v = C.validate(type, p, S); assert.deepStrictEqual(v.errors, [], type + ' ' + v.errors); return C.add(S, type, p); };
t('allocation spec example', () => assert.deepStrictEqual(C.allocate(5000, [40, 35, 25]), [2000, 1750, 1250]));
t('allocation always sums to total', () => { const a = C.allocate(100, [1, 1, 1]); assert.strictEqual(C.r2(a.reduce((x, y) => x + y)), 100); assert.deepStrictEqual(C.allocate(10, [0, 0]), [0, 0]); });
t('unit conversion round-trips', () => assert.ok(Math.abs(C.fromHa(C.toHa(3, 'acre'), 'acre') - 3) < 1e-9));
t('inventory: 100 + 50 - 30 = 120; overspend blocked', () => {
  const S = mk(), it = put(S, 'items', { name: 'Urea', unit: 'kg' });
  put(S, 'invtx', { itemId: it.id, date: '2026-01-01', type: 'Purchase', qty: 150 }); put(S, 'invtx', { itemId: it.id, date: '2026-01-02', type: 'Consumption', qty: 30 });
  assert.strictEqual(C.balance(S, it.id), 120);
  const p = C.prepare('invtx', { itemId: it.id, date: '2026-01-03', type: 'Consumption', qty: 500 }, S);
  assert.ok(C.validate('invtx', p, S).errors.some(e => /Insufficient/.test(e)));
});
t('hard validation and warnings', () => {
  const S = mk(); assert.ok(C.validate('expenses', C.prepare('expenses', { date: '2026-01-01', category: 'Fuel', amount: -1 }, S), S).errors.length);
  assert.ok(C.validate('fields', C.prepare('fields', { name: 'A', area: 0 }, S), S).errors.length);
  assert.ok(C.validate('fields', C.prepare('fields', { name: '', area: 1 }, S), S).errors.length);
  const f = put(S, 'fields', { name: 'N', area: 3 }), c = put(S, 'cycles', { fieldId: f.id, crop: 'Rice', sowing: '2026-06-15' });
  const h = C.validate('harvests', C.prepare('harvests', { cycleId: c.id, date: '2026-05-01', qty: 5 }, S), S);
  assert.deepStrictEqual(h.errors, []); assert.strictEqual(h.warnings.length, 1);
  assert.ok(C.validate('irrigation', C.prepare('irrigation', { cycleId: c.id, start: '2026-09-30T08:00', end: '2026-09-30T06:00' }, S), S).errors.length);
});
t('labour cost = qty x rate', () => { const S = mk(), w = put(S, 'workers', { name: 'A', wageType: 'Hourly', rate: 100 }); assert.strictEqual(put(S, 'work', { workerId: w.id, date: '2026-01-01', qty: 6 }).total, 600); });
t('blueprint end-to-end profitability (section 81)', () => {
  const S = mk(), f = put(S, 'fields', { name: 'North', area: 3 }), c = put(S, 'cycles', { fieldId: f.id, crop: 'Rice', sowing: '2026-06-15' });
  put(S, 'expenses', { date: '2026-06-20', category: 'Fertilizer', amount: 30400, cycleId: c.id });
  const w = put(S, 'workers', { name: 'W', wageType: 'Hourly', rate: 100 }); put(S, 'work', { workerId: w.id, date: '2026-06-21', cycleId: c.id, qty: 6 });
  put(S, 'harvests', { cycleId: c.id, date: '2026-10-20', qty: 2200 }); put(S, 'sales', { cycleId: c.id, date: '2026-10-25', qty: 2000, price: 30 });
  const k = C.kpis(S, c.id), acres = C.fromHa(k.areaHa, 'acre');
  assert.strictEqual(k.cost, 31000); assert.strictEqual(k.revenue, 60000); assert.strictEqual(k.profit, 29000);
  assert.ok(Math.abs(k.yieldKg / acres - 733.33) < 0.01); assert.ok(Math.abs(k.profit / acres - 9666.67) < 0.01);
  const d = C.dashboard(S); assert.strictEqual(d.profit, 29000); assert.strictEqual(d.activeCrops, 1);
});
t('farm-wide expense splits by area across active cycles', () => {
  const S = mk(), a = put(S, 'fields', { name: 'A', area: 1 }), b = put(S, 'fields', { name: 'B', area: 3 });
  const c1 = put(S, 'cycles', { fieldId: a.id, crop: 'X', sowing: '2026-01-01' }), c2 = put(S, 'cycles', { fieldId: b.id, crop: 'Y', sowing: '2026-01-01' });
  put(S, 'expenses', { date: '2026-01-02', category: 'Fuel', amount: 1000 });
  assert.strictEqual(C.kpis(S, c1.id).cost, 250); assert.strictEqual(C.kpis(S, c2.id).cost, 750);
});
t('referential integrity on delete + audit + sync state', () => {
  const S = mk(), f = put(S, 'fields', { name: 'A', area: 1 }); put(S, 'cycles', { fieldId: f.id, crop: 'X', sowing: '2026-01-01' });
  assert.strictEqual(C.remove(S, 'fields', f.id).ok, false); assert.strictEqual(S.data.fields.length, 1);
  assert.strictEqual(f.syncStatus, 'PENDING_SYNC'); assert.ok(S.audit.length >= 2); assert.strictEqual(C.dashboard(S).pending, 2);
});
t('migrate fills missing keys', () => { const S = C.migrate({ data: { fields: [] } }); assert.ok(Array.isArray(S.data.tasks) && S.settings.unit); });
console.log('\n' + n + ' tests passed');
