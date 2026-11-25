import { api } from '../services/apiClient';
import * as vendorService from '../services/vendorService';
import * as adminService from '../services/adminService';

jest.mock('../services/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mocked = api as jest.Mocked<typeof api>;

beforeEach(() => jest.clearAllMocks());

describe('vendorService', () => {
  it('never sends a store id: the server picks the store from the login', async () => {
    mocked.get.mockResolvedValue({ orders: [], next_before: null });
    await vendorService.listOrders({ status: ['pending', 'accepted'], limit: 100 });
    expect(mocked.get).toHaveBeenCalledWith('/vendor/orders', {
      auth: true,
      query: { status: 'pending,accepted', q: undefined, from: undefined, to: undefined, before: undefined, limit: 100 },
    });
    const call = JSON.stringify(mocked.get.mock.calls[0]);
    expect(call).not.toContain('store_id');
  });

  it('returns an empty list and a null cursor when the server sends none', async () => {
    mocked.get.mockResolvedValue({});
    await expect(vendorService.listOrders()).resolves.toEqual({ orders: [], next_before: null });
  });

  it('passes the paging cursor and trims the search text', async () => {
    mocked.get.mockResolvedValue({ orders: [] });
    await vendorService.listOrders({ status: 'completed', before: '2026-11-18T10:00:00Z', q: '  asha ' });
    expect(mocked.get.mock.calls[0][1]).toMatchObject({ query: { status: 'completed', before: '2026-11-18T10:00:00Z', q: 'asha' } });
  });

  it('marks ready and rejects with a reason', async () => {
    mocked.post.mockResolvedValue({});
    await vendorService.markReady('o1');
    await vendorService.rejectOrder('o1', 'item damaged');
    expect(mocked.post).toHaveBeenNthCalledWith(1, '/vendor/orders/o1/ready', undefined, { auth: true });
    expect(mocked.post).toHaveBeenNthCalledWith(2, '/vendor/orders/o1/reject', { reason: 'item damaged' }, { auth: true });
  });

  it('sends the local-day offset with stats so daily buckets follow the vendor', async () => {
    mocked.get.mockResolvedValue({});
    await vendorService.getStats({ from: 'a', to: 'b', tzOffset: 330 });
    expect(mocked.get).toHaveBeenCalledWith('/vendor/stats', { auth: true, query: { from: 'a', to: 'b', tz_offset: 330 } });
  });

  it('updates stock through the vendor route with a default reason', async () => {
    mocked.put.mockResolvedValue({});
    await vendorService.setInventory('p1', 12);
    expect(mocked.put).toHaveBeenCalledWith('/vendor/inventory/p1', { quantity: 12, reason: 'Updated by vendor' }, { auth: true });
  });
});

describe('adminService order monitoring and vendors', () => {
  it('maps filters onto the admin order query', async () => {
    mocked.get.mockResolvedValue({ orders: [{ id: 'x' }], next_before: 'cursor' });
    const page = await adminService.listOrdersPage({ status: ['completed', 'cancelled'], storeId: 's1', q: ' asha ', before: 'c0' });
    expect(mocked.get.mock.calls[0][0]).toBe('/admin/orders');
    expect(mocked.get.mock.calls[0][1]).toMatchObject({ query: { status: 'completed,cancelled', store_id: 's1', q: 'asha', before: 'c0', limit: 30 } });
    expect(page.next_before).toBe('cursor');
  });

  it('loads one order, the attention queue and scoped dashboard numbers', async () => {
    mocked.get.mockResolvedValue({ orders: [] });
    await adminService.getOrder('o1');
    await adminService.listOrdersNeedingAttention('s1');
    await adminService.getDashboard('s1');
    expect(mocked.get).toHaveBeenCalledWith('/admin/orders/o1', { auth: true });
    expect(mocked.get).toHaveBeenCalledWith('/admin/orders/attention', { auth: true, query: { store_id: 's1' } });
    expect(mocked.get).toHaveBeenCalledWith('/admin/dashboard', { auth: true, query: { store_id: 's1' } });
  });

  it('replaces and removes a store vendor', async () => {
    mocked.put.mockResolvedValue({});
    mocked.delete.mockResolvedValue(undefined);
    await adminService.setStoreVendor('s1', { phone: '+919876543210', name: 'Ravi' });
    await adminService.removeStoreVendor('s1');
    expect(mocked.put).toHaveBeenCalledWith('/admin/stores/s1/vendor', { phone: '+919876543210', name: 'Ravi' }, { auth: true });
    expect(mocked.delete).toHaveBeenCalledWith('/admin/stores/s1/vendor', { auth: true });
  });

  it('can reset a delivery code lockout', async () => {
    mocked.post.mockResolvedValue({});
    await adminService.resetDeliveryCode('o1');
    expect(mocked.post).toHaveBeenCalledWith('/admin/orders/o1/reset-delivery-code', undefined, { auth: true });
  });
});
