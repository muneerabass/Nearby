package services

import (
	"errors"
	"strings"
	"testing"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"

	"github.com/google/uuid"
)

func (f *lifecycleFixture) addUser(t *testing.T, phone, role string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	user := &domain.User{ID: uuid.New(), Phone: phone, Role: role, Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := f.db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	return user.ID
}

// makeVendor adds a vendor user linked to the given store.
func (f *lifecycleFixture) makeVendor(t *testing.T, phone string, storeID uuid.UUID) uuid.UUID {
	t.Helper()
	id := f.addUser(t, phone, domain.RoleVendor)
	if err := f.db.Create(&domain.VendorStoreAssignment{VendorID: id, StoreID: storeID, CreatedAt: time.Now().UTC()}).Error; err != nil {
		t.Fatal(err)
	}
	return id
}

func (f *lifecycleFixture) vendorService() *VendorService {
	return NewVendorService(f.db, repository.NewUserRepository(f.db), f.catalog, f.admin)
}

// otherStoreOrder inserts a pending order belonging to a different store.
func (f *lifecycleFixture) otherStoreOrder(t *testing.T) (uuid.UUID, uuid.UUID) {
	t.Helper()
	otherStore := seedPincodeStore(t, f.db, "Other Store", true, "560002")
	now := time.Now().UTC()
	order := &domain.Order{
		ID: uuid.New(), UserID: f.addUser(t, "+919876540099", domain.RoleCustomer), StoreID: otherStore, Status: "pending", PaymentMethod: "cod", PaymentStatus: "pending",
		SubtotalAmount: 1000, TotalAmount: 1000, RecipientName: "Other Person", DeliveryPhone: "+919876540001",
		AddressLine1: "9 Rd", City: "BLR", State: "KA", Pincode: "560002", DeliveryCode: "x", CreatedAt: now, UpdatedAt: now,
	}
	if err := f.db.Create(order).Error; err != nil {
		t.Fatal(err)
	}
	return otherStore, order.ID
}

func eventOfType(events []dto.OrderEventResponse, eventType string) *dto.OrderEventResponse {
	for i := range events {
		if events[i].EventType == eventType {
			return &events[i]
		}
	}
	return nil
}

func TestRiderRejectionIsStaffOnlyAndHidesTheOrderFromThatRider(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	f.addToCart(t, 1)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)

	if err := f.orders.Reject(f.riderID, id, "too far"); err != nil {
		t.Fatal(err)
	}
	pending, err := f.orders.PendingForDelivery(f.riderID)
	if err != nil || len(pending) != 0 {
		t.Fatalf("a rider who rejected an order must not see it again: %+v err=%v", pending, err)
	}

	customerView, err := f.orders.Get(f.userID, id)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range customerView.Events {
		if strings.Contains(strings.ToLower(derefString(event.Note)), "rejected") {
			t.Fatalf("customers must not see rider rejections: %+v", event)
		}
	}

	adminView, err := f.orders.AdminGet(id)
	if err != nil {
		t.Fatal(err)
	}
	rejection := eventOfType(adminView.Events, domain.EventRiderRejected)
	if rejection == nil || rejection.Meta["reason"] != "too far" || rejection.Visibility != domain.VisibilityStaff {
		t.Fatalf("admin should see the typed rejection with its reason: %+v", adminView.Events)
	}
	if adminView.RiderRejections != 1 || adminView.Customer == nil || adminView.Customer.Phone != "+919876540001" {
		t.Fatalf("admin detail should carry the rejection count and the customer: %+v", adminView)
	}

	page, err := f.orders.AdminListPage(repository.OrderFilter{})
	if err != nil || len(page.Orders) != 1 || page.Orders[0].RiderRejections != 1 || page.Orders[0].Customer == nil {
		t.Fatalf("the admin list should show rejections and the customer: %+v err=%v", page, err)
	}
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func TestAdminAssignNamesTheAdminAndReassignRemembersThePreviousRider(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	admin := f.addUser(t, "+919876540090", domain.RoleAdmin)
	f.addToCart(t, 1)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)

	assigned, err := f.orders.AdminAssign(admin, f.riderID, id)
	if err != nil || assigned.Status != "accepted" || assigned.Rider == nil || assigned.Rider.ID != f.riderID.String() {
		t.Fatalf("admin assign failed: %+v err=%v", assigned, err)
	}
	event := eventOfType(assigned.Events, domain.EventAdminAssigned)
	if event == nil || event.ActorRole != "admin" || event.Meta["rider_id"] != f.riderID.String() {
		t.Fatalf("history should name the admin as the actor: %+v", assigned.Events)
	}

	back, err := f.orders.AdminReassign(admin, id)
	if err != nil {
		t.Fatal(err)
	}
	reassigned := eventOfType(back.Events, domain.EventReassigned)
	if reassigned == nil || reassigned.Meta["previous_rider_id"] != f.riderID.String() {
		t.Fatalf("reassignment should record who held the order: %+v", back.Events)
	}
}

