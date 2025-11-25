using my.bookshop as my from '../db/schema';

@path: '/odata/v4/order-draft'
service OrderDraftService {
    @odata.draft.enabled
    @softdelete.enabled
    entity Orders as projection on my.Orders;
    @softdelete.enabled
    entity OrderItems as projection on my.OrderItems;
    @softdelete.enabled
    entity OrderItemNotes as projection on my.OrderItemNotes;
}
