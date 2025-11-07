aspect softdelete {
    isDeleted: Boolean default false @readonly;
    deletedAt: Timestamp @readonly;
    deletedBy: String @readonly;
}