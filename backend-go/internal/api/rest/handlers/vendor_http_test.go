package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type vendorWorld struct {
	app                *fiber.App
	db                 *gorm.DB
	auth               *services.AuthService
	storeA, storeB     uuid.UUID
	orderA, orderB     uuid.UUID
	tokens             map[string]string
	vendorA            uuid.UUID
	customer, rider    uuid.UUID
	admin, vendorBUser uuid.UUID
}

func (w *vendorWorld) addUser(t *testing.T, phone, role string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	user := &domain.User{ID: uuid.New(), Phone: phone, Role: role, Status: "active", CreatedAt: now, UpdatedAt: now}
	if err := w.db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	return user.ID
}

// login signs the phone in through the real OTP flow and returns the access token.
func (w *vendorWorld) login(t *testing.T, phone string) (string, map[string]any) {
	t.Helper()
	if err := w.auth.SendOTP(context.Background(), phone, ""); err != nil {
		t.Fatalf("send otp: %v", err)
	}
	otp, ok := w.auth.LastDevOTP(phone)
	if !ok {
		t.Fatal("no dev otp")
	}
	response, err := w.auth.VerifyOTP(context.Background(), phone, otp, nil)
	if err != nil {
		t.Fatalf("verify otp: %v", err)
	}
	var body map[string]any
	raw, _ := json.Marshal(response)
	_ = json.Unmarshal(raw, &body)
	return response.AccessToken, body
}

