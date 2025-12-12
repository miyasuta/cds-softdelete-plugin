const cds = require('@sap/cds');

const { GET, POST, DELETE, expect, axios } = cds.test(__dirname + '/..');
axios.defaults.auth = { username: 'alice', password: '' };

describe('Physical deletion test cases', () => {
  let db;

  before(async () => {
    db = await cds.connect.to('db');
  });

  describe('DEL-09: Physical deletion of entity without @softdelete.enabled', () => {
    it('When deleting an entity without @softdelete.enabled, it is physically deleted', async () => {
      const productID = 999;

      // Setup: Create a Product
      const postRes = await POST(`/odata/v4/book/Products`, {
        ID: productID,
        name: 'Test Product',
        price: 100
      });
      expect(postRes.status).to.equal(201);

      // Verify the product exists
      const getRes1 = await GET(`/odata/v4/book/Products(${productID})`);
      expect(getRes1.status).to.equal(200);
      expect(getRes1.data.name).to.equal('Test Product');

      // Action: Delete the product
      const deleteRes = await DELETE(`/odata/v4/book/Products(${productID})`);
      expect(deleteRes.status).to.equal(204);

      // Verify: Product is physically deleted (GET returns 404)
      try {
        await GET(`/odata/v4/book/Products(${productID})`);
        expect.fail('Expected 404 but request succeeded');
      } catch (error) {
        expect(error.response.status).to.equal(404);
      }

      // Verify: Product is not found in database
      const { Products } = db.entities('spec.test');
      const product = await SELECT.one.from(Products).where({ ID: productID });
      expect(product).to.not.exist;
    });
  });
});
