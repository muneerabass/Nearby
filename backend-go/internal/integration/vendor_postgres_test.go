package integration

import (
	"os"
	"strings"
	"testing"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"
	"quick-commerce/internal/services"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func seedUser(t *testing.T, db *gorm.DB, role string, online bool) *domain.User {
	t.Helper()
	now := time.Now().UTC()
	user := &domain.User{
		ID: uuid.New(), Phone: "+9198" + strings.ReplaceAll(uuid.NewString(), "-", "")[:8], Role: role, Status: "active",
		ReferralCode: strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:8]), IsOnline: online, CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create %s: %v", role, err)
	}
	return user
}

func seedStore(t *testing.T, db *gorm.DB) *domain.Store {
	t.Helper()
	store := &domain.Store{ID: uuid.New(), Name: "Store " + uuid.NewString(), Address: "1 Road", IsActive: true, CreatedAt: time.Now().UTC()}
	if err := db.Create(store).Error; err != nil {
		t.Fatalf("create store: %v", err)
	}
	return store
}

// seedOrder inserts a pending order with one item and stock for its product.
func seedOrder(t *testing.T, db *gorm.DB, customer *domain.User, store *domain.Store, name string) *domain.Order {
	t.Helper()
	now := time.Now().UTC()
	order := &domain.Order{
		ID: uuid.New(), UserID: customer.ID, StoreID: store.ID, Status: "pending", PaymentMethod: "cod", PaymentStatus: "pending",
		SubtotalAmount: 2000, DeliveryFee: 2500, HandlingFee: 400, TotalAmount: 4900, RecipientName: name,
		DeliveryPhone: customer.Phone, AddressLine1: "1 Rd", City: "BLR", State: "KA", Pincode: "560001",
		// Real codes are stored as "hmac:<64 hex>"; the column used to be varchar(6) (migration 0017).
		DeliveryCode: "hmac:" + strings.Repeat("ab", 32), CreatedAt: now, UpdatedAt: now,
	}
	if err := db.Create(order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}
	product := &domain.Product{ID: uuid.New(), StoreID: store.ID, Name: "Milk " + uuid.NewString(), Price: 1000, Images: []string{}, IsActive: true, CreatedAt: now}
	if err := db.Create(product).Error; err != nil {
		t.Fatalf("create product: %v", err)
	}
	if err := db.Create(&domain.Inventory{ID: uuid.New(), StoreID: store.ID, ProductID: product.ID, Quantity: 8, UpdatedAt: now}).Error; err != nil {
		t.Fatalf("create inventory: %v", err)
	}
	if err := db.Create(&domain.OrderItem{ID: uuid.New(), OrderID: order.ID, ProductID: product.ID, ProductName: product.Name, UnitPrice: 1000, Quantity: 2, LineTotal: 2000}).Error; err != nil {
		t.Fatalf("create item: %v", err)
	}
	return order
}

func TestVendorRoleAndAssignmentConstraints(t *testing.T) {
	db := openTestDB(t)

	vendor := seedUser(t, db, domain.RoleVendor, false)
	if err := db.Model(&domain.User{}).Where("id = ?", vendor.ID).Update("role", "superuser").Error; err == nil {
		t.Fatal("the role check constraint should reject unknown roles")
	}

	storeA, storeB := seedStore(t, db), seedStore(t, db)
	if err := db.Create(&domain.VendorStoreAssignment{VendorID: vendor.ID, StoreID: storeA.ID, CreatedAt: time.Now().UTC()}).Error; err != nil {
		t.Fatalf("assign vendor: %v", err)
	}
	if err := db.Create(&domain.VendorStoreAssignment{VendorID: vendor.ID, StoreID: storeB.ID, CreatedAt: time.Now().UTC()}).Error; err == nil {
		t.Fatal("one vendor must not be linked to two stores")
	}
	found, err := repository.NewVendorRepository(db).FindVendorForStore(nil, storeA.ID)
	if err != nil || found.ID != vendor.ID {
		t.Fatalf("FindVendorForStore: %+v err=%v", found, err)
	}
	if err := db.Delete(storeA).Error; err != nil {
		t.Fatalf("delete store: %v", err)
	}
	if _, err := repository.NewVendorRepository(db).FindAssignment(nil, vendor.ID); err == nil {
		t.Fatal("deleting a store should remove its vendor link")
	}
}

