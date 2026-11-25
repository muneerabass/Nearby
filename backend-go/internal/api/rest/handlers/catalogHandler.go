package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"quick-commerce/internal/api/middleware"
	"quick-commerce/internal/api/rest"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"
	"quick-commerce/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CatalogHandler struct {
	catalog *services.CatalogService
	admin   *services.AdminService
	orders  *services.OrderService
}

func SetupCatalogRoutes(rh *rest.RestHandler, auth *services.AuthService, deliveryCodeSecret string) {
	catalogRepository := repository.NewCatalogRepository(rh.Db)
	commerceRepository := repository.NewCommerceRepository(rh.Db)
	admin := services.NewAdminService(rh.Db, repository.NewUserRepository(rh.Db), catalogRepository, commerceRepository, repository.NewSessionRepository(rh.Db))
	orders := services.NewOrderService(rh.Db, repository.NewAddressRepository(rh.Db), catalogRepository, commerceRepository).WithDeliveryCodeSecret(deliveryCodeSecret)
	h := &CatalogHandler{catalog: services.NewCatalogService(catalogRepository), admin: admin, orders: orders}

	api := rh.App.Group("/api/v1")
	api.Get("/catalog/products", h.Products)
	api.Get("/catalog/categories", h.CustomerCategories)
	api.Get("/catalog/search", h.Search)
	api.Get("/catalog/products/:productID", h.GetProduct)

	authenticated := middleware.RequireAuth(auth.TokenService(), auth.ValidateAccessSession)
	adminRoutes := api.Group("/admin", authenticated, middleware.RequireRole(auth.UserRole, "admin"))
	adminRoutes.Get("/stores", h.ListStores)
	adminRoutes.Post("/stores", h.CreateStore)
	adminRoutes.Patch("/stores/:storeID", h.UpdateStore)
	// DELETE is a safe archive operation, not a physical delete. Existing
	// products, inventory and orders remain available for historical reporting.
	adminRoutes.Delete("/stores/:storeID", h.ArchiveStore)
	adminRoutes.Get("/products", h.ListProducts)
	adminRoutes.Post("/products", h.CreateProduct)
	adminRoutes.Patch("/products/:productID", h.UpdateProduct)
	adminRoutes.Get("/stores/:storeID/inventory", h.ListInventory)
	adminRoutes.Put("/stores/:storeID/inventory/:productID", h.SetInventory)
	adminRoutes.Get("/categories", h.ListCategories)
	adminRoutes.Post("/categories", h.CreateCategory)
	adminRoutes.Patch("/categories/:categoryID", h.UpdateCategory)
	adminRoutes.Delete("/categories/:categoryID", h.ArchiveCategory)
	adminRoutes.Get("/dashboard", h.Dashboard)
	adminRoutes.Get("/customers", h.ListCustomers)
	adminRoutes.Patch("/customers/:customerID/status", h.SetCustomerStatus)
	adminRoutes.Get("/stores/:storeID/inventory/:productID/adjustments", h.ListInventoryAdjustments)
	adminRoutes.Get("/stores/:storeID/vendor", h.GetStoreVendor)
	adminRoutes.Post("/stores/:storeID/vendor", h.CreateStoreVendor)
	adminRoutes.Put("/stores/:storeID/vendor", h.ReplaceStoreVendor)
	adminRoutes.Delete("/stores/:storeID/vendor", h.RemoveStoreVendor)
	adminRoutes.Get("/stores/:storeID/stats", h.StoreStats)
	adminRoutes.Get("/orders", h.ListOrders)
	adminRoutes.Get("/orders/attention", h.OrdersNeedingAttention)
	adminRoutes.Get("/orders/:orderID", h.GetOrder)
	adminRoutes.Post("/orders/:orderID/reset-delivery-code", h.ResetDeliveryCode)
	adminRoutes.Post("/orders/:orderID/cancel", h.CancelOrder)
	adminRoutes.Post("/orders/:orderID/reassign", h.ReassignOrder)
	adminRoutes.Post("/orders/:orderID/assign", h.AssignOrder)
	adminRoutes.Post("/delivery-users", h.CreateDeliveryUser)
	adminRoutes.Get("/stores/:storeID/delivery-users", h.ListDeliveryUsers)
	adminRoutes.Put("/delivery-users/:deliveryID/stores/:storeID", h.AssignDeliveryUser)
	adminRoutes.Delete("/delivery-users/:deliveryID/stores/:storeID", h.RemoveDeliveryAssignment)
	adminRoutes.Delete("/delivery-users/:deliveryID", h.DeleteDeliveryUser)
}

