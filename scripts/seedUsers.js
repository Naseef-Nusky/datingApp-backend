import dotenv from 'dotenv';
import { sequelize } from '../config/database.js';
// Import models to ensure they're registered
import '../models/index.js';
import { User, Profile } from '../models/index.js';

dotenv.config();

const seedUsers = async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Sync models
    await sequelize.sync({ alter: true });
    console.log('✅ Models synced');

    // Sample user data
    const usersData = [
      {
        email: 'john.doe@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        age: 28,
        gender: 'male',
        bio: 'Adventure enthusiast and travel lover. Looking for someone to share life\'s journey with.',
        location: { city: 'New York', country: 'USA', isAutoDetected: false },
        interests: ['Travel', 'Photography', 'Hiking'],
        lifestyle: {
          zodiac: 'Aries',
          work: 'Software Engineer',
          education: 'Bachelor\'s Degree',
          languages: ['English', 'Spanish'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '6\'0"',
          bodyType: 'Athletic',
          eyes: 'Brown',
          hair: 'Black'
        },
        preferences: {
          lookingFor: 'female',
          ageRange: { min: 25, max: 35 }
        }
      },
      {
        email: 'jane.smith@example.com',
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        age: 26,
        gender: 'female',
        bio: 'Love reading, cooking, and exploring new places. Seeking meaningful connections.',
        location: { city: 'Los Angeles', country: 'USA', isAutoDetected: false },
        interests: ['Reading', 'Cooking', 'Travel'],
        lifestyle: {
          zodiac: 'Libra',
          work: 'Marketing Manager',
          education: 'Master\'s Degree',
          languages: ['English', 'French'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Occasionally',
          height: '5\'6"',
          bodyType: 'Average',
          eyes: 'Blue',
          hair: 'Blonde'
        },
        preferences: {
          lookingFor: 'male',
          ageRange: { min: 28, max: 38 }
        }
      },
      {
        email: 'michael.chen@example.com',
        password: 'password123',
        firstName: 'Michael',
        lastName: 'Chen',
        age: 32,
        gender: 'male',
        bio: 'Tech entrepreneur passionate about innovation and building meaningful relationships.',
        location: { city: 'San Francisco', country: 'USA', isAutoDetected: false },
        interests: ['Technology', 'Business', 'Fitness'],
        lifestyle: {
          zodiac: 'Capricorn',
          work: 'Entrepreneur',
          education: 'MBA',
          languages: ['English', 'Mandarin'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '5\'10"',
          bodyType: 'Athletic',
          eyes: 'Brown',
          hair: 'Black'
        },
        preferences: {
          lookingFor: 'female',
          ageRange: { min: 26, max: 36 }
        }
      },
      {
        email: 'sarah.johnson@example.com',
        password: 'password123',
        firstName: 'Sarah',
        lastName: 'Johnson',
        age: 29,
        gender: 'female',
        bio: 'Yoga instructor and wellness coach. Looking for someone who values health and happiness.',
        location: { city: 'Miami', country: 'USA', isAutoDetected: false },
        interests: ['Yoga', 'Wellness', 'Meditation'],
        lifestyle: {
          zodiac: 'Pisces',
          work: 'Yoga Instructor',
          education: 'Bachelor\'s Degree',
          languages: ['English', 'Spanish'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Rarely',
          height: '5\'5"',
          bodyType: 'Slim',
          eyes: 'Green',
          hair: 'Brown'
        },
        preferences: {
          lookingFor: 'male',
          ageRange: { min: 30, max: 40 }
        }
      },
      {
        email: 'david.wilson@example.com',
        password: 'password123',
        firstName: 'David',
        lastName: 'Wilson',
        age: 35,
        gender: 'male',
        bio: 'Musician and music producer. Love creating and sharing music with others.',
        location: { city: 'Nashville', country: 'USA', isAutoDetected: false },
        interests: ['Music', 'Guitar', 'Concerts'],
        lifestyle: {
          zodiac: 'Gemini',
          work: 'Musician',
          education: 'Bachelor\'s Degree',
          languages: ['English'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '5\'11"',
          bodyType: 'Average',
          eyes: 'Blue',
          hair: 'Brown'
        },
        preferences: {
          lookingFor: 'female',
          ageRange: { min: 28, max: 38 }
        }
      },
      {
        email: 'emily.brown@example.com',
        password: 'password123',
        firstName: 'Emily',
        lastName: 'Brown',
        age: 27,
        gender: 'female',
        bio: 'Art lover and creative soul. Enjoy painting, visiting galleries, and exploring art.',
        location: { city: 'Chicago', country: 'USA', isAutoDetected: false },
        interests: ['Art', 'Painting', 'Museums'],
        lifestyle: {
          zodiac: 'Taurus',
          work: 'Graphic Designer',
          education: 'Bachelor\'s Degree',
          languages: ['English', 'Italian'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Occasionally',
          height: '5\'7"',
          bodyType: 'Average',
          eyes: 'Hazel',
          hair: 'Red'
        },
        preferences: {
          lookingFor: 'male',
          ageRange: { min: 27, max: 37 }
        }
      },
      {
        email: 'robert.taylor@example.com',
        password: 'password123',
        firstName: 'Robert',
        lastName: 'Taylor',
        age: 31,
        gender: 'male',
        bio: 'Fitness enthusiast and personal trainer. Passionate about helping others achieve their goals.',
        location: { city: 'Austin', country: 'USA', isAutoDetected: false },
        interests: ['Fitness', 'Gym', 'Running'],
        lifestyle: {
          zodiac: 'Leo',
          work: 'Personal Trainer',
          education: 'Bachelor\'s Degree',
          languages: ['English'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '6\'2"',
          bodyType: 'Athletic',
          eyes: 'Brown',
          hair: 'Brown'
        },
        preferences: {
          lookingFor: 'female',
          ageRange: { min: 25, max: 35 }
        }
      },
      {
        email: 'lisa.anderson@example.com',
        password: 'password123',
        firstName: 'Lisa',
        lastName: 'Anderson',
        age: 30,
        gender: 'female',
        bio: 'Food blogger and chef. Love trying new recipes and exploring different cuisines.',
        location: { city: 'Seattle', country: 'USA', isAutoDetected: false },
        interests: ['Cooking', 'Food', 'Travel'],
        lifestyle: {
          zodiac: 'Cancer',
          work: 'Chef',
          education: 'Culinary School',
          languages: ['English', 'French'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '5\'4"',
          bodyType: 'Average',
          eyes: 'Brown',
          hair: 'Black'
        },
        preferences: {
          lookingFor: 'male',
          ageRange: { min: 30, max: 40 }
        }
      },
      {
        email: 'james.martinez@example.com',
        password: 'password123',
        firstName: 'James',
        lastName: 'Martinez',
        age: 33,
        gender: 'male',
        bio: 'Photographer and nature lover. Always looking for the next adventure to capture.',
        location: { city: 'Denver', country: 'USA', isAutoDetected: false },
        interests: ['Photography', 'Nature', 'Hiking'],
        lifestyle: {
          zodiac: 'Sagittarius',
          work: 'Photographer',
          education: 'Bachelor\'s Degree',
          languages: ['English', 'Spanish'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Socially',
          height: '5\'9"',
          bodyType: 'Average',
          eyes: 'Green',
          hair: 'Brown'
        },
        preferences: {
          lookingFor: 'female',
          ageRange: { min: 28, max: 38 }
        }
      },
      {
        email: 'amanda.white@example.com',
        password: 'password123',
        firstName: 'Amanda',
        lastName: 'White',
        age: 28,
        gender: 'female',
        bio: 'Teacher and bookworm. Love sharing knowledge and exploring new ideas.',
        location: { city: 'Boston', country: 'USA', isAutoDetected: false },
        interests: ['Reading', 'Teaching', 'Writing'],
        lifestyle: {
          zodiac: 'Virgo',
          work: 'Teacher',
          education: 'Master\'s Degree',
          languages: ['English', 'German'],
          relationship: 'Single',
          haveKids: false,
          smoke: 'No',
          drink: 'Occasionally',
          height: '5\'6"',
          bodyType: 'Average',
          eyes: 'Blue',
          hair: 'Blonde'
        },
        preferences: {
          lookingFor: 'male',
          ageRange: { min: 28, max: 38 }
        }
      }
    ];

    console.log('🌱 Starting to seed users...\n');

    for (let i = 0; i < usersData.length; i++) {
      const userData = usersData[i];
      
      // Check if user already exists
      const existingUser = await User.findOne({ where: { email: userData.email } });
      if (existingUser) {
        console.log(`⏭️  User ${i + 1}/${usersData.length}: ${userData.email} already exists, skipping...`);
        continue;
      }

      // Create user (password will be hashed by User model hooks)
      const user = await User.create({
        email: userData.email,
        password: userData.password, // Will be hashed automatically by User model hooks
        userType: 'regular',
        isVerified: true,
        isActive: true,
        credits: Math.floor(Math.random() * 500) + 100, // Random credits between 100-600
      });

      // Create profile
      const profile = await Profile.create({
        userId: user.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        age: userData.age,
        gender: userData.gender,
        bio: userData.bio,
        location: userData.location,
        interests: userData.interests,
        lifestyle: userData.lifestyle,
        preferences: userData.preferences,
        isOnline: Math.random() > 0.5, // Random online status
        profileViews: Math.floor(Math.random() * 100),
      });

      console.log(`✅ Created user ${i + 1}/${usersData.length}: ${userData.firstName} ${userData.lastName} (${userData.email})`);
    }

    console.log('\n✅ Seeding completed!');
    console.log(`📊 Total users in database: ${await User.count()}`);
    console.log(`📊 Total profiles in database: ${await Profile.count()}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();

