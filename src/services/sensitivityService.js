/**
 * Video Sensitivity Analysis Service
 * Simulates AI-based content sensitivity detection pipeline.
 * In production, this would integrate with a real CV/ML service
 * (e.g., Google Video Intelligence API, AWS Rekognition, or custom model).
 */

const sensitivityCategories = [
  { name: 'violence', weight: 0.25 },
  { name: 'adult_content', weight: 0.30 },
  { name: 'hate_speech', weight: 0.20 },
  { name: 'graphic_content', weight: 0.15 },
  { name: 'dangerous_activities', weight: 0.10 },
];

/**
 * Simulate frame-by-frame sensitivity analysis
 */
const analyzeFrame = (frameIndex, totalFrames) => {
  // Deterministic pseudo-random based on frame position for demo
  const seed = (frameIndex * 7919) % 1000;
  const rand = seed / 1000;

  const detections = [];

  if (rand > 0.95) {
    const category = sensitivityCategories[frameIndex % sensitivityCategories.length];
    detections.push({
      category: category.name,
      confidence: 0.6 + (rand - 0.95) * 8,
      timestamp: (frameIndex / totalFrames) * 100,
    });
  }

  return detections;
};

/**
 * Calculate overall sensitivity score from frame detections
 */
const calculateScore = (allDetections) => {
  if (allDetections.length === 0) return 0;

  let weightedScore = 0;
  for (const detection of allDetections) {
    const category = sensitivityCategories.find(c => c.name === detection.category);
    const weight = category ? category.weight : 0.1;
    weightedScore += detection.confidence * weight * 100;
  }

  return Math.min(100, Math.round(weightedScore));
};

/**
 * Main analysis function - processes video with progress callbacks
 */
const analyzeVideo = async (videoId, filePath, onProgress) => {
  const TOTAL_FRAMES = 30; // Simulated frame count
  const PROCESSING_STAGES = [
    { name: 'Initializing analysis engine', progress: 5, delay: 400 },
    { name: 'Loading video metadata', progress: 10, delay: 300 },
    { name: 'Extracting key frames', progress: 20, delay: 600 },
    { name: 'Running content detection', progress: 30, delay: 400 },
  ];

  const allDetections = [];

  // Initial stages
  for (const stage of PROCESSING_STAGES) {
    await sleep(stage.delay);
    if (onProgress) {
      await onProgress(videoId, stage.progress, stage.name);
    }
  }

  // Frame-by-frame analysis
  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    await sleep(80 + Math.random() * 40);

    const frameDetections = analyzeFrame(frame, TOTAL_FRAMES);
    allDetections.push(...frameDetections);

    const frameProgress = 30 + Math.round((frame / TOTAL_FRAMES) * 55);
    if (onProgress) {
      await onProgress(videoId, frameProgress, `Analyzing frame ${frame + 1}/${TOTAL_FRAMES}`);
    }
  }

  // Final stages
  await sleep(300);
  if (onProgress) await onProgress(videoId, 90, 'Compiling sensitivity report');
  await sleep(300);
  if (onProgress) await onProgress(videoId, 95, 'Finalizing results');
  await sleep(200);
  if (onProgress) await onProgress(videoId, 100, 'Analysis complete');

  const score = calculateScore(allDetections);
  const status = score > 40 ? 'flagged' : 'safe';

  return {
    status,
    score,
    flags: allDetections.slice(0, 10), // Top 10 flags
    analyzedAt: new Date(),
    summary: generateSummary(status, score, allDetections),
  };
};

const generateSummary = (status, score, detections) => {
  if (status === 'safe') {
    return `Content analysis complete. No significant sensitive content detected. Safety score: ${100 - score}/100.`;
  }

  const categories = [...new Set(detections.map(d => d.category))];
  return `Content flagged for review. Detected potential issues in: ${categories.join(', ')}. Sensitivity score: ${score}/100.`;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { analyzeVideo };
