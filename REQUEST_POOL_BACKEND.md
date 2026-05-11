# Request Pool System - Backend Documentation

## Overview

The Request Pool System is a two-sided marketplace that enables:
- **Buyers/Users**: Post service requests and select offers from providers
- **Providers/Sellers**: Browse requests and submit competitive bids

## Architecture

### Core Files

1. **request-pool-manager.js** - Central backend logic module
   - All CRUD operations for requests and offers
   - Provider statistics tracking
   - Activity logging
   - Data validation

2. **post-request.js** - Buyer-side request posting
   - Form validation
   - Request creation
   - User data pre-population

3. **browse-pool.js** - Provider-side offer submission
   - Request browsing and filtering
   - Offer submission
   - Provider statistics

4. **my-requests.js** - Buyer request management
   - View posted requests
   - Review received offers
   - Accept/reject offers
   - Request cancellation

## Firestore Collections

### 1. `requests`
Main collection for service requests.

**Schema:**
```javascript
{
  id: string,                    // Auto-generated
  userId: string,                // Request creator
  userName: string,              // Display name
  userPhone: string,             // Contact phone
  serviceType: string,           // Category (Home, Repairs, etc)
  description: string,           // Detailed description (min 10 chars)
  location: string,              // Service location
  dateNeeded: string,            // ISO date string
  timeNeeded: string | null,     // Optional time (HH:mm)
  budget: number,                // Optional budget (₦)
  status: string,                // 'open' | 'accepted' | 'completed' | 'cancelled'
  offers: array<Offer>,          // Array of submitted offers
  acceptedOffer: Offer | null,   // Accepted offer details
  totalOffers: number,           // Count of offers
  tags: array<string>,           // Searchable tags
  createdAt: Timestamp,          // Creation date
  updatedAt: Timestamp,          // Last update
  expiresAt: Timestamp,          // 30 days from creation
  cancellationReason: string | null
}
```

