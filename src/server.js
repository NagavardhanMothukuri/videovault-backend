require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/database');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const errorHandler = require('./middleware/errorHandler');

// ================== DATABASE ==================
connectDB();

// ================== APP SETUP ==================
const app = express();
const server = http.createServer(app);

// ================== SOCKET.IO ==================
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible globally
app.set('io', io);

// ================== MIDDLEWARE ==================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads (⚠️ temporary on Render)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ================== ROUTES ==================

// ✅ Root route (FIXED your issue)
app.get('/', (req, res) => {
  res.send('🚀 VideoVault Backend is Live on Render');
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'VideoVault API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ================== SOCKET EVENTS ==================
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join:video', (videoId) => {
    socket.join(`video:${videoId}`);
    console.log(`Socket ${socket.id} joined video room: ${videoId}`);
  });

  socket.on('leave:video', (videoId) => {
    socket.leave(`video:${videoId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ================== ERROR HANDLING ==================
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ================== SERVER ==================
const PORT = process.env.PORT || 8000;

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`🚀 VideoVault server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});

module.exports = { app, server, io };