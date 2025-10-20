using my.bookshop as my from '../db/schema';

service CatalogService {
    @softdelete.enabled
    entity Books as projection on my.Books;
}
