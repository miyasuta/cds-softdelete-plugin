using spec.test as spec from '../db/schema';

// Service for draft entities
service OrderDraftService {
    @softdelete.enabled
    @odata.draft.enabled
    entity Orders as projection on spec.Orders;

    @softdelete.enabled
    entity OrderItems as projection on spec.OrderItems;

    @softdelete.enabled
    entity ItemDetails as projection on spec.ItemDetails;
}