func (h *CatalogHandler) ListStores(c *fiber.Ctx) error {
	stores, err := h.admin.ListStores()
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"stores": stores})
}

func (h *CatalogHandler) ListProducts(c *fiber.Ctx) error {
	var storeID *uuid.UUID
	if value := c.Query("store_id"); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			return writeError(c, fiber.StatusBadRequest, "invalid store_id")
		}
		storeID = &parsed
	}
	products, err := h.admin.ListProducts(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"products": products})
}

func (h *CatalogHandler) ListInventory(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	inventory, err := h.admin.ListInventory(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"inventory": inventory})
}

func (h *CatalogHandler) ListCategories(c *fiber.Ctx) error {
	categories, err := h.admin.ListCategories()
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"categories": categories})
}

func (h *CatalogHandler) CreateCategory(c *fiber.Ctx) error {
	var request dto.CategoryRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	category, err := h.admin.CreateCategory(request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(category)
}

func (h *CatalogHandler) UpdateCategory(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "categoryID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.CategoryRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	category, err := h.admin.UpdateCategory(id, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(category)
}

func (h *CatalogHandler) ArchiveCategory(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "categoryID")
	if err != nil {
		return serviceError(c, err)
	}
	category, err := h.admin.ArchiveCategory(id)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(category)
}

func (h *CatalogHandler) Dashboard(c *fiber.Ctx) error {
	storeID, err := optionalQueryUUID(c, "store_id")
	if err != nil {
		return serviceError(c, err)
	}
	data, err := h.admin.Dashboard(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(data)
}

func (h *CatalogHandler) ListCustomers(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	users, err := h.admin.ListCustomers(limit, offset)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"customers": users, "limit": limit, "offset": offset})
}

func (h *CatalogHandler) SetCustomerStatus(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "customerID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.AdminUserStatusRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	user, err := h.admin.SetUserStatus(id, request.Status)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(user)
}

func (h *CatalogHandler) ListInventoryAdjustments(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	productID, err := parseParamUUID(c, "productID")
	if err != nil {
		return serviceError(c, err)
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := h.admin.ListInventoryAdjustments(storeID, productID, limit)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"adjustments": rows})
}

// Products returns the pincode catalog. An unserved pincode is a normal
// 200 with serviceable=false, not an error.
func (h *CatalogHandler) Products(c *fiber.Ctx) error {
	catalog, err := h.catalog.ProductsForPincode(c.Query("pincode"))
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(catalog)
}

func (h *CatalogHandler) CustomerCategories(c *fiber.Ctx) error {
	categories, err := h.catalog.CustomerCategories(c.Query("pincode"))
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"categories": categories})
}

func (h *CatalogHandler) Search(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	results, err := h.catalog.Search(c.Query("pincode"), c.Query("q"), limit, offset)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(results)
}

// GetProduct fetches a single product by ID. Used by deep links and by the
// product-detail screen when the product is not yet in the client catalog cache.
func (h *CatalogHandler) GetProduct(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "productID")
	if err != nil {
		return serviceError(c, err)
	}
	product, err := h.catalog.GetProduct(id)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(product)
}

