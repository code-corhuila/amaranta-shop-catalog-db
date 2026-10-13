# amaranta-shop-catalog-db

> catalog bounded context: database (schema, seeds, migrations)

Part of the **Amaranta Shop** distributed system — team `amaranta-shop`, Grupo 2.
Governance and documentation live in [`amaranta-shop-docs`](https://github.com/code-corhuila/amaranta-shop-docs).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `amaranta-shop-docs`.

## Role in the system

The database of the **catalog** domain: the `product` collection, its validator, its indexes, its seed
data and its roles. It owns the *structure*; `amaranta-shop-catalog-api` owns the *data* and never creates a
collection or an index (Annex J, J.3.2). No database server is defined here: the single MongoDB instance
lives in `amaranta-shop-infra-mongo`, and this repository only brings the runner that migrates it.

## Depends on

`amaranta-shop-infra-mongo`: the instance, the database `catalog` and the `catalog_app` login user.
Catalog knows no other domain's data, and no other service connects to this database.

## Stack

MongoDB 7 and **Liquibase** with its MongoDB extension, as the norm requires for this engine
([ADR-010](https://github.com/code-corhuila/amaranta-shop-docs/blob/main/05-architecture/decisions/records/ADR-010-engine-per-domain-sales-postgres-catalog-mongo.md)).
The image installs **two** packages, `liquibase-mongodb` and `mongodb`; with only the second it fails with
"Driver class was not specified". A standalone instance is enough: reserving stock is one atomic update on
one document, so no multi-document transaction (and no replica set) is needed.

## Layout

```
changelog/changelog-master.yaml   the only entry point: it includes the three families in order
01_ddl/                           structure: 00_collections, 01_validators (collMod), 02_indexes, 03_views
02_dml/                           data: seeds, updates, upserts, patches
03_dcl/                           the domain's roles
deploy/                           the migration runner (Dockerfile + compose): no database, no volume
```

There is no `04_alter`, `04_tcl` or `05_rollbacks`: MongoDB has no foreign keys, and each changeset declares
its inverse inline. Every changeset is idempotent by itself, because a migration is not transactional here.
An applied changeset is never edited: a change to the validator is a new changeset with `collMod`.

## The product collection

One collection, `product`, with nothing embedded. Its `_id` is the product UUID the monolith already issued,
so every historical order line still points at a real product (ADR-010).

| Field | Type | Rule |
|---|---|---|
| `_id` | string | a UUID |
| `sku` | string | 1-50 characters, **unique** (`idx_product_sku`) |
| `name`, `description` | string | up to 120 and 500 characters |
| `category` | string | `FOOD`, `ACCESSORIES`, `HYGIENE`, `MEDICATION` or `TOYS` |
| `price`, `stockQuantity` | **long** | whole pesos, at least 1; whole units, **never below 0** |
| `imageUrl` | string | up to 500 characters |
| `isActive`, `createdAt`, `updatedAt` | bool, date, date | |

The validator is `strict` and `error`, with `additionalProperties: false`: a misspelled field is refused, not
stored. A plain JSON number arrives as a double and a small integer as an int32, and both are refused: a client
must send a `long` (in Python, `bson.Int64`). The validator is also the last defence of the stock: a decrement
that would leave it below zero is refused even if the service forgot its own condition. Indexes:
`idx_product_sku` (unique), `idx_product_category_is_active` (the list) and `idx_product_name` (the search).

## How to run

```bash
docker network create platform                              # once per machine
cd ../amaranta-shop-infra-mongo && cp env/dev.env.example env/dev.env   # then set the passwords
docker compose --env-file env/dev.env up -d --wait mongo
docker compose --env-file env/dev.env run --rm catalog-db-migrate            # update
```

It works once the infra repository `include`s `deploy/compose.yml` (a line to add there). The runner uses the
administrator of the instance; the service never does. Liquibase keeps its control collections named for this
domain (`databasechangelog_catalog`, Annex J, J.6). In `qa` and `main` never `docker compose down -v`.

## Status

The `product` collection, its validator and its indexes. Next, each its own pull request:
`chore/catalog-rebuild-check` (the check that proves all of this on every pull request),
`feat/catalog-seed-products` (the ten products, with their ids) and `feat/catalog-roles` (`catalog_reader`,
`catalog_writer` and the grant to `catalog_app`).
