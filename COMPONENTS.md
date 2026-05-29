# Ashram Bhajan Database - Component Structure

## Components Added

### Header Component (`src/components/Header.jsx`)
A responsive navigation header that appears on all authenticated pages.

**Features:**
- Navigation links: Dashboard, + Add Bhajan
- Admin-only: Users management page
- Logout functionality
- Responsive hamburger menu for mobile
- Active link highlighting
- Sticky positioning at top of page

**Props:**
- `userRole` (string) - User's role ('viewer', 'contributor', 'admin')

**Styling:** `src/styles/Header.css`

## Updated Components

### App.jsx
- Added Header import and rendering
- Added userRole state management
- Fetches user role from database on auth check
- Header only shows for authenticated users

### Dashboard.jsx
- Removed duplicate logout button (now in Header)
- Removed duplicate "Add Bhajan" button (now in Header)
- Simplified to focus on bhajan listing

## Styling Structure

### App.css
Main application styles:
- Authentication page styling
- Dashboard layout
- Form styling
- Button variants
- Contributor management
- Responsive design

### Header.css
Header-specific styles:
- Sticky header positioning
- Navigation styling
- Hamburger menu (mobile)
- Active link states
- Mobile responsiveness

## Directory Structure

```
src/
├── components/
│   └── Header.jsx
├── config/
│   └── supabase.js
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   └── BhajanForm.jsx
├── styles/
│   └── Header.css
├── App.jsx
├── App.css
└── main.jsx
```

## Next Steps

1. Integrate Header into all pages that need navigation
2. Add role-based route protection
3. Create Users management page (for admin role)
4. Add more dashboard features (search, filter, sort)
5. Implement bhajan detail/view page