func TestAdminCanCancelAnOrderThatIsOutForDelivery(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	admin := f.addUser(t, "+919876540090", domain.RoleAdmin)
	f.addToCart(t, 2)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)
	for _, step := range []func() error{
		func() error { _, err := f.orders.Accept(f.riderID, id); return err },
		func() error { _, err := f.orders.Pickup(f.riderID, id); return err },
		func() error { _, err := f.orders.OutForDelivery(f.riderID, id); return err },
	} {
		if err := step(); err != nil {
			t.Fatal(err)
		}
	}
	cancelled, err := f.orders.AdminCancel(admin, id, "customer unreachable")
	if err != nil || cancelled.Status != "cancelled" {
		t.Fatalf("admin should be able to cancel a stuck delivery: %+v err=%v", cancelled, err)
	}
	if f.stock(t) != 10 {
		t.Fatalf("stock should be restored, got %d", f.stock(t))
	}
	if _, err := f.orders.AdminCancel(admin, id, "again"); !errors.Is(err, ErrOrderNotCancellable) {
		t.Fatalf("a cancelled order cannot be cancelled twice, got %v", err)
	}
}

func TestDeliveryCodeLockoutIsRecordedOnceAndAdminCanReset(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	admin := f.addUser(t, "+919876540090", domain.RoleAdmin)
	f.addToCart(t, 1)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)
	if _, err := f.orders.Accept(f.riderID, id); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < orderPolicy.MaxCodeAttempts+2; i++ {
		_, _ = f.orders.Complete(f.riderID, id, "000000")
	}
	detail, err := f.orders.AdminGet(id)
	if err != nil {
		t.Fatal(err)
	}
	locks := 0
	for _, event := range detail.Events {
		if event.EventType == domain.EventDeliveryCodeLocked {
			locks++
		}
	}
	if locks != 1 || detail.DeliveryCodeAttempts != orderPolicy.MaxCodeAttempts {
		t.Fatalf("the lockout should be recorded exactly once (events=%d attempts=%d)", locks, detail.DeliveryCodeAttempts)
	}
	if _, err := f.orders.Complete(f.riderID, id, order.DeliveryCode); !errors.Is(err, ErrDeliveryCodeLocked) {
		t.Fatalf("the right code is refused while locked, got %v", err)
	}

	reset, err := f.orders.AdminResetDeliveryCode(admin, id)
	if err != nil || reset.DeliveryCodeAttempts != 0 || eventOfType(reset.Events, domain.EventDeliveryCodeReset) == nil {
		t.Fatalf("reset should clear the lockout and log it: %+v err=%v", reset, err)
	}
	if done, err := f.orders.Complete(f.riderID, id, order.DeliveryCode); err != nil || done.Status != "completed" {
		t.Fatalf("the rider should be able to finish after the reset: %+v err=%v", done, err)
	}
	if _, err := f.orders.AdminResetDeliveryCode(admin, id); !errors.Is(err, repository.ErrOrderUnavailable) {
		t.Fatalf("a finished order has nothing to reset, got %v", err)
	}
}

