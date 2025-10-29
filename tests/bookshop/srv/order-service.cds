using my.bookshop as my from '../db/schema';

service OrderService {
    @softdelete.enabled
    entity Orders as projection on my.Orders;
    entity OrderItems as projection on my.OrderItems;
}