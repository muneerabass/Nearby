package domain

import (
	"time"

	"github.com/google/uuid"
)

type Store struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Latitude  *float64  `json:"latitude,omitempty"`
	Longitude *float64  `json:"longitude,omitempty"`
	IsActive  bool      `json:"is_active"`
	// ContactPhone is the number riders and admin use to reach the store.
	ContactPhone *string `json:"contact_phone,omitempty"`
	// ClosedByRole records who deactivated the store: "admin" or "vendor".
	ClosedByRole *string   `json:"closed_by_role,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	// Pincodes are the postal codes this store delivers to. They live in the
	// store_pincodes table and are loaded separately.
	Pincodes []string `json:"pincodes" gorm:"-"`
}

// StorePincode marks a pincode as serviceable by a store.
type StorePincode struct {
	StoreID   uuid.UUID `gorm:"type:uuid;primaryKey"`
	Pincode   string    `gorm:"primaryKey"`
	CreatedAt time.Time
}

type Category struct {
	ID           uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	Name         string    `json:"name"`
	ImageURL     *string   `json:"image_url,omitempty"`
	IsActive     bool      `json:"is_active" gorm:"default:true"`
	DisplayOrder int       `json:"display_order"`
	ProductCount int       `json:"-" gorm:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Product struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	StoreID     uuid.UUID  `json:"store_id" gorm:"type:uuid;index"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	SKU         *string    `json:"sku,omitempty"`
	MRP         int        `json:"mrp"`
	Unit        *string    `json:"unit,omitempty"`
	Price       int        `json:"price"`
	ImageURL    *string    `json:"image_url,omitempty"`
	Images      []string   `json:"images" gorm:"serializer:json"`
	CategoryID  *uuid.UUID `json:"category_id,omitempty" gorm:"type:uuid"`
	IsActive    bool       `json:"is_active" gorm:"default:true"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type ProductInventory struct {
	ID           uuid.UUID  `json:"id"`
	StoreID      uuid.UUID  `json:"store_id"`
	Name         string     `json:"name"`
	Description  *string    `json:"description,omitempty"`
	SKU          *string    `json:"sku,omitempty"`
	MRP          int        `json:"mrp"`
	Unit         *string    `json:"unit,omitempty"`
	Price        int        `json:"price"`
	ImageURL     *string    `json:"image_url,omitempty"`
	Images       []string   `json:"images" gorm:"serializer:json"`
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	Quantity     int        `json:"quantity"`
	IsActive     bool       `json:"is_active"`
	StoreName    string     `json:"store_name"`
	CategoryName *string    `json:"category_name,omitempty"`
}

