# cds-softdelete-plugin

[![npm version](https://img.shields.io/npm/v/cds-softdelete-plugin.svg)](https://www.npmjs.com/package/cds-softdelete-plugin)
[![npm downloads](https://img.shields.io/npm/dm/cds-softdelete-plugin.svg)](https://www.npmjs.com/package/cds-softdelete-plugin)
[![license](https://img.shields.io/github/license/miyasuta/cds-softdelete-plugin)](./LICENSE)
[![GitHub tag](https://img.shields.io/github/v/tag/miyasuta/cds-softdelete-plugin?label=tag](https://github.com/miyasuta/cds-softdelete-plugin/tags)


A plugin for implementing soft delete functionality in SAP Cloud Application Programming Model (CAP) applications.

## Overview

This plugin enables easy implementation of soft delete (logical delete) for entities in CAP applications. Instead of physically deleting records from the database, it marks them as deleted while preserving the data.

### Key Features

- **Automatic Soft Delete**: Automatically converts DELETE requests to UPDATE operations
- **Automatic Filtering**: Automatically excludes soft-deleted records from READ requests
- **Composition Cascade Support**: When a parent entity is deleted, its composition children are automatically soft-deleted
- **Access to Deleted Data**: Retrieve soft-deleted data using `isDeleted=true` filter
- **Deletion Metadata**: Automatically records deletion timestamp (`deletedAt`) and user (`deletedBy`)

## Installation

```bash
npm install cds-softdelete-plugin
```

## Configuration

### 1. Data Model Definition

Add the `softdelete` aspect to your entities.

```cds
// db/schema.cds
using { softdelete } from 'cds-softdelete-plugin';

entity Orders: softdelete {
  key ID        : UUID;
      createdAt : DateTime;
      total     : Decimal(9,2);
      items     : Composition of many OrderItems on items.order = $self;
}

entity OrderItems: softdelete {
  key ID      : UUID;
      order   : Association to Orders;
      quantity: Integer;
}
```

The `softdelete` aspect adds the following fields:
- `isDeleted`: Boolean - Deletion flag (default: false)
- `deletedAt`: DateTime - Deletion timestamp
- `deletedBy`: String - User ID who deleted the record

### 2. Service Definition

Add the `@softdelete.enabled` annotation to **all entities** that should support soft delete.

```cds
// srv/order-service.cds
using my.bookshop as my from '../db/schema';

service OrderService {
    @softdelete.enabled
    entity Orders as projection on my.Orders;
    @softdelete.enabled
    entity OrderItems as projection on my.OrderItems;
}
```

**Important**:
- Add `@softdelete.enabled` to **every entity** that should be soft-deleted (both parent and child)
- Without `@softdelete.enabled`, the entity will use physical delete even if it has the `softdelete` aspect
- This annotation is required because the plugin cannot detect aspects at the service layer

**Validation**:
- The plugin validates that entities with `@softdelete.enabled` have all required fields (`isDeleted`, `deletedAt`, `deletedBy`)
- If an entity has `@softdelete.enabled` but is missing any required fields, the server will fail to start with an error message indicating which fields are missing
- To fix this error, ensure the `softdelete` aspect is added to the entity in your data model

## Behavior

### DELETE Operations

When deleting an entity, a soft delete is performed instead of a physical delete.

```javascript
// DELETE /Orders(12345678-1234-1234-1234-123456789abc)
// ↓ Converted to:
// UPDATE Orders
// SET isDeleted = true,
//     deletedAt = '2025-01-15T10:30:00.000Z',
//     deletedBy = 'user@example.com'
// WHERE ID = '12345678-1234-1234-1234-123456789abc'
```

**Composition children are automatically soft-deleted**:

```javascript
// Delete parent Order
DELETE /Orders(parent-id)

// ↓ Automatically executes:
// UPDATE Orders SET isDeleted = true, ... WHERE ID = 'parent-id'
// UPDATE OrderItems SET isDeleted = true, ... WHERE order_ID = 'parent-id'
```

### READ Operations

Soft-deleted records are automatically filtered out in list queries.

```javascript
// GET /Orders
// ↓ Automatically adds filter:
// SELECT * FROM Orders WHERE isDeleted = false
```

**By-key access returns soft-deleted records**:

When accessing an entity by specifying all keys (e.g., `Orders(ID=...)`), the `isDeleted` filter is NOT applied, allowing direct access to soft-deleted records.

```javascript
// Access by key - Returns the record even if soft-deleted
GET /Orders(12345678-1234-1234-1234-123456789abc)
// ↓ No isDeleted filter is added:
// SELECT * FROM Orders WHERE ID = '12345678-1234-1234-1234-123456789abc'

// List query - Filters out soft-deleted records
GET /Orders?$filter=ID eq 12345678-1234-1234-1234-123456789abc
// ↓ Automatically adds isDeleted filter:
// SELECT * FROM Orders WHERE ID = '...' AND isDeleted = false
```

This behavior allows you to:
- Access specific soft-deleted records directly when you know the key
- Verify deletion status by reading the `isDeleted` field
- Retrieve soft-deleted records without using complex filters

### Filter Propagation in $expand

When the parent has an `isDeleted` filter, it propagates to composition children.

```javascript
// Get deleted Orders with their deleted OrderItems
GET /Orders?isDeleted=true&$expand=items
// ↓ Returns:
// Orders (isDeleted=true) with items (isDeleted=true)

// Normal query (only non-deleted data)
GET /Orders?$expand=items
// ↓ Returns:
// Orders (isDeleted=false) with items (isDeleted=false)
```

### Retrieving Deleted Data

Explicitly specify `isDeleted=true` filter to retrieve soft-deleted data.

```javascript
// Get all deleted Orders
GET /Orders?$filter=isDeleted eq true

// Get a specific deleted Order
GET /Orders?$filter=isDeleted eq true and ID eq 12345678-1234-1234-1234-123456789abc
```

### Direct Deletion of Child Entities

When a child entity has `@softdelete.enabled`, directly deleting it results in soft delete.

```javascript
// Delete OrderItem directly (with @softdelete.enabled)
DELETE /OrderItems(item-id)
// ↓ Soft delete
// UPDATE OrderItems SET isDeleted = true, ... WHERE ID = 'item-id'
```

The parent entity is not affected when a child is deleted directly.

## Limitations

- **Composition vs Association**: Filter propagation only applies to Composition relationships. Association relationships are independent and do not propagate the `isDeleted` filter.
- **OData V2 Compatibility**: OData V2 does not support `$filter` within `$expand`, so the parent's `isDeleted` filter is automatically propagated to Composition children.
- **User-specified Filters**: When you explicitly specify `isDeleted` in an `$expand` filter (e.g., `$expand=items($filter=isDeleted eq true)`), the plugin respects your filter and does not add automatic filtering.
- **Physical Deletion**: If physical deletion is required, you can implement custom logic to delete soft-deleted records (where `isDeleted = true`).

## License

[MIT](LICENSE)

## Contributing

Issues and Pull Requests are welcome!

## Links

- [SAP Cloud Application Programming Model](https://cap.cloud.sap/)
- [CDS Plugin Documentation](https://cap.cloud.sap/docs/node.js/cds-plugins)
