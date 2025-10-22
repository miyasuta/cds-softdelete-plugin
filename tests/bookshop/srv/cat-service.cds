using my.bookshop as my from '../db/schema';

service CatalogService {
    @softdelete.enabled
    entity Books as projection on my.Books;
}

service CatalogDraftService {
    @odata.draft.enabled
    @softdelete.enabled
    entity Books as projection on my.Books;
}

service OrderService {
    entity Orders as projection on my.Orders;
    @softdelete.enabled
    entity OrderItems as projection on my.OrderItems;
}