package services

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Reasons an open order shows in the admin "needs attention" queue.
const (
	AttentionPendingTooLong = "pending_too_long"
	AttentionNoRiderOnline  = "no_rider_online"
	AttentionRiderRejected  = "rider_rejected"
	AttentionStale          = "stale_in_progress"
	AttentionCodeLocked     = "code_locked"
)

type staffUser struct {
	ID       uuid.UUID
	Name     *string
	Phone    string
	IsOnline bool
}

// eventActorNames resolves the people behind history entries in one query.
func (s *OrderService) eventActorNames(events []domain.OrderEvent) map[uuid.UUID]string {
	names := map[uuid.UUID]string{}
	seen := map[uuid.UUID]struct{}{}
	ids := make([]uuid.UUID, 0, len(events))
	for _, event := range events {
		if event.ActorID == nil {
			continue
		}
		if _, ok := seen[*event.ActorID]; !ok {
			seen[*event.ActorID] = struct{}{}
			ids = append(ids, *event.ActorID)
		}
	}
	if len(ids) == 0 {
		return names
	}
	var rows []staffUser
	if err := s.db.Table("users").Select("id, name, phone, is_online").Where("id IN ?", ids).Scan(&rows).Error; err != nil {
		return names
	}
	for _, row := range rows {
		if row.Name != nil && strings.TrimSpace(*row.Name) != "" {
			names[row.ID] = *row.Name
		}
	}
	return names
}

// enrichStaff adds what admins and vendors need beyond the light order: the
// rider, rejection counts and, for admins only, the customer. responses[i] must
// be the mapping of orders[i]. Vendors get customer details redacted.
func (s *OrderService) enrichStaff(orders []domain.Order, responses []dto.OrderResponse, viewer orderViewer) error {
	orderIDs := make([]uuid.UUID, 0, len(orders))
	wanted := map[uuid.UUID]struct{}{}
	for _, order := range orders {
		orderIDs = append(orderIDs, order.ID)
		if order.AcceptedBy != nil {
			wanted[*order.AcceptedBy] = struct{}{}
		}
		if viewer == viewerAdmin {
			wanted[order.UserID] = struct{}{}
		}
	}
	users := map[uuid.UUID]staffUser{}
	if len(wanted) > 0 {
		ids := make([]uuid.UUID, 0, len(wanted))
		for id := range wanted {
			ids = append(ids, id)
		}
		var rows []staffUser
		if err := s.db.Table("users").Select("id, name, phone, is_online").Where("id IN ?", ids).Scan(&rows).Error; err != nil {
			return err
		}
		for _, row := range rows {
			users[row.ID] = row
		}
	}
	rejections, err := s.commerce.CountRiderRejections(nil, orderIDs)
	if err != nil {
		return err
	}
	for i, order := range orders {
		response := &responses[i]
		if order.AcceptedBy != nil {
			if rider, ok := users[*order.AcceptedBy]; ok {
				response.Rider = &dto.RiderInfo{ID: rider.ID.String(), Name: rider.Name, Phone: rider.Phone, IsOnline: rider.IsOnline}
			}
		}
		response.RiderRejections = rejections[order.ID]
		if viewer == viewerAdmin {
			response.DeliveryCodeAttempts = order.DeliveryCodeAttempts
			customer := &dto.CustomerInfo{ID: order.UserID.String()}
			if user, ok := users[order.UserID]; ok {
				customer.Name, customer.Phone = user.Name, user.Phone
			}
			response.Customer = customer
		}
		if viewer == viewerVendor {
			redactForVendor(response)
		}
	}
	return nil
}

// redactForVendor keeps what a store needs to pack and hand over an order and
// removes the customer's contact details and exact address.
func redactForVendor(r *dto.OrderResponse) {
	if i := strings.Index(strings.TrimSpace(r.RecipientName), " "); i > 0 {
		r.RecipientName = strings.TrimSpace(r.RecipientName)[:i]
	}
	r.DeliveryPhone = ""
	r.AddressLine1 = ""
	r.AddressLine2, r.Landmark, r.DeliveryInstructions = nil, nil, nil
	r.Latitude, r.Longitude = nil, nil
	r.Customer = nil
	r.DeliveryCode = ""
	r.DeliveryCodeAttempts = 0
}

