package dto

import "time"

type StoreResponse struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Address  string   `json:"address"`
	Pincodes []string `json:"pincodes"`
	IsActive bool     `json:"is_active"`
	// OpenOrders is set when a store is deactivated: pending/accepted orders
	// still being served.
	OpenOrders   int            `json:"open_orders,omitempty"`
	ContactPhone *string        `json:"contact_phone,omitempty"`
	ClosedByRole *string        `json:"closed_by_role,omitempty"`
	Vendor       *VendorSummary `json:"vendor,omitempty"`
}

// VendorSummary is the person who runs a store, as admin sees them.
type VendorSummary struct {
	ID     string  `json:"id"`
	Name   *string `json:"name,omitempty"`
	Phone  string  `json:"phone"`
	Status string  `json:"status"`
}

type CatalogProductResponse struct {
	ID          string   `json:"id"`
	StoreID     string   `json:"store_id,omitempty"`
	Name        string   `json:"name"`
	Description *string  `json:"description,omitempty"`
	SKU         *string  `json:"sku,omitempty"`
	MRP         int      `json:"mrp"`
	Unit        *string  `json:"unit,omitempty"`
	Price       int      `json:"price"`
	ImageURL    *string  `json:"image_url,omitempty"`
	Images      []string `json:"images"`
	CategoryID  *string  `json:"category_id,omitempty"`
	// CategoryName and StoreName let clients label a product without extra
	// lookups; a pincode catalog mixes products from several stores.
	CategoryName *string `json:"category_name,omitempty"`
	StoreName    string  `json:"store_name"`
	Quantity     int     `json:"quantity"`
	IsActive     bool    `json:"is_active"`
}

type CustomerCategoryResponse struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	ImageURL     *string `json:"image_url,omitempty"`
	IsActive     bool    `json:"is_active"`
	DisplayOrder int     `json:"display_order"`
	ProductCount int     `json:"product_count"`
}

type CatalogSearchResponse struct {
	Query      string                   `json:"query"`
	Pincode    string                   `json:"pincode"`
	Products   []CatalogProductResponse `json:"products"`
	Limit      int                      `json:"limit"`
	NextOffset *int                     `json:"next_offset,omitempty"`
}

// PincodeCatalogResponse is the home-screen catalog for one pincode: the union
// of in-stock products across every active store serving it.
type PincodeCatalogResponse struct {
	Pincode     string                   `json:"pincode"`
	Serviceable bool                     `json:"serviceable"`
	Stores      []StoreSummary           `json:"stores"`
	Products    []CatalogProductResponse `json:"products"`
}

type StoreSummary struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type CartItemResponse struct {
	ID          string  `json:"id"`
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	ImageURL    *string `json:"image_url,omitempty"`
	UnitPrice   int     `json:"unit_price"`
	Quantity    int     `json:"quantity"`
	LineTotal   int     `json:"line_total"`
	// AvailableQuantity is the stock the store has right now; below Quantity
	// means the line cannot be fulfilled as-is.
	AvailableQuantity int `json:"available_quantity"`
}

// CartIssue explains why a cart cannot be checked out as it stands.
type CartIssue struct {
	Code              string  `json:"code"`
	ItemID            *string `json:"item_id,omitempty"`
	Message           string  `json:"message"`
	AvailableQuantity *int    `json:"available_quantity,omitempty"`
}

type InventoryAdjustmentResponse struct {
	ID             string    `json:"id"`
	ProductID      string    `json:"product_id"`
	OrderID        *string   `json:"order_id,omitempty"`
	BeforeQuantity int       `json:"before_quantity"`
	ChangeQuantity int       `json:"change_quantity"`
	AfterQuantity  int       `json:"after_quantity"`
	Reason         string    `json:"reason"`
	CreatedAt      time.Time `json:"created_at"`
}

