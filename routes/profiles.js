import express from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { streamer, admin } from '../middleware/auth.js';
import { detectLocation } from '../utils/locationDetector.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `${uuidv4()}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// @route   GET /api/profiles
// @desc    Browse profiles
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { gender, minAge, maxAge, city, country, limit = 20, page = 1, videoChat } = req.query;
    
    // Check if current user has a profile
    const currentUser = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!currentUser) {
      // If user doesn't have a profile yet, still return other profiles
      console.log('Current user profile not found, but continuing to fetch other profiles');
    }

    // Build where clause - exclude current user
    const where = {
      userId: {
        [Op.ne]: req.user.id
      }
    };
    
    console.log('Building query to exclude user:', req.user.id);
    
    // Gender filter - only apply if explicitly requested
    // Don't auto-filter by user preferences to show all profiles by default
    if (gender) {
      where.gender = gender;
    }

    // Age range filter - only apply if explicitly requested
    if (minAge || maxAge) {
      where.age = {};
      if (minAge) where.age[Op.gte] = parseInt(minAge);
      if (maxAge) where.age[Op.lte] = parseInt(maxAge);
    }

    // Location filters - using JSONB path queries for PostgreSQL
    if (city || country) {
      const locationConditions = [];
      if (city) {
        locationConditions.push(
          sequelize.literal(`"location"->>'city' ILIKE '%${city.replace(/'/g, "''")}%'`)
        );
      }
      if (country) {
        locationConditions.push(
          sequelize.literal(`"location"->>'country' ILIKE '%${country.replace(/'/g, "''")}%'`)
        );
      }
      if (locationConditions.length > 0) {
        // Use OR for location - match if city OR country matches
        if (where[Op.and]) {
          where[Op.and].push({ [Op.or]: locationConditions });
        } else {
          where[Op.or] = locationConditions;
        }
      }
    }

    // Video chat filter (if implemented in preferences)
    if (videoChat === 'true') {
      where.preferences = sequelize.where(
        sequelize.cast(sequelize.json('preferences.videoChat'), 'BOOLEAN'),
        true
      );
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('Query where clause:', JSON.stringify(where, null, 2));
    console.log('Current user ID:', req.user.id);
    console.log('Limit:', parseInt(limit), 'Offset:', offset);
    
    // First, let's check total profiles in database
    const totalProfiles = await Profile.count();
    console.log(`Total profiles in database: ${totalProfiles}`);
    
    const { count, rows: profiles } = await Profile.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
    });

    console.log(`Found ${count} total profiles matching criteria`);
    console.log(`Returning ${profiles.length} profiles in this page`);
    
    if (profiles.length === 0 && totalProfiles > 0) {
      console.warn('No profiles returned but database has profiles. Query might be too restrictive.');
    }

    // Get user details for each profile
    const profilesWithUsers = await Promise.all(
      profiles.map(async (profile) => {
        try {
          const user = await User.findByPk(profile.userId, {
            attributes: ['id', 'email', 'userType', 'credits', 'isActive'],
          });
          
          return {
            id: profile.id,
            userId: profile.userId,
            firstName: profile.firstName,
            lastName: profile.lastName || '',
            age: profile.age,
            gender: profile.gender,
            bio: profile.bio || '',
            photos: Array.isArray(profile.photos) ? profile.photos : [],
            coverPhoto: profile.coverPhoto || null,
            location: profile.location || {},
            interests: Array.isArray(profile.interests) ? profile.interests : [],
            lifestyle: profile.lifestyle || {},
            preferences: profile.preferences || {},
            wishlist: Array.isArray(profile.wishlist) ? profile.wishlist : [],
            isOnline: profile.isOnline || false,
            todayStatus: profile.todayStatus || null,
            user: user || null,
          };
        } catch (error) {
          console.error(`Error fetching user for profile ${profile.id}:`, error);
          return {
            id: profile.id,
            userId: profile.userId,
            firstName: profile.firstName,
            lastName: profile.lastName || '',
            age: profile.age,
            gender: profile.gender,
            bio: profile.bio || '',
            photos: Array.isArray(profile.photos) ? profile.photos : [],
            coverPhoto: profile.coverPhoto || null,
            location: profile.location || {},
            interests: Array.isArray(profile.interests) ? profile.interests : [],
            lifestyle: profile.lifestyle || {},
            preferences: profile.preferences || {},
            wishlist: Array.isArray(profile.wishlist) ? profile.wishlist : [],
            isOnline: profile.isOnline || false,
            todayStatus: profile.todayStatus || null,
            user: null,
          };
        }
      })
    );

    res.json({
      profiles: profilesWithUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Browse profiles error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/profiles/:id
// @desc    Get profile by ID (userId)
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ 
      where: { userId: req.params.id }
    });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    // Get user details
    const user = await User.findByPk(profile.userId, {
      attributes: ['id', 'email', 'userType', 'credits', 'isActive'],
    });

    // Increment profile views
    profile.profileViews += 1;
    await profile.save();

    res.json({
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName || '',
      age: profile.age,
      gender: profile.gender,
      bio: profile.bio || '',
      photos: Array.isArray(profile.photos) ? profile.photos : [],
      coverPhoto: profile.coverPhoto || null,
      location: profile.location || {},
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      lifestyle: profile.lifestyle || {},
      preferences: profile.preferences || {},
      wishlist: Array.isArray(profile.wishlist) ? profile.wishlist : [],
      isOnline: profile.isOnline || false,
      todayStatus: profile.todayStatus || null,
      profileViews: profile.profileViews || 0,
      user: user || null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/profiles/me
// @desc    Update own profile
// @access  Private
router.put('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const updates = req.body;
    
    // Regular users cannot change location (unless streamer/talent)
    if (updates.location && req.user.userType === 'regular') {
      delete updates.location;
    }

    // Streamers can change location anywhere
    if (updates.location && (req.user.userType === 'streamer' || req.user.userType === 'talent')) {
      updates.location.isAutoDetected = false;
    }

    await profile.update(updates);

    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/profiles/me/photos
// @desc    Upload profile photo
// @access  Private
router.post('/me/photos', protect, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const photoUrl = `/uploads/${req.file.filename}`;
    const photos = Array.isArray(profile.photos) ? [...profile.photos] : [];
    photos.push({
      url: photoUrl,
      isPublic: true,
    });

    await profile.update({ photos });

    res.json({ message: 'Photo uploaded successfully', photo: { url: photoUrl }, photos });
  } catch (error) {
    console.error('Upload photo error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/profiles/me/cover-photo
// @desc    Upload cover photo
// @access  Private
router.post('/me/cover-photo', protect, upload.single('coverPhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const coverPhotoUrl = `/uploads/${req.file.filename}`;
    await profile.update({ coverPhoto: coverPhotoUrl });

    res.json({ message: 'Cover photo uploaded successfully', coverPhoto: coverPhotoUrl });
  } catch (error) {
    console.error('Upload cover photo error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/profiles/me/photos/:photoIndex
// @desc    Delete a profile photo
// @access  Private
router.delete('/me/photos/:photoIndex', protect, async (req, res) => {
  try {
    const photoIndex = parseInt(req.params.photoIndex);
    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const photos = Array.isArray(profile.photos) ? [...profile.photos] : [];
    if (photoIndex < 0 || photoIndex >= photos.length) {
      return res.status(400).json({ message: 'Invalid photo index' });
    }

    photos.splice(photoIndex, 1);
    await profile.update({ photos });

    res.json({ message: 'Photo deleted successfully', photos });
  } catch (error) {
    console.error('Delete photo error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/profiles/me/location
// @desc    Update location (streamer/talent only)
// @access  Private
router.put('/me/location', protect, streamer, async (req, res) => {
  try {
    const { city, country, lat, lng } = req.body;
    const profile = await Profile.findOne({ where: { userId: req.user.id } });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const location = {
      city,
      country,
      coordinates: lat && lng ? { lat, lng } : null,
      isAutoDetected: false,
      detectedAt: new Date(),
    };

    await profile.update({ location });

    res.json({ message: 'Location updated', location: profile.location });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