// mapOrdersBatch is the list form for staff screens: items and store names are
// loaded once for the whole page instead of once per order.
func (s *OrderService) mapOrdersBatch(orders []domain.Order, viewer orderViewer) ([]dto.OrderResponse, error) {
	orderIDs := make([]uuid.UUID, 0, len(orders))
	storeSet := map[uuid.UUID]struct{}{}
	for _, order := range orders {
		orderIDs = append(orderIDs, order.ID)
		storeSet[order.StoreID] = struct{}{}
	}
	items, err := s.commerce.ListOrderItemsForOrders(nil, orderIDs)
	if err != nil {
		return nil, err
	}
	storeNames := map[uuid.UUID]string{}
	if len(storeSet) > 0 {
		ids := make([]uuid.UUID, 0, len(storeSet))
		for id := range storeSet {
			ids = append(ids, id)
		}
		var rows []struct {
			ID   uuid.UUID
			Name string
		}
		if err := s.db.Table("stores").Select("id, name").Where("id IN ?", ids).Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			storeNames[row.ID] = row.Name
		}
	}
	responses := make([]dto.OrderResponse, 0, len(orders))
	for i := range orders {
		responses = append(responses, buildOrderResponse(&orders[i], items[orders[i].ID], storeNames[orders[i].StoreID]))
	}
	if err := s.enrichStaff(orders, responses, viewer); err != nil {
		return nil, err
	}
	return responses, nil
}

func (s *OrderService) staffPage(filter repository.OrderFilter, viewer orderViewer) (dto.OrderPage, error) {
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 50
	}
	orders, err := s.commerce.ListOrdersAdmin(nil, filter)
	if err != nil {
		return dto.OrderPage{}, err
	}
	responses, err := s.mapOrdersBatch(orders, viewer)
	if err != nil {
		return dto.OrderPage{}, err
	}
	page := dto.OrderPage{Orders: responses}
	if len(orders) == filter.Limit {
		next := orders[len(orders)-1].CreatedAt
		page.NextBefore = &next
	}
	return page, nil
}

// AdminListPage is the admin order history: filters plus a next_before cursor.
func (s *OrderService) AdminListPage(filter repository.OrderFilter) (dto.OrderPage, error) {
	return s.staffPage(filter, viewerAdmin)
}

// AdminGet returns the full record of one order: items, fees, timeline, customer and rider.
func (s *OrderService) AdminGet(orderID uuid.UUID) (dto.OrderResponse, error) {
	return s.adminOrder(orderID)
}

// AdminAssign hands a pending order to a chosen rider on the admin's behalf.
// The history names the admin as the actor instead of pretending the rider accepted.
func (s *OrderService) AdminAssign(adminID, deliveryID, orderID uuid.UUID) (dto.OrderResponse, error) {
	if err := ValidateOrderTransition(string(OrderPending), string(OrderAccepted), "delivery"); err != nil {
		return dto.OrderResponse{}, err
	}
	now := time.Now().UTC()
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.commerce.AcceptOrder(tx, orderID, deliveryID, now); err != nil {
			return err
		}
		return s.recordTypedEvent(tx, orderID, "accepted", &adminID, "admin", "A rider was assigned to your order",
			domain.EventAdminAssigned, domain.VisibilityAll, map[string]any{"rider_id": deliveryID.String()})
	})
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.adminOrder(orderID)
}

// AdminResetDeliveryCode clears a wrong-code lockout so the rider can try again.
func (s *OrderService) AdminResetDeliveryCode(adminID, orderID uuid.UUID) (dto.OrderResponse, error) {
	order, err := s.findOrder(orderID)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.commerce.ResetDeliveryCodeAttempts(tx, orderID); err != nil {
			return err
		}
		return s.recordTypedEvent(tx, orderID, order.Status, &adminID, "admin", "Delivery code attempts reset by admin",
			domain.EventDeliveryCodeReset, domain.VisibilityStaff, nil)
	})
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.adminOrder(orderID)
}

