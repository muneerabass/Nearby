import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { OrderStatusChip } from '../components/OrderStatusChip';
import { OrderTimeline } from '../components/OrderTimeline';
import { OrderTotalsBlock } from '../components/OrderTotalsBlock';
import { VendorOrderCard } from '../components/VendorOrderCard';
import type { Order, OrderEvent } from '../types';

// Icon fonts need native modules that are not installed in the Jest environment.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// PressableScale only adds a reanimated press animation, which needs native worklets.
jest.mock('../components/PressableScale', () => {
  const { Pressable } = jest.requireActual('react-native');
  return { PressableScale: ({ children, scaleTo: _s, haptic: _h, ...rest }: any) => <Pressable {...rest}>{children}</Pressable> };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const events: OrderEvent[] = [
  { status: 'pending', actor_role: 'customer', note: 'Order placed', created_at: '2026-11-18T10:00:00Z', event_type: 'status_change', visibility: 'all' },
  { status: 'pending', actor_role: 'delivery', actor_name: 'Dev Rider', note: 'Rider rejected assignment: too far', created_at: '2026-11-18T10:05:00Z', event_type: 'rider_rejected', visibility: 'staff', meta: { reason: 'too far' } },
  { status: 'accepted', actor_role: 'admin', note: 'A rider was assigned to your order', created_at: '2026-11-18T10:06:00Z', event_type: 'admin_assigned', visibility: 'all' },
];

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'abcdef12-0000-0000-0000-000000000000',
    store_id: 's1',
    store_name: 'Dev Mart',
    status: 'pending',
    payment_method: 'cod',
    payment_status: 'pending',
    total_amount: 15900,
    subtotal_amount: 13000,
    delivery_fee: 2500,
    handling_fee: 400,
    amount_to_collect: 15900,
    recipient_name: 'Asha',
    delivery_phone: '',
    address_line1: '',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
    items: [
      { product_id: 'p1', product_name: 'Toned Milk 1L', unit_price: 6500, quantity: 2, line_total: 13000 },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('OrderTimeline', () => {
  it('shows staff the typed events, who acted and the detail', async () => {
    await render(<OrderTimeline events={events} staff />);
    expect(screen.getByText('Rider rejected the order')).toBeTruthy();
    expect(screen.getByText('Rider rejected assignment: too far')).toBeTruthy();
    expect(screen.getByText(/Rider · Dev Rider/)).toBeTruthy();
    expect(screen.getByText('Assigned to a rider by admin')).toBeTruthy();
  });

  it('shows customers only the notes they are meant to read', async () => {
    await render(<OrderTimeline events={events.filter((e) => e.visibility !== 'staff')} />);
    expect(screen.getByText('Order placed')).toBeTruthy();
    expect(screen.getByText('A rider was assigned to your order')).toBeTruthy();
    expect(screen.queryByText(/rejected/i)).toBeNull();
  });
});

describe('OrderTotalsBlock', () => {
  it('lists items, fees and the grand total', async () => {
    await render(<OrderTotalsBlock order={makeOrder()} />);
    expect(screen.getByText('Toned Milk 1L')).toBeTruthy();
    expect(screen.getByText('Item total')).toBeTruthy();
    expect(screen.getByText('Delivery fee')).toBeTruthy();
    expect(screen.getByText('Handling charge')).toBeTruthy();
    expect(screen.getByText('To pay')).toBeTruthy();
    expect(screen.getByText('₹159.00')).toBeTruthy();
  });

  it('says Paid once delivered', async () => {
    await render(<OrderTotalsBlock order={makeOrder({ status: 'completed', payment_status: 'paid' })} />);
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});

describe('OrderStatusChip', () => {
  it('labels each status', async () => {
    await render(<OrderStatusChip status="out_for_delivery" />);
    expect(screen.getByText('Out for delivery')).toBeTruthy();
  });
});

describe('VendorOrderCard', () => {
  it('waits for a rider and offers ready and reject while the order is open', async () => {
    const onReady = jest.fn();
    const onReject = jest.fn();
    await render(<VendorOrderCard order={makeOrder({ rider_rejections: 1 })} onPress={jest.fn()} onReady={onReady} onReject={onReject} />);
    expect(screen.getByText('#ABCDEF12')).toBeTruthy();
    expect(screen.getByText(/Waiting for a rider \(rejected 1×\)/)).toBeTruthy();
    expect(screen.getByText('Toned Milk 1L ×2')).toBeTruthy();
    expect(screen.getByText('Mark ready')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('shows the rider who accepted and hides Mark ready once it is ready', async () => {
    const order = makeOrder({ status: 'accepted', accepted_at: new Date().toISOString(), ready_at: new Date().toISOString(), rider: { name: 'Dev Rider', phone: '+919000000001' } });
    await render(<VendorOrderCard order={order} onPress={jest.fn()} onReady={jest.fn()} onReject={jest.fn()} />);
    expect(screen.getByText(/Rider: Dev Rider/)).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.queryByText('Mark ready')).toBeNull();
  });

  it('offers no actions on finished orders and shows who cancelled', async () => {
    const order = makeOrder({ status: 'cancelled', cancelled_by_role: 'vendor', cancel_reason: 'item damaged' });
    await render(<VendorOrderCard order={order} onPress={jest.fn()} onReady={jest.fn()} onReject={jest.fn()} />);
    expect(screen.getByText('Rejected by the store')).toBeTruthy();
    expect(screen.getByText('item damaged')).toBeTruthy();
    expect(screen.queryByText('Reject')).toBeNull();
  });
});