**Offer Sub-object:**
```javascript
{
  id: string,                    // Unique offer ID
  providerId: string,            // Provider user ID
  price: number,                 // Bid price (₦)
  message: string,               // Provider message
  availability: string,          // 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'flexible'
  status: string,                // 'pending' | 'accepted' | 'rejected'
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 2. `providerOffers`
Index collection for faster provider queries.

**Schema:**
```javascript
{
  id: string,
  requestId: string,
  providerId: string,
  price: number,
  message: string,
  availability: string,
  status: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 3. `providerStats`
Tracks provider performance metrics.

**Schema:**
```javascript
{
  id: string,
  providerId: string,
  totalPoolJoins: number,        // Number of requests bid on
  totalPoolWins: number,         // Number of accepted offers
  totalInvested: number,         // Total money earned
  totalOffers: number,           // Total offers submitted
  totalCompleted: number,        // Completed jobs
  successRate: number,           // Win percentage
  acceptanceRate: number,        // Offer acceptance percentage
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 4. `requestActivity`
Activity log for audit trail and notifications.

**Schema:**
```javascript
{
  id: string,
  requestId: string,
  userId: string,
  action: string,                // 'created', 'offer_submitted', 'offer_accepted', etc
  details: string,               // Human-readable description
  timestamp: Timestamp
}
```

### 5. `bookings` (Enhanced)
Tracks confirmed bookings from accepted offers.

**Schema:**
```javascript
{
  id: string,
  requestId: string,
  buyerId: string,
  providerId: string,
  serviceType: string,
  description: string,
  location: string,
  dateNeeded: string,
  timeNeeded: string | null,
  amount: number,                // Accepted offer price
  status: string,                // 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: Timestamp,
  completedAt: Timestamp | null
}
```

## API Functions

### Request Management

#### `createRequest(requestData)`
Create a new service request.

**Parameters:**
```javascript
{
  userName: string,
  userPhone: string,
  serviceType: string,
  description: string,
  location: string,
  dateNeeded: string,
  timeNeeded?: string,
  budget?: number
}
```

**Returns:**
```javascript
{
  success: boolean,
  requestId: string,
  message: string,
  error?: string
}
```

**Example:**
```javascript
const result = await createRequest({
  userName: 'John Doe',
  userPhone: '+2341234567890',
  serviceType: 'Home',
  description: 'Need a professional cleaner for my 3-bedroom apartment',
  location: 'Lagos, Ikoyi',
  dateNeeded: '2024-05-10',
  timeNeeded: '14:00',
  budget: 15000
});
```

#### `getOpenRequests(filters)`
Fetch all open requests with optional filters.

**Parameters:**
```javascript
{
  category?: string,
  location?: string,
  minBudget?: number,
  maxBudget?: number,
  sortBy?: 'newest' | 'budget-high' | 'budget-low' | 'urgent' | 'most-offers'
}
```

**Returns:**
```javascript
{
  success: boolean,
  count: number,
  requests: array<Request>,
  error?: string
}
```

#### `getRequestById(requestId)`
Get detailed info for a specific request.

**Returns:**
```javascript
{
  success: boolean,
  request: Request,
  error?: string
}
```

#### `getUserRequests(userId)`
Get all requests posted by a user.

**Returns:**
```javascript
{
  success: boolean,
  count: number,
  requests: array<Request>,
  error?: string
}
```

#### `updateRequestStatus(requestId, newStatus)`
Update request status (open → accepted → completed/cancelled).

**Parameters:**
- `requestId`: string
- `newStatus`: 'open' | 'accepted' | 'completed' | 'cancelled'

**Returns:**
```javascript
{
  success: boolean,
  message: string,
  error?: string
}
```

#### `cancelRequest(requestId, reason)`
Cancel a request.

**Parameters:**
- `requestId`: string
- `reason`: string (cancellation reason)

**Returns:**
```javascript
{
  success: boolean,
  message: string,
  error?: string
}
```

### Offer Management

#### `submitOffer(requestId, offerData)`
Submit an offer for a request (provider action).

**Parameters:**
```javascript
{
  price: number,                 // Must be > 0
  message?: string,
  availability: string           // 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'flexible'
}
```

**Returns:**
```javascript
{
  success: boolean,
  offerId: string,
  message: string,
  error?: string
}
```

**Example:**
```javascript
const result = await submitOffer('request_123', {
  price: 12000,
  message: 'Professional cleaner with 5 years experience. Will bring all supplies.',
  availability: 'tomorrow'
});
```

#### `acceptOffer(requestId, offerId)`
Accept an offer (buyer action - creates booking).

**Returns:**
```javascript
{
  success: boolean,
  bookingId: string,
  message: string,
  error?: string
}
```

#### `rejectOffer(requestId, offerId)`
Reject an offer.

**Returns:**
```javascript
{
  success: boolean,
  message: string,
  error?: string
}
```

#### `getProviderOffers(providerId)`
Get all offers submitted by a provider.

**Returns:**
```javascript
{
  success: boolean,
  count: number,
  offers: array<Offer>,
  error?: string
}
```

### Provider Statistics

#### `updateProviderStats(providerId, action)`
Update provider performance metrics.

**Parameters:**
- `providerId`: string
- `action`: 'offer_submitted' | 'offer_accepted' | 'completed'

**Automatically updates:**
- `totalPoolJoins` - when offer submitted
- `totalPoolWins` - when offer accepted
- `totalCompleted` - when job completed
- `successRate` - calculated as (wins / joins * 100)

#### `getProviderStats(providerId)`
Fetch provider statistics.

**Returns:**
```javascript
{
  success: boolean,
  stats: {
    providerId: string,
    totalPoolJoins: number,
    totalPoolWins: number,
    successRate: number,
    totalOffers: number,
    totalCompleted: number
  },
  error?: string
}
```

### Activity Logging

#### `addActivity(requestId, userId, action, details)`
Add activity log entry for audit trail.

**Parameters:**
- `requestId`: string
- `userId`: string
- `action`: string (action type)
- `details`: string (description)

#### `getRequestActivity(requestId)`
Get activity history for a request.

**Returns:**
```javascript
{
  success: boolean,
  activities: array<Activity>,
  error?: string
}
```

### Validation

#### `validateRequestData(data)`
Validate request form data.

**Returns:**
```javascript
{
  valid: boolean,
  errors: array<string>  // Validation error messages
}
```

#### `validateOfferData(data)`
Validate offer form data.

**Returns:**
```javascript
{
  valid: boolean,
  errors: array<string>
}
```

## Data Flow

### Posting a Request (Buyer)

```
1. User fills post-request.html form
2. post-request.js validates data
3. createRequest() saves to Firestore
4. Activity logged
5. Request appears in browse-pool for providers
6. User redirected to home
```

### Submitting an Offer (Provider)

```
1. Provider views request in browse-pool.html
2. Provider fills offer form
3. submitOffer() adds to request.offers array
4. Saves to providerOffers collection
5. Updates provider stats (totalPoolJoins++)
6. Activity logged
7. Buyer notified of new offer
```

### Accepting an Offer (Buyer)

```
1. Buyer views offers in my-requests.html
2. Buyer clicks "Accept" on preferred offer
3. acceptOffer() called
4. Request status → 'accepted'
5. Booking created in bookings collection
6. Other offers marked 'rejected'
7. Provider stats updated (totalPoolWins++)
8. Activity logged
9. Both parties notified
```

## Error Handling

All functions return `{ success: boolean, error?: string }` format.

**Common Errors:**
- "User must be authenticated" - User not logged in
- "Missing required fields" - Form validation failed
- "Unauthorized" - User trying to modify other's data
- "Request not found" - Invalid request ID
- "You have already submitted an offer for this request" - Duplicate offer attempt
- "This request is no longer open for offers" - Request status changed

## Security

- All operations require user authentication
- Users can only create/modify their own requests
- Providers can only submit offers for open requests
- Firestore rules enforce data isolation
- Activity logs maintain audit trail

## Performance Considerations

1. **Indexing**: Queries use `status`, `userId`, `providerId` fields - ensure indexes exist
2. **Subcollections**: Used `providerOffers` as separate collection for faster provider queries
3. **Pagination**: Not implemented yet - consider adding for large datasets
4. **Caching**: Browser-side caching in JavaScript arrays - refresh on tab switch

## Future Enhancements

- [ ] Real-time notifications (Firebase Cloud Messaging)
- [ ] Payment integration (Stripe/PayPal)
- [ ] Review/rating system integration
- [ ] Dispute resolution workflow
- [ ] Request recommendation engine
- [ ] Provider verification system
- [ ] Request expiration automation
- [ ] Bulk operations for admin
- [ ] Advanced analytics dashboard
- [ ] Email/SMS notifications

## Testing

### Test Request Creation
```javascript
// In browser console on post-request.html
const result = await createRequest({
  userName: 'Test User',
  userPhone: '+234123456789',
  serviceType: 'Home',
  description: 'This is a test request for system validation',
  location: 'Lagos',
  dateNeeded: '2024-05-15',
  budget: 5000
});
console.log(result);
```

### Test Offer Submission
```javascript
// Ensure different user logged in
const result = await submitOffer('REQUEST_ID_HERE', {
  price: 4500,
  message: 'I can help with this',
  availability: 'tomorrow'
});
console.log(result);
```

### Test Provider Stats
```javascript
const stats = await getProviderStats(AUTH_USER_ID);
console.log(stats);
```

## Deployment Checklist

- [ ] Test all CRUD operations
- [ ] Verify Firestore rules are deployed
- [ ] Check security rules in production
- [ ] Test with multiple users
- [ ] Verify provider stats calculation
- [ ] Test error scenarios
- [ ] Check browser console for errors
- [ ] Verify responsive design on mobile
- [ ] Test filtering and sorting
- [ ] Validate form inputs
