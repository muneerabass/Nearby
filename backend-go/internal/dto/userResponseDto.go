package dto

type UserResponseDto struct {
	ID              string  `json:"id"`
	Phone           string  `json:"phone"`
	Name            *string `json:"name,omitempty"`
	PhoneVerifiedAt *string `json:"phone_verified_at,omitempty"`
	Status          string  `json:"status"`
	IsOnline        bool    `json:"is_online"`
	LastSeenAt      *string `json:"last_seen_at,omitempty"`
	Role            string  `json:"role"`
	ReferralCode    string  `json:"referral_code"`
	ReferredByCode  *string `json:"referred_by_code,omitempty"`
	// Store is the store a vendor manages; set only for vendors.
	Store *StoreSummary `json:"store,omitempty"`
}

type AuthResponse struct {
	User         UserResponseDto `json:"user"`
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	TokenType    string          `json:"token_type"`
	ExpiresIn    int64           `json:"expires_in"`
	SessionID    string          `json:"session_id"`
}
