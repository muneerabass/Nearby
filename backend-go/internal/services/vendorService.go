package services

import (
	"errors"
	"fmt"
	"time"

	"quick-commerce/internal/domain"
	"quick-commerce/internal/dto"
	"quick-commerce/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrVendorNotAssigned  = errors.New("this vendor account is not linked to an active store")
	ErrStoreClosedByAdmin = errors.New("this store was closed by an administrator; contact support to reopen it")
)

// VendorService is the store-owner side of the platform. Every method takes the
// store ID resolved from the vendor's assignment; none accepts one from a request.
type VendorService struct {
	db      *gorm.DB
	users   repository.UserRepository
	vendors repository.VendorRepository
	catalog repository.CatalogRepository
	admin   *AdminService
	stats   *StoreStatsService
}

func NewVendorService(db *gorm.DB, users repository.UserRepository, catalog repository.CatalogRepository, admin *AdminService) *VendorService {
	return &VendorService{db: db, users: users, vendors: repository.NewVendorRepository(db), catalog: catalog, admin: admin, stats: NewStoreStatsService(db)}
}

// ResolveStore maps a signed-in user to the store they manage. It fails with
// ErrVendorNotAssigned unless they are an active vendor with a store link, so a
// blocked or demoted vendor loses access on the next request.
func (s *VendorService) ResolveStore(userID uuid.UUID) (uuid.UUID, error) {
	user, err := s.users.FindByID(nil, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return uuid.Nil, ErrVendorNotAssigned
		}
		return uuid.Nil, err
	}
	if user.Role != domain.RoleVendor || user.Status != "active" {
		return uuid.Nil, ErrVendorNotAssigned
	}
	assignment, err := s.vendors.FindAssignment(nil, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return uuid.Nil, ErrVendorNotAssigned
		}
		return uuid.Nil, err
	}
	return assignment.StoreID, nil
}

func (s *VendorService) Store(storeID uuid.UUID) (dto.StoreResponse, error) {
	store, err := s.catalog.FindStore(nil, storeID)
	if err != nil {
		return dto.StoreResponse{}, err
	}
	pincodes, err := s.catalog.ListPincodes(nil, []uuid.UUID{storeID})
	if err != nil {
		return dto.StoreResponse{}, err
	}
	store.Pincodes = pincodes[storeID]
	response := mapStore(store)
	if vendor, err := s.vendors.FindVendorForStore(nil, storeID); err == nil {
		response.Vendor = vendorSummary(vendor)
	}
	return response, nil
}

// UpdateStore lets a vendor open or close their store and set its contact
// number. Name, address and pincodes stay admin-only. A store an admin closed
// cannot be reopened by the vendor.
func (s *VendorService) UpdateStore(storeID uuid.UUID, request dto.VendorStorePatchRequest) (dto.StoreResponse, error) {
	store, err := s.catalog.FindStore(nil, storeID)
	if err != nil {
		return dto.StoreResponse{}, err
	}
	if request.IsActive != nil {
		if *request.IsActive && !store.IsActive && store.ClosedByRole != nil && *store.ClosedByRole == domain.RoleAdmin {
			return dto.StoreResponse{}, ErrStoreClosedByAdmin
		}
		store.IsActive = *request.IsActive
		if store.IsActive {
			store.ClosedByRole = nil
		} else {
			closedBy := domain.RoleVendor
			store.ClosedByRole = &closedBy
		}
	}
	if request.ContactPhone != nil {
		if store.ContactPhone, err = optionalContactPhone(request.ContactPhone); err != nil {
			return dto.StoreResponse{}, err
		}
	}
	if err := s.catalog.UpdateStore(nil, store); err != nil {
		return dto.StoreResponse{}, err
	}
	return s.Store(storeID)
}

// Riders lists the riders assigned to the store with their online status.
func (s *VendorService) Riders(storeID uuid.UUID) ([]dto.UserResponseDto, error) {
	return s.admin.ListDeliveryUsers(storeID)
}

// Stats summarises the store's orders for [from, to).
func (s *VendorService) Stats(storeID uuid.UUID, from, to time.Time, tzOffsetMinutes int) (dto.StoreStatsResponse, error) {
	return s.stats.Compute(storeID, from, to, tzOffsetMinutes)
}

func (s *VendorService) Products(storeID uuid.UUID) ([]dto.CatalogProductResponse, error) {
	return s.admin.ListProducts(&storeID)
}

func (s *VendorService) Categories() ([]domain.Category, error) {
	return s.admin.ListCategories()
}

func (s *VendorService) CreateProduct(storeID uuid.UUID, request dto.ProductRequest) (dto.CatalogProductResponse, error) {
	request.StoreID = storeID.String()
	return s.admin.CreateProduct(request)
}

func (s *VendorService) ownedProduct(storeID, productID uuid.UUID) error {
	product, err := s.catalog.FindProduct(nil, productID)
	if err != nil {
		return err
	}
	if product.StoreID != storeID {
		return repository.ErrNotFound
	}
	return nil
}

func (s *VendorService) UpdateProduct(storeID, productID uuid.UUID, request dto.ProductPatchRequest) (dto.CatalogProductResponse, error) {
	if err := s.ownedProduct(storeID, productID); err != nil {
		return dto.CatalogProductResponse{}, err
	}
	return s.admin.UpdateProduct(productID, request)
}

func (s *VendorService) Inventory(storeID uuid.UUID) ([]domain.Inventory, error) {
	return s.admin.ListInventory(storeID)
}

func (s *VendorService) SetInventory(storeID, vendorID, productID uuid.UUID, request dto.InventoryRequest) (domain.Inventory, error) {
	if err := s.ownedProduct(storeID, productID); err != nil {
		return domain.Inventory{}, err
	}
	if request.Reason == "" {
		request.Reason = "Updated by vendor"
	}
	return s.admin.SetInventoryWithActor(&vendorID, storeID, productID, request)
}

// ParseStatsRange validates a stats window; the default is the last 7 days.
func ParseStatsRange(from, to *time.Time, now time.Time) (time.Time, time.Time, error) {
	end := now
	if to != nil {
		end = *to
	}
	start := end.Add(-7 * 24 * time.Hour)
	if from != nil {
		start = *from
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, fmt.Errorf("%w: to must be after from", ErrInvalidInput)
	}
	return start, end, nil
}
