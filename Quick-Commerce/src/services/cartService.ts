import { api } from './apiClient';
import { Cart } from '../types';

// Passing the delivery address makes the server also check that the cart's store
// delivers there, so mistakes show up in the cart instead of at checkout.
const withAddress = (addressId?: string | null) => (addressId ? { query: { address_id: addressId } } : {});

export async function getCart(addressId?: string | null): Promise<Cart> {
  return api.get<Cart>('/cart', { auth: true, ...withAddress(addressId) });
}

export async function addCartItem(storeId: string, productId: string, quantity: number, addressId?: string | null): Promise<Cart> {
  return api.post<Cart>('/cart/items', { store_id: storeId, product_id: productId, quantity }, { auth: true, ...withAddress(addressId) });
}

export async function updateCartItem(itemId: string, quantity: number, addressId?: string | null): Promise<Cart> {
  return api.patch<Cart>(`/cart/items/${itemId}`, { quantity }, { auth: true, ...withAddress(addressId) });
}

export async function deleteCartItem(itemId: string, addressId?: string | null): Promise<Cart> {
  return api.delete<Cart>(`/cart/items/${itemId}`, { auth: true, ...withAddress(addressId) });
}

export async function clearCart(): Promise<void> {
  await api.delete<void>('/cart', { auth: true });
}
