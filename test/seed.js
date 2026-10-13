// The seed must leave exactly the ten products the monolith has, under the ids it issued, with the types the
// validator demands. Run by scripts/rebuild-check.sh as the administrator; any wrong answer stops it.
const catalog = db.getSiblingDB('catalog');
const expectedIds = ['399d2ea8-1ccb-4193-8255-1b51e331984d', 'cc1529a4-de3c-4f15-a831-b9d96586c6d9', '66a99702-66b0-413f-a170-02e2df06d9c1', '5c59deae-bba3-466d-bca5-049ba3a872ba', 'a9b0fcd7-9307-4209-bbc1-615f7a2ca27f', 'b00bfa5e-a6b0-448d-a3dd-cf5305107c87', 'db6fa0d3-0ca4-4bc0-9a75-a8ab50d87d0c', '64f0dd04-156a-4c37-a5d2-91639537c4c5', '13aaba9d-5a94-4384-9558-50f158701a2e', '94dd32f1-8257-444f-bbe2-e3637e4e4d7d'];

function check(label, condition) {
  if (!condition) {
    print(`FAIL: ${label}`);
    quit(1);
  }
  print(`ok   ${label}`);
}

check('there are exactly ten products', catalog.product.countDocuments({}) === 10);
check('every id is the one the monolith issued', catalog.product.countDocuments({ _id: { $in: expectedIds } }) === 10);
check('price and stockQuantity are long in every document', catalog.product.countDocuments({ price: { $type: 'long' }, stockQuantity: { $type: 'long' } }) === 10);
check('every product is active', catalog.product.countDocuments({ isActive: true }) === 10);
check('the five categories are all present', catalog.product.distinct('category').length === 5);
check('the out-of-stock product is there, with stock 0', catalog.product.findOne({ sku: 'MED-002' }).stockQuantity.toString() === '0');
check('the monolith ids still resolve by sku', catalog.product.findOne({ sku: 'FOOD-001' })._id === '399d2ea8-1ccb-4193-8255-1b51e331984d');
