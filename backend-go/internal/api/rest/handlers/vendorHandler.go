package handlers

import (
	"fmt"
	"strconv"
	"time"

	"quick-commerce/internal/api/middleware"
	"quick-commerce/internal/api/rest"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"
	"quick-commerce/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type VendorHandler struct {
	vendor *services.VendorService
	orders *services.OrderService
}

// SetupVendorRoutes mounts the store-owner API. It must be registered before
// SetupCommerceRoutes, whose catch-all authenticated group would otherwise answer
// /api/v1/vendor/... first.
func SetupVendorRoutes(rh *rest.RestHandler, auth *services.AuthService, deliveryCodeSecret string) {
	users := repository.NewUserRepository(rh.Db)
	catalog := repository.NewCatalogRepository(rh.Db)
	commerce := repository.NewCommerceRepository(rh.Db)
	admin := services.NewAdminService(rh.Db, users, catalog, commerce, repository.NewSessionRepository(rh.Db))
	orders := services.NewOrderService(rh.Db, repository.NewAddressRepository(rh.Db), catalog, commerce).WithDeliveryCodeSecret(deliveryCodeSecret)
	vendor := services.NewVendorService(rh.Db, users, catalog, admin)
	h := &VendorHandler{vendor: vendor, orders: orders}

	routes := rh.App.Group("/api/v1/vendor",
		middleware.RequireAuth(auth.TokenService(), auth.ValidateAccessSession),
		middleware.RequireRole(auth.UserRole, "vendor"),
		middleware.RequireVendorStore(vendor.ResolveStore),
	)
	routes.Get("/store", h.GetStore)
	routes.Patch("/store", h.UpdateStore)
	routes.Get("/orders", h.ListOrders)
	routes.Get("/orders/:orderID", h.GetOrder)
	routes.Post("/orders/:orderID/ready", h.MarkReady)
	routes.Post("/orders/:orderID/reject", h.RejectOrder)
	routes.Get("/stats", h.Stats)
	routes.Get("/riders", h.Riders)
	routes.Get("/categories", h.Categories)
	routes.Get("/products", h.ListProducts)
	routes.Post("/products", h.CreateProduct)
	routes.Patch("/products/:productID", h.UpdateProduct)
	routes.Get("/inventory", h.ListInventory)
	routes.Put("/inventory/:productID", h.SetInventory)
}

// scope returns the vendor's user and store; the store never comes from the request.
func vendorScope(c *fiber.Ctx) (vendorID, storeID uuid.UUID, err error) {
	vendorID, ok := middleware.UserID(c)
	if !ok {
		return uuid.Nil, uuid.Nil, services.ErrVendorNotAssigned
	}
	storeID, ok = middleware.VendorStoreID(c)
	if !ok {
		return uuid.Nil, uuid.Nil, services.ErrVendorNotAssigned
	}
	return vendorID, storeID, nil
}

func (h *VendorHandler) GetStore(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	store, err := h.vendor.Store(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(store)
}

func (h *VendorHandler) UpdateStore(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.VendorStorePatchRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	store, err := h.vendor.UpdateStore(storeID, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(store)
}

// ListOrders shows the store's orders. Filters: status (comma separated), from,
// to, q, before, limit. The response carries next_before when more pages exist.
func (h *VendorHandler) ListOrders(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	filter, err := parseOrderFilter(c)
	if err != nil {
		return serviceError(c, err)
	}
	page, err := h.orders.VendorListPage(storeID, filter)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(page)
}

func (h *VendorHandler) GetOrder(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	order, err := h.orders.VendorGet(storeID, orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

func (h *VendorHandler) MarkReady(c *fiber.Ctx) error {
	vendorID, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	order, err := h.orders.MarkReady(storeID, vendorID, orderID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

func (h *VendorHandler) RejectOrder(c *fiber.Ctx) error {
	vendorID, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	orderID, err := parseParamUUID(c, "orderID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.CancelOrderRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	order, err := h.orders.VendorCancel(storeID, vendorID, orderID, request.Reason)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(order)
}

// Stats takes from/to (RFC3339, default the last 7 days) and tz_offset, the
// viewer's UTC offset in minutes, so daily buckets follow their local day.
func (h *VendorHandler) Stats(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	from, to, tz, err := parseStatsQuery(c)
	if err != nil {
		return serviceError(c, err)
	}
	stats, err := h.vendor.Stats(storeID, from, to, tz)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(stats)
}

func parseStatsQuery(c *fiber.Ctx) (time.Time, time.Time, int, error) {
	parse := func(name string) (*time.Time, error) {
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
	from, err := parse("from")
	if err != nil {
		return time.Time{}, time.Time{}, 0, err
	}
	to, err := parse("to")
	if err != nil {
		return time.Time{}, time.Time{}, 0, err
	}
	start, end, err := services.ParseStatsRange(from, to, time.Now().UTC())
	if err != nil {
		return time.Time{}, time.Time{}, 0, err
	}
	tz, _ := strconv.Atoi(c.Query("tz_offset"))
	return start, end, tz, nil
}

func (h *VendorHandler) Riders(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	riders, err := h.vendor.Riders(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"riders": riders})
}

func (h *VendorHandler) Categories(c *fiber.Ctx) error {
	categories, err := h.vendor.Categories()
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"categories": categories})
}

func (h *VendorHandler) ListProducts(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	products, err := h.vendor.Products(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"products": products})
}

func (h *VendorHandler) CreateProduct(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.ProductRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	product, err := h.vendor.CreateProduct(storeID, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(product)
}

func (h *VendorHandler) UpdateProduct(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	productID, err := parseParamUUID(c, "productID")
	if err != nil {
		return serviceError(c, err)
	}
	var request dto.ProductPatchRequest
	if err := c.BodyParser(&request); err != nil {
		return writeError(c, fiber.StatusBadRequest, "invalid request body")
	}
	product, err := h.vendor.UpdateProduct(storeID, productID, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(product)
}

func (h *VendorHandler) ListInventory(c *fiber.Ctx) error {
	_, storeID, err := vendorScope(c)
	if err != nil {
		return serviceError(c, err)
	}
	inventory, err := h.vendor.Inventory(storeID)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(fiber.Map{"inventory": inventory})
}

func (h *VendorHandler) SetInventory(c *fiber.Ctx) error {
	vendorID, storeID, err := vendorScope(c)
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
	inventory, err := h.vendor.SetInventory(storeID, vendorID, productID, request)
	if err != nil {
		return serviceError(c, err)
	}
	return c.JSON(inventory)
}
