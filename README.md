# CAP Soft Delete Plugin

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

### 3. Plugin Activation

The plugin is automatically loaded by CAP. No additional configuration is required.

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

Soft-deleted records are automatically filtered out.

```javascript
// GET /Orders
// ↓ Automatically adds filter:
// SELECT * FROM Orders WHERE isDeleted = false
```

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

## Usage Examples

### Scenario 1: Order Deletion and Restoration

```javascript
// 1. Delete order (soft delete)
await DELETE('/Orders(order-123)')

// 2. Not visible in normal queries
const activeOrders = await GET('/Orders')
// order-123 is not included

// 3. Retrieve deleted data
const deletedOrders = await GET('/Orders?$filter=isDeleted eq true')
// order-123 is included

// 4. Restore (update isDeleted to false)
await UPDATE('/Orders(order-123)').with({ isDeleted: false })
```

### Scenario 2: Composition Cascade Delete

```javascript
// Delete parent Order
await DELETE('/Orders(order-123)')

// Child OrderItems are automatically soft-deleted (cascade)
const deletedItems = await GET('/OrderItems?$filter=isDeleted eq true and order_ID eq order-123')
// All OrderItems linked to order-123 are soft-deleted
```

### Scenario 3: Direct Child Query

```javascript
// Query child entities directly
const activeItems = await GET('/OrderItems')
// Only returns items where isDeleted = false

// Query with explicit filter in $expand
const orders = await GET('/Orders?$expand=items($filter=isDeleted eq true)')
// Returns Orders (non-deleted) with their deleted items
```

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
