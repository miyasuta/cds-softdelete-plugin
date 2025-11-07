namespace my.bookshop;
using { softdelete } from 'cds-softdelete-plugin';

entity Books: softdelete {
  key ID    : Integer;
      title : String;
      stock : Integer;
      revisions: Composition of many BookRevisions on revisions.book = $self;
}

//Booksの改訂履歴を保持するためのエンティティ
entity BookRevisions: softdelete {
  key ID        : UUID;
      book      : Association to Books;
      title     : String;
      revisedAt : DateTime;
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
      notes   : Composition of many OrderItemNotes on notes.item = $self;
}

entity OrderItemNotes: softdelete {
  key ID   : UUID;
      item : Association to OrderItems;
      text : String;
}