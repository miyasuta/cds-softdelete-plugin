using spec.test as spec from '../db/schema';

// Service for Books entity (composite key testing)
service BookService {
    @softdelete.enabled
    entity Books as projection on spec.Books;

    // Products entity without @softdelete.enabled (for physical delete testing)
    entity Products as projection on spec.Products;
}
