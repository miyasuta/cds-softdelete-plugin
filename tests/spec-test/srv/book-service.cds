using spec.test as spec from '../db/schema';

// Service for Books entity (composite key testing)
service BookService {
    @softdelete.enabled
    entity Books as projection on spec.Books;
}
