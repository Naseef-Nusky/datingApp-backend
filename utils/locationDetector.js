import geoip from 'geoip-lite';
import axios from 'axios';

/**
 * Detect location from IP using geoip-lite (offline). Falls back to ip-api.com when geoip returns null (e.g. localhost).
 * @param {string} ipAddress - Client IP (e.g. from getClientIP(req))
 * @returns {Promise<{ city: string, country: string, coordinates: object|null, detectedAt: Date, isAutoDetected: boolean }>}
 */
export const detectLocation = async (ipAddress) => {
  try {
    // Handle IPv6 localhost / strip IPv6 prefix from IPv4-mapped
    const ip = ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1' ? '127.0.0.1' : ipAddress;
    const geo = geoip.lookup(ip);

    if (geo && (geo.city || geo.country)) {
      return {
        city: geo.city || 'Unknown',
        country: geo.country || 'Unknown',
        coordinates: Array.isArray(geo.ll) && geo.ll.length >= 2
          ? { lat: geo.ll[0], lng: geo.ll[1] }
          : null,
        detectedAt: new Date(),
        isAutoDetected: true,
      };
    }

    // Fallback for localhost or when geoip has no data: use ip-api.com (uses request IP when no param)
    try {
      const res = await axios.get(`http://ip-api.com/json/${ip === '127.0.0.1' ? '' : ip}?fields=city,country,lat,lon`, { timeout: 3000 });
      const data = res.data;
      if (data && (data.city || data.country)) {
        return {
          city: data.city || 'Unknown',
          country: data.country || 'Unknown',
          coordinates: (data.lat != null && data.lon != null) ? { lat: data.lat, lng: data.lon } : null,
          detectedAt: new Date(),
          isAutoDetected: true,
        };
      }
    } catch (fallbackErr) {
      // ignore
    }

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
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
};
