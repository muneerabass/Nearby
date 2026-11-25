import { api } from '../services/apiClient';
import { categoriesForPincode, searchProducts } from '../services/catalogService';

jest.mock('../services/apiClient', () => ({
  api: { get: jest.fn() },
}));

const getMock = api.get as jest.Mock;

describe('customer catalog contracts', () => {
  beforeEach(() => getMock.mockReset());

  it('loads backend-owned categories without applying a client allowlist', async () => {
    getMock.mockResolvedValue({
      categories: [{ id: 'cat-new', name: 'Pet Supplies', image_url: 'https://cdn/category.png', is_active: true, display_order: 2, product_count: 4 }],
    });

    const categories = await categoriesForPincode('400001');

    expect(categories[0].name).toBe('Pet Supplies');
    expect(getMock).toHaveBeenCalledWith('/catalog/categories', { query: { pincode: '400001' } });
  });

  it('preserves current price, MRP, unit, stock and search pagination', async () => {
    getMock.mockResolvedValue({
      query: 'oat',
      pincode: '400001',
      limit: 20,
      products: [{ id: 'p1', name: 'Oats', price: 1800, mrp: 2200, unit: '500 g', quantity: 0, store_id: 's1', store_name: 'Local' }],
      next_offset: 20,
    });

    const page = await searchProducts('400001', 'oat');

    expect(page.products[0]).toMatchObject({ price: 1800, mrp: 2200, unit: '500 g', quantity: 0 });
    expect(page.next_offset).toBe(20);
    expect(getMock).toHaveBeenCalledWith('/catalog/search', { query: { pincode: '400001', q: 'oat', offset: 0, limit: 20 } });
  });
});
