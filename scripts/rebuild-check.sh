#!/usr/bin/env bash
# The rebuild check (Annex B, "Como se verifica"; Annex J, J.6). Needs only Docker, and it is the same
# script the pull request runs, so a failure in CI can be reproduced on your machine:
#
#   bash scripts/rebuild-check.sh
#
# It starts a throwaway MongoDB 7 and proves, in order:
#   1. update builds the collection, its validator and its indexes from an EMPTY database;
#   2. a second update applies nothing;
#   3. the validator rejects what it must reject and accepts what it must accept;
#   4. the seed leaves the ten products, under the ids the monolith issued;
#   5. the inline rollbacks leave no collection behind, and the chain applies again.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1   # Git Bash on Windows must not rewrite the container paths below

NAME="catalog-db-check-$$"
NET="catalog-db-net-$$"
IMAGE=catalog-db-liquibase:check
ADMIN=amaranta_admin
PW="$(openssl rand -hex 16)"       # a throwaway instance with throwaway passwords: nothing to version
APP_PW="$(openssl rand -hex 16)"

docker network create "$NET" > /dev/null
docker build -q -t "$IMAGE" -f deploy/liquibase.Dockerfile deploy > /dev/null
# The network alias is the host name the runner uses in deploy/compose.yml.
docker run -d --rm --name "$NAME" --network "$NET" --network-alias mongo \
  -e MONGO_INITDB_ROOT_USERNAME="$ADMIN" -e MONGO_INITDB_ROOT_PASSWORD="$PW" mongo:7.0 > /dev/null
trap 'docker rm -f "$NAME" > /dev/null 2>&1 || true; docker network rm "$NET" > /dev/null 2>&1 || true' EXIT

# The image starts a temporary server to run its init, then restarts: wait for the real one.
until docker logs "$NAME" 2>&1 | grep -q "MongoDB init process complete"; do sleep 1; done
mongo_admin() { docker exec -i "$NAME" mongosh --quiet -u "$ADMIN" -p "$PW" --authenticationDatabase admin "$@"; }
until mongo_admin --eval "db.adminCommand('ping').ok" 2> /dev/null | grep -qx 1; do sleep 1; done

# The instance creates catalog_app before anything is migrated (Annex J, J.5.2); here a stand-in does.
mongo_admin --eval "db.getSiblingDB('catalog').createUser({ user: 'catalog_app', pwd: '$APP_PW', roles: [{ role: 'readWrite', db: 'catalog' }] })" > /dev/null

# The same arguments as deploy/compose.yml, with the runner on the throwaway network. Its banner and the
# driver logging are dropped; the exit code is still the runner's (pipefail).
lb() {
  docker run --rm --network "$NET" -v "$PWD:/workspace:ro" \
    -e LIQUIBASE_COMMAND_USERNAME="$ADMIN" -e LIQUIBASE_COMMAND_PASSWORD="$PW" \
    --entrypoint liquibase "$IMAGE" \
    --search-path=/workspace --changelog-file=changelog/changelog-master.yaml \
    --database-changelog-table-name=databasechangelog_catalog \
    --database-changelog-lock-table-name=databasechangeloglock_catalog \
    --url="mongodb://mongo:27017/catalog?authSource=admin" "$@" 2>&1 \
    | { grep -vE '^(#|Starting Liquibase|Liquibase Version|Liquibase Open Source|\[main\]|\[cluster|$)' || true; }
}
applied() { mongo_admin --eval "db.getSiblingDB('catalog').databasechangelog_catalog.countDocuments({})"; }
has_collection() { mongo_admin --eval "db.getSiblingDB('catalog').getCollectionNames().includes('$1')"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== 1. update from an empty database"
lb update
first="$(applied)"
[ "$first" -gt 0 ] || fail "nothing was recorded as applied"

echo "== 2. a second update applies nothing"
lb update
[ "$(applied)" = "$first" ] || fail "second update applied changes: the chain is not incremental"

echo "== 3. the validator and the indexes"
mongo_admin --file /dev/stdin < test/validator.js

echo "== 4. the seed: the ten products, under the ids the monolith issued"
mongo_admin --file /dev/stdin < test/seed.js
# Applying the seed again (as after a half-failed run) must create what is missing and touch nothing else:
# a live stock cannot be reset to the seed's.
mongo_admin --eval "const c = db.getSiblingDB('catalog'); c.product.updateOne({ sku: 'FOOD-001' }, { \$set: { stockQuantity: Long('7') } }); c.databasechangelog_catalog.deleteOne({ id: 'dml-inserts-001' })" > /dev/null
lb update
[ "$(mongo_admin --eval "db.getSiblingDB('catalog').product.findOne({ sku: 'FOOD-001' }).stockQuantity.toString()")" = "7" ] \
  || fail "applying the seed again reset a live stock"

echo "== 5. every rollback, then the chain again"
lb rollback-count --count=999
[ "$(has_collection product)" = "false" ] || fail "the rollbacks left the product collection behind"
lb update
[ "$(has_collection product)" = "true" ] || fail "the chain did not rebuild the product collection"

echo "OK: the catalog database builds, validates, rolls back and builds again"