func TestAdminAttentionFlagsStuckOrdersWithReasons(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	f.addToCart(t, 1)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)

	if items, err := f.orders.AdminAttention(nil); err != nil || len(items) != 0 {
		t.Fatalf("a fresh order with an online rider needs no attention: %+v err=%v", items, err)
	}

	f.db.Model(&domain.Order{}).Where("id = ?", id).Update("created_at", time.Now().UTC().Add(-20*time.Minute))
	f.db.Model(&domain.User{}).Where("id = ?", f.riderID).Updates(map[string]any{"is_online": false, "last_seen_at": time.Now().UTC()})
	if err := f.orders.Reject(f.riderID, id, "busy"); err != nil {
		t.Fatal(err)
	}
	items, err := f.orders.AdminAttention(nil)
	if err != nil || len(items) != 1 {
		t.Fatalf("expected the order to be flagged: %+v err=%v", items, err)
	}
	reasons := strings.Join(items[0].Reasons, ",")
	for _, want := range []string{AttentionPendingTooLong, AttentionNoRiderOnline, AttentionRiderRejected} {
		if !strings.Contains(reasons, want) {
			t.Fatalf("missing reason %s in %s", want, reasons)
		}
	}
}

func TestVendorSeesOnlyTheirOwnStoreAndNeverTheCustomersContactDetails(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)
	otherStore, foreignID := f.otherStoreOrder(t)
	f.addToCart(t, 1)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)
	f.db.Model(&domain.Order{}).Where("id = ?", id).Update("recipient_name", "Asha Verma")

	detail, err := f.orders.VendorGet(f.storeID, id)
	if err != nil {
		t.Fatal(err)
	}
	if detail.RecipientName != "Asha" || detail.DeliveryPhone != "" || detail.AddressLine1 != "" || detail.Customer != nil || detail.DeliveryCode != "" {
		t.Fatalf("vendors must not receive the customer's phone, address or code: %+v", detail)
	}
	if detail.Pincode != "560001" || len(detail.Items) != 1 || detail.TotalAmount == 0 {
		t.Fatalf("vendors still need items, totals and the pincode: %+v", detail)
	}
	if _, err := f.orders.VendorGet(f.storeID, foreignID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("another store's order must be not found, got %v", err)
	}
	if _, err := f.orders.MarkReady(f.storeID, vendorID, foreignID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("ready on another store's order must be not found, got %v", err)
	}
	if _, err := f.orders.VendorCancel(f.storeID, vendorID, foreignID, "nope"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("rejecting another store's order must be not found, got %v", err)
	}

	page, err := f.orders.VendorListPage(f.storeID, repository.OrderFilter{StoreID: &otherStore})
	if err != nil || len(page.Orders) != 1 || page.Orders[0].ID != order.ID {
		t.Fatalf("a vendor's list is always their own store, whatever the filter says: %+v err=%v", page, err)
	}
	if page.Orders[0].DeliveryPhone != "" || page.Orders[0].Customer != nil {
		t.Fatalf("list rows are redacted too: %+v", page.Orders[0])
	}
}

func TestVendorMarkReadyAndRejectRules(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)
	f.addToCart(t, 3)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)

	ready, err := f.orders.MarkReady(f.storeID, vendorID, id)
	if err != nil || ready.ReadyAt == nil || eventOfType(ready.Events, domain.EventVendorReady) == nil {
		t.Fatalf("mark ready failed: %+v err=%v", ready, err)
	}
	if _, err := f.orders.MarkReady(f.storeID, vendorID, id); !errors.Is(err, repository.ErrOrderUnavailable) {
		t.Fatalf("marking ready twice should conflict, got %v", err)
	}
	if rider, err := f.orders.Accept(f.riderID, id); err != nil || rider.Status != "accepted" {
		t.Fatalf("ready must not block the rider from accepting: %+v err=%v", rider, err)
	}

	if _, err := f.orders.VendorCancel(f.storeID, vendorID, id, "   "); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("a reject reason is required, got %v", err)
	}
	if _, err := f.orders.Pickup(f.riderID, id); err != nil {
		t.Fatal(err)
	}
	if _, err := f.orders.VendorCancel(f.storeID, vendorID, id, "out of stock"); !errors.Is(err, ErrOrderNotCancellable) {
		t.Fatalf("a vendor cannot reject after pickup, got %v", err)
	}
}

func TestVendorRejectCancelsRestoresStockAndRecordsWho(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)
	f.addToCart(t, 4)
	order := f.place(t, "")
	id := uuid.MustParse(order.ID)
	if f.stock(t) != 6 {
		t.Fatalf("stock should be reserved, got %d", f.stock(t))
	}
	cancelled, err := f.orders.VendorCancel(f.storeID, vendorID, id, "item damaged")
	if err != nil || cancelled.Status != "cancelled" || cancelled.CancelledByRole == nil || *cancelled.CancelledByRole != "vendor" {
		t.Fatalf("vendor reject failed: %+v err=%v", cancelled, err)
	}
	if cancelled.CancelReason == nil || *cancelled.CancelReason != "item damaged" {
		t.Fatalf("cancel reason should be kept: %+v", cancelled.CancelReason)
	}
	if f.stock(t) != 10 {
		t.Fatalf("stock should be restored, got %d", f.stock(t))
	}
}

