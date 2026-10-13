// Annex J, J.10 and rule RN-13 as a test: catalog_app writes ONLY in its own database, and inside it only what
// the service needs. Run by scripts/rebuild-check.sh logged in AS catalog_app, not as the administrator, so
// what it proves is what the service really gets. Any permission wider than intended stops it.
const catalog = db.getSiblingDB('catalog');
const UNAUTHORIZED = 13;

function check(label, condition) {
  if (!condition) {
    print(`FAIL: ${label}`);
    quit(1);
  }
  print(`ok   ${label}`);
}

function refuses(label, operation) {
  try {
    operation();
  } catch (e) {
    check(`${label} (error ${e.code})`, e.code === UNAUTHORIZED);
    return;
  }
  check(`${label}: it was allowed`, false);
}

const doc = {
  _id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sku: 'TEST-PRIV', name: 'Privilege probe', description: '',
  category: 'TOYS', price: Long('1000'), stockQuantity: Long('1'), imageUrl: 'https://example.test/p.png',
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
};

// What the service must be able to do.
check('it can read products', catalog.product.countDocuments({}) >= 10);
check('it can insert a product', catalog.product.insertOne(doc).acknowledged);
check('it can reserve stock', catalog.product.updateOne({ _id: doc._id, stockQuantity: { $gte: 1 } }, { $inc: { stockQuantity: Long('-1') } }).modifiedCount === 1);
check('it can remove a product', catalog.product.deleteOne({ _id: doc._id }).deletedCount === 1);

// What it must NOT be able to do.
refuses('create a collection', () => catalog.createCollection('rogue'));
refuses('drop the product collection', () => catalog.product.drop());
refuses('create an index', () => catalog.product.createIndex({ description: 1 }, { name: 'idx_rogue' }));
refuses('weaken the validator', () => catalog.runCommand({ collMod: 'product', validator: {}, validationLevel: 'off' }));
refuses('read the migration history', () => catalog.databasechangelog_catalog.countDocuments({}));
refuses('write in another database', () => db.getSiblingDB('other_domain').thing.insertOne({ a: 1 }));
refuses('read another database', () => db.getSiblingDB('other_domain').thing.countDocuments({}));
