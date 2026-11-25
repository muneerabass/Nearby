package services

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// OrderPolicy holds the tunable business rules for carts and orders. Amounts
// are in paise. Set it once at startup with SetOrderPolicy.
type OrderPolicy struct {
	MinimumOrderValue     int
	DeliveryFee           int
	HandlingFee           int
	FreeDeliveryThreshold int
	// AcceptTimeout is how long a pending order waits for a rider before it is
	// cancelled automatically.
	AcceptTimeout time.Duration
	// PendingAttentionAfter is how long a pending order may wait for a rider
	// before it shows in the admin "needs attention" queue.
	PendingAttentionAfter time.Duration
	// StaleAcceptedAfter is how long a rider may hold an accepted order before
	// it shows in the admin "needs attention" queue.
	StaleAcceptedAfter time.Duration
	MaxLineQuantity    int
	MaxCartLines       int
	MaxCodeAttempts    int
}

func DefaultOrderPolicy() OrderPolicy {
	return OrderPolicy{
		MinimumOrderValue: 0,
		DeliveryFee:       2500, HandlingFee: 400, FreeDeliveryThreshold: 19900,
		AcceptTimeout: 30 * time.Minute, StaleAcceptedAfter: 60 * time.Minute, PendingAttentionAfter: 10 * time.Minute,
		MaxLineQuantity: 20, MaxCartLines: 50, MaxCodeAttempts: 5,
	}
}

var orderPolicy = DefaultOrderPolicy()

// SetOrderPolicy overrides the defaults. A negative fee keeps its default and a
// non-positive duration keeps its default.
func SetOrderPolicy(p OrderPolicy) {
	d := DefaultOrderPolicy()
	if p.MinimumOrderValue >= 0 {
		d.MinimumOrderValue = p.MinimumOrderValue
	}
	if p.DeliveryFee >= 0 {
		d.DeliveryFee = p.DeliveryFee
	}
	if p.HandlingFee >= 0 {
		d.HandlingFee = p.HandlingFee
	}
	if p.FreeDeliveryThreshold >= 0 {
		d.FreeDeliveryThreshold = p.FreeDeliveryThreshold
	}
	if p.AcceptTimeout > 0 {
		d.AcceptTimeout = p.AcceptTimeout
	}
	if p.StaleAcceptedAfter > 0 {
		d.StaleAcceptedAfter = p.StaleAcceptedAfter
	}
	orderPolicy = d
}

// StaleAcceptedAfter exposes the admin-queue threshold to handlers.
func StaleAcceptedAfter() time.Duration { return orderPolicy.StaleAcceptedAfter }

// fees returns the delivery and handling fee for a subtotal. An empty cart pays
// nothing; delivery is free from the threshold upwards.
func (p OrderPolicy) fees(subtotal int) (delivery, handling int) {
	if subtotal <= 0 {
		return 0, 0
	}
	if subtotal < p.FreeDeliveryThreshold {
		delivery = p.DeliveryFee
	}
	return delivery, p.HandlingFee
}

var (
	ErrOrderNotCancellable = errors.New("this order can no longer be cancelled")
	ErrDeliveryCodeLocked  = errors.New("too many wrong delivery codes; ask support to complete this order")
	ErrActiveOrders        = errors.New("finish or cancel your open orders first")
)

// InvalidDeliveryCodeError reports a wrong code and how many tries are left.
type InvalidDeliveryCodeError struct{ Remaining int }

func (e *InvalidDeliveryCodeError) Error() string {
	return fmt.Sprintf("that delivery code is incorrect (%d tries left)", e.Remaining)
}

// CartUnavailableError means the cart cannot be fulfilled as it stands.
type CartUnavailableError struct{ Issues []dto.CartIssue }

func (e *CartUnavailableError) Error() string {
	if len(e.Issues) > 0 {
		return e.Issues[0].Message
	}
	return "some items in your cart are no longer available"
}

const (
	issueOutOfStock   = "out_of_stock"
	issueInsufficient = "insufficient_stock"
	issueStoreClosed  = "store_inactive"
	issueNotServed    = "not_serviceable"
	issueMinimumOrder = "minimum_order"
)

// cartView is a cart priced and checked against live stock, store state and
// (when an address is given) serviceability. Both the cart preview and order
// creation use it, so they cannot disagree.
type cartView struct {
	Response dto.CartResponse
	Items    []domain.CartItem
	Products []*domain.Product
	Store    *domain.Store
}