func (w *vendorWorld) order(t *testing.T, storeID uuid.UUID, name string) uuid.UUID {
	t.Helper()
	now := time.Now().UTC()
	order := &domain.Order{
		ID: uuid.New(), UserID: w.customer, StoreID: storeID, Status: "pending", PaymentMethod: "cod", PaymentStatus: "pending",
		SubtotalAmount: 1000, TotalAmount: 1000, RecipientName: name, DeliveryPhone: "+919811111111",
		AddressLine1: "42 Secret Lane", City: "BLR", State: "KA", Pincode: "560001", DeliveryCode: "x", CreatedAt: now, UpdatedAt: now,
	}
	if err := w.db.Create(order).Error; err != nil {
		t.Fatal(err)
	}
	productID := uuid.New()
	if err := w.db.Create(&domain.OrderItem{ID: uuid.New(), OrderID: order.ID, ProductID: productID, ProductName: "Milk", UnitPrice: 1000, Quantity: 1, LineTotal: 1000}).Error; err != nil {
		t.Fatal(err)
	}
	if err := w.db.Create(&domain.Inventory{ID: uuid.New(), StoreID: storeID, ProductID: productID, Quantity: 5, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	return order.ID
}

func newVendorWorld(t *testing.T) *vendorWorld {
	t.Helper()
	db := fullRouteDB(t)
	app, auth := buildApp(t, db)
	w := &vendorWorld{app: app, db: db, auth: auth, tokens: map[string]string{}}
	now := time.Now().UTC()
	w.storeA, w.storeB = uuid.New(), uuid.New()
	for id, name := range map[uuid.UUID]string{w.storeA: "Store A", w.storeB: "Store B"} {
		if err := db.Create(&domain.Store{ID: id, Name: name, Address: "x", IsActive: true, CreatedAt: now}).Error; err != nil {
			t.Fatal(err)
		}
	}
	w.customer = w.addUser(t, "+919800000001", domain.RoleCustomer)
	w.rider = w.addUser(t, "+919800000002", domain.RoleDelivery)
	w.admin = w.addUser(t, "+919800000003", domain.RoleAdmin)
	w.vendorA = w.addUser(t, "+919800000004", domain.RoleVendor)
	w.vendorBUser = w.addUser(t, "+919800000005", domain.RoleVendor)
	for vendor, store := range map[uuid.UUID]uuid.UUID{w.vendorA: w.storeA, w.vendorBUser: w.storeB} {
		if err := db.Create(&domain.VendorStoreAssignment{VendorID: vendor, StoreID: store, CreatedAt: now}).Error; err != nil {
			t.Fatal(err)
		}
	}
	w.orderA = w.order(t, w.storeA, "Asha Verma")
	w.orderB = w.order(t, w.storeB, "Ravi Kumar")
	for name, phone := range map[string]string{"customer": "+919800000001", "rider": "+919800000002", "admin": "+919800000003", "vendorA": "+919800000004"} {
		w.tokens[name], _ = w.login(t, phone)
	}
	return w
}

func (w *vendorWorld) do(t *testing.T, method, path, token string, body any) (int, string) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := w.app.Test(req, -1)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(raw)
}

func TestVendorRoutesRequireAnActiveVendor(t *testing.T) {
	w := newVendorWorld(t)
	paths := []string{"/api/v1/vendor/store", "/api/v1/vendor/orders", "/api/v1/vendor/stats", "/api/v1/vendor/riders", "/api/v1/vendor/products", "/api/v1/vendor/inventory"}
	for _, path := range paths {
		if status, _ := w.do(t, "GET", path, "", nil); status != fiber.StatusUnauthorized {
			t.Errorf("%s without a token: want 401, got %d", path, status)
		}
		for _, role := range []string{"customer", "rider", "admin"} {
			if status, _ := w.do(t, "GET", path, w.tokens[role], nil); status != fiber.StatusForbidden {
				t.Errorf("%s as %s: want 403, got %d", path, role, status)
			}
		}
		if status, body := w.do(t, "GET", path, w.tokens["vendorA"], nil); status != fiber.StatusOK {
			t.Errorf("%s as vendor: want 200, got %d (%s) - the vendor group must be registered before the commerce catch-all", path, status, body)
		}
	}
}

func TestVendorCannotUseAdminOrRiderRoutes(t *testing.T) {
	w := newVendorWorld(t)
	for _, path := range []string{"/api/v1/admin/orders", "/api/v1/admin/stores", "/api/v1/admin/dashboard", "/api/v1/delivery/orders"} {
		if status, _ := w.do(t, "GET", path, w.tokens["vendorA"], nil); status != fiber.StatusForbidden {
			t.Errorf("vendor on %s: want 403, got %d", path, status)
		}
	}
}

func TestVendorOrdersAreScopedToTheirStoreAndRedacted(t *testing.T) {
	w := newVendorWorld(t)
	token := w.tokens["vendorA"]

	status, body := w.do(t, "GET", "/api/v1/vendor/orders?store_id="+w.storeB.String(), token, nil)
	if status != fiber.StatusOK {
		t.Fatalf("list: %d %s", status, body)
	}
	if !strings.Contains(body, w.orderA.String()) || strings.Contains(body, w.orderB.String()) {
		t.Fatalf("a vendor list must hold only their store's orders, whatever store_id says: %s", body)
	}
	for _, secret := range []string{"+919811111111", "Secret Lane", "Verma"} {
		if strings.Contains(body, secret) {
			t.Fatalf("customer detail %q leaked to the vendor: %s", secret, body)
		}
	}
	if !strings.Contains(body, "Asha") {
		t.Fatalf("the vendor should see the customer's first name: %s", body)
	}

	if status, _ := w.do(t, "GET", "/api/v1/vendor/orders/"+w.orderB.String(), token, nil); status != fiber.StatusNotFound {
		t.Errorf("another store's order detail: want 404, got %d", status)
	}
	if status, _ := w.do(t, "POST", "/api/v1/vendor/orders/"+w.orderB.String()+"/ready", token, nil); status != fiber.StatusNotFound {
		t.Errorf("ready on another store's order: want 404, got %d", status)
	}
	if status, _ := w.do(t, "POST", "/api/v1/vendor/orders/"+w.orderB.String()+"/reject", token, map[string]string{"reason": "x"}); status != fiber.StatusNotFound {
		t.Errorf("reject on another store's order: want 404, got %d", status)
	}
	var stillPending string
	w.db.Model(&domain.Order{}).Where("id = ?", w.orderB).Select("status").Scan(&stillPending)
	if stillPending != "pending" {
		t.Fatalf("another store's order must be untouched, status is %s", stillPending)
	}
}

func TestVendorMarksReadyAndRejectsOverHTTP(t *testing.T) {
	w := newVendorWorld(t)
	token := w.tokens["vendorA"]
	path := "/api/v1/vendor/orders/" + w.orderA.String()

	if status, body := w.do(t, "POST", path+"/ready", token, nil); status != fiber.StatusOK || !strings.Contains(body, "ready_at") {
		t.Fatalf("ready: %d %s", status, body)
	}
	if status, _ := w.do(t, "POST", path+"/ready", token, nil); status != fiber.StatusConflict {
		t.Errorf("ready twice: want 409, got %d", status)
	}
	if status, _ := w.do(t, "POST", path+"/reject", token, map[string]string{"reason": ""}); status != fiber.StatusBadRequest {
		t.Errorf("reject without a reason: want 400, got %d", status)
	}
	status, body := w.do(t, "POST", path+"/reject", token, map[string]string{"reason": "item damaged"})
	if status != fiber.StatusOK || !strings.Contains(body, `"cancelled"`) || !strings.Contains(body, `"vendor"`) {
		t.Fatalf("reject: %d %s", status, body)
	}
}

func TestBlockedAndDemotedVendorsLoseAccessImmediately(t *testing.T) {
	w := newVendorWorld(t)
	token := w.tokens["vendorA"]
	if status, _ := w.do(t, "GET", "/api/v1/vendor/store", token, nil); status != fiber.StatusOK {
		t.Fatalf("baseline: want 200, got %d", status)
	}
	w.db.Model(&domain.User{}).Where("id = ?", w.vendorA).Update("status", "blocked")
	status, body := w.do(t, "GET", "/api/v1/vendor/store", token, nil)
	if status != fiber.StatusForbidden || !strings.Contains(body, "vendor_not_assigned") {
		t.Fatalf("blocked vendor: want 403 vendor_not_assigned, got %d %s", status, body)
	}
	w.db.Model(&domain.User{}).Where("id = ?", w.vendorA).Updates(map[string]any{"status": "active", "role": domain.RoleCustomer})
	if status, _ := w.do(t, "GET", "/api/v1/vendor/store", token, nil); status != fiber.StatusForbidden {
		t.Fatalf("demoted vendor: want 403, got %d", status)
	}
}

func TestVendorLoginReturnsTheirStore(t *testing.T) {
	w := newVendorWorld(t)
	_, body := w.login(t, "+919800000005")
	user, _ := body["user"].(map[string]any)
	store, _ := user["store"].(map[string]any)
	if user["role"] != "vendor" || store["id"] != w.storeB.String() || store["name"] != "Store B" {
		t.Fatalf("a vendor's login response should name their store: %v", body)
	}
	_, customer := w.login(t, "+919800000001")
	if u, _ := customer["user"].(map[string]any); u["store"] != nil {
		t.Fatalf("customers have no store: %v", u)
	}
}

func TestAdminOrderDetailAndVendorManagementRoutes(t *testing.T) {
	w := newVendorWorld(t)
	admin := w.tokens["admin"]

	status, body := w.do(t, "GET", "/api/v1/admin/orders/"+w.orderA.String(), admin, nil)
	if status != fiber.StatusOK || !strings.Contains(body, "Secret Lane") || !strings.Contains(body, `"customer"`) || !strings.Contains(body, "Milk") {
		t.Fatalf("admin detail should carry the full record: %d %s", status, body)
	}
	if status, _ := w.do(t, "GET", "/api/v1/admin/orders/"+uuid.NewString(), admin, nil); status != fiber.StatusNotFound {
		t.Errorf("unknown order: want 404, got %d", status)
	}
	if status, body := w.do(t, "GET", "/api/v1/admin/orders/attention", admin, nil); status != fiber.StatusOK || !strings.Contains(body, `"orders"`) {
		t.Errorf("attention list: %d %s", status, body)
	}
	if status, body := w.do(t, "GET", "/api/v1/admin/orders?limit=1", admin, nil); status != fiber.StatusOK || !strings.Contains(body, "next_before") {
		t.Errorf("a full page should return next_before: %d %s", status, body)
	}
	if status, _ := w.do(t, "GET", "/api/v1/admin/orders?status=bogus", admin, nil); status != fiber.StatusBadRequest {
		t.Errorf("unknown status: want 400, got %d", status)
	}
	if status, body := w.do(t, "GET", "/api/v1/admin/stores/"+w.storeA.String()+"/stats", admin, nil); status != fiber.StatusOK || !strings.Contains(body, "total_orders") {
		t.Errorf("store stats: %d %s", status, body)
	}
	if status, body := w.do(t, "GET", "/api/v1/admin/dashboard?store_id="+w.storeA.String(), admin, nil); status != fiber.StatusOK || !strings.Contains(body, "out_for_delivery_orders") {
		t.Errorf("scoped dashboard: %d %s", status, body)
	}

	vendorPath := "/api/v1/admin/stores/" + w.storeA.String() + "/vendor"
	if status, body := w.do(t, "POST", vendorPath, admin, map[string]string{"phone": "+919800000077"}); status != fiber.StatusConflict || !strings.Contains(body, "vendor_exists") {
		t.Errorf("a second vendor via POST: want 409 vendor_exists, got %d %s", status, body)
	}
	if status, body := w.do(t, "PUT", vendorPath, admin, map[string]string{"phone": "+919800000077", "name": "New Owner"}); status != fiber.StatusOK || !strings.Contains(body, "+919800000077") {
		t.Errorf("replace vendor: %d %s", status, body)
	}
	if status, _ := w.do(t, "PUT", vendorPath, admin, map[string]string{"phone": "+919800000003"}); status != fiber.StatusBadRequest {
		t.Errorf("an admin phone cannot be a vendor: want 400, got %d", status)
	}
	if status, _ := w.do(t, "DELETE", vendorPath, admin, nil); status != fiber.StatusNoContent {
		t.Errorf("remove vendor: want 204, got %d", status)
	}
	if status, _ := w.do(t, "GET", vendorPath, admin, nil); status != fiber.StatusNotFound {
		t.Errorf("no vendor after removal: want 404, got %d", status)
	}
	if status, _ := w.do(t, "GET", "/api/v1/vendor/store", w.tokens["vendorA"], nil); status != fiber.StatusUnauthorized && status != fiber.StatusForbidden {
		t.Errorf("a removed vendor's old session must stop working, got %d", status)
	}
}
