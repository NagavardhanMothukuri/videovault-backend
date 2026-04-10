const express = require('express');
const router = express.Router();
const {
  uploadVideo,
  getVideos,
  getVideo,
  streamVideo,
  updateVideo,
  deleteVideo,
  getStats,
} = require('../controllers/videoController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.get('/stats', protect, getStats);
router.get('/', protect, getVideos);
router.post('/upload', protect, authorize('editor', 'admin'), upload.single('video'), uploadVideo);
router.get('/:id', protect, getVideo);
router.get('/:id/stream', protect, streamVideo);
router.put('/:id', protect, authorize('editor', 'admin'), updateVideo);
router.delete('/:id', protect, authorize('editor', 'admin'), deleteVideo);

module.exports = router;
