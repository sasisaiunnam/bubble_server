// utils/gridfsUtils.js
const { getGridFSBucket } = require('../config/db');
const { ObjectId } = require('mongodb');

/**
 * Upload a file to GridFS
 */
const uploadFileToGridFS = async (fileBuffer, filename, mimeType) => {
  try {
    const bucket = getGridFSBucket();
    
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: mimeType,
        metadata: {
          uploadedAt: new Date(),
          size: fileBuffer.length,
          originalName: filename
        }
      });

      uploadStream.on('error', (error) => {
        reject(error);
      });

      uploadStream.on('finish', () => {
        resolve({
          id: uploadStream.id,
          filename: filename,
          contentType: mimeType,
          size: fileBuffer.length
        });
      });

      uploadStream.write(fileBuffer);
      uploadStream.end();
    });
  } catch (error) {
    console.error('Error uploading file to GridFS:', error);
    throw error;
  }
};

/**
 * Get a file from GridFS by ID
 */
const getFileFromGridFS = async (fileId) => {
  try {
    const bucket = getGridFSBucket();
    const objectId = new ObjectId(fileId);
    
    const files = await bucket.find({ _id: objectId }).toArray();
    
    if (!files || files.length === 0) {
      return null;
    }
    
    return files[0];
  } catch (error) {
    console.error('Error getting file from GridFS:', error);
    throw error;
  }
};

/**
 * Delete a file from GridFS
 */
const deleteFileFromGridFS = async (fileId) => {
  try {
    const bucket = getGridFSBucket();
    const objectId = new ObjectId(fileId);
    
    // Check if file exists before deleting
    const files = await bucket.find({ _id: objectId }).toArray();
    if (files.length === 0) {
      console.log(`File ${fileId} not found, skipping deletion`);
      return false;
    }
    
    await bucket.delete(objectId);
    console.log(`✅ File deleted from GridFS: ${fileId}`);
    return true;
  } catch (error) {
    console.error('Error deleting file from GridFS:', error);
    throw error;
  }
};

/**
 * Get file download stream
 */
const getFileDownloadStream = (fileId) => {
  try {
    const bucket = getGridFSBucket();
    const objectId = new ObjectId(fileId);
    return bucket.openDownloadStream(objectId);
  } catch (error) {
    console.error('Error getting file stream:', error);
    throw error;
  }
};

module.exports = {
  uploadFileToGridFS,
  getFileFromGridFS,
  deleteFileFromGridFS,
  getFileDownloadStream
};