package services

import "fmt"

// OrderState is the persisted lifecycle state of an order.
type OrderState string

const (
	OrderPending        OrderState = "pending"
	OrderAccepted       OrderState = "accepted"
	OrderPickedUp       OrderState = "picked_up"
	OrderOutForDelivery OrderState = "out_for_delivery"
	OrderCompleted      OrderState = "completed"
	OrderCancelled      OrderState = "cancelled"
)

// allowedOrderTransitions is the application-level lifecycle policy. The
// repository also performs atomic state predicates for concurrent requests.
var allowedOrderTransitions = map[OrderState]map[OrderState]map[string]bool{
	OrderPending: {
		OrderAccepted:  {"delivery": true},
		OrderCancelled: {"customer": true, "admin": true, "vendor": true, "system": true},
	},
	OrderAccepted: {
		OrderPickedUp:  {"delivery": true},
		OrderCancelled: {"admin": true, "vendor": true, "system": true},
		OrderPending:   {"admin": true}, // reassignment clears the current rider
		// Compatibility for older rider clients; the current app uses the full path.
		OrderCompleted: {"delivery": true},
	},
	// Once a rider has the goods only admin may cancel (e.g. an unreachable
	// customer); the stock is restored with the cancellation.
	OrderPickedUp: {
		OrderOutForDelivery: {"delivery": true},
		OrderCancelled:      {"admin": true},
	},
	OrderOutForDelivery: {
		OrderCompleted: {"delivery": true},
		OrderCancelled: {"admin": true},
	},
}

// ValidateOrderTransition verifies that a role may move an order between states.
func ValidateOrderTransition(from, to, role string) error {
	if roles, ok := allowedOrderTransitions[OrderState(from)][OrderState(to)]; ok && roles[role] {
		return nil
	}
	return fmt.Errorf("invalid order transition %s -> %s for role %s", from, to, role)
}

// IsOrderActive reports whether an order can still change without being terminal.
func IsOrderActive(status string) bool {
	switch OrderState(status) {
	case OrderPending, OrderAccepted, OrderPickedUp, OrderOutForDelivery:
		return true
	default:
		return false
	}
}
