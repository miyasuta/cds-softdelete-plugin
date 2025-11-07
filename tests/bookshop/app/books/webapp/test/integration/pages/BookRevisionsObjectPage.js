sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'ns.books',
            componentId: 'BookRevisionsObjectPage',
            contextPath: '/Books/revisions'
        },
        CustomPageDefinitions
    );
});