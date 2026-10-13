// catalog_reader reads products and nothing else. Run logged in as a throwaway user that holds only that role.
const catalog = db.getSiblingDB('catalog');

function check(label, condition) {
  if (!condition) {
    print(`FAIL: ${label}`);
    quit(1);
  }
  print(`ok   ${label}`);
}

check('catalog_reader can read products', catalog.product.countDocuments({}) >= 10);
try {
  catalog.product.updateOne({ sku: 'FOOD-001' }, { $set: { isActive: false } });
  check('catalog_reader cannot write: it could', false);
} catch (e) {
  check(`catalog_reader cannot write (error ${e.code})`, e.code === 13);
}
