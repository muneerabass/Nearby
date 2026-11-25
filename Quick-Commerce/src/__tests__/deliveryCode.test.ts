import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDeliveryCode, getDeliveryCode, saveDeliveryCode } from '../services/storage';

describe('delivery code client cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists the one-time code across reads and clears it', async () => {
    await saveDeliveryCode('order-1', '123456');
    await expect(getDeliveryCode('order-1')).resolves.toBe('123456');

    await clearDeliveryCode('order-1');
    await expect(getDeliveryCode('order-1')).resolves.toBeNull();
  });

  it('does not create a cache entry for an empty code', async () => {
    await saveDeliveryCode('order-2', '');
    await expect(getDeliveryCode('order-2')).resolves.toBeNull();
  });
});