func TestStoreStatsCountsRevenueCancellationsAndRiders(t *testing.T) {
	f := newLifecycleFixture(t, 20)
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)

	f.addToCart(t, 2)
	first := f.place(t, "")
	firstID := uuid.MustParse(first.ID)
	for _, step := range []func() error{
		func() error { _, err := f.orders.Accept(f.riderID, firstID); return err },
		func() error { _, err := f.orders.Pickup(f.riderID, firstID); return err },
		func() error { _, err := f.orders.OutForDelivery(f.riderID, firstID); return err },
		func() error { _, err := f.orders.Complete(f.riderID, firstID, first.DeliveryCode); return err },
	} {
		if err := step(); err != nil {
			t.Fatal(err)
		}
	}
	f.addToCart(t, 1)
	second := f.place(t, "")
	if _, err := f.orders.VendorCancel(f.storeID, vendorID, uuid.MustParse(second.ID), "sold out"); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	stats, err := NewStoreStatsService(f.db).Compute(f.storeID, now.Add(-time.Hour), now.Add(time.Hour), 330)
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalOrders != 2 || stats.CompletedOrders != 1 || stats.CancelledOrders != 1 || stats.ActiveOrders != 0 {
		t.Fatalf("unexpected counts: %+v", stats)
	}
	if stats.CompletedRevenue != int64(first.TotalAmount) || stats.CancelledByRole["vendor"] != 1 {
		t.Fatalf("revenue should count only the completed order and cancellations by actor: %+v", stats)
	}
	if len(stats.TopProducts) != 1 || stats.TopProducts[0].Quantity != 2 {
		t.Fatalf("top products exclude cancelled orders: %+v", stats.TopProducts)
	}
	if stats.AssignedRiders != 1 || stats.OnlineRiders != 1 || len(stats.Daily) != 1 || stats.Daily[0].Orders != 2 {
		t.Fatalf("riders and daily buckets: %+v", stats)
	}
	if stats.AvgSecondsToAccept == nil {
		t.Fatalf("an accepted order should produce an accept-time average")
	}

	if _, err := NewStoreStatsService(f.db).Compute(f.storeID, now, now.Add(-time.Hour), 0); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("an inverted range is invalid, got %v", err)
	}
	if _, err := NewStoreStatsService(f.db).Compute(f.storeID, now.Add(-200*24*time.Hour), now, 0); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("an oversized range is invalid, got %v", err)
	}
}

