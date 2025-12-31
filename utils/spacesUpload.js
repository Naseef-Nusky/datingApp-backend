import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// DigitalOcean Spaces configuration
const spacesEndpoint = process.env.DO_SPACES_ENDPOINT; // e.g., 'nyc3.digitaloceanspaces.com'
const spacesKey = process.env.DO_SPACES_KEY; // Access Key ID
const spacesSecret = process.env.DO_SPACES_SECRET; // Secret Access Key
const spacesName = process.env.DO_SPACES_NAME; // Space name
const spacesRegion = process.env.DO_SPACES_REGION || 'nyc3'; // Region

// Create S3 client (DigitalOcean Spaces is S3-compatible)
const s3Client = new S3Client({
  endpoint: `https://${spacesEndpoint}`,
  region: spacesRegion,
  credentials: {
    accessKeyId: spacesKey,
    secretAccessKey: spacesSecret,
  },
  forcePathStyle: false, // DigitalOcean Spaces uses virtual-hosted-style
});

/**
 * Upload a file to DigitalOcean Spaces
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} mimetype - File MIME type
 * @param {string} folder - Folder path in the space (e.g., 'profiles', 'stories')
 * @param {string} originalName - Original filename (for extension)
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export const uploadToSpaces = async (fileBuffer, mimetype, folder = 'profiles', originalName = '') => {
  try {
    if (!spacesEndpoint || !spacesKey || !spacesSecret || !spacesName) {
      throw new Error('DigitalOcean Spaces credentials not configured');
    }

    // Get file extension
    const ext = originalName.split('.').pop() || 'jpg';
    
    // Generate unique filename
    const filename = `${folder}/${uuidv4()}.${ext}`;
    
    // Upload to Spaces
    const command = new PutObjectCommand({
      Bucket: spacesName,
      Key: filename,
      Body: fileBuffer,
      ContentType: mimetype,
      ACL: 'public-read', // Make file publicly accessible
    });

    await s3Client.send(command);

    // Return public URL
    // DigitalOcean Spaces URL format: https://{space-name}.{region}.digitaloceanspaces.com/{filename}
    const publicUrl = `https://${spacesName}.${spacesEndpoint}/${filename}`;
    
    return publicUrl;
  } catch (error) {
    console.error('Upload to Spaces error:', error);
    throw new Error(`Failed to upload to DigitalOcean Spaces: ${error.message}`);
  }
};

/**
 * Delete a file from DigitalOcean Spaces
 * @param {string} fileUrl - Full URL of the file to delete
 * @returns {Promise<void>}
 */
export const deleteFromSpaces = async (fileUrl) => {
  try {
    if (!spacesEndpoint || !spacesKey || !spacesSecret || !spacesName) {
      throw new Error('DigitalOcean Spaces credentials not configured');
    }

    // Extract key from URL
    // URL format: https://{space-name}.{region}.digitaloceanspaces.com/{folder}/{filename}
    const urlParts = fileUrl.split(`${spacesName}.${spacesEndpoint}/`);
    if (urlParts.length < 2) {
      throw new Error('Invalid file URL');
    }

    const key = urlParts[1];

    const command = new DeleteObjectCommand({
      Bucket: spacesName,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('Delete from Spaces error:', error);
    throw new Error(`Failed to delete from DigitalOcean Spaces: ${error.message}`);
  }
};

/**
 * Upload middleware for multer - converts file to buffer and uploads to Spaces
 * @param {string} folder - Folder path in the space
 * @returns {Function} Express middleware
 */
export const spacesUploadMiddleware = (folder = 'profiles') => {
  return async (req, res, next) => {
    if (!req.file) {
      return next();
    }

    try {
      // Read file buffer
      const fileBuffer = req.file.buffer;
      
      // Upload to Spaces
      const publicUrl = await uploadToSpaces(
        fileBuffer,
        req.file.mimetype,
        folder,
        req.file.originalname
      );

      // Replace file path with Spaces URL
      req.file.location = publicUrl;
      
      next();
    } catch (error) {
      console.error('Spaces upload middleware error:', error);
      return res.status(500).json({ 
        message: 'Failed to upload file to DigitalOcean Spaces',
        error: error.message 
      });
    }
  };
};








