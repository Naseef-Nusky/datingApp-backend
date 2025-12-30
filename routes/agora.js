import express from 'express';
import agoraToken from 'agora-token';
import { protect } from '../middleware/auth.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

const { RtcTokenBuilder, RtcRole, RtmTokenBuilder } = agoraToken;

const router = express.Router();

// Agora App ID and App Certificate (should be in .env)
const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';
// Chat SDK uses appKey (format: orgName#appName, e.g., 7110001987#1639078)
// This is different from APP_ID and must be in the format orgName#appName
const APP_KEY = process.env.AGORA_APP_KEY || '';

// Parse appKey to get orgName and appName
const parseAppKey = () => {
  if (!APP_KEY || !APP_KEY.includes('#')) {
    return { orgName: '', appName: '' };
  }
  const [orgName, appName] = APP_KEY.split('#');
  return { orgName, appName };
};

// Agora Chat REST API host (from console: a71.chat.agora.io)
// Format: a{orgNumber}.chat.agora.io
const CHAT_REST_API_HOST = process.env.AGORA_CHAT_REST_HOST || 'a71.chat.agora.io';

// Agora Chat App Key (for REST API authentication)
// This is the same as APP_KEY but stored separately for clarity
const CHAT_APP_KEY = APP_KEY;

// @route   POST /api/agora/rtc-token
// @desc    Generate RTC token for video/voice calls
// @access  Private
router.post('/rtc-token', protect, async (req, res) => {
  try {
    let { channelName, uid } = req.body;

    if (!channelName) {
      return res.status(400).json({ message: 'Channel name required' });
    }

    // Validate channel name length (64 bytes max)
    const byteLength = Buffer.from(channelName, 'utf8').length;
    if (byteLength > 64) {
      console.error(`Channel name too long: ${byteLength} bytes. Channel: ${channelName}`);
      return res.status(400).json({ 
        message: `Channel name exceeds 64 bytes (${byteLength} bytes). Max length is 64 bytes.`,
        receivedLength: byteLength
      });
    }

    // Check for invalid characters
    const invalidChars = /[\/\\?=]/;
    if (invalidChars.test(channelName)) {
      console.error(`Channel name contains invalid characters: ${channelName}`);
      return res.status(400).json({ 
        message: 'Channel name contains invalid characters. Not allowed: / \\ ? =',
        channelName 
      });
    }

    // Convert UID to number (Agora requires numeric UID)
    // To avoid UID_CONFLICT, we combine user ID hash with timestamp and random component
    // This ensures each call session gets a unique UID
    let userUid = 0;
    if (uid) {
      let baseUid = 0;
      
      if (typeof uid === 'string') {
        // Use a better hash function to convert UUID to number
        // This creates a more unique hash from the UUID
        let hash = 0;
        const uuidStr = uid.replace(/-/g, '');
        for (let i = 0; i < uuidStr.length; i++) {
          const char = uuidStr.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        baseUid = Math.abs(hash);
      } else {
        baseUid = Math.abs(parseInt(uid) || 0);
      }
      
      // Add timestamp component (milliseconds) to ensure uniqueness per session
      // This prevents UID_CONFLICT when the same user joins multiple times
      const now = Date.now();
      const timestampComponent = now % 10000000; // Last 7-8 digits of timestamp (milliseconds precision)
      
      // Add small random component (0-9999) for extra uniqueness
      const randomComponent = Math.floor(Math.random() * 10000);
      
      // Combine all components
      // Use modulo to keep within safe integer range (max 2^31 - 1 for Agora)
      userUid = (baseUid + timestampComponent + randomComponent) % 2147483647;
      
      // Ensure UID is not 0 (Agora doesn't allow 0 for explicit UIDs)
      if (userUid === 0) {
        userUid = Math.abs(baseUid) % 2147483647 || 1;
      }
    } else {
      // If no UID provided, use 0 to let Agora auto-assign
      userUid = 0;
    }

    console.log('RTC Token Request - Channel:', channelName, 'Length:', byteLength, 'bytes', 'UID (original):', uid, 'UID (numeric):', userUid);

    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Agora credentials missing - APP_ID:', !!APP_ID, 'APP_CERTIFICATE:', !!APP_CERTIFICATE);
      return res.status(500).json({ message: 'Agora credentials not configured' });
    }

    // Validate App ID and Certificate are not empty strings
    if (APP_ID.trim() === '' || APP_CERTIFICATE.trim() === '') {
      console.error('Agora credentials are empty strings');
      return res.status(500).json({ message: 'Agora credentials are empty. Please check your .env file.' });
    }

    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + 3600 * 24;
    const role = RtcRole.PUBLISHER;

    try {
      const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        userUid,
        role,
        expirationTimeInSeconds
      );

      console.log('RTC Token generated successfully for channel:', channelName, 'UID:', userUid);

      res.json({
        token,
        appId: APP_ID,
        channelName,
        uid: userUid, // Return numeric UID
      });
    } catch (tokenError) {
      console.error('Token generation error:', tokenError);
      return res.status(500).json({ 
        message: 'Failed to generate token', 
        error: tokenError.message,
        details: 'Check your AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env file'
      });
    }
  } catch (error) {
    console.error('Generate RTC token error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/agora/rtm-token
// @desc    Generate RTM token for messaging
// @access  Private
router.post('/rtm-token', protect, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Agora credentials missing - APP_ID:', !!APP_ID, 'APP_CERTIFICATE:', !!APP_CERTIFICATE);
      return res.status(500).json({ message: 'Agora credentials not configured' });
    }

    // Validate App ID and Certificate are not empty strings
    if (APP_ID.trim() === '' || APP_CERTIFICATE.trim() === '') {
      console.error('Agora credentials are empty strings');
      return res.status(500).json({ message: 'Agora credentials are empty. Please check your .env file.' });
    }

    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + 3600 * 24;

    try {
      // RTM Token Builder doesn't require a role parameter
      const token = RtmTokenBuilder.buildToken(
        APP_ID,
        APP_CERTIFICATE,
        userId.toString(),
        expirationTimeInSeconds
      );

      console.log('RTM Token generated successfully for userId:', userId);

      res.json({
        token,
        appId: APP_ID,
        userId,
      });
    } catch (tokenError) {
      console.error('RTM Token generation error:', tokenError);
      return res.status(500).json({ 
        message: 'Failed to generate RTM token', 
        error: tokenError.message,
        details: 'Check your AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env file. Also ensure RTM service is enabled in Agora Console.'
      });
    }
  } catch (error) {
    console.error('Generate RTM token error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/agora/chat-token
// @desc    Generate Chat token for Agora Chat SDK
// @access  Private
router.post('/chat-token', protect, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Agora credentials missing - APP_ID:', !!APP_ID, 'APP_CERTIFICATE:', !!APP_CERTIFICATE);
      return res.status(500).json({ message: 'Agora credentials not configured' });
    }

    // Validate App ID and Certificate are not empty strings
    if (APP_ID.trim() === '' || APP_CERTIFICATE.trim() === '') {
      console.error('Agora credentials are empty strings');
      return res.status(500).json({ message: 'Agora credentials are empty. Please check your .env file.' });
    }

    // Chat SDK requires appKey in format orgName#appName (e.g., 7110001987#1639078)
    // Log the actual value for debugging (without exposing full value)
    console.log('APP_KEY check - Length:', APP_KEY?.length, 'Has #:', APP_KEY?.includes('#'), 'First 10 chars:', APP_KEY?.substring(0, 10));
    
    if (!APP_KEY || APP_KEY.trim() === '') {
      console.error('AGORA_APP_KEY is not configured. Current value:', APP_KEY);
      return res.status(500).json({ 
        message: 'AGORA_APP_KEY is required for Chat SDK',
        details: 'Add AGORA_APP_KEY to your .env file. Format: orgName#appName (e.g., 7110001987#1639078). Note: If using # in .env, you may need to wrap it in quotes: AGORA_APP_KEY="7110001987#1639078"'
      });
    }

    // Trim the appKey to remove any whitespace
    const trimmedAppKey = APP_KEY.trim();
    
    // Validate appKey format (should contain #)
    if (!trimmedAppKey.includes('#')) {
      console.error('AGORA_APP_KEY format is invalid - should be orgName#appName. Received:', trimmedAppKey.substring(0, 20) + '...');
      return res.status(500).json({ 
        message: 'AGORA_APP_KEY format is invalid',
        details: `AppKey must be in format: orgName#appName (e.g., 7110001987#1639078). Current value doesn't contain #. Try wrapping in quotes in .env: AGORA_APP_KEY="7110001987#1639078"`
      });
    }

    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + 3600 * 24;

    try {
      // Chat SDK uses the same token format as RTM
      const token = RtmTokenBuilder.buildToken(
        APP_ID,
        APP_CERTIFICATE,
        userId.toString(),
        expirationTimeInSeconds
      );

      console.log('Chat Token generated successfully for userId:', userId);

      // Mark user as registered in Chat (they're requesting token, so they're ready to chat)
      // Always mark as registered when they request a token - this ensures all users can chat
      try {
        const profile = await Profile.findOne({ where: { userId } });
        if (profile) {
          // Always update chatRegisteredAt when token is requested
          // This ensures all users who request tokens are marked as chat-ready
          await Profile.update(
            { chatRegisteredAt: new Date() },
            { 
              where: { userId }
            }
          );
          console.log('Marked user as chat-ready:', userId);
        }
      } catch (profileError) {
        console.error('Error updating chat registration:', profileError);
        // Don't fail token generation if profile update fails
      }

      res.json({
        token,
        appKey: trimmedAppKey, // Chat SDK uses appKey (trimmed)
        appId: APP_ID, // Also return appId as fallback
        userId,
      });
    } catch (tokenError) {
      console.error('Chat Token generation error:', tokenError);
      return res.status(500).json({ 
        message: 'Failed to generate Chat token', 
        error: tokenError.message,
        details: 'Check your AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env file. Also ensure Chat service is enabled in Agora Console.'
      });
    }
  } catch (error) {
    console.error('Generate Chat token error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/agora/chat-user/:userId
// @desc    Check if a user is registered in Agora Chat
// @access  Private
router.get('/chat-user/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID required' });
    }

    if (!APP_KEY || !APP_KEY.includes('#')) {
      return res.status(500).json({ 
        message: 'AGORA_APP_KEY not configured',
        details: 'Add AGORA_APP_KEY to your .env file'
      });
    }

    const { orgName, appName } = parseAppKey();
    
    if (!orgName || !appName) {
      return res.status(500).json({ 
        message: 'Invalid AGORA_APP_KEY format',
        details: 'AppKey must be in format: orgName#appName'
      });
    }

    // Get admin token for REST API calls
    // For now, we'll use a simple approach - try to get user info
    // In production, you should use an admin token
    try {
      // Use Agora Chat REST API to check if user exists
      // GET https://{host}/{org_name}/{app_name}/users/{username}
      const apiUrl = `https://${CHAT_REST_API_HOST}/${orgName}/${appName}/users/${userId}`;
      
      // For now, we'll return a simple check
      // In production, you'd make an actual API call with admin credentials
      // This is a placeholder - you'll need to implement proper admin token generation
      
      res.json({
        userId,
        registered: false, // Default to false - user needs to open chat to register
        message: 'User registration status cannot be determined via REST API without admin credentials. Users are automatically registered when they first open the chat.'
      });
      
    } catch (apiError) {
      console.error('Chat REST API error:', apiError);
      res.json({
        userId,
        registered: false,
        message: 'Unable to check user registration status'
      });
    }
  } catch (error) {
    console.error('Check chat user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;

