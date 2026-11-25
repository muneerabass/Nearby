package repository

import (
	"errors"
	"strings"
	"time"

	"quick-commerce/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// OrderFilter narrows the admin order list.
type OrderFilter struct {
	Status string
	UserID *uuid.UUID
	// AcceptedBefore keeps only accepted orders a rider took before this time
	// (the "needs attention" queue).
	AcceptedBefore *time.Time
	StoreID        *uuid.UUID
	Limit          int
	Before         *time.Time
	// Statuses narrows to several statuses at once (ignored when Status is set).
	Statuses      []string
	From, To      *time.Time // created_at range, From inclusive, To exclusive
	RiderID       *uuid.UUID // accepted_by
	PaymentStatus string
	// Query matches an order id prefix, the recipient name or the phone.
	Query string
}

// OrderCancellation describes who cancelled an order and why.
type OrderCancellation struct {
	ActorID *uuid.UUID
	Role    string
	Reason  string
	Now     time.Time
	// StoreID, when set, restricts the cancellation to that store's orders.
	StoreID *uuid.UUID
}

func (r *commerceRepository) FindOrderByID(db *gorm.DB, orderID uuid.UUID) (*domain.Order, error) {
	var order domain.Order
	err := dbOrDefault(db, r.db).Where("id = ?", orderID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &order, err
}

func (r *commerceRepository) FindOrderByIdempotencyKey(db *gorm.DB, userID uuid.UUID, key string) (*domain.Order, error) {
	var order domain.Order
	err := dbOrDefault(db, r.db).Where("user_id = ? AND idempotency_key = ?", userID, key).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &order, err
}

func (r *commerceRepository) ListOrdersForUserPage(db *gorm.DB, userID uuid.UUID, limit int, before *time.Time) ([]domain.Order, error) {
	var orders []domain.Order
	query := dbOrDefault(db, r.db).Where("user_id = ?", userID)
	if before != nil {
		query = query.Where("created_at < ?", *before)
	}
	err := query.Order("created_at DESC").Limit(limit).Find(&orders).Error
	return orders, err
}

func (r *commerceRepository) ListOrdersAdmin(db *gorm.DB, filter OrderFilter) ([]domain.Order, error) {
	var orders []domain.Order
	query := dbOrDefault(db, r.db).Model(&domain.Order{})
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	} else if len(filter.Statuses) > 0 {
		query = query.Where("status IN ?", filter.Statuses)
	}
	if filter.From != nil {
		query = query.Where("created_at >= ?", *filter.From)
	}
	if filter.To != nil {
		query = query.Where("created_at < ?", *filter.To)
	}
	if filter.RiderID != nil {
		query = query.Where("accepted_by = ?", *filter.RiderID)
	}
	if filter.PaymentStatus != "" {
		query = query.Where("payment_status = ?", filter.PaymentStatus)
	}
	if q := strings.ToLower(strings.TrimSpace(filter.Query)); q != "" {
		like := "%" + strings.NewReplacer("%", "", "_", "").Replace(q) + "%"
		query = query.Where("LOWER(CAST(id AS TEXT)) LIKE ? OR LOWER(recipient_name) LIKE ? OR delivery_phone LIKE ?", q+"%", like, like)
	}
	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}
	if filter.AcceptedBefore != nil {
		query = query.Where("status IN ('accepted', 'picked_up', 'out_for_delivery') AND accepted_at < ?", *filter.AcceptedBefore)
	}
	if filter.StoreID != nil {
		query = query.Where("store_id = ?", *filter.StoreID)
	}
	if filter.Before != nil {
		query = query.Where("created_at < ?", *filter.Before)
	}
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	err := query.Order("created_at DESC").Limit(limit).Find(&orders).Error
	return orders, err
}

