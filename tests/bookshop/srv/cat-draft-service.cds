using my.bookshop as my from '../db/schema';

service CatalogDraftService {
    @odata.draft.enabled
    @softdelete.enabled
    entity Books as projection on my.Books;
}