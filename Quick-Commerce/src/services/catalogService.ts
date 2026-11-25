import { api } from './apiClient';
import { CustomerCategory, PincodeCatalog, Product } from '../types';

/** Home catalog for a pincode. An unserved pincode resolves with serviceable=false. */
export async function productsForPincode(pincode: string): Promise<PincodeCatalog> {
  const response = await api.get<PincodeCatalog>('/catalog/products', { query: { pincode } });
  return {
    pincode: response.pincode,
    serviceable: Boolean(response.serviceable),
    stores: response.stores ?? [],
    products: response.products ?? [],
  };
}

/** Fetch a single product by ID. Used as a deep-link fallback when the product
 *  is not yet in the local catalog cache. Throws for 404 and network errors. */
export async function getProductByID(productId: string): Promise<Product> {
  return api.get<Product>(`/catalog/products/${productId}`);
}

export async function categoriesForPincode(pincode: string): Promise<CustomerCategory[]> {
  const response = await api.get<{ categories: CustomerCategory[] }>('/catalog/categories', { query: { pincode } });
  return response.categories ?? [];
}

export interface CatalogSearchPage {
  query: string;
  pincode: string;
  products: Product[];
  limit: number;
  next_offset?: number | null;
}

export async function searchProducts(pincode: string, query: string, offset = 0, limit = 20): Promise<CatalogSearchPage> {
  const response = await api.get<CatalogSearchPage>('/catalog/search', {
    query: { pincode, q: query, offset, limit },
  });
  return { ...response, products: response.products ?? [], next_offset: response.next_offset ?? null };
}