func TestOrderEventMetaVisibilityAndRiderRejectionQuery(t *testing.T) {
	db := openTestDB(t)
	commerce := repository.NewCommerceRepository(db)
	customer := seedUser(t, db, domain.RoleCustomer, false)
	riderA, riderB := seedUser(t, db, domain.RoleDelivery, true), seedUser(t, db, domain.RoleDelivery, true)
	store := seedStore(t, db)
	for _, rider := range []*domain.User{riderA, riderB} {
		if err := commerce.CreateAssignment(nil, &domain.DeliveryStoreAssignment{ID: uuid.New(), DeliveryID: rider.ID, StoreID: store.ID, CreatedAt: time.Now().UTC()}); err != nil {
			t.Fatal(err)
		}
	}
	order := seedOrder(t, db, customer, store, "Asha Verma")

	meta := `{"reason":"too far"}`
	note := "Rider rejected assignment: too far"
	event := &domain.OrderEvent{OrderID: order.ID, Status: "pending", ActorID: &riderA.ID, ActorRole: "delivery", Note: &note,
		EventType: domain.EventRiderRejected, Visibility: domain.VisibilityStaff, Meta: &meta}
	if err := commerce.AppendOrderEvent(nil, event); err != nil {
		t.Fatalf("append typed event (jsonb meta): %v", err)
	}
	events, err := commerce.ListOrderEvents(nil, order.ID)
	if err != nil || len(events) != 1 || events[0].EventType != domain.EventRiderRejected || events[0].Meta == nil || !strings.Contains(*events[0].Meta, "too far") {
		t.Fatalf("typed event should round-trip: %+v err=%v", events, err)
	}
	bad := &domain.OrderEvent{OrderID: order.ID, Status: "pending", ActorRole: "system", EventType: "x", Visibility: "everyone"}
	if err := commerce.AppendOrderEvent(nil, bad); err == nil {
		t.Fatal("the visibility check constraint should reject unknown values")
	}

	pendingA, err := commerce.ListPendingOrdersForDelivery(nil, riderA.ID)
	if err != nil || len(pendingA) != 0 {
		t.Fatalf("the rider who rejected must not see the order again: %+v err=%v", pendingA, err)
	}
	pendingB, err := commerce.ListPendingOrdersForDelivery(nil, riderB.ID)
	if err != nil || len(pendingB) != 1 {
		t.Fatalf("other riders still see it: %+v err=%v", pendingB, err)
	}
	counts, err := commerce.CountRiderRejections(nil, []uuid.UUID{order.ID})
	if err != nil || counts[order.ID] != 1 {
		t.Fatalf("rejection count: %+v err=%v", counts, err)
	}
}

// TestStaffQueriesRunOnPostgres runs the admin/vendor list, detail, attention,
// stats, dashboard and cancel paths against real PostgreSQL, where casts,
// GROUP BY and FOR UPDATE behave differently from the SQLite unit tests.
func TestStaffQueriesRunOnPostgres(t *testing.T) {
	db := openTestDB(t)
	catalog := repository.NewCatalogRepository(db)
	commerce := repository.NewCommerceRepository(db)
	orders := services.NewOrderService(db, repository.NewAddressRepository(db), catalog, commerce)
	admin := services.NewAdminService(db, repository.NewUserRepository(db), catalog, commerce)

	customer := seedUser(t, db, domain.RoleCustomer, false)
	rider := seedUser(t, db, domain.RoleDelivery, true)
	vendor := seedUser(t, db, domain.RoleVendor, false)
	store := seedStore(t, db)
	if err := db.Create(&domain.VendorStoreAssignment{VendorID: vendor.ID, StoreID: store.ID, CreatedAt: time.Now().UTC()}).Error; err != nil {
		t.Fatal(err)
	}
	if err := commerce.CreateAssignment(nil, &domain.DeliveryStoreAssignment{ID: uuid.New(), DeliveryID: rider.ID, StoreID: store.ID, CreatedAt: time.Now().UTC()}); err != nil {
		t.Fatal(err)
	}
	first := seedOrder(t, db, customer, store, "Asha Verma")
	second := seedOrder(t, db, customer, store, "Ravi Kumar")

	page, err := orders.AdminListPage(repository.OrderFilter{StoreID: &store.ID, Query: "asha", Limit: 10})
	if err != nil || len(page.Orders) != 1 || page.Orders[0].ID != first.ID.String() || page.Orders[0].Customer == nil {
		t.Fatalf("search by recipient name: %+v err=%v", page, err)
	}
	page, err = orders.AdminListPage(repository.OrderFilter{StoreID: &store.ID, Query: first.ID.String()[:8]})
	if err != nil || len(page.Orders) != 1 {
		t.Fatalf("search by order id prefix (CAST ... AS TEXT): %+v err=%v", page, err)
	}
	page, err = orders.AdminListPage(repository.OrderFilter{StoreID: &store.ID, Statuses: []string{"pending", "accepted"}, Limit: 1})
	if err != nil || len(page.Orders) != 1 || page.NextBefore == nil {
		t.Fatalf("a full page should expose next_before: %+v err=%v", page, err)
	}

	if _, err := orders.AdminAssign(uuid.New(), rider.ID, first.ID); err != nil {
		t.Fatalf("admin assign: %v", err)
	}
	if _, err := orders.MarkReady(store.ID, vendor.ID, first.ID); err != nil {
		t.Fatalf("mark ready: %v", err)
	}
	detail, err := orders.VendorGet(store.ID, first.ID)
	if err != nil || detail.Rider == nil || detail.ReadyAt == nil || detail.Customer != nil {
		t.Fatalf("vendor detail: %+v err=%v", detail, err)
	}

	if _, err := orders.VendorCancel(store.ID, vendor.ID, second.ID, "out of stock"); err != nil {
		t.Fatalf("vendor cancel (FOR UPDATE stock restore): %v", err)
	}
	var stock int
	db.Model(&domain.Inventory{}).Where("store_id = ?", store.ID).Select("SUM(quantity)").Scan(&stock)
	if stock != 18 { // two products seeded with 8 units each, plus the 2 restored
		t.Fatalf("cancelling should restore the 2 reserved units (16 -> 18), got %d", stock)
	}

	attention, err := orders.AdminAttention(&store.ID)
	if err != nil {
		t.Fatalf("attention: %v", err)
	}
	_ = attention

	now := time.Now().UTC()
	stats, err := services.NewStoreStatsService(db).Compute(store.ID, now.Add(-time.Hour), now.Add(time.Hour), 330)
	if err != nil || stats.TotalOrders != 2 || stats.CancelledByRole["vendor"] != 1 || stats.AssignedRiders != 1 || stats.OnlineRiders != 1 {
		t.Fatalf("stats: %+v err=%v", stats, err)
	}
	if len(stats.TopProducts) != 1 || stats.TopProducts[0].Quantity != 2 {
		t.Fatalf("top products (GROUP BY): %+v", stats.TopProducts)
	}

	dash, err := admin.Dashboard(&store.ID)
	if err != nil || dash.TotalOrders != 2 || dash.AcceptedOrders != 1 || dash.CancelledOrders != 1 || dash.ActiveDeliveryPartners != 1 {
		t.Fatalf("store-scoped dashboard: %+v err=%v", dash, err)
	}
	if _, err := admin.Dashboard(nil); err != nil {
		t.Fatalf("global dashboard: %v", err)
	}
}

