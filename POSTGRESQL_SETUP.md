# PostgreSQL Setup Guide

## Finding/Setting PostgreSQL Password

### Option 1: Check if you have a password set

1. Open pgAdmin4
2. Connect to your PostgreSQL server (usually "PostgreSQL 15" or similar)
3. If you can connect without entering a password, your password might be empty or stored in pgAdmin's password manager

### Option 2: Reset PostgreSQL Password via pgAdmin4

1. **Open pgAdmin4**
2. **Right-click on your PostgreSQL server** (usually in the left sidebar)
3. Select **"Properties"**
4. Go to the **"Connection"** tab
5. You can see the username (usually "postgres") but the password is hidden

### Option 3: Reset Password via SQL Query

1. In pgAdmin4, right-click on your server → **"Query Tool"**
2. Run this SQL command to set/reset the password:
   ```sql
   ALTER USER postgres WITH PASSWORD 'your_new_password';
   ```
3. Replace `your_new_password` with your desired password
4. Click **"Execute"** (or press F5)

### Option 4: Reset Password via Command Line (Windows)

1. Open Command Prompt as Administrator
2. Navigate to PostgreSQL bin directory (usually):
   ```bash
   cd "C:\Program Files\PostgreSQL\15\bin"
   ```
   (Replace 15 with your PostgreSQL version)
3. Run:
   ```bash
   psql -U postgres
   ```
4. If it asks for a password and you don't know it, you may need to:
   - Check pgAdmin4's stored passwords
   - Or reset via Windows service

### Option 5: Check pgAdmin4 Stored Password

1. In pgAdmin4, go to **File → Preferences**
2. Navigate to **"Browser" → "Display"**
3. Check if "Show passwords" is enabled
4. Or go to **File → Preferences → "Paths"** to find where passwords are stored

## Using the Password in Your .env File

Once you have your password, update your `.env` file:

```env
DB_NAME=datingapp
DB_USER=postgres
DB_PASSWORD=your_actual_password_here
DB_HOST=localhost
DB_PORT=5432
```

## Common Default Passwords

- **Empty password** (no password) - Try leaving `DB_PASSWORD=` empty
- **postgres** - Common default password
- **admin** - Another common default
- **root** - Sometimes used

## If You Forgot the Password Completely

### Windows Method:

1. Stop PostgreSQL service:
   ```bash
   net stop postgresql-x64-15
   ```
   (Replace 15 with your version)

2. Edit the `pg_hba.conf` file (usually in `C:\Program Files\PostgreSQL\15\data\`)
   - Change `md5` to `trust` for local connections
   - Save the file

3. Start PostgreSQL service:
   ```bash
   net start postgresql-x64-15
   ```

4. Connect without password and reset:
   ```sql
   ALTER USER postgres WITH PASSWORD 'new_password';
   ```

5. Change `pg_hba.conf` back to `md5` and restart service

## Testing Your Connection

After setting up your `.env` file, test the connection:

```bash
cd backend
node -e "
import('pg').then(({ default: pg }) => {
  const client = new pg.Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'your_password',
    database: 'postgres'
  });
  client.connect().then(() => {
    console.log('✅ Connected successfully!');
    client.end();
  }).catch(err => {
    console.error('❌ Connection failed:', err.message);
  });
});
"
```

Or simply start your server and check the console for connection messages.