type AdminDashboardResponse struct {
	TotalOrders            int64 `json:"total_orders"`
	TodayOrders            int64 `json:"today_orders"`
	PendingOrders          int64 `json:"pending_orders"`
	AcceptedOrders         int64 `json:"accepted_orders"`
	PickedUpOrders         int64 `json:"picked_up_orders"`
	OutForDeliveryOrders   int64 `json:"out_for_delivery_orders"`
	RiderRejectionsToday   int64 `json:"rider_rejections_today"`
	CompletedOrders        int64 `json:"completed_orders"`
	CancelledOrders        int64 `json:"cancelled_orders"`
	TotalCustomers         int64 `json:"total_customers"`
	TotalProducts          int64 `json:"total_products"`
	ActiveDeliveryPartners int64 `json:"active_delivery_partners"`
	TodayCODCollections    int64 `json:"today_cod_collections"`
	CompletedRevenue       int64 `json:"completed_revenue"`
	LowStockProducts       int64 `json:"low_stock_products"`
}

type CartResponse struct {
	ID        string             `json:"id"`
	StoreID   *string            `json:"store_id,omitempty"`
	StoreName *string            `json:"store_name,omitempty"`
	Items     []CartItemResponse `json:"items"`
	// SubtotalAmount is items only; TotalAmount is what the customer pays
	// (subtotal + delivery + handling). All amounts are in paise.
	SubtotalAmount        int         `json:"subtotal_amount"`
	DeliveryFee           int         `json:"delivery_fee"`
	HandlingFee           int         `json:"handling_fee"`
	TotalAmount           int         `json:"total_amount"`
	FreeDeliveryThreshold int         `json:"free_delivery_threshold"`
	AmountToFreeDelivery  int         `json:"amount_to_free_delivery"`
	MinimumOrderValue     int         `json:"minimum_order_value"`
	AmountToMinimumOrder  int         `json:"amount_to_minimum_order"`
	Issues                []CartIssue `json:"issues"`
	CanCheckout           bool        `json:"can_checkout"`
}

type OrderItemResponse struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	UnitPrice   int    `json:"unit_price"`
	Quantity    int    `json:"quantity"`
	LineTotal   int    `json:"line_total"`
}

type OrderResponse struct {
	ID               string              `json:"id"`
	StoreID          string              `json:"store_id"`
	StoreName        string              `json:"store_name,omitempty"`
	Status           string              `json:"status"`
	PaymentMethod    string              `json:"payment_method"`
	PaymentStatus    string              `json:"payment_status"`
	TotalAmount      int                 `json:"total_amount"`
	RecipientName    string              `json:"recipient_name"`
	DeliveryPhone    string              `json:"delivery_phone"`
	AddressLine1     string              `json:"address_line1"`
	AddressLine2     *string             `json:"address_line2,omitempty"`
	Landmark         *string             `json:"landmark,omitempty"`
	City             string              `json:"city"`
	State            string              `json:"state"`
	Pincode          string              `json:"pincode"`
	Latitude         *float64            `json:"latitude,omitempty"`
	Longitude        *float64            `json:"longitude,omitempty"`
	AcceptedBy       *string             `json:"accepted_by,omitempty"`
	AcceptedAt       *time.Time          `json:"accepted_at,omitempty"`
	PickedUpAt       *time.Time          `json:"picked_up_at,omitempty"`
	OutForDeliveryAt *time.Time          `json:"out_for_delivery_at,omitempty"`
	CompletedAt      *time.Time          `json:"completed_at,omitempty"`
	Items            []OrderItemResponse `json:"items"`
	CreatedAt        time.Time           `json:"created_at"`
	UpdatedAt        time.Time           `json:"updated_at"`
	StatusUpdatedAt  time.Time           `json:"status_updated_at"`

	SubtotalAmount int `json:"subtotal_amount"`
	DeliveryFee    int `json:"delivery_fee"`
	HandlingFee    int `json:"handling_fee"`
	// AmountToCollect is the cash the rider takes at the door (0 once settled).
	AmountToCollect int        `json:"amount_to_collect"`
	CancelledAt     *time.Time `json:"cancelled_at,omitempty"`
	CancelReason    *string    `json:"cancel_reason,omitempty"`
	CancelledByRole *string    `json:"cancelled_by_role,omitempty"`
	// DeliveryCode is only sent to the customer who owns the order, while it is open.
	DeliveryCode string               `json:"delivery_code,omitempty"`
	Rider        *RiderInfo           `json:"rider,omitempty"`
	Events       []OrderEventResponse `json:"events,omitempty"`

	DeliveryInstructions *string    `json:"delivery_instructions,omitempty"`
	ReadyAt              *time.Time `json:"ready_at,omitempty"`
	// The fields below are filled for admin and vendor views only.
	Customer             *CustomerInfo `json:"customer,omitempty"`
	RiderRejections      int           `json:"rider_rejections,omitempty"`
	DeliveryCodeAttempts int           `json:"delivery_code_attempts,omitempty"`
}

