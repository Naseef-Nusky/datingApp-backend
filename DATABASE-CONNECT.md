# Connecting to Digital Ocean Managed PostgreSQL

Your cluster **vantage-dating-db** (LON1, PostgreSQL 18) uses SSL. Use these steps to connect the backend.

## 1. Add connection details to `backend/.env`

**Do not commit `.env`.** Put your real values in `backend/.env`:

```env
# Digital Ocean Managed Database
DB_HOST=vantage-dating-db-do-user-30908140-0.k.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=defaultdb
DB_USER=doadmin
DB_PASSWORD=your_password_from_do_control_panel
DB_SSL=true
```

- **Database name:** DO creates `defaultdb` by default. You can keep it or [create a new database](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-databases/) (e.g. `datingapp`) and set `DB_NAME=datingapp`.
- **Network:** If the app runs on a Droplet in the same region, add the DB to the same VPC and use the **VPC host** from the control panel for lower latency. For local dev or a different network, use the **Public network** host (as above).

## 2. (Optional) CA certificate

If you see an SSL certificate error, use DO’s CA certificate:

1. In the cluster → **Connection details** → **Download CA certificate**.
2. Save it in the backend folder, e.g. `backend/ca-certificate.crt`.
3. In `backend/.env` add:

   ```env
   DB_SSL_CA=./ca-certificate.crt
   ```

   Or use an absolute path: `DB_SSL_CA=/path/to/ca-certificate.crt`.

## 3. Allow your app’s IP (public access)

If you use the **Public network** host:

1. In the cluster → **Settings** → **Trusted Sources** (or **Network**).
2. Add your Droplet’s IP or your dev machine’s IP so the database accepts connections from the app.

## 4. Run the backend

```bash
cd backend
npm run dev
```

You should see: `✅ PostgreSQL Connected successfully` and then model sync (in development).

## 5. Fix "no pg_hba.conf entry ... no encryption"

If you see:

```text
no pg_hba.conf entry for host "x.x.x.x", user "doadmin", database "defaultdb", no encryption
```

the app is connecting **without SSL**. Digital Ocean only allows encrypted connections.

1. **Enable SSL in `.env`:**
   ```env
   DB_SSL=true
   ```

2. **Use the correct CA certificate** (not a generic DO URL):
   - In Digital Ocean: your **database cluster** → **Connection details** (or **Settings**) → **Download CA certificate**.
   - Save the file on the server, e.g. `/var/www/backend/ca-certificate.crt`.
   - In `.env`:
     ```env
     DB_SSL_CA=./ca-certificate.crt
     ```
     Or absolute: `DB_SSL_CA=/var/www/backend/ca-certificate.crt`.

3. **Trusted Sources:** In the cluster → **Settings** → **Trusted Sources**, add your Droplet IP (e.g. `64.227.39.175`) so the database accepts connections from the app.

4. Restart the backend: `node server.js`.

## 6. First run / tables

In development the app runs `sequelize.sync({ alter: true })`, which creates or updates tables in the database. For production you can disable auto-sync by setting `NODE_ENV=production` and optionally `SYNC_DB=true` only when you want to run migrations/sync once.

---

**Security:** Rotate the DB password in the DO control panel if it was ever committed or shared. Keep `backend/.env` in `.gitignore` and use env vars (or a secrets manager) on the server.
