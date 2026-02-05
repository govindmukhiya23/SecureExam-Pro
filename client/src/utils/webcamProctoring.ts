// Webcam Proctoring with TensorFlow.js Face Detection
// Handles AI-based suspicious behavior detection

import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import { proctoringAPI } from '../services/api';
import socketService from '../services/socket';

export type WebcamEventType =
  | 'look_away'
  | 'head_missing'
  | 'multiple_faces'
  | 'face_occlusion'
  | 'brightness_change';

const RISK_POINTS: Record<WebcamEventType, number> = {
  look_away: 10,
  head_missing: 15,
  multiple_faces: 40,
  face_occlusion: 20,
  brightness_change: 5,
};

interface WebcamCallbacks {
  onViolation: (event: WebcamEventType, points: number) => void;
  onStatusChange: (status: 'active' | 'paused' | 'error') => void;
}

interface FaceAnalysis {
  faceCount: number;
  isLookingAway: boolean;
  isFaceOccluded: boolean;
  brightness: number;
}

class WebcamProctoring {
  private sessionId: string | null = null;
  private callbacks: WebcamCallbacks | null = null;
  private isActive = false;
  private videoElement: HTMLVideoElement | null = null;
  private ownedVideoElement = false; // Track if we created the video element
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private stream: MediaStream | null = null;
  private analysisInterval: number | null = null;
  private lastBrightness: number = -1;
  private lookAwayStartTime: number | null = null;
  private headMissingStartTime: number | null = null;
  private initialized = false;

  // Thresholds
  private readonly LOOK_AWAY_THRESHOLD_MS = 3000; // 3 seconds
  private readonly HEAD_MISSING_THRESHOLD_MS = 2000; // 2 seconds
  private readonly BRIGHTNESS_CHANGE_THRESHOLD = 50;
  private readonly ANALYSIS_INTERVAL_MS = 500; // Analyze every 500ms

