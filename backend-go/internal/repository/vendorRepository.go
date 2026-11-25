package repository

import (
	"errors"

	"quick-commerce/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// VendorRepository manages the vendor-to-store link. One vendor manages exactly
// one store.
type VendorRepository interface {
	FindAssignment(db *gorm.DB, vendorID uuid.UUID) (*domain.VendorStoreAssignment, error)
	FindVendorForStore(db *gorm.DB, storeID uuid.UUID) (*domain.User, error)
	CreateAssignment(db *gorm.DB, assignment *domain.VendorStoreAssignment) error
	DeleteAssignment(db *gorm.DB, vendorID uuid.UUID) error
	DeleteAssignmentsForStore(db *gorm.DB, storeID uuid.UUID) error
}

type vendorRepository struct{ db *gorm.DB }

func NewVendorRepository(db *gorm.DB) VendorRepository { return &vendorRepository{db: db} }

func (r *vendorRepository) FindAssignment(db *gorm.DB, vendorID uuid.UUID) (*domain.VendorStoreAssignment, error) {
	var assignment domain.VendorStoreAssignment
	err := dbOrDefault(db, r.db).Where("vendor_id = ?", vendorID).First(&assignment).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &assignment, err
}

// FindVendorForStore returns the vendor user assigned to a store.
func (r *vendorRepository) FindVendorForStore(db *gorm.DB, storeID uuid.UUID) (*domain.User, error) {
	var user domain.User
	err := dbOrDefault(db, r.db).
		Joins("JOIN vendor_store_assignments vsa ON vsa.vendor_id = users.id").
		Where("vsa.store_id = ? AND users.role = ?", storeID, domain.RoleVendor).
		First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &user, err
}

func (r *vendorRepository) CreateAssignment(db *gorm.DB, assignment *domain.VendorStoreAssignment) error {
	return dbOrDefault(db, r.db).Create(assignment).Error
}

func (r *vendorRepository) DeleteAssignment(db *gorm.DB, vendorID uuid.UUID) error {
	return dbOrDefault(db, r.db).Where("vendor_id = ?", vendorID).Delete(&domain.VendorStoreAssignment{}).Error
}

func (r *vendorRepository) DeleteAssignmentsForStore(db *gorm.DB, storeID uuid.UUID) error {
	return dbOrDefault(db, r.db).Where("store_id = ?", storeID).Delete(&domain.VendorStoreAssignment{}).Error
}