// TestLegacyClosedStoresBecomeReopenableButNewAdminClosuresStayLocked checks migration
// 0018: stores closed before the vendor release lose their admin lock, while a store an
// admin closes afterwards keeps it.
func TestLegacyClosedStoresBecomeReopenableButNewAdminClosuresStayLocked(t *testing.T) {
	db := openTestDB(t)
	catalog := repository.NewCatalogRepository(db)
	commerce := repository.NewCommerceRepository(db)
	admin := services.NewAdminService(db, repository.NewUserRepository(db), catalog, commerce)

	var releasedAt time.Time
	if err := db.Raw("SELECT applied_at FROM schema_migrations WHERE version = 16").Scan(&releasedAt).Error; err != nil || releasedAt.IsZero() {
		t.Fatalf("migration 0016 should be recorded: %v", err)
	}
	adminLock := "admin"
	legacy := seedStore(t, db)
	if err := db.Model(&domain.Store{}).Where("id = ?", legacy.ID).
		Updates(map[string]any{"is_active": false, "closed_by_role": adminLock}).Error; err != nil {
		t.Fatal(err)
	}
	// Simulate a store last touched before the release.
	if err := db.Exec("UPDATE stores SET updated_at = ? WHERE id = ?", releasedAt.Add(-48*time.Hour), legacy.ID).Error; err != nil {
		t.Fatal(err)
	}

	recent := seedStore(t, db)
	closed := false
	if _, err := admin.UpdateStore(recent.ID, dto.StorePatchRequest{IsActive: &closed}); err != nil {
		t.Fatalf("admin closes a store after the release: %v", err)
	}

	script, err := os.ReadFile("../migrations/0018_reopenable_legacy_closed_stores.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(string(script)).Error; err != nil {
		t.Fatalf("run 0018: %v", err)
	}

	var lockOf = func(id uuid.UUID) *string {
		var store domain.Store
		if err := db.First(&store, "id = ?", id).Error; err != nil {
			t.Fatal(err)
		}
		return store.ClosedByRole
	}
	if got := lockOf(legacy.ID); got != nil {
		t.Fatalf("a store closed before the release should be reopenable by its vendor, still locked by %q", *got)
	}
	if got := lockOf(recent.ID); got == nil || *got != "admin" {
		t.Fatalf("a store an admin closed after the release must stay locked, got %v", got)
	}
}
