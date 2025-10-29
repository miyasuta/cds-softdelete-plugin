namespace my.bookshop;
using { softdelete } from 'cds-softdelete-plugin';

entity Books: softdelete {
  key ID    : Integer;
      title : String;
      stock : Integer;
}

entity Orders: softdelete {
  key ID        : UUID;
      createdAt : DateTime;
      total     : Decimal(9,2);
      items     : Composition of many OrderItems on items.order = $self;
}

entity OrderItems: softdelete {
  key ID      : UUID;
      order   : Association to Orders;
      quantity: Integer;
}