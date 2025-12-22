# Seed Users Script

This script creates 10 test users with complete profiles for testing the dating app.

## Usage

Run the seed script from the backend directory:

```bash
cd backend
npm run seed
```

Or directly:

```bash
node scripts/seedUsers.js
```

## What it does

1. Connects to the PostgreSQL database
2. Syncs all models (creates tables if they don't exist)
3. Creates 10 test users with:
   - Email addresses (john.doe@example.com, jane.smith@example.com, etc.)
   - Password: `password123` (for all users)
   - Complete profiles with:
     - Personal information (name, age, gender, bio)
     - Location data
     - Interests
     - Lifestyle information
     - Preferences
   - Random credits (100-600)
   - Random online status
   - Random profile views

## Test Users Created

1. **John Doe** (28, Male) - Software Engineer, New York
2. **Jane Smith** (26, Female) - Marketing Manager, Los Angeles
3. **Michael Chen** (32, Male) - Entrepreneur, San Francisco
4. **Sarah Johnson** (29, Female) - Yoga Instructor, Miami
5. **David Wilson** (35, Male) - Musician, Nashville
6. **Emily Brown** (27, Female) - Graphic Designer, Chicago
7. **Robert Taylor** (31, Male) - Personal Trainer, Austin
8. **Lisa Anderson** (30, Female) - Chef, Seattle
9. **James Martinez** (33, Male) - Photographer, Denver
10. **Amanda White** (28, Female) - Teacher, Boston

## Login Credentials

All users have the same password: `password123`

You can login with any of these emails:
- john.doe@example.com
- jane.smith@example.com
- michael.chen@example.com
- sarah.johnson@example.com
- david.wilson@example.com
- emily.brown@example.com
- robert.taylor@example.com
- lisa.anderson@example.com
- james.martinez@example.com
- amanda.white@example.com

## Notes

- The script checks if users already exist and skips them (won't create duplicates)
- All users are verified and active
- Profiles are automatically created when users are created
- The script will show progress and final counts