func (v cartView) hasIssue(code string) bool {
	for _, issue := range v.Response.Issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}

func buildCartView(db *gorm.DB, catalog repository.CatalogRepository, commerce repository.CommerceRepository, cart *domain.Cart, address *domain.UserAddress) (cartView, error) {
	items, err := commerce.ListCartItems(db, cart.ID)
	if err != nil {
		return cartView{}, err
	}
	view := cartView{Items: items}
	view.Response = dto.CartResponse{ID: cart.ID.String(), Items: make([]dto.CartItemResponse, 0, len(items)), Issues: []dto.CartIssue{}}
	if cart.StoreID != nil {
		store, err := catalog.FindStore(db, *cart.StoreID)
		if err != nil {
			return cartView{}, err
		}
		view.Store = store
		id, name := store.ID.String(), store.Name
		view.Response.StoreID, view.Response.StoreName = &id, &name
	}
	subtotal := 0
	for _, item := range items {
		product, err := catalog.FindProduct(db, item.ProductID)
		if err != nil {
			return cartView{}, err
		}
		view.Products = append(view.Products, product)
		available := 0
		if cart.StoreID != nil {
			inventory, err := catalog.FindInventoryForUpdate(db, *cart.StoreID, item.ProductID)
			if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return cartView{}, err
			}
			if err == nil {
				available = inventory.Quantity
			}
		}
		lineTotal := product.Price * item.Quantity
		subtotal += lineTotal
		itemID := item.ID.String()
		view.Response.Items = append(view.Response.Items, dto.CartItemResponse{
			ID: itemID, ProductID: product.ID.String(), ProductName: product.Name, ImageURL: product.ImageURL,
			UnitPrice: product.Price, Quantity: item.Quantity, LineTotal: lineTotal, AvailableQuantity: available,
		})
		switch {
		case available <= 0:
			view.Response.Issues = append(view.Response.Issues, dto.CartIssue{Code: issueOutOfStock, ItemID: &itemID, Message: product.Name + " is out of stock"})
		case available < item.Quantity:
			left := available
			view.Response.Issues = append(view.Response.Issues, dto.CartIssue{Code: issueInsufficient, ItemID: &itemID, AvailableQuantity: &left,
				Message: fmt.Sprintf("Only %d of %s left", available, product.Name)})
		}
	}
	if view.Store != nil && !view.Store.IsActive {
		view.Response.Issues = append(view.Response.Issues, dto.CartIssue{Code: issueStoreClosed, Message: view.Store.Name + " is currently closed"})
	}
	if view.Store != nil && address != nil {
		serves, err := catalog.StoreServesPincode(db, view.Store.ID, address.Pincode)
		if err != nil {
			return cartView{}, err
		}
		if !serves {
			view.Response.Issues = append(view.Response.Issues, dto.CartIssue{Code: issueNotServed,
				Message: fmt.Sprintf("%s doesn't deliver to %s", view.Store.Name, address.Pincode)})
		}
	}
	if subtotal > 0 && subtotal < orderPolicy.MinimumOrderValue {
		missing := orderPolicy.MinimumOrderValue - subtotal
		view.Response.Issues = append(view.Response.Issues, dto.CartIssue{Code: issueMinimumOrder,
			Message: fmt.Sprintf("Add %d more to reach the minimum order value", missing)})
	}
	delivery, handling := orderPolicy.fees(subtotal)
	r := &view.Response
	r.SubtotalAmount, r.DeliveryFee, r.HandlingFee = subtotal, delivery, handling
	r.TotalAmount = subtotal + delivery + handling
	r.FreeDeliveryThreshold = orderPolicy.FreeDeliveryThreshold
	r.MinimumOrderValue = orderPolicy.MinimumOrderValue
	if subtotal > 0 && subtotal < orderPolicy.MinimumOrderValue {
		r.AmountToMinimumOrder = orderPolicy.MinimumOrderValue - subtotal
	}
	if subtotal > 0 && subtotal < orderPolicy.FreeDeliveryThreshold {
		r.AmountToFreeDelivery = orderPolicy.FreeDeliveryThreshold - subtotal
	}
	r.CanCheckout = len(items) > 0 && len(r.Issues) == 0
	return view, nil
}

