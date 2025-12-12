namespace spec.test;
using { softdelete } from 'cds-softdelete-plugin';

// Orders entity with composition to OrderItems
entity Orders: softdelete {
  key ID        : String;
      createdAt : DateTime;
      total     : Decimal(9,2);
      items     : Composition of many OrderItems on items.order = $self;
}

// OrderItems entity with composition to ItemDetails (grandchild)
entity OrderItems: softdelete {
  key ID      : String;
      order   : Association to Orders;
      quantity: Integer;
      details : Composition of many ItemDetails on details.item = $self;
}

// ItemDetails entity (grandchild for cascade delete testing)
entity ItemDetails: softdelete {
  key ID   : String;
      item : Association to OrderItems;
      text : String;
}

// Books entity with composite key for testing composite key scenarios
entity Books: softdelete {
  key ID      : Integer;
  key version : Integer;
      title   : String;
}

// BusinessPartners entity for Association testing
entity BusinessPartners: softdelete {
  key ID   : String;
      name : String;
}

// Products entity WITHOUT @softdelete.enabled (for physical delete testing)
entity Products {
  key ID    : Integer;
      name  : String;
      price : Decimal(9,2);
}
