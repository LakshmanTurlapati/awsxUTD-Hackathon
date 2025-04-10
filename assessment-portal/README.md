# Dashboard Component Changes

## UI Changes Implemented:

1. **Profile Component**:
   - Removed skills and experience sections
   - Removed icon beside requirement
   - Made all profile fields editable:
     - Name
     - Role
     - About
     - Requirement
   - Added Save button for updating profile information

2. **Visualization Widget**:
   - Fixed radar graph issue requiring double click
   - Maintained consistent size when showing candidate data

3. **Added New Referer Widget**:
   - Added widget with "(i) Please select a referer" header
   - Left content empty for future implementation

## Backend Integration:

### Service Updates:
- Added new `RefererData` interface to support profile data storage
- Added new methods to the `DynamoDBService`:
  - `saveRefererData(refererData: RefererData)`
  - `getAllReferers()`
  - `getRefererById(id: string)`
  - `deleteReferer(id: string)`

### Backend Requirements:
- New DynamoDB table for storing referer data
- New API endpoints for handling referer operations

## How to Test:

1. The radar chart should update immediately when clicking a candidate (no double-click needed)
2. Profile details should be editable and save correctly
3. The layout should maintain proper sizing and appearance in all views 