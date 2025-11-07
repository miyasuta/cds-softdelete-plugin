sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"ns/books/test/integration/pages/BooksList",
	"ns/books/test/integration/pages/BooksObjectPage",
	"ns/books/test/integration/pages/BookRevisionsObjectPage"
], function (JourneyRunner, BooksList, BooksObjectPage, BookRevisionsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('ns/books') + '/test/flp.html#app-preview',
        pages: {
			onTheBooksList: BooksList,
			onTheBooksObjectPage: BooksObjectPage,
			onTheBookRevisionsObjectPage: BookRevisionsObjectPage
        },
        async: true
    });

    return runner;
});