// CancelOrder flips an order to cancelled in one atomic UPDATE. It only matches
// when the order is still in one of the allowed statuses (and, for customers,
// belongs to them), so it cannot race with a rider accepting the order.
func (r *commerceRepository) CancelOrder(db *gorm.DB, orderID uuid.UUID, onlyUser *uuid.UUID, allowed []string, cancel OrderCancellation) error {
	query := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("id = ? AND status IN ?", orderID, allowed)
	if onlyUser != nil {
		query = query.Where("user_id = ?", *onlyUser)
	}
	if cancel.StoreID != nil {
		query = query.Where("store_id = ?", *cancel.StoreID)
	}
	result := query.Updates(map[string]any{
		"status": "cancelled", "cancelled_at": cancel.Now, "cancelled_by": cancel.ActorID,
		"cancelled_by_role": cancel.Role, "cancel_reason": cancel.Reason, "updated_at": cancel.Now,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrOrderUnavailable
	}
	return nil
}

// ReassignOrder puts an accepted order back in the pending pool.
func (r *commerceRepository) ReassignOrder(db *gorm.DB, orderID uuid.UUID, now time.Time) error {
	result := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("id = ? AND status = 'accepted'", orderID).
		Updates(map[string]any{"status": "pending", "accepted_by": nil, "accepted_at": nil, "updated_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrOrderUnavailable
	}
	return nil
}

// RestoreInventory returns an order's items to its store's stock. Call it only
// from the transaction that moved the order to cancelled, so it runs once.
func (r *commerceRepository) RestoreInventory(db *gorm.DB, orderID uuid.UUID, now time.Time) error {
	conn := dbOrDefault(db, r.db)
	var order domain.Order
	if err := conn.Select("id", "store_id").Where("id = ?", orderID).First(&order).Error; err != nil {
		return err
	}
	var items []domain.OrderItem
	if err := conn.Where("order_id = ?", orderID).Find(&items).Error; err != nil {
		return err
	}
	for _, item := range items {
		var inventory domain.Inventory
		if err := conn.Clauses(clause.Locking{Strength: "UPDATE"}).Where("store_id = ? AND product_id = ?", order.StoreID, item.ProductID).First(&inventory).Error; err != nil {
			return err
		}
		before := inventory.Quantity
		after := before + item.Quantity
		if err := conn.Model(&domain.Inventory{}).Where("id = ?", inventory.ID).
			Updates(map[string]any{"quantity": after, "updated_at": now}).Error; err != nil {
			return err
		}
		if err := conn.Create(&domain.InventoryAdjustment{
			ID: uuid.New(), StoreID: order.StoreID, ProductID: item.ProductID, OrderID: &orderID,
			BeforeQuantity: before, ChangeQuantity: item.Quantity, AfterQuantity: after,
			Reason: "Order cancelled: inventory restored", CreatedAt: now,
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

// ListStalePendingOrderIDs locks pending orders older than the cutoff. SKIP
// LOCKED lets several server instances sweep without blocking each other.
func (r *commerceRepository) ListStalePendingOrderIDs(db *gorm.DB, cutoff time.Time, limit int) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	query := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("status = 'pending' AND created_at < ?", cutoff).
		Order("created_at ASC").Limit(limit)
	if db != nil {
		query = query.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"})
	}
	err := query.Pluck("id", &ids).Error
	return ids, err
}

// RecordWrongDeliveryCode atomically increments the failed-attempt counter only
// when it is still below max (M-003). The WHERE clause makes the check and the
// increment a single atomic operation: two concurrent wrong-code requests cannot
// both push the counter past the limit.
//
// Returns the new attempt count, or max when the counter was already at or above
// max (the increment was skipped in that case).
func (r *commerceRepository) RecordWrongDeliveryCode(db *gorm.DB, orderID uuid.UUID, max int) (int, error) {
	conn := dbOrDefault(db, r.db)
	result := conn.Model(&domain.Order{}).
		Where("id = ? AND delivery_code_attempts < ?", orderID, max).
		UpdateColumn("delivery_code_attempts", gorm.Expr("delivery_code_attempts + 1"))
	if result.Error != nil {
		return 0, result.Error
	}
	if result.RowsAffected == 0 {
		// Already at or past the limit; did not increment.
		return max, nil
	}
	var updated domain.Order
	if err := conn.Select("delivery_code_attempts").Where("id = ?", orderID).First(&updated).Error; err != nil {
		return 0, err
	}
	return updated.DeliveryCodeAttempts, nil
}

func (r *commerceRepository) AppendOrderEvent(db *gorm.DB, event *domain.OrderEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}
	return dbOrDefault(db, r.db).Create(event).Error
}

func (r *commerceRepository) ListOrderEvents(db *gorm.DB, orderID uuid.UUID) ([]domain.OrderEvent, error) {
	var events []domain.OrderEvent
	err := dbOrDefault(db, r.db).Where("order_id = ?", orderID).Order("created_at ASC").Find(&events).Error
	return events, err
}

func (r *commerceRepository) CountActiveOrdersForCustomer(db *gorm.DB, userID uuid.UUID) (int64, error) {
	var count int64
	err := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("user_id = ? AND status IN ?", userID, []string{"pending", "accepted", "picked_up", "out_for_delivery"}).Count(&count).Error
	return count, err
}

// CountActiveOrdersForRider counts accepted-but-not-completed orders a rider holds,
// optionally only at one store.
func (r *commerceRepository) CountActiveOrdersForRider(db *gorm.DB, riderID uuid.UUID, storeID *uuid.UUID) (int64, error) {
	var count int64
	query := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("accepted_by = ? AND status IN ?", riderID, []string{"accepted", "picked_up", "out_for_delivery"})
	if storeID != nil {
		query = query.Where("store_id = ?", *storeID)
	}
	err := query.Count(&count).Error
	return count, err
}

func (r *commerceRepository) CountOpenOrdersForStore(db *gorm.DB, storeID uuid.UUID) (int64, error) {
	var count int64
	err := dbOrDefault(db, r.db).Model(&domain.Order{}).Where("store_id = ? AND status IN ?", storeID, []string{"pending", "accepted", "picked_up", "out_for_delivery"}).Count(&count).Error
	return count, err
}

func (r *commerceRepository) FindOrderForStore(db *gorm.DB, storeID, orderID uuid.UUID) (*domain.Order, error) {
	var order domain.Order
	err := dbOrDefault(db, r.db).Where("id = ? AND store_id = ?", orderID, storeID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &order, err
}

// MarkOrderReady stamps ready_at once, while the order is still before pickup.
// It deliberately leaves updated_at alone so "time in status" is not reset.
func (r *commerceRepository) MarkOrderReady(db *gorm.DB, storeID, orderID, vendorID uuid.UUID, now time.Time) error {
	result := dbOrDefault(db, r.db).Model(&domain.Order{}).
		Where("id = ? AND store_id = ? AND status IN ? AND ready_at IS NULL", orderID, storeID, []string{"pending", "accepted"}).
		Updates(map[string]any{"ready_at": now, "ready_by": vendorID})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrOrderUnavailable
	}
	return nil
}

// ResetDeliveryCodeAttempts clears the wrong-code lockout on an open order.
func (r *commerceRepository) ResetDeliveryCodeAttempts(db *gorm.DB, orderID uuid.UUID) error {
	result := dbOrDefault(db, r.db).Model(&domain.Order{}).
		Where("id = ? AND status IN ?", orderID, []string{"accepted", "picked_up", "out_for_delivery"}).
		UpdateColumn("delivery_code_attempts", 0)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrOrderUnavailable
	}
	return nil
}

func (r *commerceRepository) ListOrderItemsForOrders(db *gorm.DB, orderIDs []uuid.UUID) (map[uuid.UUID][]domain.OrderItem, error) {
	result := make(map[uuid.UUID][]domain.OrderItem, len(orderIDs))
	if len(orderIDs) == 0 {
		return result, nil
	}
	var items []domain.OrderItem
	if err := dbOrDefault(db, r.db).Where("order_id IN ?", orderIDs).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	for _, item := range items {
		result[item.OrderID] = append(result[item.OrderID], item)
	}
	return result, nil
}

// CountRiderRejections returns how many times riders rejected each order.
func (r *commerceRepository) CountRiderRejections(db *gorm.DB, orderIDs []uuid.UUID) (map[uuid.UUID]int, error) {
	result := make(map[uuid.UUID]int, len(orderIDs))
	if len(orderIDs) == 0 {
		return result, nil
	}
	var rows []struct {
		OrderID uuid.UUID
		Count   int
	}
	err := dbOrDefault(db, r.db).Model(&domain.OrderEvent{}).
		Select("order_id, COUNT(*) AS count").
		Where("order_id IN ? AND event_type = ?", orderIDs, domain.EventRiderRejected).
		Group("order_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.OrderID] = row.Count
	}
	return result, nil
}

// ListActiveOrders returns open orders (optionally for one store), oldest first.
func (r *commerceRepository) ListActiveOrders(db *gorm.DB, storeID *uuid.UUID, limit int) ([]domain.Order, error) {
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	var orders []domain.Order
	query := dbOrDefault(db, r.db).Where("status IN ?", []string{"pending", "accepted", "picked_up", "out_for_delivery"})
	if storeID != nil {
		query = query.Where("store_id = ?", *storeID)
	}
	err := query.Order("created_at ASC").Limit(limit).Find(&orders).Error
	return orders, err
}
