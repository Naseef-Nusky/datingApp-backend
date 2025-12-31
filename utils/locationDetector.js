import axios from 'axios';

export const detectLocation = async (ipAddress) => {
  try {
    // Using ipapi.co for location detection
    const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`);
    
    if (response.data && response.data.city && response.data.country_name) {
      return {
        city: response.data.city,
        country: response.data.country_name,
        coordinates: {
          lat: response.data.latitude,
          lng: response.data.longitude,
        },
        detectedAt: new Date(),
        isAutoDetected: true,
      };
    }
    
    // Fallback
    return {
      city: 'Unknown',
      country: 'Unknown',
      coordinates: null,
      detectedAt: new Date(),
      isAutoDetected: true,
    };
  } catch (error) {
    console.error('Location detection error:', error);
    return {
      city: 'Unknown',
      country: 'Unknown',
      coordinates: null,
      detectedAt: new Date(),
      isAutoDetected: true,
    };
  }
};

export const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
};








