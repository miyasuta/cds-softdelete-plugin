using my.bookshop as my from '../db/schema';

service OrderService {
    @softdelete.enabled
    entity Orders as projection on my.Orders;
    @softdelete.enabled
    entity OrderItems as projection on my.OrderItems;
}