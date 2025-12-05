# cds-softdelete-plugin

[![npm version](https://img.shields.io/npm/v/cds-softdelete-plugin.svg)](https://www.npmjs.com/package/cds-softdelete-plugin)
[![npm downloads](https://img.shields.io/npm/dm/cds-softdelete-plugin.svg)](https://www.npmjs.com/package/cds-softdelete-plugin)
[![license](https://img.shields.io/github/license/miyasuta/cds-softdelete-plugin)](./LICENSE)
[![GitHub tag](https://img.shields.io/github/v/tag/miyasuta/cds-softdelete-plugin?label=tag)](https://github.com/miyasuta/cds-softdelete-plugin/tags)

A plugin for implementing soft delete functionality in SAP Cloud Application Programming Model (CAP) applications.

## What It Does

This plugin automatically converts DELETE operations to soft deletes (marking records as deleted instead of removing them) and filters out soft-deleted records from READ operations. When a parent entity is deleted, its composition children are automatically soft-deleted as well.

## Installation

```bash
npm install cds-softdelete-plugin
```

## Quick Start

### 1. Add the `softdelete` aspect to your entities

```cds
// db/schema.cds
using { softdelete } from 'cds-softdelete-plugin';

entity Orders: softdelete {
  key ID    : UUID;
      total : Decimal(9,2);
      items : Composition of many OrderItems on items.order = $self;
}

entity OrderItems: softdelete {
  key ID       : UUID;
      order    : Association to Orders;
      quantity : Integer;
}
```

The `softdelete` aspect adds these fields:
- `isDeleted` (Boolean) - Deletion flag
- `deletedAt` (DateTime) - Deletion timestamp
- `deletedBy` (String) - User who deleted the record

### 2. Enable soft delete in your service

Add `@softdelete.enabled` to every entity that should use soft delete:

```cds
// srv/order-service.cds
service OrderService {
    @softdelete.enabled
    entity Orders as projection on my.Orders;

    @softdelete.enabled
    entity OrderItems as projection on my.OrderItems;
}
```

**Important**: Both parent and child entities need `@softdelete.enabled` for cascade delete to work. The annotation is required because service projections do not automatically inherit aspect behavior.

## How It Works

### DELETE Operations

Delete operations are converted to updates that set `isDeleted=true`:

```javascript
DELETE /Orders(123)
// Sets: isDeleted=true, deletedAt=<timestamp>, deletedBy=<user>
```

Composition children are automatically soft-deleted when the parent is deleted.

### READ Operations

Soft-deleted records are automatically excluded from list queries:

```javascript
GET /Orders
// Only returns records where isDeleted=false
```

### Retrieving Deleted Data

Use `isDeleted=true` filter to access soft-deleted records:

```javascript
GET /Orders?$filter=isDeleted eq true
```

## Draft Support

Soft delete works in draft mode (Fiori Elements Object Page). Note that in draft edit mode, deleted items may remain visible until the draft is activated. This is expected behavior to ensure proper synchronization.

## Limitations

- **Draft Edit Mode**: Deleted items remain visible in draft edit mode until the draft is activated

## License

[MIT](LICENSE)

## Links

- [SAP Cloud Application Programming Model](https://cap.cloud.sap/)
- [CDS Plugin Documentation](https://cap.cloud.sap/docs/node.js/cds-plugins)
