package dto

type StoreRequest struct {
	Name         string   `json:"name"`
	Address      string   `json:"address"`
	Pincodes     []string `json:"pincodes"`
	IsActive     *bool    `json:"is_active"`
	ContactPhone *string  `json:"contact_phone"`
	// Vendor, when set, creates the store's vendor login in the same transaction.
	Vendor *StoreVendorRequest `json:"vendor"`
}

type StorePatchRequest struct {
	Name         *string   `json:"name"`
	Address      *string   `json:"address"`
	Pincodes     *[]string `json:"pincodes"`
	IsActive     *bool     `json:"is_active"`
	ContactPhone *string   `json:"contact_phone"`
}

// StoreVendorRequest names the person who runs a store. They sign in with the
// phone number through the normal OTP flow.
type StoreVendorRequest struct {
	Phone string  `json:"phone"`
	Name  *string `json:"name"`
}

// VendorStorePatchRequest is what a vendor may change on their own store.
type VendorStorePatchRequest struct {
	IsActive     *bool   `json:"is_active"`
	ContactPhone *string `json:"contact_phone"`
}

type ProductRequest struct {
	StoreID     string   `json:"store_id"`
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	SKU         *string  `json:"sku"`
	MRP         int      `json:"mrp"`
	Unit        *string  `json:"unit"`
	Price       int      `json:"price"`
	ImageURL    *string  `json:"image_url"`
	Images      []string `json:"images"`
	CategoryID  *string  `json:"category_id"`
	// Quantity is the initial stock set for this product at its store.
	Quantity *int `json:"quantity"`
}

type ProductPatchRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	SKU         *string   `json:"sku"`
	MRP         *int      `json:"mrp"`
	Unit        *string   `json:"unit"`
	Price       *int      `json:"price"`
	ImageURL    *string   `json:"image_url"`
	Images      *[]string `json:"images"`
	CategoryID  *string   `json:"category_id"`
	IsActive    *bool     `json:"is_active"`
}

type InventoryRequest struct {
	Quantity          int    `json:"quantity"`
	Reason            string `json:"reason"`
	LowStockThreshold *int   `json:"low_stock_threshold"`
}

type CategoryRequest struct {
	Name         string  `json:"name"`
	ImageURL     *string `json:"image_url"`
	IsActive     *bool   `json:"is_active"`
	DisplayOrder *int    `json:"display_order"`
}

type AdminUserStatusRequest struct {
	Status string `json:"status"`
}
type AdminOrderAssignmentRequest struct {
	DeliveryID string `json:"delivery_id"`
}

type AddCartItemRequest struct {
	StoreID   string `json:"store_id"`
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type UpdateCartItemRequest struct {
	Quantity int `json:"quantity"`
}

type CreateOrderRequest struct {
	AddressID string `json:"address_id"`
}

type DeliveryUserRequest struct {
	Phone string  `json:"phone"`
	Name  *string `json:"name"`
	// StoreID, when set, assigns the new rider to that store in the same
	// transaction so a partial failure cannot leave an unassigned user (H-004).
	StoreID *string `json:"store_id"`
}

type CompleteOrderRequest struct {
	DeliveryCode string `json:"delivery_code"`
}

type DeliveryAvailabilityRequest struct {
	Online bool `json:"online"`
}
type DeliveryRejectRequest struct {
	Reason string `json:"reason"`
}

type CancelOrderRequest struct {
	Reason string `json:"reason"`
}
