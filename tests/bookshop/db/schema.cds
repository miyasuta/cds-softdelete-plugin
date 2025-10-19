namespace my.bookshop;
using { softdelete } from 'cds-softdelete-plugin';

entity Books: softdelete {
  key ID    : Integer;
      title : String;
      stock : Integer;
}