func (h *CatalogHandler) CreateStore(c *fiber.Ctx) error {
	var request dto.StoreRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	store, err := h.admin.CreateStore(request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(store)
}

func (h *CatalogHandler) UpdateStore(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.StorePatchRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	store, err := h.admin.UpdateStore(id, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(store)
}

// ArchiveStore preserves all store history and marks the store unavailable for
// new catalog/cart/order traffic. Existing open orders continue to be served.
func (h *CatalogHandler) ArchiveStore(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	active := false
	store, err := h.admin.UpdateStore(id, dto.StorePatchRequest{IsActive: &active})
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(store)
}

func (h *CatalogHandler) CreateProduct(c *fiber.Ctx) error {
	var request dto.ProductRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	product, err := h.admin.CreateProduct(request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(product)
}

func (h *CatalogHandler) UpdateProduct(c *fiber.Ctx) error {
	id, err := parseParamUUID(c, "productID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.ProductPatchRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	product, err := h.admin.UpdateProduct(id, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(product)
}

func (h *CatalogHandler) SetInventory(c *fiber.Ctx) error {
	adminID, ok := middleware.UserID(c)
	if !ok {
		return writeError(c, fiber.StatusUnauthorized, "authentication required")
	}
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	productID, err := parseParamUUID(c, "productID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.InventoryRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	inventory, err := h.admin.SetInventoryWithActor(&adminID, storeID, productID, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(inventory)
}

func (h *CatalogHandler) GetStoreVendor(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	vendor, err := h.admin.GetStoreVendor(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(vendor)
}

func (h *CatalogHandler) setStoreVendor(c *fiber.Ctx, createOnly bool) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.StoreVendorRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	vendor, err := h.admin.SetStoreVendor(storeID, request, createOnly)
	if err != nil {
		return serviceError(c, err)
	}
	if createOnly {
		return c.Status(fiber.StatusCreated).JSON(vendor)
	}
	return c.JSON(vendor)
}

// CreateStoreVendor gives a store its vendor login; it fails if one exists already.
func (h *CatalogHandler) CreateStoreVendor(c *fiber.Ctx) error { return h.setStoreVendor(c, true) }

// ReplaceStoreVendor changes the store's vendor (or just their name).
func (h *CatalogHandler) ReplaceStoreVendor(c *fiber.Ctx) error { return h.setStoreVendor(c, false) }

func (h *CatalogHandler) RemoveStoreVendor(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	if err := h.admin.RemoveStoreVendor(storeID); err != nil {
		return serviceError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// StoreStats is the same summary the store's vendor sees, for any store.
func (h *CatalogHandler) StoreStats(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	if _, err := h.admin.GetStore(storeID); err != nil {
		return serviceError(c, err)
	}
	from, to, tz, err := parseStatsQuery(c)
	if err != nil {
		return serviceError(c, err)
	}
	stats, err := services.NewStoreStatsService(h.admin.DB()).Compute(storeID, from, to, tz)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(stats)
}

func (h *CatalogHandler) CreateDeliveryUser(c *fiber.Ctx) error {
	var request dto.DeliveryUserRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	user, err := h.admin.CreateDeliveryUser(request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(user)
}

func (h *CatalogHandler) ListDeliveryUsers(c *fiber.Ctx) error {
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	users, err := h.admin.ListDeliveryUsers(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"delivery_users": users})
}

func (h *CatalogHandler) AssignDeliveryUser(c *fiber.Ctx) error {
	deliveryID, err := parseParamUUID(c, "deliveryID")
	if err != nil {
		return serviceError(c, err)
	}
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	if err := h.admin.AssignDeliveryUser(deliveryID, storeID); err != nil {
		return serviceError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *CatalogHandler) DeleteDeliveryUser(c *fiber.Ctx) error {
	deliveryID, err := parseParamUUID(c, "deliveryID")
	if err != nil {
		return serviceError(c, err)
	}
	if err := h.admin.DeleteDeliveryUser(deliveryID); err != nil {
		return serviceError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *CatalogHandler) RemoveDeliveryAssignment(c *fiber.Ctx) error {
	deliveryID, err := parseParamUUID(c, "deliveryID")
	if err != nil {
		return serviceError(c, err)
	}
	storeID, err := parseParamUUID(c, "storeID")
	if err != nil {
		return serviceError(c, err)
	}
	if err := h.admin.RemoveDeliveryAssignment(deliveryID, storeID); err != nil {
		return serviceError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func parseParamUUID(c *fiber.Ctx, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Params(name))
	if err != nil {
		return uuid.Nil, services.ErrInvalidInput
	}
	return id, nil
}

// orderStatuses are the statuses an order list may be filtered by.
var orderStatuses = map[string]bool{"pending": true, "accepted": true, "picked_up": true, "out_for_delivery": true, "completed": true, "cancelled": true}

// parseOrderFilter reads the shared admin/vendor order list query: status (one
// or several, comma separated), from/to (RFC3339), payment_status, q, before, limit.
func parseOrderFilter(c *fiber.Ctx) (repository.OrderFilter, error) {
	var filter repository.OrderFilter
	if value := c.Query("status"); value != "" {
		var statuses []string
		for _, status := range strings.Split(value, ",") {
			status = strings.TrimSpace(status)
			if !orderStatuses[status] {
				return filter, fmt.Errorf("%w: unknown status", services.ErrInvalidInput)
			}
			statuses = append(statuses, status)
		}
		if len(statuses) == 1 {
			filter.Status = statuses[0]
		} else {
			filter.Statuses = statuses
		}
	}
	parseTime := func(name string) (*time.Time, error) {
		value := c.Query(name)
		if value == "" {
			return nil, nil
		}
		parsed, err := time.Parse(time.RFC3339Nano, value)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid %s", services.ErrInvalidInput, name)
		}
		return &parsed, nil
	}
	var err error
	if filter.Before, err = parseTime("before"); err != nil {
		return filter, err
	}
	if filter.From, err = parseTime("from"); err != nil {
		return filter, err
	}
	if filter.To, err = parseTime("to"); err != nil {
		return filter, err
	}
	switch payment := c.Query("payment_status"); payment {
	case "", "pending", "paid":
		filter.PaymentStatus = payment
	default:
		return filter, fmt.Errorf("%w: unknown payment_status", services.ErrInvalidInput)
	}
	filter.Query = strings.TrimSpace(c.Query("q"))
	if len(filter.Query) > 60 {
		return filter, fmt.Errorf("%w: search text is too long", services.ErrInvalidInput)
	}
	filter.Limit, _ = strconv.Atoi(c.Query("limit"))
	return filter, nil
}

func optionalQueryUUID(c *fiber.Ctx, name string) (*uuid.UUID, error) {
	value := c.Query(name)
	if value == "" {
		return nil, nil
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid %s", services.ErrInvalidInput, name)
	}
	return &id, nil
}

// ListOrders is the admin order history and queue. Filters: status, store_id,
// customer_id, rider_id, payment_status, q, from/to, stale=true (accepted orders
// a rider has held too long) and the before cursor. The response carries
// next_before when more pages exist.
func (h *CatalogHandler) ListOrders(c *fiber.Ctx) error {
	filter, err := parseOrderFilter(c)
	if err != nil {
		return serviceError(c, err)
	}
	if c.Query("stale") == "true" {
		cutoff := time.Now().UTC().Add(-services.StaleAcceptedAfter())
		filter.AcceptedBefore = &cutoff
	}
	if filter.StoreID, err = optionalQueryUUID(c, "store_id"); err != nil {
		return serviceError(c, err)
	}
	if filter.UserID, err = optionalQueryUUID(c, "customer_id"); err != nil {
		return serviceError(c, err)
	}
	if filter.RiderID, err = optionalQueryUUID(c, "rider_id"); err != nil {
		return serviceError(c, err)
	}
	page, err := h.orders.AdminListPage(filter)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(page)
}

// GetOrder returns the complete record of one order for the admin.
func (h *CatalogHandler) GetOrder(c *fiber.Ctx) error {
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	order, err := h.orders.AdminGet(orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

// OrdersNeedingAttention lists open orders an admin should act on, with reasons.
func (h *CatalogHandler) OrdersNeedingAttention(c *fiber.Ctx) error {
	storeID, err := optionalQueryUUID(c, "store_id")
	if err != nil {
		return serviceError(c, err)
	}
	items, err := h.orders.AdminAttention(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"orders": items})
}

func (h *CatalogHandler) ResetDeliveryCode(c *fiber.Ctx) error {
	adminID, ok := middleware.UserID(c)
	if !ok {
		return writeError(c, fiber.StatusUnauthorized, "authentication required")
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	order, err := h.orders.AdminResetDeliveryCode(adminID, orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

func (h *CatalogHandler) CancelOrder(c *fiber.Ctx) error {
	adminID, ok := middleware.UserID(c)
	if !ok {
		return writeError(c, fiber.StatusUnauthorized, "authentication required")
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.CancelOrderRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	order, err := h.orders.AdminCancel(adminID, orderID, request.Reason)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

func (h *CatalogHandler) ReassignOrder(c *fiber.Ctx) error {
	adminID, ok := middleware.UserID(c)
	if !ok {
		return writeError(c, fiber.StatusUnauthorized, "authentication required")
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	order, err := h.orders.AdminReassign(adminID, orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

func (h *CatalogHandler) AssignOrder(c *fiber.Ctx) error {
	adminID, ok := middleware.UserID(c)
	if !ok {
		return writeError(c, fiber.StatusUnauthorized, "authentication required")
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.AdminOrderAssignmentRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	deliveryID, err := uuid.Parse(request.DeliveryID)
	if err != nil {
		return serviceError(c, services.ErrInvalidInput)
	}
	order, err := h.orders.AdminAssign(adminID, deliveryID, orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}
