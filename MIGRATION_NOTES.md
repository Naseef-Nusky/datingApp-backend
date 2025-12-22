# Migration from MongoDB to PostgreSQL

This document notes the key changes made when migrating from MongoDB/Mongoose to PostgreSQL/Sequelize.

## Key Changes

### 1. Database Connection
- **Before**: Mongoose with MongoDB connection string
- **After**: Sequelize with PostgreSQL connection

### 2. Model Definitions
- **Before**: Mongoose schemas with `mongoose.Schema()`
- **After**: Sequelize models with `sequelize.define()`
- Primary keys changed from ObjectId to UUID
- JSON fields use JSONB type in PostgreSQL

### 3. Query Syntax Changes

#### Finding Records
```javascript
// Mongoose
User.findOne({ email: 'test@example.com' })
User.findById(id)

// Sequelize
User.findOne({ where: { email: 'test@example.com' } })
User.findByPk(id)
```

#### Creating Records
```javascript
// Both work similarly
User.create({ email, password })
```

#### Updating Records
```javascript
// Mongoose
user.field = value;
await user.save();

// Sequelize (same)
user.field = value;
await user.save();
```

#### Query Operators
```javascript
// Mongoose
{ expiresAt: { $gt: Date.now() } }

// Sequelize
import { Op } from 'sequelize';
{ expiresAt: { [Op.gt]: new Date() } }
```

#### Accessing IDs
```javascript
// Mongoose
user._id
user._id.toString()

// Sequelize
user.id (already a string/UUID)
```

### 4. Associations
- Sequelize uses `belongsTo`, `hasOne`, `hasMany` instead of Mongoose `populate()`
- Use `include` in queries instead of `populate()`

### 5. Routes That Need Updating

The following route files need to be updated to use Sequelize syntax:
- ✅ `routes/auth.js` - Updated
- ⚠️ `routes/profiles.js` - Needs update
- ⚠️ `routes/matches.js` - Needs update
- ⚠️ `routes/messages.js` - Needs update
- ⚠️ `routes/stories.js` - Needs update
- ⚠️ `routes/gifts.js` - Needs update
- ⚠️ `routes/credits.js` - Needs update
- ⚠️ `routes/notifications.js` - Needs update
- ⚠️ `routes/safety.js` - Needs update
- ⚠️ `routes/streamer.js` - Needs update

### 6. Common Patterns to Update

#### Finding with conditions
```javascript
// Mongoose
Profile.findOne({ userId: req.user._id })

// Sequelize
Profile.findOne({ where: { userId: req.user.id } })
```

#### Finding multiple with conditions
```javascript
// Mongoose
Match.find({ $or: [{ user1: id }, { user2: id }] })

// Sequelize
import { Op } from 'sequelize';
Match.findAll({ 
  where: { 
    [Op.or]: [{ user1: id }, { user2: id }] 
  } 
})
```

#### Populating/Including
```javascript
// Mongoose
Profile.findOne({ userId }).populate('userId', 'email')

// Sequelize
Profile.findOne({ 
  where: { userId },
  include: [{ model: User, attributes: ['email'] }]
})
```

#### Aggregations
```javascript
// Mongoose
Message.aggregate([...])

// Sequelize
Message.findAll({
  attributes: [...],
  group: [...],
  // or use raw queries for complex aggregations
})
```

### 7. Environment Variables

Update `.env` file:
```env
# Remove
MONGODB_URI=...

# Add
DB_NAME=datingapp
DB_USER=postgres
DB_PASSWORD=your-password
DB_HOST=localhost
DB_PORT=5432
```

### 8. Database Setup

1. Install PostgreSQL
2. Create database:
   ```sql
   CREATE DATABASE datingapp;
   ```
3. Models will auto-create tables on first run (development mode)
4. For production, use migrations (Sequelize CLI)

