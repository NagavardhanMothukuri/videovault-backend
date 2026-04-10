const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: '',
  },
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimetype: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  duration: {
    type: Number,
    default: 0,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  organization: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'completed', 'failed'],
    default: 'uploading',
  },
  sensitivity: {
    status: {
      type: String,
      enum: ['pending', 'safe', 'flagged', 'unknown'],
      default: 'pending',
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    flags: [{
      category: String,
      confidence: Number,
      timestamp: Number,
    }],
    analyzedAt: Date,
  },
  processingProgress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  category: {
    type: String,
    default: 'uncategorized',
    trim: true,
  },
  thumbnailPath: {
    type: String,
    default: null,
  },
  allowedViewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  isPublic: {
    type: Boolean,
    default: false,
  },
  views: {
    type: Number,
    default: 0,
  },
  metadata: {
    width: Number,
    height: Number,
    fps: Number,
    bitrate: Number,
    codec: String,
  },
}, {
  timestamps: true,
});

// Indexes for performance
videoSchema.index({ uploadedBy: 1, createdAt: -1 });
videoSchema.index({ organization: 1 });
videoSchema.index({ 'sensitivity.status': 1 });
videoSchema.index({ status: 1 });

module.exports = mongoose.model('Video', videoSchema);