func TestVendorProvisioningRules(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	adminPhone := "+919876540090"
	f.addUser(t, adminPhone, domain.RoleAdmin)
	req := func(phone string) dto.StoreVendorRequest { return dto.StoreVendorRequest{Phone: phone} }

	vendor, err := f.admin.SetStoreVendor(f.storeID, dto.StoreVendorRequest{Phone: "+919876540071", Name: strPtr("Ravi")}, true)
	if err != nil || vendor.Phone != "+919876540071" {
		t.Fatalf("create vendor failed: %+v err=%v", vendor, err)
	}
	var user domain.User
	f.db.Where("phone = ?", "+919876540071").First(&user)
	if user.Role != domain.RoleVendor {
		t.Fatalf("the user should now be a vendor, got %s", user.Role)
	}
	if _, err := f.admin.SetStoreVendor(f.storeID, req("+919876540072"), true); !errors.Is(err, ErrVendorExists) {
		t.Fatalf("create-only must refuse a second vendor, got %v", err)
	}

	for phone, want := range map[string]error{adminPhone: ErrInvalidRole, "+919876540002": ErrInvalidRole} {
		if _, err := f.admin.SetStoreVendor(f.storeID, req(phone), false); !errors.Is(err, want) {
			t.Fatalf("%s should be refused with %v, got %v", phone, want, err)
		}
	}
	var stillVendor domain.User
	f.db.Where("phone = ?", "+919876540071").First(&stillVendor)
	if stillVendor.Role != domain.RoleVendor {
		t.Fatalf("a refused replacement must roll back and keep the current vendor, got role %s", stillVendor.Role)
	}

	f.addToCart(t, 1)
	f.place(t, "")
	if _, err := f.admin.SetStoreVendor(f.storeID, req("+919876540001"), false); !errors.Is(err, ErrActiveOrders) {
		t.Fatalf("a customer with an open order cannot become the vendor, got %v", err)
	}

	replaced, err := f.admin.SetStoreVendor(f.storeID, req("+919876540073"), false)
	if err != nil || replaced.Phone != "+919876540073" {
		t.Fatalf("replace failed: %+v err=%v", replaced, err)
	}
	var demoted domain.User
	f.db.Where("phone = ?", "+919876540071").First(&demoted)
	if demoted.Role != domain.RoleCustomer {
		t.Fatalf("the replaced vendor should become a customer, got %s", demoted.Role)
	}
	if _, err := f.vendorService().ResolveStore(demoted.ID); !errors.Is(err, ErrVendorNotAssigned) {
		t.Fatalf("a demoted vendor must lose access, got %v", err)
	}

	otherStore := seedPincodeStore(t, f.db, "Second Store", true, "560003")
	if _, err := f.admin.SetStoreVendor(otherStore, req("+919876540073"), false); !errors.Is(err, ErrVendorAssigned) {
		t.Fatalf("one vendor cannot run two stores, got %v", err)
	}

	if err := f.admin.RemoveStoreVendor(f.storeID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.admin.GetStoreVendor(f.storeID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("the store should have no vendor after removal, got %v", err)
	}
}

func strPtr(s string) *string { return &s }

func TestCreatingAStoreWithAVendorIsAtomic(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	f.addUser(t, "+919876540090", domain.RoleAdmin)

	_, err := f.admin.CreateStore(dto.StoreRequest{Name: "Atomic Store", Address: "1 Road", Pincodes: []string{"560010"},
		Vendor: &dto.StoreVendorRequest{Phone: "+919876540090"}})
	if !errors.Is(err, ErrInvalidRole) {
		t.Fatalf("an admin phone cannot become a vendor, got %v", err)
	}
	var count int64
	f.db.Model(&domain.Store{}).Where("name = ?", "Atomic Store").Count(&count)
	if count != 0 {
		t.Fatalf("the store must not be created when its vendor cannot be, found %d", count)
	}

	store, err := f.admin.CreateStore(dto.StoreRequest{Name: "Atomic Store", Address: "1 Road", Pincodes: []string{"560010"},
		ContactPhone: strPtr("+919800000001"), Vendor: &dto.StoreVendorRequest{Phone: "+919876540074", Name: strPtr("Meena")}})
	if err != nil || store.Vendor == nil || store.Vendor.Phone != "+919876540074" || store.ContactPhone == nil {
		t.Fatalf("store and vendor should be created together: %+v err=%v", store, err)
	}
	stores, err := f.admin.ListStores()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, s := range stores {
		if s.ID == store.ID && s.Vendor != nil && s.Vendor.Phone == "+919876540074" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the store list should include the vendor")
	}
}

func TestVendorCannotReopenAStoreAdminClosed(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vs := f.vendorService()
	closed := false
	open := true

	store, err := vs.UpdateStore(f.storeID, dto.VendorStorePatchRequest{IsActive: &closed})
	if err != nil || store.IsActive || store.ClosedByRole == nil || *store.ClosedByRole != "vendor" {
		t.Fatalf("vendor should be able to close their store: %+v err=%v", store, err)
	}
	if store, err = vs.UpdateStore(f.storeID, dto.VendorStorePatchRequest{IsActive: &open}); err != nil || !store.IsActive {
		t.Fatalf("vendor should be able to reopen a store they closed: %+v err=%v", store, err)
	}

	if _, err := f.admin.UpdateStore(f.storeID, dto.StorePatchRequest{IsActive: &closed}); err != nil {
		t.Fatal(err)
	}
	if _, err := vs.UpdateStore(f.storeID, dto.VendorStorePatchRequest{IsActive: &open}); !errors.Is(err, ErrStoreClosedByAdmin) {
		t.Fatalf("vendor must not reopen an admin-closed store, got %v", err)
	}
	if _, err := f.admin.UpdateStore(f.storeID, dto.StorePatchRequest{IsActive: &open}); err != nil {
		t.Fatal(err)
	}
	bad := "12345"
	if _, err := vs.UpdateStore(f.storeID, dto.VendorStorePatchRequest{ContactPhone: &bad}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("a malformed contact phone is rejected, got %v", err)
	}
}

func TestResolveStoreRequiresAnActiveAssignedVendor(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vs := f.vendorService()
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)

	if storeID, err := vs.ResolveStore(vendorID); err != nil || storeID != f.storeID {
		t.Fatalf("expected the vendor's store, got %v err=%v", storeID, err)
	}
	if _, err := vs.ResolveStore(f.userID); !errors.Is(err, ErrVendorNotAssigned) {
		t.Fatalf("a customer is not a vendor, got %v", err)
	}
	f.db.Model(&domain.User{}).Where("id = ?", vendorID).Update("status", "blocked")
	if _, err := vs.ResolveStore(vendorID); !errors.Is(err, ErrVendorNotAssigned) {
		t.Fatalf("a blocked vendor must lose access, got %v", err)
	}
	unassigned := f.addUser(t, "+919876540080", domain.RoleVendor)
	if _, err := vs.ResolveStore(unassigned); !errors.Is(err, ErrVendorNotAssigned) {
		t.Fatalf("a vendor without a store has no access, got %v", err)
	}
}

