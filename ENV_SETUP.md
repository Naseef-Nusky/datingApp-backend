# Environment Variables Setup

## Quick Setup

1. **Create a `.env` file** in the `backend` directory (copy from `.env.example` if it exists)

2. **Add your PostgreSQL credentials**:

```env
PORT=5000
NODE_ENV=development

# PostgreSQL Database Configuration
DB_NAME=datingapp
DB_USER=postgres
DB_PASSWORD=password@123
DB_HOST=localhost
DB_PORT=5432

# JWT Secret (change this to a random string in production)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Email configuration (for password reset) - Optional for now
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@datingapp.com
```

## Your Current Settings

Based on your PostgreSQL setup:
- **Database Name**: `datingapp` (or `datingApp` - check which one you're using)
- **Username**: `postgres`
- **Password**: `password@123`
- **Host**: `localhost`
- **Port**: `5432` (default)

## Important Notes

1. **Database Name**: Make sure the database exists. If you see `datingApp=#` in your psql prompt, your database might be named `datingApp` (with capital A). Update `DB_NAME` accordingly.

2. **Create the database** if it doesn't exist:
   ```sql
   CREATE DATABASE datingapp;
   ```
   Or if you prefer the capitalized version:
   ```sql
   CREATE DATABASE "datingApp";
   ```

3. **Test the connection** by starting your server:
   ```bash
   cd backend
   npm run dev
   ```

   You should see: `PostgreSQL Connected successfully`

## Troubleshooting

If you get connection errors:

1. **Check database name**: Make sure `DB_NAME` matches exactly what you see in pgAdmin4
2. **Check password**: Ensure `password@123` is correct (no extra spaces)
3. **Check PostgreSQL is running**: 
   - Windows: Check Services for "postgresql-x64-XX"
   - Or try connecting via pgAdmin4 first