  // Static method to request camera permission
  static async requestCameraPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Camera permission denied:', error);
      return false;
    }
  }

  async initialize(
    sessionId: string,
    callbacksOrVideoElement: WebcamCallbacks | HTMLVideoElement,
    maybeCallbacks?: WebcamCallbacks
  ): Promise<boolean> {
    this.sessionId = sessionId;

    // Support both old API (sessionId, videoElement, callbacks) and new API (sessionId, callbacks)
    if (maybeCallbacks) {
      this.videoElement = callbacksOrVideoElement as HTMLVideoElement;
      this.callbacks = maybeCallbacks;
      this.ownedVideoElement = false;
    } else {
      this.callbacks = callbacksOrVideoElement as WebcamCallbacks;
      // Create our own hidden video element
      this.videoElement = document.createElement('video');
      this.videoElement.setAttribute('playsinline', '');
      this.videoElement.muted = true;
      this.ownedVideoElement = true;
    }

    try {
      // Check if video element already has a stream (from TakeExam direct init)
      if (this.videoElement.srcObject && this.videoElement.srcObject instanceof MediaStream) {
        this.stream = this.videoElement.srcObject;
      } else {
        // Request webcam access
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      // Load TensorFlow.js and face detection model
      await tf.ready();
      
      this.detector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: true,
          maxFaces: 5, // Detect up to 5 faces
        }
      );

      this.initialized = true;
      this.callbacks.onStatusChange('active');

      return true;
    } catch (error) {
      console.error('Failed to initialize webcam proctoring:', error);
      this.callbacks?.onStatusChange('error');
      return false;
    }
  }

  // Start the webcam analysis (call after initialize)
  async start(): Promise<boolean> {
    if (!this.initialized || !this.videoElement || !this.detector) {
      console.error('Webcam proctoring not initialized. Call initialize() first.');
      return false;
    }

    this.isActive = true;
    this.startAnalysis();
    return true;
  }

  destroy(): void {
    this.isActive = false;
    this.initialized = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      if (this.ownedVideoElement) {
        this.videoElement.remove();
      }
      this.videoElement = null;
    }

    this.ownedVideoElement = false;
    this.detector = null;
    this.sessionId = null;
    this.callbacks = null;
  }

  private startAnalysis(): void {
    this.analysisInterval = window.setInterval(async () => {
      if (!this.isActive || !this.videoElement || !this.detector) return;

      try {
        const analysis = await this.analyzeFrame();
        this.processAnalysis(analysis);
      } catch (error) {
        console.error('Frame analysis error:', error);
      }
    }, this.ANALYSIS_INTERVAL_MS);
  }

  private async analyzeFrame(): Promise<FaceAnalysis> {
    if (!this.videoElement || !this.detector) {
      return {
        faceCount: 0,
        isLookingAway: false,
        isFaceOccluded: false,
        brightness: 0,
      };
    }

    // Detect faces
    const faces = await this.detector.estimateFaces(this.videoElement, {
      flipHorizontal: true,
    });

    const faceCount = faces.length;

    // Calculate brightness from video frame
    const brightness = this.calculateBrightness();

    // Analyze face orientation (if exactly one face detected)
    let isLookingAway = false;
    let isFaceOccluded = false;

    if (faceCount === 1) {
      const face = faces[0];
      const keypoints = face.keypoints;

      // Check if looking away based on eye and nose positions
      isLookingAway = this.checkLookingAway(keypoints);
      
      // Check for face occlusion (based on keypoint confidence/visibility)
      isFaceOccluded = this.checkOcclusion(face);
    }

    return {
      faceCount,
      isLookingAway,
      isFaceOccluded,
      brightness,
    };
  }

  private checkLookingAway(keypoints: faceLandmarksDetection.Keypoint[]): boolean {
    // Get key facial landmarks
    const leftEye = keypoints.find(k => k.name === 'leftEye');
    const rightEye = keypoints.find(k => k.name === 'rightEye');
    const nose = keypoints.find(k => k.name === 'noseTip');

    if (!leftEye || !rightEye || !nose) return false;

    // Calculate eye center
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    
    // Check horizontal deviation of nose from eye center
    const horizontalDeviation = Math.abs(nose.x - eyeCenterX);
    const eyeDistance = Math.abs(rightEye.x - leftEye.x);

    // If nose is too far from eye center, person is looking away
    const deviationRatio = horizontalDeviation / eyeDistance;
    
    return deviationRatio > 0.5;
  }

  private checkOcclusion(face: faceLandmarksDetection.Face): boolean {
    // Check if face bounding box is too small or keypoints are missing
    const keypoints = face.keypoints;
    
    // Count visible keypoints (those with high confidence)
    const visibleKeypoints = keypoints.filter(k => 
      k.x > 0 && k.y > 0 && k.x < 640 && k.y < 480
    );

    // If less than 50% of keypoints are visible, face may be occluded
    return visibleKeypoints.length < keypoints.length * 0.5;
  }

  private calculateBrightness(): number {
    if (!this.videoElement) return 0;

    const canvas = document.createElement('canvas');
    canvas.width = 100; // Downscale for performance
    canvas.height = 75;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Calculate perceived brightness using ITU-R BT.709
      const brightness = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      totalBrightness += brightness;
    }

    return totalBrightness / (data.length / 4);
  }

  private processAnalysis(analysis: FaceAnalysis): void {
    const now = Date.now();

    // Check for multiple faces
    if (analysis.faceCount > 1) {
      this.reportEvent('multiple_faces');
    }

    // Check for missing face/head
    if (analysis.faceCount === 0) {
      if (!this.headMissingStartTime) {
        this.headMissingStartTime = now;
      } else if (now - this.headMissingStartTime >= this.HEAD_MISSING_THRESHOLD_MS) {
        this.reportEvent('head_missing');
        this.headMissingStartTime = null;
      }
    } else {
      this.headMissingStartTime = null;
    }

    // Check for looking away
    if (analysis.faceCount === 1 && analysis.isLookingAway) {
      if (!this.lookAwayStartTime) {
        this.lookAwayStartTime = now;
      } else if (now - this.lookAwayStartTime >= this.LOOK_AWAY_THRESHOLD_MS) {
        this.reportEvent('look_away');
        this.lookAwayStartTime = null;
      }
    } else {
      this.lookAwayStartTime = null;
    }

    // Check for face occlusion
    if (analysis.faceCount === 1 && analysis.isFaceOccluded) {
      this.reportEvent('face_occlusion');
    }

    // Check for sudden brightness change
    if (this.lastBrightness !== -1) {
      const brightnessDiff = Math.abs(analysis.brightness - this.lastBrightness);
      if (brightnessDiff > this.BRIGHTNESS_CHANGE_THRESHOLD) {
        this.reportEvent('brightness_change');
      }
    }
    this.lastBrightness = analysis.brightness;
  }

  private async reportEvent(eventType: WebcamEventType): Promise<void> {
    if (!this.sessionId || !this.callbacks) return;

    const points = RISK_POINTS[eventType];

    // Notify via callback
    this.callbacks.onViolation(eventType, points);

    // Report to server
    try {
      await proctoringAPI.logEvent({
        session_id: this.sessionId,
        event_type: eventType,
      });

      // Also emit via socket for real-time monitoring
      socketService.reportSuspiciousEvent({
        session_id: this.sessionId,
        event_type: eventType,
        points,
      });
    } catch (error) {
      console.error('Failed to report webcam event:', error);
    }
  }

  // Public methods
  pause(): void {
    this.isActive = false;
    this.callbacks?.onStatusChange('paused');
  }

  resume(): void {
    this.isActive = true;
    this.callbacks?.onStatusChange('active');
  }

  isRunning(): boolean {
    return this.isActive;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}

export const webcamProctoring = new WebcamProctoring();
export default webcamProctoring;
