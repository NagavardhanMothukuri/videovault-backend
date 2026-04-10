const path = require('path');
const fs = require('fs');
const Video = require('../models/Video');
const { analyzeVideo } = require('../services/sensitivityService');
const { UPLOAD_DIR } = require('../middleware/upload');

// @desc    Upload video
// @route   POST /api/videos/upload
// @access  Private (editor, admin)
const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file provided' });
    }

    const { title, description, tags, category, isPublic } = req.body;

    const video = await Video.create({
      title: title || req.file.originalname,
      description: description || '',
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
      organization: req.user.organization,
      status: 'processing',
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      category: category || 'uncategorized',
      isPublic: isPublic === 'true',
    });

    // Start async processing
    processVideoAsync(video._id, req.file.path, req.app.get('io'));

    res.status(201).json({
      success: true,
      message: 'Video uploaded successfully. Processing started.',
      data: { video },
    });
  } catch (error) {
    next(error);
  }
};

// Async processing pipeline
const processVideoAsync = async (videoId, filePath, io) => {
  try {
    const onProgress = async (videoId, progress, stage) => {
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      if (io) {
        io.emit(`video:progress:${videoId}`, { videoId, progress, stage });
        io.emit('video:progress', { videoId, progress, stage });
      }
    };

    const result = await analyzeVideo(videoId, filePath, onProgress);

    await Video.findByIdAndUpdate(videoId, {
      status: 'completed',
      processingProgress: 100,
      sensitivity: result,
    });

    const updatedVideo = await Video.findById(videoId).populate('uploadedBy', 'name email');

    if (io) {
      io.emit(`video:completed:${videoId}`, { videoId, video: updatedVideo });
      io.emit('video:completed', { videoId, video: updatedVideo });
    }
  } catch (error) {
    console.error('Processing error:', error);
    await Video.findByIdAndUpdate(videoId, {
      status: 'failed',
      processingProgress: 0,
    });
    if (io) {
      io.emit(`video:failed:${videoId}`, { videoId, error: error.message });
      io.emit('video:failed', { videoId, error: error.message });
    }
  }
};

// @desc    Get all videos (with filtering)
// @route   GET /api/videos
// @access  Private
const getVideos = async (req, res, next) => {
  try {
    const {
      status,
      sensitivity,
      category,
      search,
      sortBy = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    let query = {};

    // Role-based filtering
    if (req.user.role === 'admin') {
      // Admin sees all videos in their organization
      query.organization = req.user.organization;
    } else if (req.user.role === 'viewer') {
      // Viewer sees only explicitly shared videos
      query.$or = [
        { uploadedBy: req.user._id },
        { allowedViewers: req.user._id },
        { isPublic: true },
      ];
    } else {
      // Editor sees their own videos
      query.uploadedBy = req.user._id;
    }

    if (status) query.status = status;
    if (sensitivity) query['sensitivity.status'] = sensitivity;
    if (category) query.category = category;
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ],
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortField = ['createdAt', 'title', 'size', 'views'].includes(sortBy) ? sortBy : 'createdAt';

    const [videos, total] = await Promise.all([
      Video.find(query)
        .populate('uploadedBy', 'name email')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit)),
      Video.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        videos,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single video
// @route   GET /api/videos/:id
// @access  Private
const getVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id).populate('uploadedBy', 'name email');

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // Access control
    const hasAccess =
      req.user.role === 'admin' ||
      video.uploadedBy._id.toString() === req.user._id.toString() ||
      video.allowedViewers.includes(req.user._id) ||
      video.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Increment views
    await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    res.json({ success: true, data: { video } });
  } catch (error) {
    next(error);
  }
};

// @desc    Stream video
// @route   GET /api/videos/:id/stream
// @access  Private
const streamVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    if (video.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Video is not ready for streaming' });
    }

    // Access control
    const hasAccess =
      req.user.role === 'admin' ||
      video.uploadedBy.toString() === req.user._id.toString() ||
      video.allowedViewers.includes(req.user._id) ||
      video.isPublic;

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const filePath = path.join(UPLOAD_DIR, video.uploadedBy.toString(), video.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Video file not found on server' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = fs.createReadStream(filePath, { start, end });
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mimetype,
      };

      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      const headers = {
        'Content-Length': fileSize,
        'Content-Type': video.mimetype,
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Update video metadata
// @route   PUT /api/videos/:id
// @access  Private (owner, admin)
const updateVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const isOwner = video.uploadedBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this video' });
    }

    const { title, description, tags, category, isPublic } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
    if (category !== undefined) updates.category = category;
    if (isPublic !== undefined) updates.isPublic = isPublic;

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('uploadedBy', 'name email');

    res.json({ success: true, data: { video: updatedVideo } });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete video
// @route   DELETE /api/videos/:id
// @access  Private (owner, admin)
const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const isOwner = video.uploadedBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this video' });
    }

    // Delete file from disk
    const filePath = path.join(UPLOAD_DIR, video.uploadedBy.toString(), video.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Video.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get video stats
// @route   GET /api/videos/stats
// @access  Private
const getStats = async (req, res, next) => {
  try {
    const matchQuery = req.user.role === 'admin'
      ? { organization: req.user.organization }
      : { uploadedBy: req.user._id };

    const [stats] = await Video.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalSize: { $sum: '$size' },
          safe: { $sum: { $cond: [{ $eq: ['$sensitivity.status', 'safe'] }, 1, 0] } },
          flagged: { $sum: { $cond: [{ $eq: ['$sensitivity.status', 'flagged'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        stats: stats || {
          total: 0, totalSize: 0, safe: 0, flagged: 0, processing: 0, completed: 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadVideo,
  getVideos,
  getVideo,
  streamVideo,
  updateVideo,
  deleteVideo,
  getStats,
};
