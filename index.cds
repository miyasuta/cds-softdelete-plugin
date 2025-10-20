aspect softdelete {
    isDeleted: Boolean default false @readonly;
    deletedAt: Timestamp @cds.on.delete: $now;
}