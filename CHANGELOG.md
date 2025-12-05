# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-06

### First Major Release

This is the first stable release of cds-softdelete-plugin. The plugin is considered production-ready with comprehensive test coverage and well-defined behavior.

### Features

- **Automatic Soft Delete**: DELETE operations are automatically converted to UPDATE operations that set `isDeleted=true`, `deletedAt`, and `deletedBy`
- **Automatic Filtering**: READ operations automatically exclude soft-deleted records (where `isDeleted=false`)
- **Cascade Delete**: When a parent entity is deleted, all composition children are automatically soft-deleted recursively
- **Draft Support**: Full support for SAP Fiori Elements draft mode, including draft entity soft delete and proper synchronization on activation
- **Key-Based Access**: Direct access by key (e.g., `Orders(ID)`) returns records regardless of `isDeleted` status, allowing access to deleted records
- **Explicit Filter Support**: Users can explicitly query deleted records using `$filter=isDeleted eq true`
- **Validation**: Server startup validation ensures entities with `@softdelete.enabled` have all required fields (`isDeleted`, `deletedAt`, `deletedBy`)
- **Field Protection**: All soft delete fields are protected with `@readonly` annotation to prevent direct user modification
- **Idempotent Operations**: Deleting an already soft-deleted record succeeds without side effects (no timestamp updates)

### Technical Details

- **Test Coverage**: 38 test cases covering all scenarios (100% coverage)
  - Deletion operations (8 test cases)
  - Active entity reads (16 test cases)
  - Draft entity reads (7 test cases)
  - Draft activation (2 test cases)
  - Validation (2 test cases)
  - Field protection (4 test cases)
- **Specification**: Comprehensive specification documentation in `docs/project/spec.md`
- **Compatibility**: Requires `@sap/cds >= 9`

### Known Behavior

- **Draft Edit Mode**: Deleted items remain visible in draft edit mode until the draft is activated (this is by design to ensure proper synchronization)

## [0.3.5] - 2024-12-05

### Added
- Validation test cases for entity configuration
- Field protection test cases for readonly fields
- Comprehensive test specification documentation

### Fixed
- Idempotency check for soft delete operations to prevent `deletedAt` updates on already deleted records

## [0.3.4] - 2024-11-XX

### Added
- Plugin specification documentation
- Test specification documentation

### Fixed
- Draft entity filtering limitation documented as expected behavior

## [0.3.3] - 2024-XX-XX

### Fixed
- Prevent overwriting `deletedAt`/`deletedBy` on already soft-deleted records during cascade delete

## [0.3.2] - 2024-XX-XX

### Fixed
- Propagate parent `isDeleted` status in navigation paths

## [0.3.1] - 2024-XX-XX

### Fixed
- Apply `isDeleted` filter for navigation path reads in draft entities

## [0.3.0] - 2024-XX-XX

### Added
- Draft entity soft delete support with proper READ handler isolation

## [0.2.0] - 2024-XX-XX

### Fixed
- Foreign key naming in cascade delete for draft navigation paths

## [0.1.2] - 2024-XX-XX

### Fixed
- Exclude draft virtual keys from cascade soft delete
- Propagate parent `isDeleted` status to children in key-based access

## [0.1.1] - 2024-XX-XX

### Fixed
- GitHub tag badge markdown syntax

## [0.1.0] - 2024-XX-XX

### Added
- Initial release with basic soft delete functionality
- Validation for entities with `@softdelete.enabled`

[1.0.0]: https://github.com/miyasuta/cds-softdelete-plugin/compare/v0.3.5...v1.0.0
[0.3.5]: https://github.com/miyasuta/cds-softdelete-plugin/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/miyasuta/cds-softdelete-plugin/releases/tag/v0.3.4
