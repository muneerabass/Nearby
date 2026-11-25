package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrVendorExists   = errors.New("this store already has a vendor")
	ErrVendorAssigned = errors.New("this phone number already manages another store")
)

func vendorSummary(user *domain.User) *dto.VendorSummary {
	return &dto.VendorSummary{ID: user.ID.String(), Name: user.Name, Phone: user.Phone, Status: user.Status}
}

// optionalContactPhone validates a store contact number; blank clears it.
func optionalContactPhone(value *string) (*string, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	phone, err := NormalizePhone(*value)
	if err != nil {
		return nil, fmt.Errorf("%w: contact phone must be a valid number with country code", ErrInvalidInput)
	}
	return &phone, nil
}

func (s *AdminService) vendorsByStore() (map[uuid.UUID]*dto.VendorSummary, error) {
	var rows []struct {
		StoreID uuid.UUID
		ID      uuid.UUID
		Name    *string
		Phone   string
		Status  string
	}
	err := s.db.Table("vendor_store_assignments vsa").
		Select("vsa.store_id AS store_id, u.id AS id, u.name AS name, u.phone AS phone, u.status AS status").
		Joins("JOIN users u ON u.id = vsa.vendor_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[uuid.UUID]*dto.VendorSummary, len(rows))
	for _, row := range rows {
		result[row.StoreID] = &dto.VendorSummary{ID: row.ID.String(), Name: row.Name, Phone: row.Phone, Status: row.Status}
	}
	return result, nil
}

// demoteVendor turns a vendor back into a plain customer, unlinks the store and
// signs them out everywhere.
func (s *AdminService) demoteVendor(tx *gorm.DB, vendor *domain.User) error {
	now := time.Now().UTC()
	if err := s.vendors.DeleteAssignment(tx, vendor.ID); err != nil {
		return err
	}
	vendor.Role = domain.RoleCustomer
	vendor.UpdatedAt = now
	if err := s.users.Update(tx, vendor); err != nil {
		return err
	}
	if s.sessions != nil {
		return s.sessions.RevokeAll(tx, vendor.ID, now)
	}
	return nil
}

// assignVendor makes request.Phone the one vendor of a store, inside tx. With
// createOnly it fails when the store already has one; otherwise it replaces them.
// Admins, riders, vendors of another store and customers with open orders are refused.
func (s *AdminService) assignVendor(tx *gorm.DB, storeID uuid.UUID, request dto.StoreVendorRequest, createOnly bool) (*domain.User, error) {
	phone, err := NormalizePhone(request.Phone)
	if err != nil {
		return nil, err
	}
	var name *string
	if request.Name != nil {
		trimmed := strings.TrimSpace(*request.Name)
		if len(trimmed) > 120 {
			return nil, fmt.Errorf("%w: name must be at most 120 characters", ErrInvalidInput)
		}
		if trimmed != "" {
			name = &trimmed
		}
	}
	now := time.Now().UTC()

	current, err := s.vendors.FindVendorForStore(tx, storeID)
	switch {
	case err == nil:
		if createOnly {
			return nil, ErrVendorExists
		}
		if current.Phone == phone {
			if name != nil {
				current.Name = name
				current.UpdatedAt = now
				if err := s.users.Update(tx, current); err != nil {
					return nil, err
				}
			}
			return current, nil
		}
		if err := s.demoteVendor(tx, current); err != nil {
			return nil, err
		}
	case !errors.Is(err, repository.ErrNotFound):
		return nil, err
	}

	user, err := s.users.FindByPhone(tx, phone)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		referral, err := generateReferralCode()
		if err != nil {
			return nil, err
		}
		user = &domain.User{ID: uuid.New(), Phone: phone, Name: name, Role: domain.RoleVendor, Status: "active", ReferralCode: referral, CreatedAt: now, UpdatedAt: now}
		if err := s.users.Create(tx, user); err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if user.Status != "active" {
			return nil, fmt.Errorf("%w: this account is blocked", ErrInvalidInput)
		}
		switch user.Role {
		case domain.RoleAdmin:
			return nil, fmt.Errorf("%w: an admin cannot be a vendor", ErrInvalidRole)
		case domain.RoleDelivery:
			return nil, fmt.Errorf("%w: a delivery partner cannot also be a vendor", ErrInvalidRole)
		case domain.RoleVendor:
			if existing, err := s.vendors.FindAssignment(tx, user.ID); err == nil && existing.StoreID != storeID {
				return nil, ErrVendorAssigned
			} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
				return nil, err
			}
		default:
			if open, err := s.commerce.CountActiveOrdersForCustomer(tx, user.ID); err != nil {
				return nil, err
			} else if open > 0 {
				return nil, ErrActiveOrders
			}
		}
		user.Role = domain.RoleVendor
		if name != nil {
			user.Name = name
		}
		user.UpdatedAt = now
		if err := s.users.Update(tx, user); err != nil {
			return nil, err
		}
	}
	if err := s.vendors.DeleteAssignment(tx, user.ID); err != nil {
		return nil, err
	}
	if err := s.vendors.CreateAssignment(tx, &domain.VendorStoreAssignment{VendorID: user.ID, StoreID: storeID, CreatedAt: now}); err != nil {
		return nil, err
	}
	return user, nil
}

// GetStoreVendor returns the vendor of a store (not found when there is none).
func (s *AdminService) GetStoreVendor(storeID uuid.UUID) (*dto.VendorSummary, error) {
	if _, err := s.catalog.FindStore(nil, storeID); err != nil {
		return nil, err
	}
	vendor, err := s.vendors.FindVendorForStore(nil, storeID)
	if err != nil {
		return nil, err
	}
	return vendorSummary(vendor), nil
}

// SetStoreVendor creates (createOnly) or replaces the vendor of a store.
func (s *AdminService) SetStoreVendor(storeID uuid.UUID, request dto.StoreVendorRequest, createOnly bool) (*dto.VendorSummary, error) {
	if _, err := s.catalog.FindStore(nil, storeID); err != nil {
		return nil, err
	}
	var vendor *domain.User
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		vendor, err = s.assignVendor(tx, storeID, request, createOnly)
		return err
	})
	if err != nil {
		return nil, err
	}
	return vendorSummary(vendor), nil
}

// RemoveStoreVendor takes the vendor login away from a store.
func (s *AdminService) RemoveStoreVendor(storeID uuid.UUID) error {
	if _, err := s.catalog.FindStore(nil, storeID); err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		vendor, err := s.vendors.FindVendorForStore(tx, storeID)
		if err != nil {
			return err
		}
		return s.demoteVendor(tx, vendor)
	})
}

// GetStore checks that a store exists.
func (s *AdminService) GetStore(storeID uuid.UUID) (*domain.Store, error) {
	return s.catalog.FindStore(nil, storeID)
}

// DB exposes the connection for services that share this one (stats).
func (s *AdminService) DB() *gorm.DB { return s.db }