func TestVendorCatalogWritesAreLimitedToTheirOwnStore(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	vendorID := f.makeVendor(t, "+919876540070", f.storeID)
	vs := f.vendorService()
	otherStore := seedPincodeStore(t, f.db, "Rival Store", true, "560004")
	seedStockedProduct(t, f.db, otherStore, "Rival Milk", 5)
	var rival domain.Product
	f.db.Where("store_id = ?", otherStore).First(&rival)

	if _, err := vs.SetInventory(f.storeID, vendorID, rival.ID, dto.InventoryRequest{Quantity: 99}); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("a vendor cannot set another store's stock, got %v", err)
	}
	newPrice := 1
	if _, err := vs.UpdateProduct(f.storeID, rival.ID, dto.ProductPatchRequest{Price: &newPrice}); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("a vendor cannot edit another store's product, got %v", err)
	}
	// Postgres has this unique index from migration 0002; SQLite's AutoMigrate does not.
	if err := f.db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS inventory_store_product_uq ON inventory (store_id, product_id)").Error; err != nil {
		t.Fatal(err)
	}
	created, err := vs.CreateProduct(f.storeID, dto.ProductRequest{StoreID: otherStore.String(), Name: "Own Bread", MRP: 500, Price: 450})
	if err != nil || created.StoreID != f.storeID.String() {
		t.Fatalf("a new product always lands in the vendor's own store, whatever the body says: %+v err=%v", created, err)
	}
	if inventory, err := vs.SetInventory(f.storeID, vendorID, f.productID, dto.InventoryRequest{Quantity: 42}); err != nil || inventory.Quantity != 42 {
		t.Fatalf("a vendor can set their own stock: %+v err=%v", inventory, err)
	}
}

func TestAdminCreatedUsersGetDistinctReferralCodes(t *testing.T) {
	f := newLifecycleFixture(t, 10)
	for _, phone := range []string{"+919876540201", "+919876540202"} {
		if _, err := f.admin.CreateDeliveryUser(dto.DeliveryUserRequest{Phone: phone}); err != nil {
			t.Fatal(err)
		}
	}
	for _, phone := range []string{"+919876540203", "+919876540204"} {
		if _, err := f.admin.SetStoreVendor(seedPincodeStore(t, f.db, "Store "+phone, true, "560020"), dto.StoreVendorRequest{Phone: phone}, true); err != nil {
			t.Fatal(err)
		}
	}
	var codes []string
	f.db.Model(&domain.User{}).Where("phone IN ?", []string{"+919876540201", "+919876540202", "+919876540203", "+919876540204"}).Pluck("referral_code", &codes)
	seen := map[string]bool{}
	for _, code := range codes {
		if code == "" || seen[code] {
			t.Fatalf("users created by an admin need unique referral codes (users.referral_code is NOT NULL UNIQUE), got %v", codes)
		}
		seen[code] = true
	}
	if len(codes) != 4 {
		t.Fatalf("expected four users, got %d", len(codes))
	}
}
