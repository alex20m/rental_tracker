import assert from 'node:assert/strict';
import { computeTax, estimateCapitalTax } from './tax';
import { defaultSettings } from './store';
import type { DB } from './types';

// Capital income tax brackets
assert.equal(estimateCapitalTax(-500), 0);
assert.equal(estimateCapitalTax(10000), 3000);
assert.equal(estimateCapitalTax(30000), 9000);
assert.equal(estimateCapitalTax(40000), 9000 + 3400);

const db: DB = {
  settings: { ...defaultSettings, purchasePrice: 100000, useDepreciation: true, depreciationPrior: 10000 },
  rents: [
    { id: '1', month: '2025-01', status: 'paid', amount: 700, receivedDate: '2025-01-03', note: '' },
    { id: '2', month: '2025-02', status: 'vacant', amount: 0, receivedDate: '', note: '' },
    // December rent paid in January → belongs to the next tax year (cash basis)
    { id: '3', month: '2025-12', status: 'paid', amount: 700, receivedDate: '2026-01-02', note: '' },
  ],
  costs: [
    { id: 'a', date: '2025-03-01', category: 'maintenance_charge', description: '', amount: 200, hasReceipt: true },
    { id: 'b', date: '2025-03-01', category: 'financing_charge', description: '', amount: 150, hasReceipt: false },
    { id: 'c', date: '2025-06-01', category: 'repairs', description: '', amount: 100, hasReceipt: false },
  ],
};

const t = computeTax(db, 2025);
assert.equal(t.rentIncome, 700);
assert.equal(t.deductibleCosts, 300); // financing charge excluded
assert.equal(t.nonDeductibleCosts, 150);
assert.equal(t.depreciation, 2250); // (100000 - 10000) * 2.5%
assert.equal(t.netIncome, 700 - 300 - 2250);
assert.equal(t.estimatedTax, 0); // loss → no tax
assert.equal(t.vacantMonths, 1);
assert.equal(t.costsWithoutReceipt, 2);
assert.equal(computeTax(db, 2026).rentIncome, 700);

console.log('tax tests passed');
