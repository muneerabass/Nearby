package services

import "testing"

func TestOrderStateMachineAllowsOnlyRoleOwnedTransitions(t *testing.T) {
	allowed := [][3]string{
		{"pending", "accepted", "delivery"},
		{"accepted", "picked_up", "delivery"},
		{"picked_up", "out_for_delivery", "delivery"},
		{"out_for_delivery", "completed", "delivery"},
		{"pending", "cancelled", "customer"},
		{"accepted", "pending", "admin"},
		{"pending", "cancelled", "vendor"},
		{"accepted", "cancelled", "vendor"},
		{"picked_up", "cancelled", "admin"},
		{"out_for_delivery", "cancelled", "admin"},
	}
	for _, transition := range allowed {
		if err := ValidateOrderTransition(transition[0], transition[1], transition[2]); err != nil {
			t.Errorf("expected %s -> %s for %s to be allowed: %v", transition[0], transition[1], transition[2], err)
		}
	}

	denied := [][3]string{
		{"pending", "picked_up", "delivery"},
		{"accepted", "out_for_delivery", "delivery"},
		{"completed", "cancelled", "admin"},
		{"pending", "accepted", "customer"},
		{"accepted", "pending", "delivery"},
		{"picked_up", "cancelled", "vendor"},
		{"out_for_delivery", "cancelled", "vendor"},
		{"picked_up", "cancelled", "customer"},
		{"out_for_delivery", "cancelled", "delivery"},
		{"completed", "cancelled", "vendor"},
		{"pending", "accepted", "vendor"},
	}
	for _, transition := range denied {
		if err := ValidateOrderTransition(transition[0], transition[1], transition[2]); err == nil {
			t.Errorf("expected %s -> %s for %s to be denied", transition[0], transition[1], transition[2])
		}
	}
}
