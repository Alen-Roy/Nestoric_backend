// routes/upload.js - FILE UPLOAD ROUTES
// Upload images, documents to Cloudinary

const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// ==========================================
// CONFIGURE CLOUDINARY
// ==========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ==========================================
// CONFIGURE MULTER (file handler)
// ==========================================
// Store files in memory (temporary)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

    console.log('Incoming file:', file.originalname, 'MIME:', file.mimetype);

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF allowed.'));
    }
  }
});

// ==========================================
// MIDDLEWARE - Verify Token
// ==========================================
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// UPLOAD IMAGE (avatar, photos)
// ==========================================
router.post('/image', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary
    // Use upload_stream because file is in memory
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nestoric/images', // Folder in Cloudinary
          resource_type: 'image'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      // Write file buffer to stream
      uploadStream.end(req.file.buffer);
    });

    const result = await uploadPromise;

    res.json({
      message: 'Image uploaded successfully',
      url: result.secure_url,      // Direct URL to image
      publicId: result.public_id    // Cloudinary ID (for deletion)
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// ==========================================
// UPLOAD DOCUMENT (PDF, files)
// ==========================================
router.post('/document', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'nestoric/documents',
          resource_type: 'auto' // Auto-detect file type
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(req.file.buffer);
    });

    const result = await uploadPromise;

    res.json({
      message: 'Document uploaded successfully',
      url: result.secure_url,
      publicId: result.public_id,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// ==========================================
// DELETE FILE (by public ID)
// ==========================================
router.delete('/:publicId', authenticateToken, async (req, res) => {
  try {
    // Decode public ID (comes URL encoded)
    const publicId = decodeURIComponent(req.params.publicId);

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;

// ==========================================
// HOW TO USE IN FLUTTER:
// ==========================================
//
// 1. UPLOAD IMAGE:
//    POST http://localhost:3000/api/upload/image
//    Headers: { "Authorization": "Bearer TOKEN" }
//    Body: FormData with file
//    Response: { "url": "https://res.cloudinary.com/...", "publicId": "..." }
//
// 2. UPLOAD DOCUMENT:
//    POST http://localhost:3000/api/upload/document
//    Headers: { "Authorization": "Bearer TOKEN" }
//    Body: FormData with file
//    Response: { "url": "...", "publicId": "...", "filename": "..." }
//
// 3. DELETE FILE:
//    DELETE http://localhost:3000/api/upload/:publicId
//    Headers: { "Authorization": "Bearer TOKEN" }
//
// ==========================================
// FLUTTER EXAMPLE CODE:
// ==========================================
//
// import 'package:http/http.dart' as http;
// import 'package:image_picker/image_picker.dart';
//
// Future<String?> uploadImage(File imageFile, String token) async {
//   var request = http.MultipartRequest(
//     'POST',
//     Uri.parse('http://localhost:3000/api/upload/image'),
//   );
//
//   request.headers['Authorization'] = 'Bearer $token';
//   request.files.add(await http.MultipartFile.fromPath('file', imageFile.path));
//
//   var response = await request.send();
//   var responseData = await response.stream.bytesToString();
//   var jsonData = json.decode(responseData);
//
//   return jsonData['url']; // Returns Cloudinary URL
// }
//
// ==========================================