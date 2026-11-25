package services

import (
	"fmt"
	"sort"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	maxStatsRange = 92 * 24 * time.Hour
	maxStatsRows  = 50000
)

// StoreStatsService computes one store's order figures. The admin and vendor
// endpoints share it so their numbers always agree.
type StoreStatsService struct{ db *gorm.DB }

func NewStoreStatsService(db *gorm.DB) *StoreStatsService { return &StoreStatsService{db: db} }

// Compute summarises a store's orders created in [from, to). tzOffsetMinutes
// shifts the daily buckets to the viewer's local day (e.g. 330 for India).
func (s *StoreStatsService) Compute(storeID uuid.UUID, from, to time.Time, tzOffsetMinutes int) (dto.StoreStatsResponse, error) {
	if !to.After(from) {
		return dto.StoreStatsResponse{}, fmt.Errorf("%w: to must be after from", ErrInvalidInput)
	}
	if to.Sub(from) > maxStatsRange {
		return dto.StoreStatsResponse{}, fmt.Errorf("%w: the range is limited to 92 days", ErrInvalidInput)
	}
	if tzOffsetMinutes < -14*60 || tzOffsetMinutes > 14*60 {
		return dto.StoreStatsResponse{}, fmt.Errorf("%w: invalid time zone offset", ErrInvalidInput)
	}
	offset := time.Duration(tzOffsetMinutes) * time.Minute

	var orders []domain.Order
	if err := s.db.Select("id", "status", "payment_status", "total_amount", "created_at", "accepted_at", "completed_at", "ready_at", "cancelled_by_role").
		Where("store_id = ? AND created_at >= ? AND created_at < ?", storeID, from, to).
		Order("created_at ASC").Limit(maxStatsRows).Find(&orders).Error; err != nil {
		return dto.StoreStatsResponse{}, err
	}

	result := dto.StoreStatsResponse{
		StoreID: storeID.String(), From: from, To: to,
		ByStatus: map[string]int64{}, CancelledByRole: map[string]int64{}, Daily: []dto.StoreStatsDay{},
		TopProducts: []dto.StoreStatsProduct{},
	}
	var acceptSum, deliverySum, readySum float64
	var acceptN, deliveryN, readyN int
	days := map[string]*dto.StoreStatsDay{}
	for _, order := range orders {
		result.TotalOrders++
		result.ByStatus[order.Status]++
		key := order.CreatedAt.Add(offset).Format("2006-01-02")
		day := days[key]
		if day == nil {
			day = &dto.StoreStatsDay{Date: key}
			days[key] = day
		}
		day.Orders++
		switch order.Status {
		case "completed":
			day.Completed++
			if order.PaymentStatus == "paid" {
				result.CompletedRevenue += int64(order.TotalAmount)
				day.Revenue += int64(order.TotalAmount)
			}
		case "cancelled":
			role := "unknown"
			if order.CancelledByRole != nil {
				role = *order.CancelledByRole
			}
			result.CancelledByRole[role]++
		}
		if order.AcceptedAt != nil {
			acceptSum += order.AcceptedAt.Sub(order.CreatedAt).Seconds()
			acceptN++
			if order.CompletedAt != nil && order.Status == "completed" {
				deliverySum += order.CompletedAt.Sub(*order.AcceptedAt).Seconds()
				deliveryN++
			}
		}
		if order.ReadyAt != nil {
			readySum += order.ReadyAt.Sub(order.CreatedAt).Seconds()
			readyN++
		}
	}
	average := func(sum float64, n int) *float64 {
		if n == 0 {
			return nil
		}
		value := sum / float64(n)
		return &value
	}
	result.AvgSecondsToAccept = average(acceptSum, acceptN)
	result.AvgSecondsAcceptToDelivered = average(deliverySum, deliveryN)
	result.AvgSecondsToReady = average(readySum, readyN)
	result.CompletedOrders = result.ByStatus["completed"]
	result.CancelledOrders = result.ByStatus["cancelled"]
	for _, status := range []string{"pending", "accepted", "picked_up", "out_for_delivery"} {
		result.ActiveOrders += result.ByStatus[status]
	}

	keys := make([]string, 0, len(days))
	for key := range days {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		result.Daily = append(result.Daily, *days[key])
	}

	if err := s.db.Table("order_status_events e").Joins("JOIN orders o ON o.id = e.order_id").
		Where("o.store_id = ? AND e.event_type = ? AND e.created_at >= ? AND e.created_at < ?", storeID, domain.EventRiderRejected, from, to).
		Count(&result.RiderRejections).Error; err != nil {
		return dto.StoreStatsResponse{}, err
	}

	var top []dto.StoreStatsProduct
	if err := s.db.Table("order_items oi").
		Select("oi.product_id AS product_id, oi.product_name AS product_name, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS revenue").
		Joins("JOIN orders o ON o.id = oi.order_id").
		Where("o.store_id = ? AND o.created_at >= ? AND o.created_at < ? AND o.status <> ?", storeID, from, to, "cancelled").
		Group("oi.product_id, oi.product_name").Order("SUM(oi.quantity) DESC").Limit(5).Scan(&top).Error; err != nil {
		return dto.StoreStatsResponse{}, err
	}
	if top != nil {
		result.TopProducts = top
	}

	if err := s.db.Table("delivery_store_assignments dsa").Joins("JOIN users u ON u.id = dsa.delivery_id").
		Where("dsa.store_id = ? AND u.role = 'delivery' AND u.status = 'active'", storeID).Count(&result.AssignedRiders).Error; err != nil {
		return dto.StoreStatsResponse{}, err
	}
	if err := s.db.Table("delivery_store_assignments dsa").Joins("JOIN users u ON u.id = dsa.delivery_id").
		Where("dsa.store_id = ? AND u.role = 'delivery' AND u.status = 'active' AND (u.is_online = ? OR u.last_seen_at IS NULL)", storeID, true).
		Count(&result.OnlineRiders).Error; err != nil {
		return dto.StoreStatsResponse{}, err
	}
	return result, nil
}
