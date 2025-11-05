aspect softdelete {
    isDeleted: Boolean default false;
    deletedAt: Timestamp;
    deletedBy: String;
}