// generateDeliveryCode returns a random 6-digit plaintext code (L-004).
func generateDeliveryCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// hashDeliveryCode produces an "hmac:<hex>" string so that callers can
// distinguish hashed codes from legacy plaintext codes (L-004/L-006).
// Including the order ID in the HMAC message binds each hash to exactly one
// order, preventing cross-order code reuse.
// When secret is empty (no WithDeliveryCodeSecret call), falls back to a plain
// SHA-256 — still not stored in plaintext, but weaker. Callers should always
// provide a secret in production.
func hashDeliveryCode(secret []byte, orderID uuid.UUID, code string) string {
	msg := orderID.String() + ":" + code
	var digest []byte
	if len(secret) > 0 {
		mac := hmac.New(sha256.New, secret)
		_, _ = mac.Write([]byte(msg))
		digest = mac.Sum(nil)
	} else {
		sum := sha256.Sum256([]byte(msg))
		digest = sum[:]
	}
	return "hmac:" + hex.EncodeToString(digest)
}

// isHashedDeliveryCode reports whether the stored code was produced by
// hashDeliveryCode (and should never be returned to the client in plaintext).
func isHashedDeliveryCode(stored string) bool {
	return strings.HasPrefix(stored, "hmac:")
}

func (s *OrderService) recordEvent(tx *gorm.DB, orderID uuid.UUID, status string, actorID *uuid.UUID, role, note string) error {
	return s.recordTypedEvent(tx, orderID, status, actorID, role, note, domain.EventStatusChange, domain.VisibilityAll, nil)
}

// recordTypedEvent appends a history entry that also says what kind of event it
// is and who may see it. meta carries structured detail such as the previous
// rider or a rejection reason.
func (s *OrderService) recordTypedEvent(tx *gorm.DB, orderID uuid.UUID, status string, actorID *uuid.UUID, role, note, eventType, visibility string, meta map[string]any) error {
	event := &domain.OrderEvent{OrderID: orderID, Status: status, ActorID: actorID, ActorRole: role,
		EventType: eventType, Visibility: visibility, CreatedAt: time.Now().UTC()}
	if note != "" {
		event.Note = &note
	}
	if len(meta) > 0 {
		encoded, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		text := string(encoded)
		event.Meta = &text
	}
	return s.commerce.AppendOrderEvent(tx, event)
}

// cancelOrder is the single place an order is cancelled: status flip, stock
// restore and history entry succeed or fail together.
func (s *OrderService) cancelOrder(orderID uuid.UUID, onlyUser *uuid.UUID, allowed []string, actorID *uuid.UUID, role, reason string) error {
	return s.cancelOrderScoped(orderID, onlyUser, nil, allowed, actorID, role, reason)
}

// cancelOrderScoped is cancelOrder restricted to one customer and/or one store.
// An order outside the scope is reported as not found, never as forbidden.
func (s *OrderService) cancelOrderScoped(orderID uuid.UUID, onlyUser, onlyStore *uuid.UUID, allowed []string, actorID *uuid.UUID, role, reason string) error {
	for _, state := range allowed {
		if err := ValidateOrderTransition(state, string(OrderCancelled), role); err != nil {
			return err
		}
	}
	now := time.Now().UTC()
	return s.db.Transaction(func(tx *gorm.DB) error {
		err := s.commerce.CancelOrder(tx, orderID, onlyUser, allowed, repository.OrderCancellation{ActorID: actorID, Role: role, Reason: reason, Now: now, StoreID: onlyStore})
		if errors.Is(err, repository.ErrOrderUnavailable) {
			// Tell "not yours / doesn't exist" apart from "too late".
			order, findErr := s.commerce.FindOrderByID(tx, orderID)
			if findErr != nil || (onlyUser != nil && order.UserID != *onlyUser) || (onlyStore != nil && order.StoreID != *onlyStore) {
				return repository.ErrNotFound
			}
			return ErrOrderNotCancellable
		}
		if err != nil {
			return err
		}
		if err := s.commerce.RestoreInventory(tx, orderID, now); err != nil {
			return err
		}
		return s.recordEvent(tx, orderID, "cancelled", actorID, role, reason)
	})
}

// Cancel lets a customer cancel their own order until a rider accepts it.
func (s *OrderService) Cancel(userID, orderID uuid.UUID, reason string) (dto.OrderResponse, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "Cancelled by customer"
	}
	if len(reason) > 300 {
		return dto.OrderResponse{}, fmt.Errorf("%w: reason is too long", ErrInvalidInput)
	}
	if err := s.cancelOrder(orderID, &userID, []string{"pending"}, &userID, "customer", reason); err != nil {
		return dto.OrderResponse{}, err
	}
	return s.Get(userID, orderID)
}

