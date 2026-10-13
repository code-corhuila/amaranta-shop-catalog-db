// The validator is the structure of the product collection (Annex B, rule 1): it must reject what the
// service must never store and accept what it stores. Run by scripts/rebuild-check.sh as the
// administrator; it leaves no product behind. Any wrong answer stops it with a non-zero exit.
const catalog = db.getSiblingDB('catalog');

const valid = (overrides = {}) => ({
  _id: '11111111-1111-4111-8111-111111111111',
  sku: 'TEST-001',
  name: 'Test product',
  description: 'A product that exists only inside the validator test.',
  category: 'FOOD',
  price: Long('1000'),
  stockQuantity: Long('5'),
  imageUrl: 'https://example.test/product.png',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function check(label, condition) {
  if (!condition) {
    print(`FAIL: ${label}`);
    quit(1);
  }
  print(`ok   ${label}`);
}

// An operation that must be refused with a given MongoDB error code (121: validation, 11000: duplicate).
function refuses(label, code, operation) {
  try {
    operation();
  } catch (e) {
    check(`${label} (error ${e.code})`, e.code === code);
    return;
  }
  check(`${label}: it was accepted`, false);
}

catalog.product.deleteMany({ sku: /^TEST-/ });

// What it must accept.
check('a valid product is accepted', catalog.product.insertOne(valid()).acknowledged);

// What it must reject: the shape.
refuses('a field that is not declared', 121, () => catalog.product.insertOne(valid({ _id: '22222222-2222-4222-8222-222222222222', sku: 'TEST-002', color: 'red' })));
refuses('a missing required field', 121, () => {
  const doc = valid({ _id: '33333333-3333-4333-8333-333333333333', sku: 'TEST-003' });
  delete doc.imageUrl;
  catalog.product.insertOne(doc);
});
refuses('a category outside the five', 121, () => catalog.product.insertOne(valid({ _id: '44444444-4444-4444-8444-444444444444', sku: 'TEST-004', category: 'PETS' })));
refuses('an id that is not a UUID', 121, () => catalog.product.insertOne(valid({ _id: 'not-a-uuid', sku: 'TEST-005' })));
refuses('a name over 120 characters', 121, () => catalog.product.insertOne(valid({ _id: '55555555-5555-4555-8555-555555555555', sku: 'TEST-006', name: 'x'.repeat(121) })));

// What it must reject: the numbers (a plain number arrives as a double, a small int as int32).
refuses('a price of zero', 121, () => catalog.product.insertOne(valid({ _id: '66666666-6666-4666-8666-666666666666', sku: 'TEST-007', price: Long('0') })));
refuses('a price that is a double', 121, () => catalog.product.insertOne(valid({ _id: '77777777-7777-4777-8777-777777777777', sku: 'TEST-008', price: 1000.5 })));
refuses('a price that is an int32', 121, () => catalog.product.insertOne(valid({ _id: '88888888-8888-4888-8888-888888888888', sku: 'TEST-009', price: NumberInt(1000) })));
refuses('a negative stock', 121, () => catalog.product.insertOne(valid({ _id: '99999999-9999-4999-8999-999999999999', sku: 'TEST-010', stockQuantity: Long('-1') })));

// What it must reject: the unique key, and the stock that would go below zero.
refuses('a second product with the same sku', 11000, () => catalog.product.insertOne(valid({ _id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })));
refuses('a decrement below zero', 121, () => catalog.product.updateOne({ _id: '11111111-1111-4111-8111-111111111111' }, { $inc: { stockQuantity: Long('-6') } }));
check('a decrement within the stock is accepted',
  catalog.product.updateOne({ _id: '11111111-1111-4111-8111-111111111111' }, { $inc: { stockQuantity: Long('-5') } }).modifiedCount === 1);
check('the stock is exactly zero, and still a long',
  catalog.product.findOne({ _id: '11111111-1111-4111-8111-111111111111' }).stockQuantity.toString() === '0');

// The indexes exist under their explicit names, and the sku one is unique.
const indexes = Object.fromEntries(catalog.product.getIndexes().map((i) => [i.name, i]));
['idx_product_sku', 'idx_product_category_is_active', 'idx_product_name'].forEach((n) => check(`index ${n} exists`, n in indexes));
check('idx_product_sku is unique', indexes.idx_product_sku.unique === true);

catalog.product.deleteMany({ sku: /^TEST-/ });