type Inventory struct {
	ID                uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	StoreID           uuid.UUID `json:"store_id" gorm:"type:uuid;index"`
	ProductID         uuid.UUID `json:"product_id" gorm:"type:uuid;index"`
	Quantity          int       `json:"quantity"`
	LowStockThreshold int       `json:"low_stock_threshold"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (Inventory) TableName() string { return "inventory" }

type Cart struct {
	ID        uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID  `json:"user_id" gorm:"type:uuid;uniqueIndex"`
	StoreID   *uuid.UUID `json:"store_id,omitempty" gorm:"type:uuid"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type CartItem struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	CartID    uuid.UUID `json:"cart_id" gorm:"type:uuid;index"`
	ProductID uuid.UUID `json:"product_id" gorm:"type:uuid;index"`
	Quantity  int       `json:"quantity"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Order struct {
	ID                   uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	UserID               uuid.UUID  `json:"user_id" gorm:"type:uuid;index"`
	StoreID              uuid.UUID  `json:"store_id" gorm:"type:uuid;index"`
	Status               string     `json:"status"`
	PaymentMethod        string     `json:"payment_method"`
	PaymentStatus        string     `json:"payment_status"`
	TotalAmount          int        `json:"total_amount"`
	RecipientName        string     `json:"recipient_name"`
	DeliveryPhone        string     `json:"delivery_phone"`
	AddressLine1         string     `json:"address_line1"`
	AddressLine2         *string    `json:"address_line2,omitempty"`
	Landmark             *string    `json:"landmark,omitempty"`
	City                 string     `json:"city"`
	State                string     `json:"state"`
	Pincode              string     `json:"pincode"`
	Latitude             *float64   `json:"latitude,omitempty"`
	Longitude            *float64   `json:"longitude,omitempty"`
	DeliveryInstructions *string    `json:"delivery_instructions,omitempty"`
	AcceptedBy           *uuid.UUID `json:"accepted_by,omitempty" gorm:"type:uuid"`
	AcceptedAt           *time.Time `json:"accepted_at,omitempty"`
	PickedUpAt           *time.Time `json:"picked_up_at,omitempty"`
	OutForDeliveryAt     *time.Time `json:"out_for_delivery_at,omitempty"`
	CompletedAt          *time.Time `json:"completed_at,omitempty"`
	ReadyAt              *time.Time `json:"ready_at,omitempty"`
	ReadyBy              *uuid.UUID `json:"-" gorm:"type:uuid"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`

	// TotalAmount is the grand total (subtotal + fees) the rider collects.
	SubtotalAmount       int        `json:"subtotal_amount"`
	DeliveryFee          int        `json:"delivery_fee"`
	HandlingFee          int        `json:"handling_fee"`
	CancelledAt          *time.Time `json:"cancelled_at,omitempty"`
	CancelledBy          *uuid.UUID `json:"-" gorm:"type:uuid"`
	CancelledByRole      *string    `json:"-"`
	CancelReason         *string    `json:"cancel_reason,omitempty"`
	DeliveryCode         string     `json:"-"`
	DeliveryCodeAttempts int        `json:"-"`
	IdempotencyKey       *string    `json:"-"`
}

// Order event types. status_change is an ordinary lifecycle step; the others are
// operational facts admins and vendors need to see.
const (
	EventStatusChange       = "status_change"
	EventRiderRejected      = "rider_rejected"
	EventReassigned         = "reassigned"
	EventAdminAssigned      = "admin_assigned"
	EventVendorReady        = "vendor_ready"
	EventDeliveryCodeLocked = "delivery_code_locked"
	EventDeliveryCodeReset  = "delivery_code_reset"
	EventAutoCancelled      = "auto_cancelled"
)

// Event visibility: "all" is shown to the customer too, "staff" only to
// admins, vendors and riders.
const (
	VisibilityAll   = "all"
	VisibilityStaff = "staff"
)

// OrderEvent is one entry in an order's status history.
type OrderEvent struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	OrderID    uuid.UUID `gorm:"type:uuid;index"`
	Status     string
	ActorID    *uuid.UUID `gorm:"type:uuid"`
	ActorRole  string
	Note       *string
	EventType  string  `gorm:"default:status_change"`
	Visibility string  `gorm:"default:all"`
	Meta       *string `gorm:"type:jsonb"`
	CreatedAt  time.Time
}

func (OrderEvent) TableName() string { return "order_status_events" }

type OrderItem struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	OrderID     uuid.UUID `json:"order_id" gorm:"type:uuid;index"`
	ProductID   uuid.UUID `json:"product_id" gorm:"type:uuid"`
	ProductName string    `json:"product_name"`
	UnitPrice   int       `json:"unit_price"`
	Quantity    int       `json:"quantity"`
	LineTotal   int       `json:"line_total"`
}

type DeliveryStoreAssignment struct {
	ID         uuid.UUID `json:"id" gorm:"type:uuid;primaryKey"`
	DeliveryID uuid.UUID `json:"delivery_id" gorm:"type:uuid;index"`
	StoreID    uuid.UUID `json:"store_id" gorm:"type:uuid;index"`
	CreatedAt  time.Time `json:"created_at"`
}

// VendorStoreAssignment links a vendor login to the one store it manages.
type VendorStoreAssignment struct {
	VendorID  uuid.UUID `json:"vendor_id" gorm:"type:uuid;primaryKey"`
	StoreID   uuid.UUID `json:"store_id" gorm:"type:uuid;index"`
	CreatedAt time.Time `json:"created_at"`
}

type InventoryAdjustment struct {
	ID             uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey"`
	StoreID        uuid.UUID  `json:"store_id" gorm:"type:uuid"`
	ProductID      uuid.UUID  `json:"product_id" gorm:"type:uuid"`
	ActorID        *uuid.UUID `json:"actor_id,omitempty" gorm:"type:uuid"`
	OrderID        *uuid.UUID `json:"order_id,omitempty" gorm:"type:uuid"`
	BeforeQuantity int        `json:"before_quantity"`
	ChangeQuantity int        `json:"change_quantity"`
	AfterQuantity  int        `json:"after_quantity"`
	Reason         string     `json:"reason"`
	CreatedAt      time.Time  `json:"created_at"`
}

func (InventoryAdjustment) TableName() string { return "inventory_adjustments" }