// AdminCancel force-cancels an open order (e.g. an unreachable rider or customer).
func (s *OrderService) AdminCancel(adminID, orderID uuid.UUID, reason string) (dto.OrderResponse, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return dto.OrderResponse{}, fmt.Errorf("%w: a reason is required", ErrInvalidInput)
	}
	if len(reason) > 300 {
		return dto.OrderResponse{}, fmt.Errorf("%w: reason is too long", ErrInvalidInput)
	}
	if err := s.cancelOrder(orderID, nil, []string{"pending", "accepted", "picked_up", "out_for_delivery"}, &adminID, "admin", reason); err != nil {
		return dto.OrderResponse{}, err
	}
	return s.adminOrder(orderID)
}

// AdminReassign puts an accepted order back in the pending pool for another rider.
func (s *OrderService) AdminReassign(adminID, orderID uuid.UUID) (dto.OrderResponse, error) {
	if err := ValidateOrderTransition(string(OrderAccepted), string(OrderPending), "admin"); err != nil {
		return dto.OrderResponse{}, err
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		previous, findErr := s.commerce.FindOrderByID(tx, orderID)
		if findErr != nil {
			return findErr
		}
		if err := s.commerce.ReassignOrder(tx, orderID, time.Now().UTC()); err != nil {
			return err
		}
		meta := map[string]any{}
		if previous.AcceptedBy != nil {
			meta["previous_rider_id"] = previous.AcceptedBy.String()
		}
		return s.recordTypedEvent(tx, orderID, "pending", &adminID, "admin", "Reassigned by admin", domain.EventReassigned, domain.VisibilityAll, meta)
	})
	if errors.Is(err, repository.ErrOrderUnavailable) {
		if _, findErr := s.commerce.FindOrderByID(nil, orderID); findErr != nil {
			return dto.OrderResponse{}, repository.ErrNotFound
		}
		return dto.OrderResponse{}, ErrOrderNotCancellable
	}
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.adminOrder(orderID)
}

func (s *OrderService) adminOrder(orderID uuid.UUID) (dto.OrderResponse, error) {
	order, err := s.commerce.FindOrderByID(nil, orderID)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.mapOrderDetail(order, viewerAdmin)
}

// SweepStalePending cancels pending orders no rider took within the accept
// timeout. It is safe to run on several instances at once.
func (s *OrderService) SweepStalePending(now time.Time) (int, error) {
	cutoff := now.Add(-orderPolicy.AcceptTimeout)
	cancelled := 0
	err := s.db.Transaction(func(tx *gorm.DB) error {
		ids, err := s.commerce.ListStalePendingOrderIDs(tx, cutoff, 50)
		if err != nil {
			return err
		}
		for _, id := range ids {
			err := s.commerce.CancelOrder(tx, id, nil, []string{"pending"}, repository.OrderCancellation{
				Role: "system", Reason: "No rider accepted your order in time", Now: now})
			if errors.Is(err, repository.ErrOrderUnavailable) {
				continue
			}
			if err != nil {
				return err
			}
			if err := s.commerce.RestoreInventory(tx, id, now); err != nil {
				return err
			}
			if err := s.recordTypedEvent(tx, id, "cancelled", nil, "system", "No rider accepted your order in time", domain.EventAutoCancelled, domain.VisibilityAll, nil); err != nil {
				return err
			}
			cancelled++
		}
		return nil
	})
	return cancelled, err
}

// StartOrderSweeper runs SweepStalePending every interval until ctx ends.
func StartOrderSweeper(ctx context.Context, orders *OrderService, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if n, err := orders.SweepStalePending(now.UTC()); err != nil {
					log.Printf("order sweeper: %v", err)
				} else if n > 0 {
					log.Printf("order sweeper: cancelled %d stale pending order(s)", n)
				}
			}
		}
	}()
}

