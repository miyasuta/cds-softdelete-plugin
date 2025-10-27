aspect softdelete {
    isDeleted: Boolean default false @readonly;
    deletedAt: Timestamp @cds.on.delete: $now;
    deletedBy: String @cds.on.delete: $user;
}