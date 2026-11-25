package middleware

import (
	"errors"
	"quick-commerce/internal/services"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const (
	UserIDLocal    = "authenticated_user_id"
	SessionIDLocal = "authenticated_session_id"
	RequestIDLocal = "request_id"
	// VendorStoreLocal holds the store a vendor manages. Vendor handlers must read
	// the store from here and never from the request.
	VendorStoreLocal = "vendor_store_id"
)

func RequireAuth(tokens *services.TokenService, validateSession func(uuid.UUID, uuid.UUID) error) fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get(fiber.HeaderAuthorization)
		parts := strings.Fields(header)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return authError(c, "authentication required")
		}
		claims, err := tokens.Parse(parts[1], time.Now().UTC())
		if err != nil {
			return authError(c, "invalid access token")
		}
		if validateSession != nil {
			if err := validateSession(claims.UserID, claims.SessionID); err != nil {
				return authError(c, "session is no longer active")
			}
		}
		c.Locals(UserIDLocal, claims.UserID)
		c.Locals(SessionIDLocal, claims.SessionID)
		return c.Next()
	}
}

func UserID(c *fiber.Ctx) (uuid.UUID, bool) {
	id, ok := c.Locals(UserIDLocal).(uuid.UUID)
	return id, ok && id != uuid.Nil
}

func RequireRole(lookup func(uuid.UUID) (string, error), allowed ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, ok := UserID(c)
		if !ok {
			return authError(c, "authentication required")
		}
		role, err := lookup(userID)
		if err != nil {
			return authError(c, "authentication required")
		}
		for _, candidate := range allowed {
			if role == candidate {
				return c.Next()
			}
		}
		body := fiber.Map{"error": "insufficient permissions", "code": "forbidden"}
		if requestID, ok := c.Locals(RequestIDLocal).(string); ok && requestID != "" {
			body["request_id"] = requestID
		}
		return c.Status(fiber.StatusForbidden).JSON(body)
	}
}

func authError(c *fiber.Ctx, message string) error {
	body := fiber.Map{"error": message, "code": "unauthorized"}
	if requestID, ok := c.Locals(RequestIDLocal).(string); ok && requestID != "" {
		body["request_id"] = requestID
	}
	return c.Status(fiber.StatusUnauthorized).JSON(body)
}

// RequireVendorStore resolves the signed-in vendor's store and makes it available
// through VendorStoreID. Blocked, demoted or unassigned vendors get a 403.
func RequireVendorStore(resolve func(uuid.UUID) (uuid.UUID, error)) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID, ok := UserID(c)
		if !ok {
			return authError(c, "authentication required")
		}
		storeID, err := resolve(userID)
		if errors.Is(err, services.ErrVendorNotAssigned) {
			body := fiber.Map{"error": services.ErrVendorNotAssigned.Error(), "code": "vendor_not_assigned"}
			if requestID, ok := c.Locals(RequestIDLocal).(string); ok && requestID != "" {
				body["request_id"] = requestID
			}
			return c.Status(fiber.StatusForbidden).JSON(body)
		}
		if err != nil {
			return err
		}
		c.Locals(VendorStoreLocal, storeID)
		return c.Next()
	}
}

// VendorStoreID returns the store set by RequireVendorStore.
func VendorStoreID(c *fiber.Ctx) (uuid.UUID, bool) {
	id, ok := c.Locals(VendorStoreLocal).(uuid.UUID)
	return id, ok && id != uuid.Nil
}
