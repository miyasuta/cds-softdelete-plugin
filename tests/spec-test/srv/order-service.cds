using spec.test as spec from '../db/schema';

// Service for active entities (non-draft)
service OrderService {
    @softdelete.enabled
    entity Orders as projection on spec.Orders;

    @softdelete.enabled
    entity OrderItems as projection on spec.OrderItems;

    @softdelete.enabled
    entity ItemDetails as projection on spec.ItemDetails;
}