// CustomerInfo identifies who placed an order. Vendors never receive it.
type CustomerInfo struct {
	ID    string  `json:"id"`
	Name  *string `json:"name,omitempty"`
	Phone string  `json:"phone"`
}

type RiderInfo struct {
	ID       string  `json:"id,omitempty"`
	Name     *string `json:"name,omitempty"`
	Phone    string  `json:"phone"`
	IsOnline bool    `json:"is_online,omitempty"`
}

type OrderEventResponse struct {
	Status    string    `json:"status"`
	ActorRole string    `json:"actor_role"`
	Note      *string   `json:"note,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	// EventType, Visibility, ActorName and Meta are filled for admin and vendor views.
	EventType  string         `json:"event_type,omitempty"`
	Visibility string         `json:"visibility,omitempty"`
	ActorName  *string        `json:"actor_name,omitempty"`
	Meta       map[string]any `json:"meta,omitempty"`
}

// OrderPage is one page of a customer's orders; pass NextBefore as ?before= for the next.
type OrderPage struct {
	Orders     []OrderResponse `json:"orders"`
	NextBefore *time.Time      `json:"next_before,omitempty"`
}

// AttentionOrder is an open order an admin should look at, with why.
type AttentionOrder struct {
	Order   OrderResponse `json:"order"`
	Reasons []string      `json:"reasons"`
}

// StoreStatsResponse summarises one store's orders over a period. Money is in paise.
type StoreStatsResponse struct {
	StoreID          string           `json:"store_id"`
	From             time.Time        `json:"from"`
	To               time.Time        `json:"to"`
	TotalOrders      int64            `json:"total_orders"`
	CompletedOrders  int64            `json:"completed_orders"`
	CancelledOrders  int64            `json:"cancelled_orders"`
	ActiveOrders     int64            `json:"active_orders"`
	ByStatus         map[string]int64 `json:"by_status"`
	CancelledByRole  map[string]int64 `json:"cancelled_by_role"`
	CompletedRevenue int64            `json:"completed_revenue"`
	// Averages are nil when there is nothing to average.
	AvgSecondsToAccept          *float64            `json:"avg_seconds_to_accept,omitempty"`
	AvgSecondsToReady           *float64            `json:"avg_seconds_to_ready,omitempty"`
	AvgSecondsAcceptToDelivered *float64            `json:"avg_seconds_accept_to_delivered,omitempty"`
	RiderRejections             int64               `json:"rider_rejections"`
	AssignedRiders              int64               `json:"assigned_riders"`
	OnlineRiders                int64               `json:"online_riders"`
	TopProducts                 []StoreStatsProduct `json:"top_products"`
	Daily                       []StoreStatsDay     `json:"daily"`
}

type StoreStatsProduct struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	Quantity    int64  `json:"quantity"`
	Revenue     int64  `json:"revenue"`
}

type StoreStatsDay struct {
	Date      string `json:"date"`
	Orders    int64  `json:"orders"`
	Completed int64  `json:"completed"`
	Revenue   int64  `json:"revenue"`
}