// AdminAttention lists open orders that need a human: unclaimed too long, no rider
// available, rejected by riders, stuck in progress, or locked on the delivery code.
func (s *OrderService) AdminAttention(storeID *uuid.UUID) ([]dto.AttentionOrder, error) {
	orders, err := s.commerce.ListActiveOrders(nil, storeID, 500)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(orders))
	for _, order := range orders {
		ids = append(ids, order.ID)
	}
	rejections, err := s.commerce.CountRiderRejections(nil, ids)
	if err != nil {
		return nil, err
	}
	var eligibleRows []struct {
		StoreID uuid.UUID
		Riders  int
	}
	if err := s.db.Table("delivery_store_assignments dsa").
		Select("dsa.store_id AS store_id, COUNT(*) AS riders").
		Joins("JOIN users u ON u.id = dsa.delivery_id").
		Where("u.role = 'delivery' AND u.status = 'active' AND (u.is_online = ? OR u.last_seen_at IS NULL)", true).
		Group("dsa.store_id").Scan(&eligibleRows).Error; err != nil {
		return nil, err
	}
	eligible := map[uuid.UUID]int{}
	for _, row := range eligibleRows {
		eligible[row.StoreID] = row.Riders
	}

	now := time.Now().UTC()
	var flagged []domain.Order
	reasons := map[uuid.UUID][]string{}
	for _, order := range orders {
		var found []string
		if order.Status == string(OrderPending) {
			if now.Sub(order.CreatedAt) > orderPolicy.PendingAttentionAfter {
				found = append(found, AttentionPendingTooLong)
			}
			if eligible[order.StoreID] == 0 {
				found = append(found, AttentionNoRiderOnline)
			}
			if rejections[order.ID] > 0 {
				found = append(found, AttentionRiderRejected)
			}
		} else if order.AcceptedAt != nil && now.Sub(*order.AcceptedAt) > orderPolicy.StaleAcceptedAfter {
			found = append(found, AttentionStale)
		}
		if order.DeliveryCodeAttempts >= orderPolicy.MaxCodeAttempts {
			found = append(found, AttentionCodeLocked)
		}
		if len(found) > 0 {
			flagged = append(flagged, order)
			reasons[order.ID] = found
		}
	}
	sort.SliceStable(flagged, func(i, j int) bool { return flagged[i].CreatedAt.Before(flagged[j].CreatedAt) })
	responses, err := s.mapOrdersBatch(flagged, viewerAdmin)
	if err != nil {
		return nil, err
	}
	result := make([]dto.AttentionOrder, 0, len(flagged))
	for i, order := range flagged {
		result = append(result, dto.AttentionOrder{Order: responses[i], Reasons: reasons[order.ID]})
	}
	return result, nil
}

// VendorListPage lists a store's own orders. The store comes from the vendor's
// assignment, never from the request.
func (s *OrderService) VendorListPage(storeID uuid.UUID, filter repository.OrderFilter) (dto.OrderPage, error) {
	filter.StoreID = &storeID
	filter.UserID = nil
	return s.staffPage(filter, viewerVendor)
}

// VendorGet returns one order of the vendor's store; any other store's order is not found.
func (s *OrderService) VendorGet(storeID, orderID uuid.UUID) (dto.OrderResponse, error) {
	order, err := s.commerce.FindOrderForStore(nil, storeID, orderID)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.mapOrderDetail(order, viewerVendor)
}

// MarkReady tells the rider and admin the store has packed the order. It is
// informational: riders may still pick the order up.
func (s *OrderService) MarkReady(storeID, vendorID, orderID uuid.UUID) (dto.OrderResponse, error) {
	order, err := s.commerce.FindOrderForStore(nil, storeID, orderID)
	if err != nil {
		return dto.OrderResponse{}, err
	}
	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.commerce.MarkOrderReady(tx, storeID, orderID, vendorID, now); err != nil {
			return err
		}
		return s.recordTypedEvent(tx, orderID, order.Status, &vendorID, "vendor", "Store marked the order ready for pickup",
			domain.EventVendorReady, domain.VisibilityAll, nil)
	})
	if err != nil {
		return dto.OrderResponse{}, err
	}
	return s.VendorGet(storeID, orderID)
}

// VendorCancel lets a store reject an order it cannot fulfil, until a rider has picked it up.
func (s *OrderService) VendorCancel(storeID, vendorID, orderID uuid.UUID, reason string) (dto.OrderResponse, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return dto.OrderResponse{}, fmt.Errorf("%w: a reason is required", ErrInvalidInput)
	}
	if len(reason) > 300 {
		return dto.OrderResponse{}, fmt.Errorf("%w: reason is too long", ErrInvalidInput)
	}
	if err := s.cancelOrderScoped(orderID, nil, &storeID, []string{"pending", "accepted"}, &vendorID, "vendor", reason); err != nil {
		return dto.OrderResponse{}, err
	}
	return s.VendorGet(storeID, orderID)
}
