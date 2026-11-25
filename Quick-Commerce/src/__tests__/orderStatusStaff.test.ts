import { attentionLabel, durationLabel, shortOrderId, staffHeadline, whoCancelled, whoCancelledStaff } from '../utils/orderStatus';
import { destinationForRole } from '../navigation/roleRoute';

describe('staff-voiced order copy', () => {
  it('describes a pending order by whether riders have rejected it', () => {
    expect(staffHeadline({ status: 'pending' })).toBe('Waiting for a rider to accept');
    expect(staffHeadline({ status: 'pending', rider_rejections: 2 })).toContain('rejected 2×');
  });

  it('says whether an accepted order is ready for pickup', () => {
    expect(staffHeadline({ status: 'accepted', ready_at: null })).toContain('not marked ready');
    expect(staffHeadline({ status: 'accepted', ready_at: '2026-11-18T10:00:00Z' })).toContain('ready for pickup');
  });

  it('names who cancelled in staff and customer voice', () => {
    expect(whoCancelledStaff('vendor')).toBe('Rejected by the store');
    expect(whoCancelledStaff('system')).toContain('no rider accepted');
    expect(whoCancelled('vendor')).toContain('store');
    expect(whoCancelled('customer')).toBe('You cancelled this order');
  });

  it('formats durations and ids', () => {
    expect(durationLabel(null)).toBe('—');
    expect(durationLabel(20)).toBe('<1 min');
    expect(durationLabel(12 * 60)).toBe('12 min');
    expect(durationLabel(65 * 60)).toBe('1h 5m');
    expect(shortOrderId('abcdef12-3456')).toBe('#ABCDEF12');
  });

  it('labels every attention reason', () => {
    for (const reason of ['pending_too_long', 'no_rider_online', 'rider_rejected', 'stale_in_progress', 'code_locked'] as const) {
      expect(attentionLabel(reason)).not.toBe(reason);
    }
  });
});

describe('role routing', () => {
  it('sends each known role to its own navigator', () => {
    expect(destinationForRole('admin')).toBe('Admin');
    expect(destinationForRole('delivery')).toBe('Delivery');
    expect(destinationForRole('vendor')).toBe('Vendor');
    expect(destinationForRole('customer')).toBe('Main');
  });

  it('never routes an unknown role into the customer app', () => {
    expect(destinationForRole('superuser')).toBeNull();
    expect(destinationForRole('')).toBeNull();
    expect(destinationForRole(undefined)).toBeNull();
  });
});