// verifyDeliveryCode checks the customer's code, counting wrong tries.
// It handles two stored formats:
//   - "hmac:<hex>": new format — hash the input and compare (L-004/L-006).
//   - anything else: legacy plaintext — compare directly (safe migration path).
func (s *OrderService) verifyDeliveryCode(order *domain.Order, code string) error {
	if order.DeliveryCode == "" { // legacy order placed before codes existed
		return nil
	}
	max := orderPolicy.MaxCodeAttempts
	// Fast-path: already locked from a previous attempt (stale read is fine
	// here — we'll never unlock an order that is locked).
	if order.DeliveryCodeAttempts >= max {
		return ErrDeliveryCodeLocked
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return fmt.Errorf("%w: enter the delivery code the customer shows you", ErrInvalidInput)
	}
	var match bool
	if isHashedDeliveryCode(order.DeliveryCode) {
		// New HMAC path: hash the submitted code and compare with stored hash.
		want := hashDeliveryCode(s.codeSecret, order.ID, code)
		match = subtle.ConstantTimeCompare([]byte(want), []byte(order.DeliveryCode)) == 1
	} else {
		// Legacy plaintext path for orders created before L-004 (safe migration).
		match = subtle.ConstantTimeCompare([]byte(code), []byte(order.DeliveryCode)) == 1
	}
	if match {
		return nil
	}
	// M-003: the increment is atomic — the WHERE clause in RecordWrongDeliveryCode
	// ensures two concurrent wrong-code requests cannot both push the counter
	// past the limit. The returned count is authoritative.
	attempts, err := s.commerce.RecordWrongDeliveryCode(nil, order.ID, max)
	if err != nil {
		return err
	}
	if attempts >= max {
		// Record the lockout once: only the request that crossed the limit
		// (the caller's read was one below it) writes the event.
		if order.DeliveryCodeAttempts < max {
			_ = s.recordTypedEvent(s.db, order.ID, order.Status, order.AcceptedBy, "delivery",
				fmt.Sprintf("Delivery code locked after %d wrong attempts", max), domain.EventDeliveryCodeLocked, domain.VisibilityStaff, nil)
		}
		return ErrDeliveryCodeLocked
	}
	return &InvalidDeliveryCodeError{Remaining: max - attempts}
}

type orderViewer int

const (
	viewerCustomer orderViewer = iota
	viewerRider
	viewerAdmin
	viewerVendor
)

// mapOrderDetail is mapOrder plus the history, rider and (for the owner) the delivery code.
// Staff-only events are shown to admins and vendors, never to customers or riders.
func (s *OrderService) mapOrderDetail(order *domain.Order, viewer orderViewer) (dto.OrderResponse, error) {
	response, err := s.mapOrder(order)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	staff := viewer == viewerAdmin || viewer == viewerVendor
	events, err := s.commerce.ListOrderEvents(nil, order.ID)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	actorNames := map[uuid.UUID]string{}
	if staff {
		actorNames = s.eventActorNames(events)
	}
	for _, event := range events {
		if event.Visibility == domain.VisibilityStaff && !staff {
			continue
		}
		mapped := dto.OrderEventResponse{Status: event.Status, ActorRole: event.ActorRole, Note: event.Note, CreatedAt: event.CreatedAt,
			EventType: event.EventType, Visibility: event.Visibility}
		if staff {
			if event.ActorID != nil {
				if name, ok := actorNames[*event.ActorID]; ok {
					mapped.ActorName = &name
				}
			}
			if event.Meta != nil {
				var meta map[string]any
				if json.Unmarshal([]byte(*event.Meta), &meta) == nil {
					mapped.Meta = meta
				}
			}
		}
		response.Events = append(response.Events, mapped)
	}
	if staff {
		rows := []dto.OrderResponse{response}
		if err := s.enrichStaff([]domain.Order{*order}, rows, viewer); err != nil {
			return dto.OrderResponse{}, err
		}
		response = rows[0]
	} else if viewer != viewerRider && order.AcceptedBy != nil && IsOrderActive(order.Status) && order.Status != string(OrderPending) {
		var rider struct {
			Name  *string
			Phone string
		}
		if err := s.db.Table("users").Select("name, phone").Where("id = ?", *order.AcceptedBy).Scan(&rider).Error; err == nil && rider.Phone != "" {
			response.Rider = &dto.RiderInfo{Name: rider.Name, Phone: rider.Phone}
		}
	}
	// L-004/L-006: only return the delivery code to the customer when it is still
	// in plaintext (legacy orders). Hashed codes are never returned; the customer
	// received the plaintext once at order creation (in OrderService.Create).
	if viewer == viewerCustomer && IsOrderActive(order.Status) {
		if !isHashedDeliveryCode(order.DeliveryCode) {
			response.DeliveryCode = order.DeliveryCode
		}
	}
	return response, nil
}
